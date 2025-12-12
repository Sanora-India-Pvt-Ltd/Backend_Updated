const Redis = require('ioredis');

let redisClient = null;
let redisSubscriber = null;
let redisPublisher = null;

// In-memory fallback for presence tracking when Redis is not available
const inMemoryPresence = {
    onlineUsers: new Map(), // userId -> { online: true, lastSeen: timestamp }
    cleanupInterval: null,
    
    // Cleanup stale entries every 5 minutes
    startCleanup() {
        if (this.cleanupInterval) return;
        this.cleanupInterval = setInterval(() => {
            const now = Date.now();
            const fiveMinutesAgo = now - (5 * 60 * 1000);
            
            for (const [userId, data] of this.onlineUsers.entries()) {
                if (data.lastSeen < fiveMinutesAgo) {
                    this.onlineUsers.delete(userId);
                }
            }
        }, 5 * 60 * 1000); // Run every 5 minutes
    },
    
    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
};

const initRedis = async () => {
    try {
        // Only initialize Redis if REDIS_URL is explicitly set
        // Don't default to localhost to avoid connection errors
        if (!process.env.REDIS_URL) {
            console.log('ℹ️  Redis not configured (REDIS_URL not set) - using in-memory adapter');
            console.log('   Presence tracking will use in-memory storage (single server only)');
            // Start in-memory presence cleanup
            inMemoryPresence.startCleanup();
            return { redisClient: null, redisSubscriber: null, redisPublisher: null };
        }

        const redisUrl = process.env.REDIS_URL;
        
        // Connection options to handle connection failures gracefully
        const redisOptions = {
            retryStrategy: (times) => {
                // Stop retrying after 3 attempts to avoid spam
                if (times > 3) {
                    return null; // Stop retrying
                }
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableOfflineQueue: false, // Don't queue commands when offline
            connectTimeout: 10000, // 10 second timeout
            enableReadyCheck: true,
            showFriendlyErrorStack: false, // Reduce error stack noise
            lazyConnect: true // Don't connect immediately - wait for explicit connect()
        };
        
        // Main Redis client for general operations
        redisClient = new Redis(redisUrl, redisOptions);

        // Separate connections for pub/sub (required for Socket.IO adapter)
        // These need enableOfflineQueue for Socket.IO adapter to work
        const pubSubOptions = {
            ...redisOptions,
            enableOfflineQueue: true // Enable queue for Socket.IO adapter
        };
        redisSubscriber = new Redis(redisUrl, pubSubOptions);
        redisPublisher = new Redis(redisUrl, pubSubOptions);

        // Track if we've already logged connection errors to avoid spam
        let connectionErrorLogged = {
            client: false,
            subscriber: false,
            publisher: false
        };

        // Helper function to format error messages
        const formatError = (err) => {
            if (!err) return 'Unknown error';
            if (err.message) return err.message;
            if (typeof err === 'string') return err;
            if (err.code) return `Error code: ${err.code}`;
            return String(err);
        };

        // Attempt to connect (will fail gracefully if Redis is not available)
        redisClient.connect().catch(() => {
            // Connection failed - expected if Redis is not running
        });

        redisClient.on('connect', () => {
            console.log('✅ Redis client connected');
            connectionErrorLogged.client = false; // Reset on successful connection
            // Stop in-memory presence when Redis is available
            inMemoryPresence.stopCleanup();
        });

        redisClient.on('error', (err) => {
            const errorMsg = formatError(err);
            // Only log connection errors once to avoid spam
            if (!connectionErrorLogged.client) {
                // Suppress common connection errors (Redis not running)
                if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND')) {
                    console.warn('⚠️  Redis client: Connection failed (Redis may not be running)');
                } else if (errorMsg) {
                    console.error('❌ Redis client error:', errorMsg);
                }
                connectionErrorLogged.client = true;
            }
            // Don't crash - app can work without Redis (with limited functionality)
        });

        // Attempt to connect pub/sub clients
        // These connections MUST be awaited and ready before using with Socket.IO adapter
        // Socket.IO adapter calls psubscribe() immediately, which requires an open connection
        
        // Helper to wait for Redis connection to be ready
        const waitForReady = (client, name) => {
            return new Promise((resolve) => {
                if (client.status === 'ready') {
                    resolve();
                    return;
                }
                
                const onReady = () => {
                    client.removeListener('error', onError);
                    resolve();
                };
                
                const onError = (err) => {
                    client.removeListener('ready', onReady);
                    // Connection failed - resolve anyway (will fallback to in-memory)
                    resolve();
                };
                
                client.once('ready', onReady);
                client.once('error', onError);
                
                // Start connection
                client.connect().catch(() => {
                    // Connection failed - resolve anyway
                    resolve();
                });
            });
        };
        
        // Wait for both connections to be ready
        await Promise.all([
            waitForReady(redisSubscriber, 'subscriber'),
            waitForReady(redisPublisher, 'publisher')
        ]);

        redisSubscriber.on('connect', () => {
            console.log('✅ Redis subscriber connected');
            connectionErrorLogged.subscriber = false; // Reset on successful connection
        });

        redisSubscriber.on('error', (err) => {
            const errorMsg = formatError(err);
            // Only log connection errors once to avoid spam
            if (!connectionErrorLogged.subscriber) {
                // Suppress common connection errors (Redis not running)
                if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND')) {
                    console.warn('⚠️  Redis subscriber: Connection failed (Redis may not be running)');
                } else if (errorMsg) {
                    console.error('❌ Redis subscriber error:', errorMsg);
                }
                connectionErrorLogged.subscriber = true;
            }
            // Don't crash - app can work without Redis (with limited functionality)
        });

        redisPublisher.on('connect', () => {
            console.log('✅ Redis publisher connected');
            connectionErrorLogged.publisher = false; // Reset on successful connection
        });

        redisPublisher.on('error', (err) => {
            const errorMsg = formatError(err);
            // Only log connection errors once to avoid spam
            if (!connectionErrorLogged.publisher) {
                // Suppress common connection errors (Redis not running)
                if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('ENOTFOUND')) {
                    console.warn('⚠️  Redis publisher: Connection failed (Redis may not be running)');
                } else if (errorMsg) {
                    console.error('❌ Redis publisher error:', errorMsg);
                }
                connectionErrorLogged.publisher = true;
            }
            // Don't crash - app can work without Redis (with limited functionality)
        });

        return { redisClient, redisSubscriber, redisPublisher };
    } catch (error) {
        console.error('❌ Redis initialization error:', error.message);
        console.warn('⚠️  App will continue without Redis (some features may be limited)');
        return { redisClient: null, redisSubscriber: null, redisPublisher: null };
    }
};

// Helper functions for presence tracking
// These functions use Redis if available, otherwise fall back to in-memory storage
const setUserOnline = async (userId) => {
    const now = Date.now();
    
    if (redisClient) {
        // Use Redis if available
        try {
            await redisClient.setex(`user:online:${userId}`, 300, '1'); // 5 minutes TTL
            await redisClient.set(`user:lastSeen:${userId}`, now);
        } catch (error) {
            console.error('Redis setUserOnline error:', error.message);
            // Fallback to in-memory on Redis error
            inMemoryPresence.onlineUsers.set(userId, { online: true, lastSeen: now });
        }
    } else {
        // Use in-memory fallback
        inMemoryPresence.onlineUsers.set(userId, { online: true, lastSeen: now });
        inMemoryPresence.startCleanup(); // Ensure cleanup is running
    }
};

const setUserOffline = async (userId) => {
    const now = Date.now();
    
    if (redisClient) {
        // Use Redis if available
        try {
            await redisClient.del(`user:online:${userId}`);
            await redisClient.set(`user:lastSeen:${userId}`, now);
        } catch (error) {
            console.error('Redis setUserOffline error:', error.message);
            // Fallback to in-memory on Redis error
            inMemoryPresence.onlineUsers.set(userId, { online: false, lastSeen: now });
        }
    } else {
        // Use in-memory fallback - mark as offline but keep lastSeen
        const existing = inMemoryPresence.onlineUsers.get(userId);
        inMemoryPresence.onlineUsers.set(userId, { 
            online: false, 
            lastSeen: existing?.lastSeen || now 
        });
        inMemoryPresence.startCleanup(); // Ensure cleanup is running
    }
};

const isUserOnline = async (userId) => {
    if (redisClient) {
        // Use Redis if available
        try {
            const result = await redisClient.get(`user:online:${userId}`);
            return result === '1';
        } catch (error) {
            console.error('Redis isUserOnline error:', error.message);
            // Fallback to in-memory on Redis error
            const userData = inMemoryPresence.onlineUsers.get(userId);
            return userData?.online === true;
        }
    } else {
        // Use in-memory fallback
        const userData = inMemoryPresence.onlineUsers.get(userId);
        return userData?.online === true;
    }
};

const getUserLastSeen = async (userId) => {
    if (redisClient) {
        // Use Redis if available
        try {
            const timestamp = await redisClient.get(`user:lastSeen:${userId}`);
            return timestamp ? parseInt(timestamp) : null;
        } catch (error) {
            console.error('Redis getUserLastSeen error:', error.message);
            // Fallback to in-memory on Redis error
            const userData = inMemoryPresence.onlineUsers.get(userId);
            return userData?.lastSeen || null;
        }
    } else {
        // Use in-memory fallback
        const userData = inMemoryPresence.onlineUsers.get(userId);
        return userData?.lastSeen || null;
    }
};

module.exports = {
    initRedis,
    getRedisClient: () => redisClient,
    getRedisSubscriber: () => redisSubscriber,
    getRedisPublisher: () => redisPublisher,
    setUserOnline,
    setUserOffline,
    isUserOnline,
    getUserLastSeen
};



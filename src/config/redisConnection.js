/**
 * Redis Connection Module
 * Provides Redis client for conference polling system
 * Falls back to stub if REDIS_URL not configured
 */

const Redis = require('ioredis');

let redisClient = null;
let redisSubscriber = null;
let redisPublisher = null;
let isRedisAvailable = false;

/**
 * Initialize Redis connection
 * @returns {Promise<boolean>} True if Redis connected, false if using fallback
 */
const initRedis = async () => {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
        console.log('ℹ️  REDIS_URL not configured - using in-memory fallback for conference polling');
        console.log('   Conference polling will work but cannot scale horizontally');
        return false;
    }

    try {
        // Create main Redis client with error handling
        redisClient = new Redis(redisUrl, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            enableOfflineQueue: false,
            connectTimeout: 10000, // 10 second timeout
            commandTimeout: 5000 // 5 second command timeout
        });

        // Create subscriber client (required for pub/sub)
        redisSubscriber = new Redis(redisUrl, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            enableOfflineQueue: false,
            connectTimeout: 10000,
            commandTimeout: 5000
        });

        // Create publisher client (required for pub/sub)
        redisPublisher = new Redis(redisUrl, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            enableOfflineQueue: false,
            connectTimeout: 10000,
            commandTimeout: 5000
        });

        // Add error handlers to prevent unhandled errors
        redisClient.on('error', (error) => {
            console.error('Redis client error:', error.message);
            // Don't set isRedisAvailable = false here, let connection retry
            // Only set to false if connection completely fails
        });

        redisSubscriber.on('error', (error) => {
            console.error('Redis subscriber error:', error.message);
        });

        redisPublisher.on('error', (error) => {
            console.error('Redis publisher error:', error.message);
        });

        // Add connection error handlers
        redisClient.on('close', () => {
            console.warn('⚠️  Redis client connection closed');
            isRedisAvailable = false;
        });

        redisSubscriber.on('close', () => {
            console.warn('⚠️  Redis subscriber connection closed');
        });

        redisPublisher.on('close', () => {
            console.warn('⚠️  Redis publisher connection closed');
        });

        // Wait for connection with timeout
        const connectionPromise = Promise.all([
            redisClient.ping().catch(err => { throw new Error(`Client ping failed: ${err.message}`); }),
            redisSubscriber.ping().catch(err => { throw new Error(`Subscriber ping failed: ${err.message}`); }),
            redisPublisher.ping().catch(err => { throw new Error(`Publisher ping failed: ${err.message}`); })
        ]);

        // Add timeout to connection attempt
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Redis connection timeout')), 10000);
        });

        await Promise.race([connectionPromise, timeoutPromise]);

        isRedisAvailable = true;
        console.log('✅ Redis connected successfully for conference polling');
        return true;
    } catch (error) {
        console.error('❌ Redis connection failed:', error.message);
        console.log('   Falling back to in-memory storage (single server only)');
        
        // Clean up failed connections
        if (redisClient) {
            redisClient.disconnect();
            redisClient = null;
        }
        if (redisSubscriber) {
            redisSubscriber.disconnect();
            redisSubscriber = null;
        }
        if (redisPublisher) {
            redisPublisher.disconnect();
            redisPublisher = null;
        }

        isRedisAvailable = false;
        return false;
    }
};

/**
 * Get Redis client (main)
 * @returns {Redis|null} Redis client or null if not available
 */
const getRedis = () => {
    return isRedisAvailable ? redisClient : null;
};

/**
 * Get Redis subscriber client
 * @returns {Redis|null} Redis subscriber or null if not available
 */
const getRedisSubscriber = () => {
    return isRedisAvailable ? redisSubscriber : null;
};

/**
 * Get Redis publisher client
 * @returns {Redis|null} Redis publisher or null if not available
 */
const getRedisPublisher = () => {
    return isRedisAvailable ? redisPublisher : null;
};

/**
 * Check if Redis is available
 * @returns {boolean}
 */
const isRedisReady = () => {
    return isRedisAvailable;
};

/**
 * Gracefully close Redis connections
 */
const closeRedis = async () => {
    if (redisClient) {
        try {
            await redisClient.quit();
        } catch (error) {
            console.error('Error closing Redis client:', error.message);
        }
        redisClient = null;
    }
    if (redisSubscriber) {
        try {
            await redisSubscriber.quit();
        } catch (error) {
            console.error('Error closing Redis subscriber:', error.message);
        }
        redisSubscriber = null;
    }
    if (redisPublisher) {
        try {
            await redisPublisher.quit();
        } catch (error) {
            console.error('Error closing Redis publisher:', error.message);
        }
        redisPublisher = null;
    }
    isRedisAvailable = false;
    console.log('🔌 Redis connections closed');
};

module.exports = {
    initRedis,
    getRedis,
    getRedisSubscriber,
    getRedisPublisher,
    isRedisReady,
    closeRedis
};


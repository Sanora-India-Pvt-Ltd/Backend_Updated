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
        // Create main Redis client
        redisClient = new Redis(redisUrl, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            enableOfflineQueue: false
        });

        // Create subscriber client (required for pub/sub)
        redisSubscriber = new Redis(redisUrl, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            enableOfflineQueue: false
        });

        // Create publisher client (required for pub/sub)
        redisPublisher = new Redis(redisUrl, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            enableOfflineQueue: false
        });

        // Wait for connection
        await Promise.all([
            redisClient.ping(),
            redisSubscriber.ping(),
            redisPublisher.ping()
        ]);

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
        await redisClient.quit();
        redisClient = null;
    }
    if (redisSubscriber) {
        await redisSubscriber.quit();
        redisSubscriber = null;
    }
    if (redisPublisher) {
        await redisPublisher.quit();
        redisPublisher = null;
    }
    isRedisAvailable = false;
    console.log('🔌 Redis connections closed');
};

// Handle connection errors
if (redisClient) {
    redisClient.on('error', (error) => {
        console.error('Redis client error:', error.message);
    });
}

if (redisSubscriber) {
    redisSubscriber.on('error', (error) => {
        console.error('Redis subscriber error:', error.message);
    });
}

if (redisPublisher) {
    redisPublisher.on('error', (error) => {
        console.error('Redis publisher error:', error.message);
    });
}

module.exports = {
    initRedis,
    getRedis,
    getRedisSubscriber,
    getRedisPublisher,
    isRedisReady,
    closeRedis
};


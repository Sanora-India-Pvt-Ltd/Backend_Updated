/**
 * Redis Connection Module (FIXED)
 * Stable Redis connection with proper readiness handling
 */

const Redis = require("ioredis");

let redisClient = null;
let redisSubscriber = null;
let redisPublisher = null;
let isRedisAvailable = false;

const createRedisClient = (url, name) => {
    const client = new Redis(url, {
        lazyConnect: true,          // IMPORTANT
        maxRetriesPerRequest: 3,
        enableOfflineQueue: false,
        connectTimeout: 10000,
        retryStrategy(times) {
            return Math.min(times * 100, 2000);
        }
    });

    client.on("ready", () => {
        console.log(`✅ Redis ${name} ready`);
    });

    client.on("error", (err) => {
        console.error(`❌ Redis ${name} error:`, err.message);
    });

    client.on("close", () => {
        console.warn(`⚠️ Redis ${name} connection closed`);
        if (name === "client") {
            isRedisAvailable = false;
        }
    });

    return client;
};

/**
 * Initialize Redis
 */
const initRedis = async () => {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
        console.log("ℹ️ REDIS_URL not set → using in-memory mode");
        return false;
    }

    try {
        redisClient = createRedisClient(redisUrl, "client");
        redisSubscriber = createRedisClient(redisUrl, "subscriber");
        redisPublisher = createRedisClient(redisUrl, "publisher");

        // Connect all
        await Promise.all([
            redisClient.connect(),
            redisSubscriber.connect(),
            redisPublisher.connect()
        ]);

        // Final sanity check
        await redisClient.ping();

        isRedisAvailable = true;
        console.log("🚀 Redis fully connected and ready");
        return true;
    } catch (error) {
        console.error("❌ Redis init failed:", error.message);

        if (redisClient) redisClient.disconnect();
        if (redisSubscriber) redisSubscriber.disconnect();
        if (redisPublisher) redisPublisher.disconnect();

        redisClient = null;
        redisSubscriber = null;
        redisPublisher = null;
        isRedisAvailable = false;

        return false;
    }
};

/**
 * Getters
 */
const getRedis = () => (isRedisAvailable ? redisClient : null);
const getRedisSubscriber = () => (isRedisAvailable ? redisSubscriber : null);
const getRedisPublisher = () => (isRedisAvailable ? redisPublisher : null);
const isRedisReady = () => isRedisAvailable;

/**
 * Graceful shutdown
 */
const closeRedis = async () => {
    try {
        if (redisClient) await redisClient.quit();
        if (redisSubscriber) await redisSubscriber.quit();
        if (redisPublisher) await redisPublisher.quit();
    } catch (err) {
        console.error("Redis shutdown error:", err.message);
    } finally {
        redisClient = null;
        redisSubscriber = null;
        redisPublisher = null;
        isRedisAvailable = false;
        console.log("🔌 Redis closed");
    }
};

module.exports = {
    initRedis,
    getRedis,
    getRedisSubscriber,
    getRedisPublisher,
    isRedisReady,
    closeRedis
};

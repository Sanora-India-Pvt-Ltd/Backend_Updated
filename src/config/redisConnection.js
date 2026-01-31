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

/**
 * Get Redis connection options for BullMQ (job queues).
 * BullMQ requires maxRetriesPerRequest: null, enableReadyCheck: false.
 */
const getRedisConnectionOptions = () => {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) return null;
    try {
        let host, port, password, username;
        if (redisUrl.includes("://")) {
            const url = new URL(redisUrl);
            host = url.hostname;
            port = parseInt(url.port) || 6379;
            username = url.username || undefined;
            password = url.password || undefined;
        } else {
            const parts = redisUrl.split(":");
            host = parts[0];
            port = parseInt(parts[1]) || 6379;
            password = parts[2] || undefined;
        }
        return {
            host,
            port,
            password,
            username,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            lazyConnect: true,
            retryStrategy: (times) => Math.min(times * 100, 2000)
        };
    } catch (error) {
        console.error("❌ Failed to parse Redis URL:", error.message);
        return null;
    }
};

/**
 * Create a new Redis connection for BullMQ (job queues need their own instance).
 */
const createRedisConnection = () => {
    const opts = getRedisConnectionOptions();
    if (!opts) return null;
    try {
        const redis = new Redis(opts);
        redis.on("error", (err) => console.error("❌ BullMQ Redis connection error:", err.message));
        redis.on("ready", () => console.log("✅ BullMQ Redis connection ready"));
        return redis;
    } catch (error) {
        console.error("❌ Failed to create BullMQ Redis connection:", error.message);
        return null;
    }
};

module.exports = {
    initRedis,
    getRedis,
    getRedisSubscriber,
    getRedisPublisher,
    isRedisReady,
    closeRedis,
    getRedisConnectionOptions,
    createRedisConnection
};

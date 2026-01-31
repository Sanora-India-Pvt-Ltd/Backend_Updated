/**
 * Cache (Redis) abstraction.
 * Single entry for Redis: all app code must use this instead of config/redisConnection.
 * Re-exports redisConnection; getClient() is the preferred API for getting Redis client.
 */

const redisConnection = require('../../config/redisConnection');
const logger = require('../logger');

function getClient() {
    try {
        return redisConnection.getRedis();
    } catch (err) {
        logger.error('Cache getClient failed', { error: err.message });
        throw err;
    }
}

module.exports = {
    getClient,
    getRedis: redisConnection.getRedis,
    getRedisSubscriber: redisConnection.getRedisSubscriber,
    getRedisPublisher: redisConnection.getRedisPublisher,
    isRedisReady: redisConnection.isRedisReady,
    initRedis: redisConnection.initRedis,
    closeRedis: redisConnection.closeRedis,
    getRedisConnectionOptions: redisConnection.getRedisConnectionOptions,
    createRedisConnection: redisConnection.createRedisConnection
};

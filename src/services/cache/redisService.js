const { getRedis } = require('../../config/redisConnection');

/**
 * Cache course metadata (5-15 min TTL)
 */
const cacheCourse = async (courseId, courseData, ttl = null) => {
    const redis = getRedis();
    if (!redis) return false;

    const cacheTTL = ttl || Math.floor(Math.random() * 10 + 5) * 60; // 5-15 minutes
    await redis.setex(`course:${courseId}`, cacheTTL, JSON.stringify(courseData));
    return true;
};

/**
 * Get cached course
 */
const getCachedCourse = async (courseId) => {
    const redis = getRedis();
    if (!redis) return null;

    const cached = await redis.get(`course:${courseId}`);
    return cached ? JSON.parse(cached) : null;
};

/**
 * Store refresh tokens
 */
const storeRefreshToken = async (token, userId, expiresIn = 30 * 24 * 60 * 60) => {
    const redis = getRedis();
    if (!redis) return false;

    await redis.setex(`refresh:university:${token}`, expiresIn, userId.toString());
    return true;
};

/**
 * Get refresh token
 */
const getRefreshToken = async (token) => {
    const redis = getRedis();
    if (!redis) return null;

    return await redis.get(`refresh:university:${token}`);
};

/**
 * Delete refresh token
 */
const deleteRefreshToken = async (token) => {
    const redis = getRedis();
    if (!redis) return false;

    await redis.del(`refresh:university:${token}`);
    return true;
};

/**
 * Rate limiting helpers
 */
const checkRateLimit = async (key, limit, windowSeconds) => {
    const redis = getRedis();
    if (!redis) return { allowed: true, remaining: limit };

    const current = await redis.incr(`ratelimit:${key}`);
    
    if (current === 1) {
        await redis.expire(`ratelimit:${key}`, windowSeconds);
    }

    const remaining = Math.max(0, limit - current);
    return {
        allowed: current <= limit,
        remaining
    };
};

/**
 * Invite token validation cache
 */
const cacheInviteToken = async (token, isValid, ttl = 300) => {
    const redis = getRedis();
    if (!redis) return false;

    await redis.setex(`invite:${token}`, ttl, isValid ? '1' : '0');
    return true;
};

/**
 * Get cached invite token validation
 */
const getCachedInviteToken = async (token) => {
    const redis = getRedis();
    if (!redis) return null;

    const cached = await redis.get(`invite:${token}`);
    return cached === '1';
};

module.exports = {
    cacheCourse,
    getCachedCourse,
    storeRefreshToken,
    getRefreshToken,
    deleteRefreshToken,
    checkRateLimit,
    cacheInviteToken,
    getCachedInviteToken
};


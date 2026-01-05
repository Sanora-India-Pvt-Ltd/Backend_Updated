const CourseInvite = require('../../models/course/CourseInvite');
const crypto = require('crypto');
const { getRedis } = require('../../config/redisConnection');

/**
 * Generate invite token (crypto.randomBytes + hash)
 */
const generateInviteToken = () => {
    const randomToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(randomToken).digest('hex');
    
    return {
        plainToken: randomToken,
        hashedToken
    };
};

/**
 * Validate token against expiration & used status
 */
const validateInviteToken = async (token) => {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const invite = await CourseInvite.findOne({
        token: hashedToken,
        used: false,
        expiresAt: { $gt: new Date() }
    });

    return invite;
};

/**
 * Cache validation in Redis (5 min TTL)
 */
const cacheInviteValidation = async (token, isValid) => {
    const redis = getRedis();
    if (redis) {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        await redis.setex(`invite:${hashedToken}`, 300, isValid ? '1' : '0'); // 5 minutes
    }
};

/**
 * Get cached validation
 */
const getCachedInviteValidation = async (token) => {
    const redis = getRedis();
    if (redis) {
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const cached = await redis.get(`invite:${hashedToken}`);
        return cached === '1';
    }
    return null;
};

/**
 * Track invite usage
 */
const markInviteAsUsed = async (inviteId, userId) => {
    const invite = await CourseInvite.findByIdAndUpdate(
        inviteId,
        {
            used: true,
            usedBy: userId,
            usedAt: new Date()
        },
        { new: true }
    );

    return invite;
};

module.exports = {
    generateInviteToken,
    validateInviteToken,
    cacheInviteValidation,
    getCachedInviteValidation,
    markInviteAsUsed
};


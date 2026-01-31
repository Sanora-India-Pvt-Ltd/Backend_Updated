const jwt = require('jsonwebtoken');
const University = require('../models/auth/University');
const { getClient: getRedis } = require('../core/infra/cache');

/**
 * Verify JWT from Authorization header
 * Attach universityId to request
 * Check university status (approved/active)
 */
const protectUniversity = async (req, res, next) => {
    try {
        let token;

        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route'
            });
        }

        // Check if token is blacklisted (logout)
        const redis = getRedis();
        if (redis) {
            const blacklisted = await redis.get(`blacklist:university:${token}`);
            if (blacklisted) {
                return res.status(401).json({
                    success: false,
                    message: 'Token has been invalidated. Please login again.'
                });
            }
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);

            if (decoded.type !== 'university') {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid token type. University token required.'
                });
            }

            const university = await University.findById(decoded.id).select('-password');

            if (!university) {
                return res.status(404).json({
                    success: false,
                    message: 'University not found'
                });
            }

            // Check if active (support both old flat structure and new nested structure)
            const isActive = university.account?.status?.isActive ?? university.isActive;
            if (!isActive) {
                return res.status(403).json({
                    success: false,
                    message: 'University account is inactive'
                });
            }

            // Check if verified (support both old flat structure and new nested structure)
            const isVerified = university.verification?.isVerified ?? university.isVerified;
            if (!isVerified) {
                return res.status(403).json({
                    success: false,
                    message: 'Email verification required. Please verify your email address before accessing this resource.',
                    requiresVerification: true
                });
            }

            req.university = university;
            req.universityId = university._id;
            next();
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized, token failed'
            });
        }
    } catch (error) {
        next(error);
    }
};

module.exports = {
    protectUniversity
};


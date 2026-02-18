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

            // Validate account.status (new schema only)
            const status = university.account?.status;
            if (!status?.isActive) {
                return res.status(403).json({
                    success: false,
                    message: 'Account inactive'
                });
            }
            if (!status?.isApproved) {
                return res.status(403).json({
                    success: false,
                    message: 'Account not approved'
                });
            }
            if (status?.isLocked) {
                return res.status(403).json({
                    success: false,
                    message: 'Account locked'
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


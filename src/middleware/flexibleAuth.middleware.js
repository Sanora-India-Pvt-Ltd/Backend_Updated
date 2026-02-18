const jwt = require('jsonwebtoken');
const User = require('../models/authorization/User');
const University = require('../models/auth/University');
const UniversitySession = require('../models/auth/UniversitySession');
const { getClient: getRedis } = require('../core/infra/cache');

/**
 * Flexible authentication middleware
 * Accepts both university and user tokens
 * Sets req.universityId if university token, req.userId if user token
 */
const flexibleAuth = async (req, res, next) => {
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

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

            // Check if token is blacklisted
            const redis = getRedis();
            if (redis) {
                if (decoded.type === 'university') {
                    const blacklisted = await redis.get(`blacklist:university:${token}`);
                    if (blacklisted) {
                        return res.status(401).json({
                            success: false,
                            message: 'Token has been invalidated. Please login again.'
                        });
                    }
                } else if (decoded.type === 'user') {
                    const blacklisted = await redis.get(`blacklist:user:${token}`);
                    if (blacklisted) {
                        return res.status(401).json({
                            success: false,
                            message: 'Token has been invalidated. Please login again.'
                        });
                    }
                }
            }

            // Handle university token
            if (decoded.type === 'university') {
                const session = await UniversitySession.findOne({ token });
                if (!session) {
                    return res.status(401).json({
                        success: false,
                        code: 'SESSION_NOT_FOUND',
                        message: 'Session not found. Please login again.'
                    });
                }
                if (session.isActive === false) {
                    return res.status(401).json({
                        success: false,
                        code: 'SESSION_INACTIVE',
                        message: 'Session is inactive. Please login again.'
                    });
                }
                if (session.expiresAt < new Date()) {
                    return res.status(401).json({
                        success: false,
                        code: 'SESSION_EXPIRED',
                        message: 'Session expired. Please login again.'
                    });
                }
                session.lastActivity = new Date();
                await session.save();

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
                return next();
            }

            // Handle user token (or token without type, default to user)
            const user = await User.findById(decoded.id).select('-auth');
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            req.user = user;
            req.userId = user._id;
            return next();

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
    flexibleAuth
};



const jwt = require('jsonwebtoken');
const User = require('../models/authorization/User');
const University = require('../models/auth/University');
const { getRedis } = require('../config/redisConnection');

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


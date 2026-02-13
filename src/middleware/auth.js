const jwt = require('jsonwebtoken');
const User = require('../models/authorization/User');
const { generateAccessToken, generateRefreshToken, generateToken, JWT_SECRET } = require('../core/auth/token');

const protect = async (req, res, next) => {
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
            const decoded = jwt.verify(token, JWT_SECRET);
            // Exclude auth section for security - never expose auth data in req.user
            const user = await User.findById(decoded.id).select('-auth');

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            req.user = user;
            req.userId = user._id; // Also set userId for convenience
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

// Verify refresh token
const verifyRefreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                message: 'Refresh token is required'
            });
        }

        // Find user by refresh token (nested structure only)
        const user = await User.findOne({ 'auth.tokens.refreshTokens.token': refreshToken });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        const tokenRecord = user.auth?.tokens?.refreshTokens?.find(rt => rt.token === refreshToken);
        if (!tokenRecord) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid refresh token'
        });
    }
};

module.exports = {
    generateToken,
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
    protect
};

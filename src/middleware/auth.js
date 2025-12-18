const jwt = require('jsonwebtoken');
const User = require('../models/User');
const crypto = require('crypto');

// Generate Access Token (short-lived - 1 hour for better UX, still secure)
const generateAccessToken = (payload) => {
    return jwt.sign(
        payload,
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' } // 1 hour - balances security and user experience
    );
};

// Generate Refresh Token (never expires - only invalidated on explicit logout)
const generateRefreshToken = () => {
    const token = crypto.randomBytes(40).toString('hex'); // Secure random token
    // Set expiry to 100 years from now (effectively never expires)
    // Tokens are only invalidated when user explicitly logs out
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 100); // 100 years from now (effectively never expires)
    return { token, expiryDate };
};

// Legacy function for backward compatibility (now generates access token)
const generateToken = (payload) => {
    return generateAccessToken(payload);
};

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
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            // Exclude auth section for security - never expose auth data in req.user
            const user = await User.findById(decoded.id).select('-auth');
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            req.user = user;
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

        // Find user by refresh token (check all possible structures)
        // Support: auth.refreshToken, auth.tokens.refreshToken, auth.tokens.refreshTokens[]
        let user = await User.findOne({ 'auth.refreshToken': refreshToken });
        
        // If not found, check auth.tokens.refreshToken (singular in tokens object)
        if (!user) {
            user = await User.findOne({ 'auth.tokens.refreshToken': refreshToken });
        }
        
        // If not found, check refreshTokens array
        if (!user) {
            user = await User.findOne({ 'auth.tokens.refreshTokens.token': refreshToken });
        }
        
        // If not found, check old flat structure
        if (!user) {
            user = await User.findOne({ refreshToken: refreshToken });
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        // Check if token exists - support all structures
        let tokenRecord = null;
        if (user.auth?.tokens?.refreshTokens && Array.isArray(user.auth.tokens.refreshTokens)) {
            tokenRecord = user.auth.tokens.refreshTokens.find(rt => rt.token === refreshToken);
        }

        // Check all possible single token fields
        const singleToken = user.auth?.refreshToken || 
                           user.auth?.tokens?.refreshToken || 
                           user.refreshToken;

        // Fallback to single token field for backward compatibility
        if (!tokenRecord && singleToken === refreshToken) {
            // Token found in single field - it's valid (no expiry check)
            // Tokens only expire when user explicitly logs out
        } else if (tokenRecord) {
            // Token found in array - it's valid (no expiry check)
            // Tokens only expire when user explicitly logs out
        } else {
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
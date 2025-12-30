const jwt = require('jsonwebtoken');
const Speaker = require('../models/conference/Speaker');
const crypto = require('crypto');

// Generate Access Token
const generateAccessToken = (payload) => {
    return jwt.sign(
        payload,
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
    );
};

// Generate Refresh Token
const generateRefreshToken = () => {
    const token = crypto.randomBytes(40).toString('hex');
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 100);
    return { token, expiryDate };
};

// Protect route - verify Speaker token
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
            const speaker = await Speaker.findById(decoded.id).select('-security.passwordHash -sessions');
            
            if (!speaker) {
                return res.status(404).json({
                    success: false,
                    message: 'Speaker not found'
                });
            }

            if (!speaker.account?.status?.isActive) {
                return res.status(403).json({
                    success: false,
                    message: 'Speaker account is inactive'
                });
            }

            req.speaker = speaker;
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

        const speaker = await Speaker.findOne({ 'sessions.refreshTokens.tokenId': refreshToken });

        if (!speaker) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        const tokenRecord = speaker.sessions?.refreshTokens?.find(rt => rt.tokenId === refreshToken);
        if (!tokenRecord) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        req.speaker = speaker;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid refresh token'
        });
    }
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    protect,
    verifyRefreshToken
};


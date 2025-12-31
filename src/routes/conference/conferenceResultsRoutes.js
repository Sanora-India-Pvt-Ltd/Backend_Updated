const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Host = require('../../models/conference/Host');
const Speaker = require('../../models/conference/Speaker');
const User = require('../../models/authorization/User');
const {
    getQuestionResult,
    getConferenceResults
} = require('../../controllers/conference/conferenceResultsController');

// Middleware to support multiple auth types (Host, Speaker, User)
// Checks token type from JWT payload and routes to appropriate auth
const multiAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route'
            });
        }

        const token = authHeader.split(' ')[1];
        
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            
            // Route based on token type
            if (decoded.type === 'host') {
                const host = await Host.findById(decoded.id).select('-security.passwordHash -sessions');
                if (!host) {
                    return res.status(404).json({
                        success: false,
                        message: 'Host not found'
                    });
                }
                if (!host.account?.status?.isActive) {
                    return res.status(403).json({
                        success: false,
                        message: 'Host account is inactive'
                    });
                }
                req.hostUser = host;
                return next();
            } else if (decoded.type === 'speaker') {
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
                return next();
            } else {
                // Default to User auth (also handles tokens without type field)
                const user = await User.findById(decoded.id).select('-auth');
                if (!user) {
                    return res.status(404).json({
                        success: false,
                        message: 'User not found'
                    });
                }
                req.user = user;
                return next();
            }
        } catch (jwtError) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized, token failed'
            });
        }
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Authentication error'
        });
    }
};

// Results routes
router.get('/:conferenceId/questions/:questionId/results', multiAuth, getQuestionResult);
router.get('/:conferenceId/questions/results', multiAuth, getConferenceResults);

module.exports = router;


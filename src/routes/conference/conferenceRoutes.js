const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Host = require('../../models/conference/Host');
const Speaker = require('../../models/conference/Speaker');
const User = require('../../models/authorization/User');
const { requireHostOrSuperAdmin, requireConferenceRole, attachConferenceRole, ROLES } = require('../../middleware/conferenceRoles');

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
const {
    createConference,
    getConferences,
    getConferenceById,
    updateConference,
    activateConference,
    endConference,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    pushQuestionLive,
    getLiveQuestion,
    answerQuestion,
    getQuestions,
    addMedia,
    deleteMedia,
    getMedia,
    getAnalytics,
    requestGroupJoin,
    reviewGroupJoinRequest,
    getConferenceMaterials
} = require('../../controllers/conference/conferenceController');

// Conference CRUD routes
router.post('/', multiAuth, requireHostOrSuperAdmin, createConference);
router.get('/', multiAuth, getConferences);
router.get('/:conferenceId', multiAuth, attachConferenceRole, getConferenceById);
router.put('/:conferenceId', multiAuth, requireConferenceRole(ROLES.HOST, ROLES.SUPER_ADMIN), updateConference);
router.post('/:conferenceId/activate', multiAuth, requireConferenceRole(ROLES.HOST, ROLES.SUPER_ADMIN), activateConference);
router.post('/:conferenceId/end', multiAuth, requireConferenceRole(ROLES.HOST, ROLES.SUPER_ADMIN), endConference);

// Question routes
router.post('/:conferenceId/questions', multiAuth, requireConferenceRole(ROLES.HOST, ROLES.SPEAKER), addQuestion);
router.get('/:conferenceId/questions', multiAuth, attachConferenceRole, getQuestions);
router.put('/:conferenceId/questions/:questionId', multiAuth, requireConferenceRole(ROLES.HOST, ROLES.SPEAKER), updateQuestion);
router.delete('/:conferenceId/questions/:questionId', multiAuth, requireConferenceRole(ROLES.HOST, ROLES.SPEAKER), deleteQuestion);
router.post('/:conferenceId/questions/:questionId/live', multiAuth, requireConferenceRole(ROLES.HOST, ROLES.SPEAKER), pushQuestionLive);
router.get('/:conferenceId/questions/live', multiAuth, getLiveQuestion);
router.post('/:conferenceId/questions/:questionId/answer', multiAuth, answerQuestion);

// Media routes
router.post('/:conferenceId/media', multiAuth, requireConferenceRole(ROLES.HOST, ROLES.SPEAKER), addMedia);
router.get('/:conferenceId/media', multiAuth, attachConferenceRole, getMedia);
router.delete('/:conferenceId/media/:mediaId', multiAuth, requireConferenceRole(ROLES.HOST, ROLES.SPEAKER), deleteMedia);

// Analytics routes
router.get('/:conferenceId/analytics', multiAuth, attachConferenceRole, getAnalytics);

// Group join routes
router.post('/:conferenceId/group/request', multiAuth, requestGroupJoin);
router.post('/group/requests/:requestId/review', multiAuth, reviewGroupJoinRequest);

// Materials route
router.get('/:conferenceId/materials', multiAuth, attachConferenceRole, getConferenceMaterials);

module.exports = router;


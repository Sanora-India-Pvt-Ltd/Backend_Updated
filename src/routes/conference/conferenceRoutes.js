const express = require('express');
const router = express.Router();
const { requireHostOrSuperAdmin, requireConferenceRole, attachConferenceRole, ROLES, multiAuth } = require('../../middleware/conferenceRoles');
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
    getConferenceMaterials,
    getConferenceByPublicCode,
    regenerateQRCode
} = require('../../controllers/conference/conferenceController');

// Public conference access by public code (no auth required)
router.get('/public/:publicCode', getConferenceByPublicCode);

// Conference CRUD routes
router.post('/', multiAuth, requireHostOrSuperAdmin, createConference);
router.get('/', multiAuth, getConferences);
router.get('/:conferenceId', multiAuth, attachConferenceRole, getConferenceById);
router.put('/:conferenceId', multiAuth, requireConferenceRole(ROLES.HOST, ROLES.SUPER_ADMIN), updateConference);
router.post('/:conferenceId/activate', multiAuth, requireConferenceRole(ROLES.HOST, ROLES.SUPER_ADMIN), activateConference);
router.post('/:conferenceId/end', multiAuth, requireConferenceRole(ROLES.HOST, ROLES.SUPER_ADMIN), endConference);
router.post('/:conferenceId/qr-code/regenerate', multiAuth, requireConferenceRole(ROLES.HOST, ROLES.SPEAKER, ROLES.SUPER_ADMIN), regenerateQRCode);

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

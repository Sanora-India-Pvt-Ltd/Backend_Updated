const asyncHandler = require('../../core/utils/asyncHandler');
const conferenceService = require('../../app/services/conference.service');

function getCreateContext(req) {
    let hostId = null;
    let ownerModel = 'User';
    let ownerSpeakerId = null;
    if (req.hostUser) {
        hostId = req.hostUser._id;
        ownerModel = 'Host';
    } else if (req.speaker) {
        hostId = req.speaker._id;
        ownerModel = 'Speaker';
        ownerSpeakerId = req.speaker._id;
    } else if (req.user) {
        hostId = req.user._id;
        ownerModel = 'User';
    }
    return { hostId, ownerModel, ownerSpeakerId };
}

const createConference = asyncHandler(async (req, res) => {
    const context = getCreateContext(req);
    const conference = await conferenceService.createConference(req.body, context);
    return res.status(201).json({ success: true, data: conference });
});

const getConferences = asyncHandler(async (req, res) => {
    const conferences = await conferenceService.getConferences(req.query, req.user?._id);
    return res.json({ success: true, data: conferences });
});

const getConferenceById = asyncHandler(async (req, res) => {
    const { conferenceId } = req.params;
    const { conference, userRole } = await conferenceService.getConferenceById(conferenceId, req);
    const data = { ...(conference && typeof conference.toObject === 'function' ? conference.toObject() : conference || {}), userRole };
    return res.json({
        success: true,
        data
    });
});

const updateConference = asyncHandler(async (req, res) => {
    const conference = await conferenceService.updateConference(
        req.conference,
        req.body,
        req.userRole,
        req.user
    );
    return res.json({ success: true, data: conference });
});

const activateConference = asyncHandler(async (req, res) => {
    const conference = await conferenceService.activateConference(req.conference, req.userRole);
    return res.json({ success: true, data: conference });
});

const endConference = asyncHandler(async (req, res) => {
    const conference = await conferenceService.endConference(
        req.conference,
        req.userRole,
        req.user._id
    );
    return res.json({ success: true, data: conference });
});

const addQuestion = asyncHandler(async (req, res) => {
    const question = await conferenceService.addQuestion(
        req.params.conferenceId,
        req.body,
        req
    );
    return res.status(201).json({ success: true, data: question });
});

const updateQuestion = asyncHandler(async (req, res) => {
    const question = await conferenceService.updateQuestion(
        req.params.conferenceId,
        req.params.questionId,
        req.body,
        req
    );
    return res.json({ success: true, data: question });
});

const deleteQuestion = asyncHandler(async (req, res) => {
    await conferenceService.deleteQuestion(
        req.params.conferenceId,
        req.params.questionId,
        req
    );
    return res.json({ success: true, message: 'Question deleted successfully' });
});

const pushQuestionLive = asyncHandler(async (req, res) => {
    const { question, startedAt, expiresAt } = await conferenceService.pushQuestionLive(
        req.params.conferenceId,
        req.params.questionId,
        req.body,
        req
    );
    return res.json({
        success: true,
        data: { ...question.toObject(), startedAt, expiresAt }
    });
});

const getLiveQuestion = asyncHandler(async (req, res) => {
    const result = await conferenceService.getLiveQuestion(
        req.params.conferenceId,
        req.user._id
    );
    if (result.data === null) {
        return res.json({ success: true, data: null, message: result.message });
    }
    return res.json({ success: true, data: result.data });
});

const answerQuestion = asyncHandler(async (req, res) => {
    const result = await conferenceService.answerQuestion(
        req.params.conferenceId,
        req.params.questionId,
        req.body,
        req.user._id
    );
    return res.json({ success: true, data: result });
});

const getQuestions = asyncHandler(async (req, res) => {
    const data = await conferenceService.getQuestions(req.params.conferenceId, req);
    return res.json({ success: true, data });
});

const addMedia = asyncHandler(async (req, res) => {
    const conferenceMedia = await conferenceService.addMedia(
        req.params.conferenceId,
        req.body,
        req
    );
    return res.status(201).json({ success: true, data: conferenceMedia });
});

const deleteMedia = asyncHandler(async (req, res) => {
    await conferenceService.deleteMedia(
        req.params.conferenceId,
        req.params.mediaId,
        req
    );
    return res.json({ success: true, message: 'Media deleted successfully' });
});

const getMedia = asyncHandler(async (req, res) => {
    const data = await conferenceService.getMedia(req.params.conferenceId, req);
    return res.json({ success: true, data });
});

const getAnalytics = asyncHandler(async (req, res) => {
    const data = await conferenceService.getAnalytics(req.params.conferenceId, req);
    return res.json({ success: true, data });
});

const requestGroupJoin = asyncHandler(async (req, res) => {
    const joinRequest = await conferenceService.requestGroupJoin(
        req.params.conferenceId,
        req.user._id
    );
    return res.status(201).json({ success: true, data: joinRequest });
});

const reviewGroupJoinRequest = asyncHandler(async (req, res) => {
    const joinRequest = await conferenceService.reviewGroupJoinRequest(
        req.params.requestId,
        req.body,
        req.user._id,
        req.user.role
    );
    return res.json({ success: true, data: joinRequest });
});

const getConferenceMaterials = asyncHandler(async (req, res) => {
    const data = await conferenceService.getConferenceMaterials(
        req.params.conferenceId,
        req.user._id,
        req.userRole,
        req
    );
    return res.json({ success: true, data });
});

const getConferenceByPublicCode = asyncHandler(async (req, res) => {
    const conference = await conferenceService.getConferenceByPublicCode(
        req.params.publicCode
    );
    return res.json({ success: true, data: conference });
});

const regenerateQRCode = asyncHandler(async (req, res) => {
    const conference = await conferenceService.regenerateQRCode(
        req.conference,
        req.userRole
    );
    return res.json({
        success: true,
        data: conference,
        message: 'QR code regenerated successfully'
    });
});

module.exports = {
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
};

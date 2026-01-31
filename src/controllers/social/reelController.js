/**
 * Thin reel controller: reads req, calls reelService, sends same JSON.
 */

const reelService = require('../../app/services/reel.service');

function respond(res, result) {
    res.status(result.statusCode).json(result.json);
}

const uploadReelMedia = async (req, res) => {
    const result = await reelService.uploadReelMedia(req.user, req.file);
    respond(res, result);
};

const createReelWithUpload = async (req, res) => {
    const result = await reelService.createReelWithUpload(req.user, req.body, req.file);
    respond(res, result);
};

const createReel = async (req, res) => {
    const result = await reelService.createReel(req.user, req.body);
    respond(res, result);
};

const getReels = async (req, res) => {
    const result = await reelService.getReels(req.user?._id, req.query);
    respond(res, result);
};

const getUserReels = async (req, res) => {
    const result = await reelService.getUserReels(req.user?._id, req.params.id, req.query);
    respond(res, result);
};

const toggleLikeReel = async (req, res) => {
    const result = await reelService.toggleLikeReel(req.user, req.params.id, req.body);
    respond(res, result);
};

const addComment = async (req, res) => {
    const result = await reelService.addCommentReel(req.user, req.params.id, req.body);
    respond(res, result);
};

const deleteComment = async (req, res) => {
    const result = await reelService.deleteCommentReel(req.user, req.params.id, req.params.commentId);
    respond(res, result);
};

const deleteReel = async (req, res) => {
    const result = await reelService.deleteReel(req.user, req.params.id);
    respond(res, result);
};

const reportReel = async (req, res) => {
    const result = await reelService.reportReel(req.user, req.params.id, req.body);
    respond(res, result);
};

module.exports = {
    uploadReelMedia,
    createReelWithUpload,
    createReel,
    getReels,
    getUserReels,
    toggleLikeReel,
    addComment,
    deleteComment,
    deleteReel,
    reportReel
};

/**
 * Thin like controller: reads req, calls socialService, sends same JSON.
 */

const socialService = require('../../app/services/social.service');

function respond(res, result) {
    res.status(result.statusCode).json(result.json);
}

exports.toggleLikePost = async (req, res) => {
    const result = await socialService.toggleLikePost(req.user._id, req.params.id, req.body);
    respond(res, result);
};

exports.toggleLikeReel = async (req, res) => {
    const result = await socialService.toggleLikeReel(req.user._id, req.params.id, req.body);
    respond(res, result);
};

exports.getReactions = async (req, res) => {
    const result = await socialService.getReactions(req.params.content, req.params.contentId);
    respond(res, result);
};

exports.getMyReactions = async (req, res) => {
    const result = await socialService.getMyReactions(req.user._id, req.body);
    respond(res, result);
};

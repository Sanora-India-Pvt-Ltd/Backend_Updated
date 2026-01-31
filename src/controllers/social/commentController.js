/**
 * Thin comment controller: reads req, calls socialService, sends same JSON.
 */

const socialService = require('../../app/services/social.service');

function respond(res, result) {
    res.status(result.statusCode).json(result.json);
}

const addComment = async (req, res) => {
    const result = await socialService.addComment(req.user._id, req.body);
    respond(res, result);
};

const addReply = async (req, res) => {
    const result = await socialService.addReply(req.user._id, req.params.commentId, req.body);
    respond(res, result);
};

const getComments = async (req, res) => {
    const result = await socialService.getComments(req.params.contentId, req.params.contentType, req.query);
    respond(res, result);
};

const getCommentsByQuery = async (req, res) => {
    const result = await socialService.getCommentsByQuery(req.query);
    respond(res, result);
};

const getReplies = async (req, res) => {
    const result = await socialService.getReplies(req.params.commentId, req.query);
    respond(res, result);
};

const deleteComment = async (req, res) => {
    const result = await socialService.deleteComment(req.user._id, req.params.commentId, req.query);
    respond(res, result);
};

const deleteReply = async (req, res) => {
    const result = await socialService.deleteReply(req.user._id, req.params.commentId, req.params.replyId, req.query);
    respond(res, result);
};

module.exports = {
    addComment,
    addReply,
    getComments,
    getCommentsByQuery,
    getReplies,
    deleteComment,
    deleteReply
};

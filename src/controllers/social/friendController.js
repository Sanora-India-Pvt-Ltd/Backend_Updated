/**
 * Thin friend controller: reads req, calls friendService, sends same JSON.
 */

const friendService = require('../../app/services/friend.service');

function respond(res, result) {
    res.status(result.statusCode).json(result.json);
}

const sendFriendRequest = async (req, res) => {
    const result = await friendService.sendFriendRequest(req.user._id, req.params.receiverId);
    respond(res, result);
};

const acceptFriendRequest = async (req, res) => {
    const result = await friendService.acceptFriendRequest(req.user._id, req.params.requestId);
    respond(res, result);
};

const rejectFriendRequest = async (req, res) => {
    const result = await friendService.rejectFriendRequest(req.user._id, req.params.requestId);
    respond(res, result);
};

const listFriends = async (req, res) => {
    const result = await friendService.listFriends(req.user._id);
    respond(res, result);
};

const listReceivedRequests = async (req, res) => {
    const result = await friendService.listReceivedRequests(req.user._id);
    respond(res, result);
};

const listSentRequests = async (req, res) => {
    const result = await friendService.listSentRequests(req.user._id);
    respond(res, result);
};

const unfriend = async (req, res) => {
    const result = await friendService.unfriend(req.user._id, req.params.friendId);
    respond(res, result);
};

const cancelSentRequest = async (req, res) => {
    const result = await friendService.cancelSentRequest(req.user._id, req.params.requestId);
    respond(res, result);
};

const getFriendSuggestions = async (req, res) => {
    const result = await friendService.getFriendSuggestions(req.user._id, req.query.limit);
    respond(res, result);
};

module.exports = {
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    listFriends,
    listReceivedRequests,
    listSentRequests,
    unfriend,
    cancelSentRequest,
    getFriendSuggestions
};

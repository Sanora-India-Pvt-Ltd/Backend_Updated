/**
 * Thin chat controller: reads req, calls chatService, sends same JSON.
 */

const chatService = require('../../app/services/chat.service');

function respond(res, result) {
    res.status(result.statusCode).json(result.json);
}

const getConversations = async (req, res) => {
    const result = await chatService.getConversations(req.user._id);
    respond(res, result);
};

const getOrCreateConversation = async (req, res) => {
    const result = await chatService.getOrCreateConversation(req.user._id, req.params.participantId);
    respond(res, result);
};

const getMessages = async (req, res) => {
    const result = await chatService.getMessages(req.user._id, req.params.conversationId, req.query);
    respond(res, result);
};

const sendMessage = async (req, res) => {
    const result = await chatService.sendMessage(req.user._id, req.body);
    respond(res, result);
};

const deleteMessage = async (req, res) => {
    const result = await chatService.deleteMessage(req.user._id, req.params.messageId, req.body);
    respond(res, result);
};

const markMessagesAsRead = async (req, res) => {
    const result = await chatService.markMessagesAsRead(req.user._id, req.body);
    respond(res, result);
};

const getUnreadCount = async (req, res) => {
    const result = await chatService.getUnreadCount(req.user._id);
    respond(res, result);
};

const createGroup = async (req, res) => {
    const result = await chatService.createGroup(req.user._id, req.body);
    respond(res, result);
};

const updateGroupInfo = async (req, res) => {
    const result = await chatService.updateGroupInfo(req.user._id, req.params.groupId, req.body);
    respond(res, result);
};

const uploadGroupPhoto = async (req, res) => {
    const result = await chatService.uploadGroupPhoto(req.user._id, req.params.groupId, req.file);
    respond(res, result);
};

const removeGroupPhoto = async (req, res) => {
    const result = await chatService.removeGroupPhoto(req.user._id, req.params.groupId);
    respond(res, result);
};

const removeGroupMember = async (req, res) => {
    const result = await chatService.removeGroupMember(req.user._id, req.params.groupId, req.body);
    respond(res, result);
};

const addGroupAdmin = async (req, res) => {
    const result = await chatService.addGroupAdmin(req.user._id, req.params.groupId, req.body);
    respond(res, result);
};

module.exports = {
    getConversations,
    getOrCreateConversation,
    getMessages,
    sendMessage,
    deleteMessage,
    markMessagesAsRead,
    getUnreadCount,
    createGroup,
    updateGroupInfo,
    uploadGroupPhoto,
    removeGroupPhoto,
    removeGroupMember,
    addGroupAdmin
};

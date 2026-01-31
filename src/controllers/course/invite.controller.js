const inviteService = require('../../app/services/invite.service');

const generateInvite = async (req, res) => {
    const result = await inviteService.generateInvite(req.params.courseId, req.universityId, req.body);
    res.status(result.statusCode).json(result.json);
};

const validateInvite = async (req, res) => {
    const result = await inviteService.validateInvite(req.params.token);
    res.status(result.statusCode).json(result.json);
};

const acceptInvite = async (req, res) => {
    const result = await inviteService.acceptInvite(req.params.token, req.userId);
    res.status(result.statusCode).json(result.json);
};

const getMyInvites = async (req, res) => {
    const result = await inviteService.getMyInvites(req.userId);
    res.status(result.statusCode).json(result.json);
};

const getInvitesSent = async (req, res) => {
    const result = await inviteService.getInvitesSent(req.params.courseId, req.universityId);
    res.status(result.statusCode).json(result.json);
};

module.exports = {
    generateInvite,
    validateInvite,
    acceptInvite,
    getMyInvites,
    getInvitesSent
};

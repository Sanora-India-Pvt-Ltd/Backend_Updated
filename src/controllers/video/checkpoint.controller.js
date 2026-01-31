const videoService = require('../../app/services/video.service');

const createQuestion = async (req, res) => {
    const result = await videoService.createCheckpointQuestion(req.params.videoId, req.universityId, req.body);
    res.status(result.statusCode).json(result.json);
};

const getQuestion = async (req, res) => {
    const result = await videoService.getCheckpointQuestion(req.params.videoId, req.params.checkpointTime);
    res.status(result.statusCode).json(result.json);
};

const validateAnswer = async (req, res) => {
    const result = await videoService.validateCheckpointAnswer(req.params.id, req.body.answer);
    res.status(result.statusCode).json(result.json);
};

const getQuestionsByVideo = async (req, res) => {
    const result = await videoService.getQuestionsByVideo(req.params.videoId);
    res.status(result.statusCode).json(result.json);
};

const updateQuestion = async (req, res) => {
    const result = await videoService.updateCheckpointQuestion(req.params.id, req.universityId, req.body);
    res.status(result.statusCode).json(result.json);
};

const deleteQuestion = async (req, res) => {
    const result = await videoService.deleteCheckpointQuestion(req.params.id, req.universityId);
    res.status(result.statusCode).json(result.json);
};

module.exports = {
    createQuestion,
    getQuestion,
    validateAnswer,
    getQuestionsByVideo,
    updateQuestion,
    deleteQuestion
};

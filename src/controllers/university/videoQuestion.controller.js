const videoQuestionService = require('../../app/services/videoQuestion.service');

const getVideoQuestions = async (req, res) => {
    const result = await videoQuestionService.getVideoQuestions(req.params.videoId, req.universityId);
    return res.status(result.statusCode).json(result.json);
};

const updateVideoQuestion = async (req, res) => {
    const result = await videoQuestionService.updateVideoQuestion(req.params.questionId, req.universityId, req.body);
    return res.status(result.statusCode).json(result.json);
};

const deleteVideoQuestion = async (req, res) => {
    const result = await videoQuestionService.deleteVideoQuestion(req.params.questionId, req.universityId);
    return res.status(result.statusCode).json(result.json);
};

const createManualVideoQuestion = async (req, res) => {
    const result = await videoQuestionService.createManualVideoQuestion(req.params.videoId, req.universityId, req.body);
    return res.status(result.statusCode).json(result.json);
};

const regenerateVideoQuestions = async (req, res) => {
    const result = await videoQuestionService.regenerateVideoQuestions(req.params.videoId, req.universityId);
    return res.status(result.statusCode).json(result.json);
};

const publishVideoQuestion = async (req, res) => {
    const result = await videoQuestionService.publishVideoQuestion(req.params.questionId, req.universityId);
    return res.status(result.statusCode).json(result.json);
};

module.exports = {
    getVideoQuestions,
    updateVideoQuestion,
    deleteVideoQuestion,
    createManualVideoQuestion,
    regenerateVideoQuestions,
    publishVideoQuestion
};

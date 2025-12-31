const ConferenceQuestion = require('../../models/conference/ConferenceQuestion');

/**
 * Get result for a specific question
 * GET /api/conference/:conferenceId/questions/:questionId/results
 */
const getQuestionResult = async (req, res) => {
    try {
        const { conferenceId, questionId } = req.params;

        const question = await ConferenceQuestion.findOne({
            _id: questionId,
            conferenceId: conferenceId,
            status: 'CLOSED'
        }).select('conferenceId questionText options results');

        if (!question) {
            return res.status(404).json({
                success: false,
                message: 'Question result not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                conferenceId: question.conferenceId,
                questionId: question._id,
                questionText: question.questionText,
                options: question.options,
                results: question.results
            }
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error fetching question result',
            error: error.message
        });
    }
};

/**
 * Get results for all closed questions in a conference
 * GET /api/conference/:conferenceId/questions/results
 */
const getConferenceResults = async (req, res) => {
    try {
        const { conferenceId } = req.params;

        const questions = await ConferenceQuestion.find({
            conferenceId: conferenceId,
            status: 'CLOSED'
        })
        .select('_id questionText results order')
        .sort({ order: 1 });

        const results = questions.map(question => ({
            questionId: question._id,
            questionText: question.questionText,
            results: question.results
        }));

        return res.status(200).json({
            success: true,
            data: results
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Error fetching conference results',
            error: error.message
        });
    }
};

module.exports = {
    getQuestionResult,
    getConferenceResults
};


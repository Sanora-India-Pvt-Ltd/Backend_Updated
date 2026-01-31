/**
 * Conference results business logic.
 * Returns { statusCode, json }. Used by conferenceResultsController.
 */

const ConferenceQuestion = require('../../models/conference/ConferenceQuestion');

async function getQuestionResult(params) {
    const { conferenceId, questionId } = params;

    const question = await ConferenceQuestion.findOne({
        _id: questionId,
        conferenceId,
        status: 'CLOSED'
    })
        .select('conferenceId questionText options results');

    if (!question) {
        return { statusCode: 404, json: { success: false, message: 'Question result not found' } };
    }

    return {
        statusCode: 200,
        json: {
            success: true,
            data: {
                conferenceId: question.conferenceId,
                questionId: question._id,
                questionText: question.questionText,
                options: question.options,
                results: question.results
            }
        }
    };
}

async function getConferenceResults(params) {
    const { conferenceId } = params;

    const questions = await ConferenceQuestion.find({
        conferenceId,
        status: 'CLOSED'
    })
        .select('_id questionText results order')
        .sort({ order: 1 });

    const results = questions.map((q) => ({
        questionId: q._id,
        questionText: q.questionText,
        results: q.results
    }));

    return {
        statusCode: 200,
        json: {
            success: true,
            data: results
        }
    };
}

module.exports = {
    getQuestionResult,
    getConferenceResults
};

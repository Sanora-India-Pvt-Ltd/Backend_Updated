/**
 * Thin controller: reads req, calls conferenceResultsService, sends same JSON/status.
 * No models, no DB logic.
 */

const conferenceResultsService = require('../../app/services/conferenceResults.service');

async function getQuestionResult(req, res) {
    const result = await conferenceResultsService.getQuestionResult(req.params);
    res.status(result.statusCode).json(result.json);
}

async function getConferenceResults(req, res) {
    const result = await conferenceResultsService.getConferenceResults(req.params);
    res.status(result.statusCode).json(result.json);
}

module.exports = {
    getQuestionResult,
    getConferenceResults
};

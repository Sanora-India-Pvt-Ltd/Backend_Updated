const express = require('express');
const router = express.Router();
const { multiAuth } = require('../../middleware/conferenceRoles');
const {
    getQuestionResult,
    getConferenceResults
} = require('../../controllers/conference/conferenceResultsController');

// Results routes
router.get('/:conferenceId/questions/:questionId/results', multiAuth, getQuestionResult);
router.get('/:conferenceId/questions/results', multiAuth, getConferenceResults);

module.exports = router;

const express = require('express');
const router = express.Router();
const { getVideoQuestions, updateVideoQuestion, deleteVideoQuestion, createManualVideoQuestion, regenerateVideoQuestions } = require('../../controllers/university/videoQuestion.controller');
const { flexibleAuth } = require('../../middleware/flexibleAuth.middleware');
const { requireUniversity } = require('../../middleware/roleGuards');

// University Video Question Routes (UNIVERSITY only)
router.get('/videos/:videoId/questions', flexibleAuth, requireUniversity, getVideoQuestions);
router.post('/videos/:videoId/questions', flexibleAuth, requireUniversity, createManualVideoQuestion);
router.post('/videos/:videoId/questions/regenerate', flexibleAuth, requireUniversity, regenerateVideoQuestions);
router.put('/questions/:questionId', flexibleAuth, requireUniversity, updateVideoQuestion);
router.delete('/questions/:questionId', flexibleAuth, requireUniversity, deleteVideoQuestion);

module.exports = router;


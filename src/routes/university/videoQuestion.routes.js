const express = require('express');
const router = express.Router();
const { getVideoQuestions } = require('../../controllers/university/videoQuestion.controller');
const { flexibleAuth } = require('../../middleware/flexibleAuth.middleware');
const { requireUniversity } = require('../../middleware/roleGuards');

// University Video Question Routes (UNIVERSITY only)
router.get('/videos/:videoId/questions', flexibleAuth, requireUniversity, getVideoQuestions);

module.exports = router;


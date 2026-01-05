const express = require('express');
const router = express.Router();
const {
    createQuestion,
    getQuestion,
    validateAnswer,
    getQuestionsByVideo,
    updateQuestion,
    deleteQuestion
} = require('../../controllers/video/checkpoint.controller');
const { protectUniversity } = require('../../middleware/universityAuth.middleware');
const { protect } = require('../../middleware/auth');

// Checkpoint Routes
router.post('/videos/:videoId/questions', protectUniversity, createQuestion);
router.get('/videos/:videoId/questions', protect, getQuestionsByVideo);
router.get('/videos/:videoId/questions/:checkpointTime', protect, getQuestion);
router.post('/questions/:id/validate', protect, validateAnswer);
router.put('/questions/:id', protectUniversity, updateQuestion);
router.delete('/questions/:id', protectUniversity, deleteQuestion);

module.exports = router;


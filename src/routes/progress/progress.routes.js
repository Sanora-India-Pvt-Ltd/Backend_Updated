const express = require('express');
const router = express.Router();
const {
    updateVideoProgress,
    getVideoProgress,
    getMultipleProgress,
    markVideoComplete
} = require('../../controllers/progress/userProgress.controller');
const {
    getCourseProgress,
    getCompletionStats,
    resetProgress
} = require('../../controllers/progress/courseProgress.controller');
const { protect } = require('../../middleware/auth');

// Progress Routes
router.put('/video/:videoId', protect, updateVideoProgress);
router.get('/video/:videoId', protect, getVideoProgress);
router.get('/playlist/:playlistId', protect, getMultipleProgress);
router.get('/course/:courseId', protect, getCourseProgress);
router.post('/course/:courseId/reset/:userId?', protect, resetProgress);
router.get('/stats', protect, getCompletionStats);
router.post('/video/:videoId/complete', protect, markVideoComplete);

module.exports = router;


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
const { flexibleAuth } = require('../../middleware/flexibleAuth.middleware');
const { requireUser } = require('../../middleware/roleGuards');

// Progress Routes (USER only)
router.post('/video', flexibleAuth, requireUser, updateVideoProgress);
router.put('/video/:videoId', flexibleAuth, requireUser, updateVideoProgress);
router.get('/video/:videoId', flexibleAuth, requireUser, getVideoProgress);
router.get('/playlist/:playlistId', flexibleAuth, requireUser, getMultipleProgress);
router.get('/course/:courseId', flexibleAuth, requireUser, getCourseProgress);
router.post('/course/:courseId/reset/:userId?', flexibleAuth, requireUser, resetProgress);
router.get('/stats', flexibleAuth, requireUser, getCompletionStats);
router.post('/video/:videoId/complete', flexibleAuth, requireUser, markVideoComplete);

module.exports = router;


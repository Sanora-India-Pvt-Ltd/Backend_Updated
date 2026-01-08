const express = require('express');
const { protect } = require('../middleware/auth');
const { flexibleAuth } = require('../middleware/flexibleAuth.middleware');
const diskUpload = require('../middleware/upload');
const {
    getJobStatus,
    getMyJobs,
    getQueueStats,
    uploadVideo
} = require('../controllers/videoTranscodingController');

const router = express.Router();

// Upload video for course transcoding (supports both USER and UNIVERSITY tokens)
// POST /api/video-transcoding/upload
// Body: multipart/form-data with 'video' file, courseId, title, optional attachedProductId
router.post('/upload', flexibleAuth, diskUpload.single('video'), uploadVideo);

// Get transcoding job status
// GET /api/video-transcoding/status/:jobId
router.get('/status/:jobId', getJobStatus);

// Get all transcoding jobs for current user (protected)
// GET /api/video-transcoding/jobs?status=completed&page=1&limit=20
router.get('/jobs', protect, getMyJobs);

// Get queue statistics (protected)
// GET /api/video-transcoding/stats
router.get('/stats', protect, getQueueStats);

console.log('📋 Video transcoding routes registered:');
console.log('  POST   /api/video-transcoding/upload (flexibleAuth)');
console.log('  GET    /api/video-transcoding/status/:jobId');
console.log('  GET    /api/video-transcoding/jobs (protected)');
console.log('  GET    /api/video-transcoding/stats (protected)');

module.exports = router;


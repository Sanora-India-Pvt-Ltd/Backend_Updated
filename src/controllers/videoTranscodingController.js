const asyncHandler = require('../core/utils/asyncHandler');
const videoTranscodingService = require('../app/services/videoTranscoding.service');

/**
 * Get transcoding job status
 * GET /api/video-transcoding/status/:jobId
 */
const getJobStatus = asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const currentUserId = req.user ? req.user._id : null;
    const jobStatus = await videoTranscodingService.getJobStatus(jobId, currentUserId);

    res.json({
        success: true,
        data: jobStatus
    });
});

/**
 * Get all transcoding jobs for current user
 * GET /api/video-transcoding/jobs
 */
const getMyJobs = asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { status, limit = 20, page = 1 } = req.query;

    const { jobs, pagination } = await videoTranscodingService.getMyJobs(userId, {
        status,
        limit,
        page
    });

    res.json({
        success: true,
        data: {
            jobs,
            pagination
        }
    });
});

/**
 * Get queue statistics
 * GET /api/video-transcoding/stats
 */
const getQueueStats = asyncHandler(async (req, res) => {
    const { queue, jobCounts } = await videoTranscodingService.getQueueStats();

    res.json({
        success: true,
        data: {
            queue,
            jobCounts
        }
    });
});

/**
 * Upload video for course transcoding
 * POST /api/video-transcoding/upload
 */
const uploadVideo = asyncHandler(async (req, res) => {
    const createdBy = videoTranscodingService.getCreatedBy(req);
    const data = await videoTranscodingService.uploadVideo(req.file, req.body, createdBy);

    res.status(201).json({
        success: true,
        message: 'Video uploaded and queued for transcoding',
        data
    });
});

module.exports = {
    getJobStatus,
    getMyJobs,
    getQueueStats,
    uploadVideo
};

const videoTranscodingQueue = require('../services/videoTranscodingQueue');
const VideoTranscodingJob = require('../models/VideoTranscodingJob');
const Video = require('../models/course/Video');
// const { protect } = require('../middleware/auth');
const { isVideo } = require('../services/videoTranscoder');

/**
 * Get transcoding job status
 * GET /api/video-transcoding/status/:jobId
 */
const getJobStatus = async (req, res) => {
    try {
        const { jobId } = req.params;

        if (!jobId) {
            return res.status(400).json({
                success: false,
                message: 'Job ID is required'
            });
        }

        const jobStatus = await videoTranscodingQueue.getJobStatus(jobId);

        if (!jobStatus) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        // Check if user owns this job (optional security check)
        if (req.user && jobStatus.userId !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this job'
            });
        }

        res.json({
            success: true,
            data: jobStatus
        });
    } catch (error) {
        console.error('Get job status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get job status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get all transcoding jobs for current user
 * GET /api/video-transcoding/jobs
 */
const getMyJobs = async (req, res) => {
    try {
        const userId = req.user._id;
        const { status, limit = 20, page = 1 } = req.query;

        const query = { userId };
        if (status) {
            query.status = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const jobs = await VideoTranscodingJob.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(skip)
            .select('-__v');

        const total = await VideoTranscodingJob.countDocuments(query);

        res.json({
            success: true,
            data: {
                jobs,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('Get my jobs error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get jobs',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Get queue statistics
 * GET /api/video-transcoding/stats
 */
const getQueueStats = async (req, res) => {
    try {
        const stats = videoTranscodingQueue.getStats();

        // Get job counts from database
        const jobCounts = await VideoTranscodingJob.aggregate([
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 }
                }
            }
        ]);

        const statusCounts = {};
        jobCounts.forEach(item => {
            statusCounts[item._id] = item.count;
        });

        res.json({
            success: true,
            data: {
                queue: stats,
                jobCounts: statusCounts
            }
        });
    } catch (error) {
        console.error('Get queue stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get queue stats',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

/**
 * Upload video for course transcoding
 * POST /api/video-transcoding/upload
 */
const uploadVideo = async (req, res) => {
    try {
        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Video file is required'
            });
        }

        // Validate that the file is a video
        if (!isVideo(req.file.mimetype)) {
            return res.status(400).json({
                success: false,
                message: 'File must be a video'
            });
        }

        // Get courseId from body (required)
        const { courseId, title, attachedProductId } = req.body;

        if (!courseId) {
            return res.status(400).json({
                success: false,
                message: 'courseId is required'
            });
        }

        if (!title || !title.trim()) {
            return res.status(400).json({
                success: false,
                message: 'title is required'
            });
        }

        // Get creator ID (supports both USER and UNIVERSITY)
        let createdBy;
        if (req.user && req.user._id) {
            createdBy = req.user._id.toString();
        } else if (req.universityId) {
            createdBy = req.universityId.toString();
        } else {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Create Video document BEFORE queueing transcoding
        const video = await Video.create({
            courseId,
            title: title.trim(),
            attachedProductId: attachedProductId || null,
            productAnalytics: {
                views: 0,
                clicks: 0,
                purchases: 0
            },
            status: 'UPLOADING',
            videoUrl: null, // Will be set after transcoding
            s3Key: null // Will be set after transcoding
        });

        // Create transcoding job with videoId, courseId, and createdBy
        const jobId = await videoTranscodingQueue.addJob({
            inputPath: req.file.path,
            userId: createdBy, // Keep userId for backward compatibility
            jobType: 'course',
            originalFilename: req.file.originalname,
            videoId: video._id.toString(),
            courseId: courseId,
            createdBy: createdBy
        });

        res.status(201).json({
            success: true,
            message: 'Video uploaded and queued for transcoding',
            data: {
                videoId: video._id.toString(),
                jobId: jobId,
                courseId: courseId,
                title: video.title,
                status: video.status,
                originalFilename: req.file.originalname,
                fileSize: req.file.size,
                mimetype: req.file.mimetype
            }
        });
    } catch (error) {
        console.error('Upload video error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload video',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getJobStatus,
    getMyJobs,
    getQueueStats,
    uploadVideo
};


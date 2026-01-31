const eventBus = require('../../core/infra/eventBus');
const VideoTranscodingJob = require('../../models/VideoTranscodingJob');
const Video = require('../../models/course/Video');
const { isVideo } = require('../../core/infra/videoTranscoder');
const AppError = require('../../core/errors/AppError');

function getCreatedBy(req) {
    if (req.user && req.user._id) return req.user._id.toString();
    if (req.universityId) return req.universityId.toString();
    throw new AppError('Authentication required', 401);
}

async function getJobStatus(jobId, currentUserId) {
    if (!jobId) throw new AppError('Job ID is required', 400);

    const jobStatus = await eventBus.getTranscodingJobStatus(jobId);
    if (!jobStatus) throw new AppError('Job not found', 404);

    if (currentUserId && jobStatus.userId !== currentUserId.toString()) {
        throw new AppError('Not authorized to view this job', 403);
    }

    return jobStatus;
}

async function getMyJobs(userId, { status, limit = 20, page = 1 } = {}) {
    const query = { userId };
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const jobs = await VideoTranscodingJob.find(query)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .select('-__v');

    const total = await VideoTranscodingJob.countDocuments(query);

    return {
        jobs,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            totalPages: Math.ceil(total / parseInt(limit))
        }
    };
}

async function getQueueStats() {
    const stats = eventBus.getTranscodingQueueStats();
    const jobCounts = await VideoTranscodingJob.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const statusCounts = {};
    jobCounts.forEach((item) => {
        statusCounts[item._id] = item.count;
    });

    return { queue: stats, jobCounts: statusCounts };
}

async function uploadVideo(file, body, createdBy) {
    if (!file) throw new AppError('Video file is required', 400);
    if (!isVideo(file.mimetype)) throw new AppError('File must be a video', 400);

    const { courseId, title, attachedProductId } = body;
    if (!courseId) throw new AppError('courseId is required', 400);
    if (!title || !title.trim()) throw new AppError('title is required', 400);

    const video = await Video.create({
        courseId,
        title: title.trim(),
        attachedProductId: attachedProductId || null,
        productAnalytics: { views: 0, clicks: 0, purchases: 0 },
        status: 'UPLOADING',
        videoUrl: null,
        s3Key: null
    });

    const jobId = await eventBus.addTranscodingJob({
        inputPath: file.path,
        userId: createdBy,
        jobType: 'course',
        originalFilename: file.originalname,
        videoId: video._id.toString(),
        courseId: courseId,
        createdBy: createdBy
    });

    return {
        videoId: video._id.toString(),
        jobId,
        courseId,
        title: video.title,
        status: video.status,
        originalFilename: file.originalname,
        fileSize: file.size,
        mimetype: file.mimetype
    };
}

module.exports = {
    getCreatedBy,
    getJobStatus,
    getMyJobs,
    getQueueStats,
    uploadVideo
};

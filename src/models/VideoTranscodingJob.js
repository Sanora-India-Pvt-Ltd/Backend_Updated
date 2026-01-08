const mongoose = require('mongoose');

const videoTranscodingJobSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    inputPath: {
        type: String,
        required: true
    },
    outputPath: {
        type: String,
        default: null
    },
    jobType: {
        type: String,
        enum: ['post', 'reel', 'story', 'media', 'course'],
        required: true,
        index: true
    },
    videoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Video',
        default: null,
        index: true
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        default: null,
        index: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
        index: true
    },
    originalFilename: {
        type: String,
        default: ''
    },
    status: {
        type: String,
        enum: ['queued', 'processing', 'completed', 'failed'],
        default: 'queued',
        index: true
    },
    progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    error: {
        type: String,
        default: null
    },
    // Video metadata (after transcoding)
    duration: {
        type: Number,
        default: null
    },
    width: {
        type: Number,
        default: null
    },
    height: {
        type: Number,
        default: null
    },
    fileSize: {
        type: Number,
        default: null
    },
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
        // Note: index is created explicitly below for TTL functionality
    },
    startedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    },
    failedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Indexes for efficient queries
videoTranscodingJobSchema.index({ userId: 1, status: 1, createdAt: -1 });
videoTranscodingJobSchema.index({ status: 1, createdAt: -1 });
videoTranscodingJobSchema.index({ createdAt: -1 });
videoTranscodingJobSchema.index({ videoId: 1 });
videoTranscodingJobSchema.index({ courseId: 1, status: 1 });

// TTL index to auto-delete old completed/failed jobs after 7 days
videoTranscodingJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

const VideoTranscodingJob = mongoose.model('VideoTranscodingJob', videoTranscodingJobSchema);

module.exports = VideoTranscodingJob;


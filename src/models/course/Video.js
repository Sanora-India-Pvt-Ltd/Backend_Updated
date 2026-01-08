const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
    playlistId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Playlist',
        required: false, // Optional for direct course uploads
        default: null
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: ''
    },
    subtitles: {
        type: String,  // VTT/SRT subtitle text content
        default: null
    },
    videoUrl: {
        type: String,
        required: false, // Not required during upload, set after transcoding
        default: null
    },
    status: {
        type: String,
        enum: ['UPLOADING', 'READY', 'FAILED'],
        default: 'UPLOADING'
    },
    thumbnail: {
        type: String,
        default: null
    },
    duration: {
        type: Number, // in seconds
        default: 0
    },
    order: {
        type: Number,
        default: 0
    },
    s3Key: {
        type: String,
        default: null
    },
    attachedProductId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        default: null
    },
    productAnalytics: {
        views: {
            type: Number,
            default: 0,
            min: 0
        },
        clicks: {
            type: Number,
            default: 0,
            min: 0
        },
        purchases: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes for performance
videoSchema.index({ playlistId: 1, order: 1 });
videoSchema.index({ courseId: 1 });
videoSchema.index({ playlistId: 1 });
videoSchema.index({ attachedProductId: 1 });

module.exports = mongoose.model('Video', videoSchema);


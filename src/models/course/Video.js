const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
    playlistId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Playlist',
        required: true
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    details: {
        title: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            default: ''
        },
        thumbnail: {
            type: String,
            default: null
        }
    },
    media: {
        videoUrl: {
            type: String,
            required: true
        },
        s3Key: {
            type: String,
            default: null
        },
        subtitles: {
            type: String,  // VTT/SRT subtitle text content
            default: null
        },
        duration: {
            type: Number, // in seconds
            default: 0
        }
    },
    order: {
        type: Number,
        default: 0
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

module.exports = mongoose.model('Video', videoSchema);


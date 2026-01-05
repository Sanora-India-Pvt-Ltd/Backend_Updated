const mongoose = require('mongoose');

const userVideoProgressSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    videoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Video',
        required: true
    },
    progress: {
        lastWatchedSecond: {
            type: Number,
            default: 0,
            min: 0
        },
        completed: {
            type: Boolean,
            default: false
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    }
}, {
    timestamps: true
});

// UNIQUE compound index for userId + videoId (critical for scale)
userVideoProgressSchema.index({ userId: 1, videoId: 1 }, { unique: true });

// Additional indexes for queries
userVideoProgressSchema.index({ userId: 1, 'progress.completed': 1 });
userVideoProgressSchema.index({ videoId: 1 });

module.exports = mongoose.model('UserVideoProgress', userVideoProgressSchema);


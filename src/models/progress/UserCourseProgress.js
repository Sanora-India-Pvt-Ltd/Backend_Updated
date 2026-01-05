const mongoose = require('mongoose');

const userCourseProgressSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    progress: {
        completedVideos: {
            type: Number,
            default: 0,
            min: 0
        },
        completionPercent: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        lastAccessedAt: {
            type: Date,
            default: Date.now
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    }
}, {
    timestamps: true
});

// Compound index for userId + courseId
userCourseProgressSchema.index({ userId: 1, courseId: 1 });

// Additional indexes
userCourseProgressSchema.index({ courseId: 1 });
userCourseProgressSchema.index({ userId: 1 });

module.exports = mongoose.model('UserCourseProgress', userCourseProgressSchema);


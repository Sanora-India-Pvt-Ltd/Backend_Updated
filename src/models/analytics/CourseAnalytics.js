const mongoose = require('mongoose');

const courseAnalyticsSchema = new mongoose.Schema({
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true,
        unique: true
    },
    totalUsers: {
        type: Number,
        default: 0
    },
    avgCompletionTime: {
        type: Number, // in minutes
        default: null
    },
    mostRepeatedSegments: [{
        from: {
            type: Number, // in seconds
            required: true
        },
        to: {
            type: Number, // in seconds
            required: true
        },
        count: {
            type: Number,
            default: 0
        }
    }],
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for courseId (unique)
courseAnalyticsSchema.index({ courseId: 1 }, { unique: true });

module.exports = mongoose.model('CourseAnalytics', courseAnalyticsSchema);


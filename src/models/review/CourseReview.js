const mongoose = require('mongoose');

const courseReviewSchema = new mongoose.Schema({
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },
    comment: {
        type: String,
        default: '',
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Compound index for courseId + userId (one review per user per course)
courseReviewSchema.index({ courseId: 1, userId: 1 }, { unique: true });

// Additional indexes
courseReviewSchema.index({ courseId: 1, rating: 1 });
courseReviewSchema.index({ userId: 1 });

module.exports = mongoose.model('CourseReview', courseReviewSchema);


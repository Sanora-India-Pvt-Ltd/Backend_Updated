const mongoose = require('mongoose');

const mcqGenerationJobSchema = new mongoose.Schema({
    videoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Video',
        required: true,
        index: true
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
        default: 'PENDING',
        index: true
    },
    provider: {
        type: String,
        default: 'DRISHTI_AI'
    },
    attempts: {
        type: Number,
        default: 0
    },
    error: {
        type: String,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Index for efficient querying of pending jobs
mcqGenerationJobSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model('MCQGenerationJob', mcqGenerationJobSchema);


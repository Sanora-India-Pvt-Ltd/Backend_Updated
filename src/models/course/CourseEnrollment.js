const mongoose = require('mongoose');

const courseEnrollmentSchema = new mongoose.Schema({
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
    status: {
        type: String,
        enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED'],
        default: 'REQUESTED',
        required: true
    },
    approvedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    },
    expiresAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Unique compound index to prevent duplicate enrollments
courseEnrollmentSchema.index({ userId: 1, courseId: 1 }, { unique: true });

// Additional indexes for performance
courseEnrollmentSchema.index({ courseId: 1, status: 1 });
courseEnrollmentSchema.index({ userId: 1, status: 1 });
courseEnrollmentSchema.index({ status: 1, createdAt: -1 });
courseEnrollmentSchema.index({ expiresAt: 1 }); // For expiry queries
courseEnrollmentSchema.index({ courseId: 1, createdAt: -1 });

// Pre-save hook: Check expiry before saving
courseEnrollmentSchema.pre('save', async function() {
    // Only check expiry for APPROVED or IN_PROGRESS statuses
    if ((this.status === 'APPROVED' || this.status === 'IN_PROGRESS') && this.expiresAt) {
        const now = new Date();
        if (now > this.expiresAt) {
            // Enrollment has expired
            this.status = 'EXPIRED';
        }
    }
    // No need to call next() in async pre-save hooks
});

module.exports = mongoose.model('CourseEnrollment', courseEnrollmentSchema);


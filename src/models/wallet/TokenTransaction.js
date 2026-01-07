const mongoose = require('mongoose');

/**
 * Token Transaction Model
 * 
 * ⚠️ IMPORTANT: Tokens are EARN-ONLY.
 * Redemption is intentionally disabled until payment integration.
 * 
 * This model tracks token credits only (e.g., course completion rewards).
 * Debit transactions (redemptions) are not supported until feature flag is enabled.
 */
const tokenTransactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    source: {
        type: String,
        enum: ['COURSE_COMPLETION'],
        required: true
    },
    sourceId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    enrollmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CourseEnrollment',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['CREDITED'],
        default: 'CREDITED',
        required: true
    }
}, {
    timestamps: true
});

// Compound unique index to prevent double-crediting
tokenTransactionSchema.index(
    { userId: 1, source: 1, enrollmentId: 1 },
    { unique: true }
);

// Additional indexes for performance
tokenTransactionSchema.index({ userId: 1, createdAt: -1 });
tokenTransactionSchema.index({ sourceId: 1 });
tokenTransactionSchema.index({ enrollmentId: 1 });

module.exports = mongoose.model('TokenTransaction', tokenTransactionSchema);


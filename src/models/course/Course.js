const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    universityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'University',
        required: true
    },
    courseType: {
        type: String,
        enum: ['subject_mastery', 'product_marketplace']
    },
    title: {
        type: String,
        trim: true
    },
    name: {
        type: String,
        trim: true
    },
    thumbnail: {
        type: String,
        default: null
    },
    description: {
        type: String,
        default: ''
    },
    eligibilityCriteria: {
        spendabilityBands: [{ type: String }],
        deliveryLocations: [{ type: String }]
    },
    reward: {
        type: { type: String },
        amount: { type: Number }
    },
    enrollmentCount: {
        type: Number,
        default: 0
    },
    notes: {
        type: String,
        default: ''
    },
    inviteOnly: {
        type: Boolean,
        default: true
    },
    isInviteOnly: {
        type: Boolean,
        default: false
    },
    maxCompletions: {
        type: Number,
        default: null
    },
    completedCount: {
        type: Number,
        default: 0
    },
    completionDeadline: {
        type: Date,
        default: null
    },
    status: {
        type: String,
        enum: ['draft', 'under_review', 'active', 'down'],
        default: 'under_review'
    },
    publishedAt: {
        type: Date,
        default: null
    },
    rewardTokensPerCompletion: {
        type: Number,
        default: 0,
        min: 0
    },
    stats: {
        totalUsers: {
            type: Number,
            default: 0
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
courseSchema.index({ universityId: 1 });
courseSchema.index({ inviteOnly: 1 });
courseSchema.index({ isInviteOnly: 1 });
courseSchema.index({ status: 1 });
courseSchema.index({ createdAt: -1 });
courseSchema.index({ universityId: 1, createdAt: -1 });
courseSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Course', courseSchema);


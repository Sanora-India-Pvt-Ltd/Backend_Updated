const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
    universityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'University',
        required: true
    },
    details: {
        name: {
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
    settings: {
        inviteOnly: {
            type: Boolean,
            default: true
        }
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
courseSchema.index({ 'settings.inviteOnly': 1 });
courseSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Course', courseSchema);


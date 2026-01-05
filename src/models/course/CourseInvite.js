const mongoose = require('mongoose');
const crypto = require('crypto');

const courseInviteSchema = new mongoose.Schema({
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    token: {
        type: String,
        required: true,
        unique: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    used: {
        type: Boolean,
        default: false
    },
    usedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    usedAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// TTL index to auto-delete expired invites
courseInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Indexes for performance
courseInviteSchema.index({ courseId: 1 });
courseInviteSchema.index({ token: 1 });
courseInviteSchema.index({ email: 1 });
courseInviteSchema.index({ used: 1 });

// Pre-save hook to hash token
courseInviteSchema.pre('save', function(next) {
    if (this.isNew && !this.token) {
        // Generate random token and hash it
        const randomToken = crypto.randomBytes(32).toString('hex');
        this.token = crypto.createHash('sha256').update(randomToken).digest('hex');
    }
    next();
});

module.exports = mongoose.model('CourseInvite', courseInviteSchema);


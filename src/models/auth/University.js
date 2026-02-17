const mongoose = require('mongoose');

const universitySchema = new mongoose.Schema({
    universityCode: {
        type: String,
        required: true,
        trim: true
    },

    name: {
        type: String,
        required: true,
        trim: true
    },

    contact: {
        phone: { type: String, trim: true },
        address: { type: String, trim: true }
    },

    account: {
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },
        password: {
            type: String,
            required: true
        },
        role: {
            type: String,
            default: 'UNIVERSITY'
        },
        status: {
            isApproved: { type: Boolean, default: false },
            isActive: { type: Boolean, default: true },
            isLocked: { type: Boolean, default: false }
        },
        loginAttempts: {
            type: Number,
            default: 0
        },
        lastLogin: Date
    },

    security: {
        twoFactorEnabled: { type: Boolean, default: false },
        twoFactorSecret: String,
        sessionTimeoutMinutes: { type: Number, default: 30 },
        ipAddresses: [String],
        deviceFingerprints: [String]
    },

    notificationPreferences: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        inApp: { type: Boolean, default: true }
    }
}, {
    timestamps: true
});

// Indexes (define uniqueness here to avoid duplicate index definitions)
universitySchema.index({ universityCode: 1 }, { unique: true });
universitySchema.index({ 'account.email': 1 }, { unique: true });

module.exports = mongoose.model('University', universitySchema);

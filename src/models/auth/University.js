const mongoose = require('mongoose');

const universitySchema = new mongoose.Schema({
    account: {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        password: {
            type: String,
            required: true
        },
        status: {
            isActive: {
                type: Boolean,
                default: true
            }
        }
    },
    profile: {
        name: {
            type: String,
            required: true,
            trim: true
        }
    },
    verification: {
        isVerified: {
            type: Boolean,
            default: false
        },
        token: {
            type: String,
            default: null
        },
        tokenExpires: {
            type: Date,
            default: null
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for faster lookups
universitySchema.index({ 'account.email': 1 });
universitySchema.index({ 'account.status.isActive': 1, 'verification.isVerified': 1 });

module.exports = mongoose.model('University', universitySchema);

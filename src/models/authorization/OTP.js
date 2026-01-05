const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        lowercase: true
    },
    otp: {
        type: String,
        required: true
    },
    userType: {
        type: String,
        enum: [
            'student',
            'doctor',
            'user',
            'signup',
            'password_reset',
            // University registration
            'university_signup',
            // University email verification (for existing accounts)
            'university_verification',
            // Conference accounts (host/speaker) – kept separate from main user flow
            'conference_host_signup_email',
            'conference_host_signup_phone',
            'conference_speaker_signup_email',
            'conference_speaker_signup_phone'
        ],
        required: true
    },
    expiresAt: {
        type: Date,
        required: true
    },
    attempts: {
        type: Number,
        default: 0
    },
    verified: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Create index for automatic cleanup of expired OTPs
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OTP', otpSchema);
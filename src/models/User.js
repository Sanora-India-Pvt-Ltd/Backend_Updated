const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    firstName: {
        type: String,
        required: true
    },
    lastName: {
        type: String,
        required: true
    },
    phoneNumber: {
        type: String,
        required: false, // Optional - validated in controllers for regular signups
        default: undefined
    },
    gender: {
        type: String,
        required: true,
        enum: ['Male', 'Female', 'Other', 'Prefer not to say']
    },
    name: {
        type: String,
        default: ''
    },
    dob: {
        type: Date,
        required: false
    },
    alternatePhoneNumber: {
        type: String,
        required: false,
        default: undefined
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true // Allows multiple null values
    },
    profileImage: {
        type: String,
        default: ''
    },
    isGoogleOAuth: {
        type: Boolean,
        default: false
    },
    refreshToken: {
        type: String,
        default: null
    },
    refreshTokenExpiry: {
        type: Date,
        default: null
    },
    refreshTokens: [{
        token: {
            type: String,
            required: true
        },
        expiryDate: {
            type: Date,
            required: true
        },
        deviceInfo: {
            type: String,
            default: 'Unknown Device'
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);


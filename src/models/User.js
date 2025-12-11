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
    coverPhoto: {
        type: String,
        default: ''
    },
    bio: {
        type: String,
        default: ''
    },
    currentCity: {
        type: String,
        default: ''
    },
    hometown: {
        type: String,
        required: false,
        default: ''
    },
    pronouns: {
        type: String,
        required: false,
        default: ''
    },
    relationshipStatus: {
        type: String,
        required: false,
        enum: ['Single', 'In a relationship', 'Engaged', 'Married', 'In a civil partnership', 'In a domestic partnership', 'In an open relationship', "It's complicated", 'Separated', 'Divorced', 'Widowed'],
        default: null
    },
    workplace: [{
        company: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            required: true
        },
        position: {
            type: String,
            required: true
        },
        startDate: {
            type: Date,
            required: true
        },
        endDate: {
            type: Date,
            default: null
        },
        isCurrent: {
            type: Boolean,
            default: false
        }
    }],
    education: [{
        institution: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Institution',
            required: false
        },
        degree: {
            type: String,
            default: ''
        },
        field: {
            type: String,
            default: ''
        },
        startYear: {
            type: Number,
            required: false
        },
        endYear: {
            type: Number,
            default: null
        }
    }],
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
    }],
    friends: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);


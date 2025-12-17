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
        description: {
            type: String,
            trim: true,
            default: ''
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
        description: {
            type: String,
            trim: true,
            default: ''
        },
        degree: {
            type: String,
            default: ''
        },
        field: {
            type: String,
            default: ''
        },
        institutionType: {
            type: String,
            enum: ['school', 'college', 'university', 'others'],
            default: 'school'
        },
        startMonth: {
            type: Number,
            min: 1,
            max: 12,
            required: false
        },
        startYear: {
            type: Number,
            required: false
        },
        endMonth: {
            type: Number,
            min: 1,
            max: 12,
            default: null
        },
        endYear: {
            type: Number,
            default: null
        },
        cgpa: {
            type: Number,
            min: 0,
            max: 10,
            default: null
        },
        percentage: {
            type: Number,
            min: 0,
            max: 100,
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
    }],
    blockedUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    generalWeightage: {
        type: Number,
        default: 0
    },
    professionalWeightage: {
        type: Number,
        default: 0
    },
    token: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);


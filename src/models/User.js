const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // OLD FLAT STRUCTURE (for backward compatibility - optional)
    email: {
        type: String,
        required: false, // Now optional - use profile.email instead
        unique: false, // Remove unique constraint - profile.email has it
        sparse: true,
        lowercase: true
    },
    password: {
        type: String,
        required: false // Now optional - use auth.password instead
    },
    firstName: {
        type: String,
        required: false // Now optional - use profile.name.first instead
    },
    lastName: {
        type: String,
        required: false // Now optional - use profile.name.last instead
    },
    phoneNumber: {
        type: String,
        required: false,
        default: undefined
    },
    gender: {
        type: String,
        required: false, // Now optional - use profile.gender instead
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
        unique: false, // Remove unique constraint - auth.googleId has it
        sparse: true
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
    },
    
    // NEW NESTED STRUCTURE (primary structure)
    profile: {
        name: {
            first: {
                type: String,
                required: false // Required only for non-OAuth signups (validated in controller)
            },
            last: {
                type: String,
                required: false // Required only for non-OAuth signups (validated in controller)
            },
            full: {
                type: String,
                default: ''
            }
        },
        email: {
            type: String,
            required: false, // Required only for non-OAuth signups (validated in controller)
            unique: true,
            sparse: true,
            lowercase: true
        },
        phoneNumbers: {
            primary: {
                type: String,
                required: false
            },
            alternate: {
                type: String,
                required: false,
                default: undefined
            }
        },
        gender: {
            type: String,
            required: false, // Required only for non-OAuth signups (validated in controller)
            enum: ['Male', 'Female', 'Other', 'Prefer not to say']
        },
        pronouns: {
            type: String,
            default: ''
        },
        dob: {
            type: Date,
            required: false
        },
        bio: {
            type: String,
            default: ''
        },
        profileImage: {
            type: String,
            default: ''
        },
        coverPhoto: {
            type: String,
            default: ''
        }
    },
    auth: {
        password: {
            type: String,
            required: false // Not required for OAuth users
        },
        isGoogleOAuth: {
            type: Boolean,
            default: false
        },
        googleId: {
            type: String,
            unique: true,
            sparse: true
        },
        refreshToken: {
            type: String,
            default: null
        },
        refreshTokenExpiry: {
            type: Date,
            default: null
        },
        tokens: {
            // Support both singular token (for backward compatibility) and array (for multi-device)
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
                    required: false // Not required if using singular refreshToken
                },
                expiresAt: {
                    type: Date,
                    required: false // Not required if using singular refreshToken
                },
                device: {
                    type: String,
                    default: 'Unknown Device'
                },
                createdAt: {
                    type: Date,
                    default: Date.now
                }
            }]
        }
    },
    account: {
        isActive: {
            type: Boolean,
            default: true
        },
        isVerified: {
            type: Boolean,
            default: false
        },
        lastLogin: {
            type: Date,
            default: null
        }
    },
    social: {
        friends: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        blockedUsers: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        relationshipStatus: {
            type: String,
            required: false,
            enum: ['Single', 'In a relationship', 'Engaged', 'Married', 'In a civil partnership', 'In a domestic partnership', 'In an open relationship', "It's complicated", 'Separated', 'Divorced', 'Widowed'],
            default: null
        }
    },
    location: {
        currentCity: {
            type: String,
            default: ''
        },
        hometown: {
            type: String,
            default: ''
        }
    },
    professional: {
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
        }]
    },
    content: {
        generalWeightage: {
            type: Number,
            default: 0
        },
        professionalWeightage: {
            type: Number,
            default: 0
        }
    }
}, {
    timestamps: true
});

// Pre-save validation hook to ensure either old or new structure has required fields
userSchema.pre('validate', function(next) {
    // For OAuth users, skip validation of required fields
    if (this.auth && this.auth.isGoogleOAuth) {
        return next();
    }
    
    // Check if using new nested structure
    const hasNewStructure = this.profile && this.profile.email;
    
    if (hasNewStructure) {
        // Using new structure - ensure profile fields are present
        // Note: Required fields are validated in controllers, not here
        // This allows OAuth users to be created without all fields
    } else {
        // Using old structure - ensure old fields are present
        // Note: Required fields are validated in controllers, not here
    }
    
    next();
});

// Index for email lookup (support both structures)
userSchema.index({ 'profile.email': 1 }, { unique: true, sparse: true });
userSchema.index({ email: 1 }, { unique: false, sparse: true }); // Keep for backward compatibility

module.exports = mongoose.model('User', userSchema);


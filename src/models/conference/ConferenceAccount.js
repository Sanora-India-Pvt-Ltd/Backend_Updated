const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Base schema for both Host and Speaker (single collection via discriminators)
// Production-grade nested structure
const conferenceAccountSchema = new mongoose.Schema({
    account: {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        phone: {
            type: String,
            default: null,
            trim: true
        },
        role: {
            type: String,
            enum: ['HOST', 'SPEAKER'],
            required: true
        },
        status: {
            isActive: {
                type: Boolean,
                default: true
            },
            isSuspended: {
                type: Boolean,
                default: false
            }
        }
    },
    profile: {
        name: {
            type: String,
            required: true,
            trim: true
        },
        bio: {
            type: String,
            default: '',
            trim: true
        },
        images: {
            avatar: {
                type: String,
                default: ''
            },
            cover: {
                type: String,
                default: ''
            }
        }
    },
    verification: {
        email: {
            verified: {
                type: Boolean,
                default: false
            },
            verifiedAt: {
                type: Date,
                default: null
            }
        },
        phone: {
            verified: {
                type: Boolean,
                default: false
            },
            verifiedAt: {
                type: Date,
                default: null
            }
        },
        // Business-level verification (e.g. KYC) – keep existing meaning
        isVerified: {
            type: Boolean,
            default: false
        }
    },
    security: {
        passwordHash: {
            type: String,
            required: true
        },
        passwordChangedAt: {
            type: Date,
            default: Date.now
        },
        lastLogin: {
            type: Date,
            default: null
        },
        devices: [{
            deviceId: {
                type: String,
                required: true
            },
            ip: {
                type: String,
                default: null
            },
            lastActive: {
                type: Date,
                default: Date.now
            }
        }]
    },
    sessions: {
        refreshTokens: [{
            tokenId: {
                type: String,
                required: true
            },
            issuedAt: {
                type: Date,
                default: Date.now
            },
            expiresAt: {
                type: Date,
                required: true
            },
            deviceId: {
                type: String,
                default: 'Unknown Device'
            }
        }]
    },
    system: {
        version: {
            type: Number,
            default: 2
        }
    },
    // Discriminator key: HOST | SPEAKER (kept at root for Mongoose discriminator compatibility)
    role: {
        type: String,
        enum: ['HOST', 'SPEAKER'],
        required: true
    }
}, {
    timestamps: true,
    discriminatorKey: 'role',
    collection: 'conferenceaccounts'
});

// Sync role between root and account.role for consistency
conferenceAccountSchema.pre('save', function() {
    // Sync account.role to root role (for discriminator)
    if (this.isModified('account.role') && this.account?.role) {
        this.role = this.account.role;
    }
    // Sync root role to account.role (if role is set directly)
    if (this.isModified('role') && this.role && (!this.account?.role || this.account.role !== this.role)) {
        if (!this.account) this.account = {};
        this.account.role = this.role;
    }
});

// Hash password before saving
conferenceAccountSchema.pre('save', async function() {
    // Handle password hash - only hash if it's a plain text password (doesn't start with $2)
    if (this.isModified('security.passwordHash') && this.security.passwordHash && !this.security.passwordHash.startsWith('$2')) {
        this.security.passwordHash = await bcrypt.hash(this.security.passwordHash, 10);
        this.security.passwordChangedAt = new Date();
    }
});

// Method to compare password
conferenceAccountSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.security.passwordHash);
};

// Indexes for better query performance
conferenceAccountSchema.index({ 'account.email': 1 }, { unique: true });
conferenceAccountSchema.index({ 'verification.isVerified': 1, createdAt: -1 });
conferenceAccountSchema.index({ 'account.status.isActive': 1 });
conferenceAccountSchema.index({ 'account.role': 1 });
conferenceAccountSchema.index({ role: 1 }); // For discriminator

const ConferenceAccount = mongoose.model('ConferenceAccount', conferenceAccountSchema);

module.exports = ConferenceAccount;



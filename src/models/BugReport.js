const mongoose = require('mongoose');

// Bug severity levels
const BUG_SEVERITY = ['low', 'medium', 'high', 'critical'];

// Bug status
const BUG_STATUS = ['open', 'in_progress', 'resolved', 'closed'];

const bugReportSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000
    },
    severity: {
        type: String,
        enum: BUG_SEVERITY,
        default: 'medium',
        index: true
    },
    status: {
        type: String,
        enum: BUG_STATUS,
        default: 'open',
        index: true
    },
    // Additional metadata
    deviceInfo: {
        type: String,
        default: ''
    },
    browserInfo: {
        type: String,
        default: ''
    },
    osInfo: {
        type: String,
        default: ''
    },
    appVersion: {
        type: String,
        default: ''
    },
    // Steps to reproduce (optional)
    stepsToReproduce: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: ''
    },
    // Expected vs actual behavior (optional)
    expectedBehavior: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ''
    },
    actualBehavior: {
        type: String,
        trim: true,
        maxlength: 1000,
        default: ''
    },
    // Screenshots or media URLs (optional)
    attachments: [{
        url: {
            type: String,
            required: true
        },
        type: {
            type: String,
            enum: ['image', 'video', 'file'],
            default: 'image'
        }
    }],
    // Admin response (optional)
    adminResponse: {
        type: String,
        trim: true,
        maxlength: 2000,
        default: null
    },
    resolvedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Indexes for efficient querying
bugReportSchema.index({ userId: 1, createdAt: -1 });
bugReportSchema.index({ status: 1, severity: 1, createdAt: -1 });
bugReportSchema.index({ createdAt: -1 });

// Create model using the default mongoose connection (same database cluster)
// Collection name will be "bugreports" (Mongoose pluralizes automatically)
const BugReport = mongoose.model('BugReport', bugReportSchema);

module.exports = {
    BugReport,
    BUG_SEVERITY,
    BUG_STATUS
};


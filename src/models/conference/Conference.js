const mongoose = require('mongoose');

// Ensure Speaker and Host models are loaded and registered before Conference schema uses them
// This is required for populate operations to work with discriminator models
require('./Speaker');
require('./Host');

const conferenceSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        default: '',
        trim: true
    },
    hostId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'ownerModel'
    },
    ownerModel: {
        type: String,
        enum: ['User', 'Host', 'Speaker'],
        default: 'User'
    },
    speakers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Speaker',
        required: true
    }],
    publicCode: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['DRAFT', 'ACTIVE', 'ENDED'],
        default: 'DRAFT'
    },
    endedAt: {
        type: Date,
        default: null
    },
    groupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        default: null
    }
}, {
    timestamps: true
});

// Indexes for better query performance
conferenceSchema.index({ hostId: 1, createdAt: -1 });
conferenceSchema.index({ speakers: 1, createdAt: -1 });
// Note: publicCode index is automatically created by unique: true in schema
conferenceSchema.index({ status: 1, createdAt: -1 });
conferenceSchema.index({ groupId: 1 });
conferenceSchema.index({ ownerModel: 1, hostId: 1 });

module.exports = mongoose.model('Conference', conferenceSchema);


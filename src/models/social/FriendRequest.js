const mongoose = require('mongoose');

const friendRequestSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
        // Index removed - covered by compound indexes starting with sender
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
        // Index removed - covered by compound indexes starting with receiver
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
        // Index removed - covered by compound indexes containing status
    }
}, {
    timestamps: true
});

// Compound unique index to prevent duplicate pending requests
// This allows one pending, one accepted, and one rejected request between same users
friendRequestSchema.index({ sender: 1, receiver: 1, status: 1 }, { unique: true });

// Index for querying requests by receiver
friendRequestSchema.index({ receiver: 1, status: 1 });

// Index for querying requests by sender
friendRequestSchema.index({ sender: 1, status: 1 });

// Indexes for sort by createdAt with sender/receiver filter
friendRequestSchema.index({ sender: 1, createdAt: -1 });
friendRequestSchema.index({ receiver: 1, createdAt: -1 });

module.exports = mongoose.model('FriendRequest', friendRequestSchema);


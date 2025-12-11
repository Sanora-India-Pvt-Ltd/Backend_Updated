const mongoose = require('mongoose');

const friendRequestSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending',
        index: true
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

module.exports = mongoose.model('FriendRequest', friendRequestSchema);


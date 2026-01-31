const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
    participants: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }],
    lastMessage: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null
    },
    lastMessageAt: {
        type: Date,
        default: Date.now
    },
    isGroup: {
        type: Boolean,
        default: false
    },
    type: {
        type: String,
        enum: ['CONFERENCE_GROUP'],
        default: null,
        required: false
    },
    conferenceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conference',
        default: null
    },
    admins: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    groupName: {
        type: String,
        default: null
    },
    groupImage: {
        type: String,
        default: null
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

// Index for faster queries
conversationSchema.index({ participants: 1 });
conversationSchema.index({ participants: 1, lastMessageAt: -1 });
conversationSchema.index({ lastMessageAt: -1 });
conversationSchema.index({ updatedAt: -1 });
conversationSchema.index({ conferenceId: 1 });
conversationSchema.index({ type: 1, conferenceId: 1 });

// Method to find or create a conversation between two users
conversationSchema.statics.findOrCreateConversation = async function(userId1, userId2) {
    // Check if conversation already exists
    let conversation = await this.findOne({
        participants: { $all: [userId1, userId2] },
        isGroup: false
    }).populate('participants', 'profile.name.first profile.name.last profile.name.full profile.profileImage')
      .populate('lastMessage');

    if (!conversation) {
        // Create new conversation
        conversation = await this.create({
            participants: [userId1, userId2],
            isGroup: false
        });
        await conversation.populate('participants', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
    }

    return conversation;
};

module.exports = mongoose.model('Conversation', conversationSchema);



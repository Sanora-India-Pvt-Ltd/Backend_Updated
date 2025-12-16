const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { getIO } = require('../socket/socketServer');
const { isUserOnline, getUserLastSeen } = require('../config/redisStub');

// Get all conversations for a user
const getConversations = async (req, res) => {
    try {
        const userId = req.user._id;

        // Get current user's blocked users
        const currentUser = await User.findById(userId).select('blockedUsers');
        const blockedUserIds = currentUser.blockedUsers || [];

        const conversations = await Conversation.find({
            participants: userId,
            // Exclude conversations where all other participants are blocked
            $expr: {
                $gt: [
                    {
                        $size: {
                            $filter: {
                                input: '$participants',
                                as: 'p',
                                cond: {
                                    $and: [
                                        { $ne: ['$$p', userId] },
                                        { $not: { $in: ['$$p', blockedUserIds] } }
                                    ]
                                }
                            }
                        }
                    },
                    0
                ]
            }
        })
        .populate('participants', 'firstName lastName name profileImage')
        .populate('lastMessage')
        .populate('createdBy', 'firstName lastName name profileImage')
        .sort({ lastMessageAt: -1, updatedAt: -1 })
        .lean();

        // Add online status for each participant
        const conversationsWithStatus = await Promise.all(
            conversations.map(async (conv) => {
                const otherParticipants = conv.participants.filter(
                    p => p._id.toString() !== userId.toString()
                );

                const participantsWithStatus = await Promise.all(
                    conv.participants.map(async (participant) => {
                        const online = await isUserOnline(participant._id.toString());
                        const lastSeen = await getUserLastSeen(participant._id.toString());
                        return {
                            ...participant,
                            isOnline: online,
                            lastSeen: lastSeen
                        };
                    })
                );

                return {
                    ...conv,
                    participants: participantsWithStatus,
                    otherParticipants
                };
            })
        );

        res.json({
            success: true,
            data: conversationsWithStatus
        });
    } catch (error) {
        console.error('Get conversations error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch conversations',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get or create a conversation between two users
const getOrCreateConversation = async (req, res) => {
    try {
        const userId = req.user._id;
        const { participantId } = req.params;

        if (!participantId) {
            return res.status(400).json({
                success: false,
                message: 'Participant ID is required'
            });
        }

        if (userId.toString() === participantId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot create conversation with yourself'
            });
        }

        // Check if other user exists
        const otherUser = await User.findById(participantId);
        if (!otherUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if either user has blocked the other
        const currentUser = await User.findById(userId).select('blockedUsers');
        if (currentUser.blockedUsers && currentUser.blockedUsers.includes(participantId)) {
            return res.status(403).json({
                success: false,
                message: 'You cannot create a conversation with a blocked user'
            });
        }

        if (otherUser.blockedUsers && otherUser.blockedUsers.includes(userId)) {
            return res.status(403).json({
                success: false,
                message: 'Action not available'
            });
        }

        // Find or create conversation
        const conversation = await Conversation.findOrCreateConversation(userId, participantId);

        // Populate last message if exists
        if (conversation.lastMessage) {
            await conversation.populate('lastMessage');
            await conversation.lastMessage.populate('senderId', 'firstName lastName name profileImage');
        }

        // Add online status
        const participantsWithStatus = await Promise.all(
            conversation.participants.map(async (participant) => {
                const online = await isUserOnline(participant._id.toString());
                const lastSeen = await getUserLastSeen(participant._id.toString());
                return {
                    ...participant.toObject(),
                    isOnline: online,
                    lastSeen: lastSeen
                };
            })
        );

        res.json({
            success: true,
            data: {
                ...conversation.toObject(),
                participants: participantsWithStatus
            }
        });
    } catch (error) {
        console.error('Get or create conversation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get or create conversation',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get messages for a conversation
const getMessages = async (req, res) => {
    try {
        const userId = req.user._id;
        const { conversationId } = req.params;
        const { page = 1, limit = 50 } = req.query;

        // Verify user is a participant
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        const isParticipant = conversation.participants.some(
            p => p.toString() === userId.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this conversation'
            });
        }

        // Get messages
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const messages = await Message.find({
            conversationId,
            deletedAt: null,
            $or: [
                { deletedFor: { $ne: userId } },
                { deletedFor: { $exists: false } }
            ]
        })
        .populate('senderId', 'firstName lastName name profileImage')
        .populate('replyTo')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip(skip)
        .lean();

        // Reverse to get chronological order
        messages.reverse();

        // Mark messages as read
        const unreadMessageIds = messages
            .filter(msg => 
                msg.senderId._id.toString() !== userId.toString() && 
                msg.status !== 'read'
            )
            .map(msg => msg._id);

        if (unreadMessageIds.length > 0) {
            await Message.updateMany(
                {
                    _id: { $in: unreadMessageIds },
                    conversationId
                },
                { status: 'read' }
            );

            // Emit read receipt via WebSocket
            const io = getIO();
            io.to(`conversation:${conversationId}`).emit('messages:read', {
                messageIds: unreadMessageIds,
                readBy: userId.toString(),
                conversationId
            });
        }

        res.json({
            success: true,
            data: messages,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: await Message.countDocuments({
                    conversationId,
                    deletedAt: null,
                    $or: [
                        { deletedFor: { $ne: userId } },
                        { deletedFor: { $exists: false } }
                    ]
                })
            }
        });
    } catch (error) {
        console.error('Get messages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch messages',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Send a message (REST API endpoint - WebSocket is preferred for real-time)
const sendMessage = async (req, res) => {
    try {
        const userId = req.user._id;
        const { conversationId, text, media, messageType, replyTo } = req.body;

        if (!conversationId) {
            return res.status(400).json({
                success: false,
                message: 'Conversation ID is required'
            });
        }

        if (!text && (!media || media.length === 0)) {
            return res.status(400).json({
                success: false,
                message: 'Message text or media is required'
            });
        }

        // Reject audio messages
        if (messageType === 'audio' || (media && media.some(m => m.type === 'audio'))) {
            return res.status(400).json({
                success: false,
                message: 'Audio messages are not allowed'
            });
        }

        // Verify conversation and authorization
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        const isParticipant = conversation.participants.some(
            p => p.toString() === userId.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to send message'
            });
        }

        // Check if current user has blocked any participant or vice versa
        const currentUser = await User.findById(userId).select('blockedUsers');
        const otherParticipants = conversation.participants.filter(
            p => p.toString() !== userId.toString()
        );

        for (const participant of otherParticipants) {
            if (currentUser.blockedUsers && currentUser.blockedUsers.includes(participant)) {
                return res.status(403).json({
                    success: false,
                    message: 'You cannot send messages to a blocked user'
                });
            }

            const otherUser = await User.findById(participant).select('blockedUsers');
            if (otherUser.blockedUsers && otherUser.blockedUsers.includes(userId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Action not available'
                });
            }
        }

        // Create message
        const messageData = {
            conversationId,
            senderId: userId,
            messageType: messageType || (media && media.length > 0 ? 'image' : 'text'),
            status: 'sent'
        };

        if (text) messageData.text = text;
        if (media && media.length > 0) messageData.media = media;
        if (replyTo) messageData.replyTo = replyTo;

        const message = await Message.create(messageData);
        await message.populate('senderId', 'firstName lastName name profileImage');
        if (message.replyTo) {
            await message.populate('replyTo');
        }

        // Update conversation
        conversation.lastMessage = message._id;
        conversation.lastMessageAt = new Date();
        await conversation.save();

        // Emit via WebSocket
        const io = getIO();
        io.to(`conversation:${conversationId}`).emit('new:message', {
            message: message.toObject()
        });

        res.json({
            success: true,
            data: message
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Delete a message
const deleteMessage = async (req, res) => {
    try {
        const userId = req.user._id;
        const { messageId } = req.params;
        const { deleteForEveryone } = req.body;

        const message = await Message.findById(messageId);
        if (!message) {
            return res.status(404).json({
                success: false,
                message: 'Message not found'
            });
        }

        // Verify user is sender or participant
        const conversation = await Conversation.findById(message.conversationId);
        const isParticipant = conversation.participants.some(
            p => p.toString() === userId.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        if (deleteForEveryone && message.senderId.toString() === userId.toString()) {
            // Delete for everyone (only sender can do this)
            message.deletedAt = new Date();
            await message.save();

            // Emit via WebSocket
            const io = getIO();
            io.to(`conversation:${message.conversationId}`).emit('message:deleted', {
                messageId,
                conversationId: message.conversationId
            });
        } else {
            // Delete for me only
            if (!message.deletedFor) {
                message.deletedFor = [];
            }
            message.deletedFor.push(userId);
            await message.save();
        }

        res.json({
            success: true,
            message: 'Message deleted successfully'
        });
    } catch (error) {
        console.error('Delete message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete message',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Mark messages as read
const markMessagesAsRead = async (req, res) => {
    try {
        const userId = req.user._id;
        const { conversationId, messageIds } = req.body;

        if (!conversationId) {
            return res.status(400).json({
                success: false,
                message: 'Conversation ID is required'
            });
        }

        // Verify user is a participant
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({
                success: false,
                message: 'Conversation not found'
            });
        }

        const isParticipant = conversation.participants.some(
            p => p.toString() === userId.toString()
        );

        if (!isParticipant) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized'
            });
        }

        // Update message status
        const query = {
            conversationId,
            senderId: { $ne: userId },
            status: { $ne: 'read' }
        };

        if (messageIds && messageIds.length > 0) {
            query._id = { $in: messageIds };
        }

        const result = await Message.updateMany(query, { status: 'read' });

        // Emit via WebSocket
        const io = getIO();
        io.to(`conversation:${conversationId}`).emit('messages:read', {
            messageIds: messageIds || [],
            readBy: userId.toString(),
            conversationId
        });

        res.json({
            success: true,
            message: 'Messages marked as read',
            count: result.modifiedCount
        });
    } catch (error) {
        console.error('Mark messages as read error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark messages as read',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get unread message count
const getUnreadCount = async (req, res) => {
    try {
        const userId = req.user._id;

        const conversations = await Conversation.find({
            participants: userId
        }).select('_id');

        const conversationIds = conversations.map(c => c._id);

        const unreadCount = await Message.countDocuments({
            conversationId: { $in: conversationIds },
            senderId: { $ne: userId },
            status: { $ne: 'read' },
            deletedAt: null,
            $or: [
                { deletedFor: { $ne: userId } },
                { deletedFor: { $exists: false } }
            ]
        });

        res.json({
            success: true,
            data: {
                unreadCount
            }
        });
    } catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get unread count',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    getConversations,
    getOrCreateConversation,
    getMessages,
    sendMessage,
    deleteMessage,
    markMessagesAsRead,
    getUnreadCount
};



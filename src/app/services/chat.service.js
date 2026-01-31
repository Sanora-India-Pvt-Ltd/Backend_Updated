/**
 * Chat and group conversation business logic. Returns { statusCode, json } or throws.
 */

const cache = require('../../core/infra/cache');
const Conversation = require('../../models/social/Conversation');
const Message = require('../../models/social/Message');
const User = require('../../models/authorization/User');
const Media = require('../../models/Media');
const mongoose = require('mongoose');
const StorageService = require('../../core/infra/storage');
const realtime = require('../../core/infra/realtime');
const { isUserOnline, getUserLastSeen } = require('../../config/redisStub');

async function getBlockedUserIds(userId) {
    try {
        const user = await User.findById(userId).select('blockedUsers social.blockedUsers').lean();
        if (!user) return [];
        const rootBlocked = user.blockedUsers || [];
        const socialBlocked = user.social?.blockedUsers || [];
        const uniqueBlocked = [...new Set([...rootBlocked, ...socialBlocked].map(id => id.toString()))];
        return uniqueBlocked.map(id => new mongoose.Types.ObjectId(id));
    } catch (error) {
        console.error('Error getting blocked users:', error);
        return [];
    }
}

async function isUserBlocked(blockerId, blockedId) {
    try {
        const blockedUserIds = await getBlockedUserIds(blockerId);
        return blockedUserIds.some(id => id.toString() === blockedId.toString());
    } catch (error) {
        console.error('Error checking if user is blocked:', error);
        return false;
    }
}

function formatParticipant(participant, online, lastSeen) {
    const obj = participant.toObject ? participant.toObject() : participant;
    const name = obj.profile?.name?.full ||
        (obj.profile?.name?.first && obj.profile?.name?.last ? `${obj.profile.name.first} ${obj.profile.name.last}`.trim() : null) ||
        obj.profile?.name?.first || obj.profile?.name?.last || obj.name ||
        (obj.firstName || obj.lastName ? `${obj.firstName || ''} ${obj.lastName || ''}`.trim() : '');
    const profileImage = obj.profile?.profileImage || obj.profileImage || '';
    return { _id: obj._id, name, profileImage, isOnline: online || false, lastSeen: lastSeen || null };
}

function formatSender(senderObj) {
    if (!senderObj) return null;
    const name = senderObj.profile?.name?.full ||
        (senderObj.profile?.name?.first && senderObj.profile?.name?.last ? `${senderObj.profile.name.first} ${senderObj.profile.name.last}`.trim() : null) ||
        senderObj.profile?.name?.first || senderObj.profile?.name?.last || senderObj.name ||
        (senderObj.firstName || senderObj.lastName ? `${senderObj.firstName || ''} ${senderObj.lastName || ''}`.trim() : '');
    const profileImage = senderObj.profile?.profileImage || senderObj.profileImage || '';
    return { _id: senderObj._id, name, profileImage };
}

async function getConversations(userId) {
    const cacheKey = `conversations:${userId}`;
    const client = cache.getClient();
    if (client) {
        try {
            const cached = await client.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch (e) { /* fall through to DB */ }
    }
    try {
        const blockedUserIds = await getBlockedUserIds(userId);
        const conversations = await Conversation.find({
            participants: userId,
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
            .select('-__v')
            .populate('participants', 'profile.name.first profile.name.last profile.name.full profile.profileImage firstName lastName name profileImage')
            .populate('lastMessage')
            .populate('createdBy', 'profile.name.first profile.name.last profile.name.full profile.profileImage')
            .sort({ lastMessageAt: -1, updatedAt: -1 })
            .lean();
        const allParticipantIds = new Set();
        conversations.forEach(conv => conv.participants.forEach(p => allParticipantIds.add(p._id.toString())));
        const onlineStatusMap = new Map();
        const lastSeenMap = new Map();
        await Promise.all(Array.from(allParticipantIds).map(async (participantId) => {
            onlineStatusMap.set(participantId, await isUserOnline(participantId));
            lastSeenMap.set(participantId, await getUserLastSeen(participantId));
        }));
        const conversationsWithStatus = conversations.map((conv) => {
            const otherParticipants = conv.participants.filter(p => p._id.toString() !== userId.toString());
            const participantsWithStatus = conv.participants.map((participant) => {
                const participantId = participant._id.toString();
                return formatParticipant(participant, onlineStatusMap.get(participantId), lastSeenMap.get(participantId));
            });
            return { ...conv, participants: participantsWithStatus, otherParticipants };
        });
        const result = { statusCode: 200, json: { success: true, data: conversationsWithStatus } };
        if (client) {
            try {
                await client.set(cacheKey, JSON.stringify(result), 'EX', 60);
            } catch (e) { /* ignore */ }
        }
        return result;
    } catch (error) {
        console.error('Get conversations error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to fetch conversations', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function getOrCreateConversation(userId, participantId) {
    try {
        if (!participantId) return { statusCode: 400, json: { success: false, message: 'Participant ID is required' } };
        if (userId.toString() === participantId) return { statusCode: 400, json: { success: false, message: 'Cannot create conversation with yourself' } };
        const otherUser = await User.findById(participantId).select('_id').lean();
        if (!otherUser) return { statusCode: 404, json: { success: false, message: 'User not found' } };
        if (await isUserBlocked(userId, participantId)) return { statusCode: 403, json: { success: false, message: 'You cannot create a conversation with a blocked user' } };
        if (await isUserBlocked(participantId, userId)) return { statusCode: 403, json: { success: false, message: 'Action not available' } };
        const conversation = await Conversation.findOrCreateConversation(userId, participantId);
        if (conversation.lastMessage) {
            await conversation.populate('lastMessage');
            await conversation.lastMessage.populate('senderId', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
        }
        if (conversation.participants?.length > 0 && !conversation.participants[0].profile) {
            await conversation.populate('participants', 'profile.name.first profile.name.last profile.name.full profile.profileImage firstName lastName name profileImage');
        }
        const participantsWithStatus = await Promise.all(conversation.participants.map(async (participant) => {
            const online = await isUserOnline(participant._id.toString());
            const lastSeen = await getUserLastSeen(participant._id.toString());
            return formatParticipant(participant, online, lastSeen);
        }));
        return { statusCode: 200, json: { success: true, data: { ...conversation.toObject(), participants: participantsWithStatus } } };
    } catch (error) {
        console.error('Get or create conversation error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to get or create conversation', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function getMessages(userId, conversationId, query) {
    try {
        const { page = 1, limit = 50 } = query;
        const conversation = await Conversation.findById(conversationId).select('participants').lean();
        if (!conversation) return { statusCode: 404, json: { success: false, message: 'Conversation not found' } };
        const isParticipant = conversation.participants.some(p => p.toString() === userId.toString());
        if (!isParticipant) return { statusCode: 403, json: { success: false, message: 'Not authorized to view this conversation' } };
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const messages = await Message.find({
            conversationId,
            deletedAt: null,
            $or: [{ deletedFor: { $ne: userId } }, { deletedFor: { $exists: false } }]
        })
            .select('-__v')
            .populate('senderId', 'profile.name.first profile.name.last profile.name.full profile.profileImage firstName lastName name profileImage')
            .populate({ path: 'replyTo', populate: { path: 'senderId', select: 'profile.name.first profile.name.last profile.name.full profile.profileImage firstName lastName name profileImage' } })
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip(skip)
            .lean();
        messages.reverse();
        const transformedMessages = messages.map(msg => {
            const msgObj = msg.toObject ? msg.toObject() : msg;
            const senderObj = msgObj.senderId?.toObject ? msgObj.senderId.toObject() : msgObj.senderId;
            let transformedReplyTo = null;
            if (msgObj.replyTo) {
                const replyToObj = msgObj.replyTo.toObject ? msgObj.replyTo.toObject() : msgObj.replyTo;
                const replyToSenderObj = replyToObj.senderId?.toObject ? replyToObj.senderId.toObject() : replyToObj.senderId;
                transformedReplyTo = replyToSenderObj
                    ? { ...replyToObj, senderId: formatSender(replyToSenderObj) }
                    : replyToObj;
            }
            return { ...msgObj, senderId: formatSender(senderObj), replyTo: transformedReplyTo };
        });
        const unreadMessageIds = transformedMessages
            .filter(msg => msg.senderId?._id?.toString() !== userId.toString() && msg.status !== 'read')
            .map(msg => msg._id);
        if (unreadMessageIds.length > 0) {
            await Message.updateMany({ _id: { $in: unreadMessageIds }, conversationId }, { status: 'read' });
            const io = realtime.getIO();
            io.to(`conversation:${conversationId}`).emit('messages:read', { messageIds: unreadMessageIds, readBy: userId.toString(), conversationId });
        }
        const total = await Message.countDocuments({
            conversationId,
            deletedAt: null,
            $or: [{ deletedFor: { $ne: userId } }, { deletedFor: { $exists: false } }]
        });
        return {
            statusCode: 200,
            json: {
                success: true,
                data: transformedMessages,
                pagination: { page: parseInt(page), limit: parseInt(limit), total }
            }
        };
    } catch (error) {
        console.error('Get messages error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to fetch messages', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function sendMessage(userId, body) {
    try {
        const { conversationId, text, media, messageType, replyTo } = body;
        if (!conversationId) return { statusCode: 400, json: { success: false, message: 'Conversation ID is required' } };
        if (!text && (!media || media.length === 0)) return { statusCode: 400, json: { success: false, message: 'Message text or media is required' } };
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) return { statusCode: 404, json: { success: false, message: 'Conversation not found' } };
        const isParticipant = conversation.participants.some(p => p.toString() === userId.toString());
        if (!isParticipant) return { statusCode: 403, json: { success: false, message: 'Not authorized to send message' } };
        const otherParticipants = conversation.participants.filter(p => p.toString() !== userId.toString());
        const blockedByMe = await getBlockedUserIds(userId);
        const blockedByMeSet = new Set(blockedByMe.map(id => id.toString()));
        if (otherParticipants.some(p => blockedByMeSet.has(p.toString()))) {
            return { statusCode: 403, json: { success: false, message: 'You cannot send messages to a blocked user' } };
        }
        const usersWhoBlockedMe = await User.find(
            { _id: { $in: otherParticipants }, 'social.blockedUsers': userId }
        ).select('_id').lean();
        if (usersWhoBlockedMe.length > 0) {
            return { statusCode: 403, json: { success: false, message: 'Action not available' } };
        }
        let detectedMessageType = messageType || (media?.length ? (media[0].type || 'image') : 'text');
        const messageData = { conversationId, senderId: userId, messageType: detectedMessageType, status: 'sent' };
        if (text) messageData.text = text;
        if (media?.length) messageData.media = media;
        if (replyTo) messageData.replyTo = replyTo;
        const message = await Message.create(messageData);
        await message.populate('senderId', 'profile.name.first profile.name.last profile.name.full profile.profileImage firstName lastName name profileImage');
        if (message.replyTo) await message.populate({ path: 'replyTo', populate: { path: 'senderId', select: 'profile.name.first profile.name.last profile.name.full profile.profileImage firstName lastName name profileImage' } });
        const messageObj = message.toObject();
        const senderObj = messageObj.senderId?.toObject ? messageObj.senderId.toObject() : messageObj.senderId;
        const transformedMessage = { ...messageObj, senderId: formatSender(senderObj) };
        conversation.lastMessage = message._id;
        conversation.lastMessageAt = new Date();
        await conversation.save();
        try {
            const client = cache.getClient();
            if (client) {
                for (const p of conversation.participants) {
                    const pid = (p && p.toString) ? p.toString() : String(p);
                    await client.del(`conversations:${pid}`);
                }
            }
        } catch (e) { /* fail-safe: ignore Redis errors */ }
        const io = realtime.getIO();
        io.to(`conversation:${conversationId}`).emit('new:message', { message: transformedMessage });
        return { statusCode: 200, json: { success: true, data: transformedMessage } };
    } catch (error) {
        console.error('Send message error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to send message', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function deleteMessage(userId, messageId, body) {
    try {
        const { deleteForEveryone } = body;
        const message = await Message.findById(messageId);
        if (!message) return { statusCode: 404, json: { success: false, message: 'Message not found' } };
        const conversation = await Conversation.findById(message.conversationId);
        const isParticipant = conversation.participants.some(p => p.toString() === userId.toString());
        if (!isParticipant) return { statusCode: 403, json: { success: false, message: 'Not authorized' } };
        if (deleteForEveryone && message.senderId.toString() === userId.toString()) {
            message.deletedAt = new Date();
            await message.save();
            const io = realtime.getIO();
            io.to(`conversation:${message.conversationId}`).emit('message:deleted', { messageId, conversationId: message.conversationId });
        } else {
            if (!message.deletedFor) message.deletedFor = [];
            message.deletedFor.push(userId);
            await message.save();
        }
        return { statusCode: 200, json: { success: true, message: 'Message deleted successfully' } };
    } catch (error) {
        console.error('Delete message error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to delete message', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function markMessagesAsRead(userId, body) {
    try {
        const { conversationId, messageIds } = body;
        if (!conversationId) return { statusCode: 400, json: { success: false, message: 'Conversation ID is required' } };
        const conversation = await Conversation.findById(conversationId).select('participants').lean();
        if (!conversation) return { statusCode: 404, json: { success: false, message: 'Conversation not found' } };
        const isParticipant = conversation.participants.some(p => p.toString() === userId.toString());
        if (!isParticipant) return { statusCode: 403, json: { success: false, message: 'Not authorized' } };
        const query = { conversationId, senderId: { $ne: userId }, status: { $ne: 'read' } };
        if (messageIds?.length) query._id = { $in: messageIds };
        const result = await Message.updateMany(query, { status: 'read' });
        const io = realtime.getIO();
        io.to(`conversation:${conversationId}`).emit('messages:read', { messageIds: messageIds || [], readBy: userId.toString(), conversationId });
        return { statusCode: 200, json: { success: true, message: 'Messages marked as read', count: result.modifiedCount } };
    } catch (error) {
        console.error('Mark messages as read error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to mark messages as read', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function getUnreadCount(userId) {
    try {
        const conversations = await Conversation.find({ participants: userId }).select('_id').lean();
        const conversationIds = conversations.map(c => c._id);
        const unreadCount = await Message.countDocuments({
            conversationId: { $in: conversationIds },
            senderId: { $ne: userId },
            status: { $ne: 'read' },
            deletedAt: null,
            $or: [{ deletedFor: { $ne: userId } }, { deletedFor: { $exists: false } }]
        });
        return { statusCode: 200, json: { success: true, data: { unreadCount } } };
    } catch (error) {
        console.error('Get unread count error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to get unread count', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function createGroup(userId, body) {
    try {
        const { groupName, participants } = body;
        if (!groupName || typeof groupName !== 'string' || groupName.trim() === '') {
            return { statusCode: 400, json: { success: false, message: 'Group name is required' } };
        }
        if (!participants || !Array.isArray(participants) || participants.length === 0) {
            return { statusCode: 400, json: { success: false, message: 'At least one participant is required' } };
        }
        const uniqueParticipantIds = [...new Set(participants.map(id => id.toString()))];
        const participantIds = uniqueParticipantIds.filter(id => id !== userId.toString()).map(id => new mongoose.Types.ObjectId(id));
        const existingUsers = await User.find({ _id: { $in: participantIds } }).select('_id').lean();
        const existingUserIds = existingUsers.map(u => u._id.toString());
        const invalidParticipantIds = participantIds.filter(id => !existingUserIds.includes(id.toString()));
        if (invalidParticipantIds.length > 0) {
            return { statusCode: 400, json: { success: false, message: 'One or more participants not found', invalidIds: invalidParticipantIds.map(id => id.toString()) } };
        }
        const blockedUserIds = await getBlockedUserIds(userId);
        const blockedParticipants = participantIds.filter(id => blockedUserIds.some(blockedId => blockedId.toString() === id.toString()));
        if (blockedParticipants.length > 0) {
            return { statusCode: 403, json: { success: false, message: 'Cannot add blocked users to group', blockedIds: blockedParticipants.map(id => id.toString()) } };
        }
        const usersWhoBlockedMe = await User.find(
            { _id: { $in: participantIds }, 'social.blockedUsers': userId }
        ).select('_id').lean();
        if (usersWhoBlockedMe.length > 0) {
            return { statusCode: 403, json: { success: false, message: 'Cannot create group with users who have blocked you' } };
        }
        const allParticipants = [userId, ...participantIds];
        const groupConversation = await Conversation.create({
            participants: allParticipants,
            isGroup: true,
            groupName: groupName.trim(),
            groupImage: body.groupImage && body.groupImage.trim() !== '' ? body.groupImage.trim() : null,
            createdBy: userId
        });
        await groupConversation.populate('participants', 'profile.name.first profile.name.last profile.name.full profile.profileImage firstName lastName name profileImage');
        await groupConversation.populate('createdBy', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
        const participantsWithStatus = await Promise.all(groupConversation.participants.map(async (participant) => {
            const online = await isUserOnline(participant._id.toString());
            const lastSeen = await getUserLastSeen(participant._id.toString());
            return formatParticipant(participant, online, lastSeen);
        }));
        const creatorObj = groupConversation.createdBy?.toObject ? groupConversation.createdBy.toObject() : groupConversation.createdBy;
        const creatorName = creatorObj?.profile?.name?.full || (creatorObj?.profile?.name?.first && creatorObj?.profile?.name?.last ? `${creatorObj.profile.name.first} ${creatorObj.profile.name.last}`.trim() : creatorObj?.profile?.name?.first || creatorObj?.profile?.name?.last || creatorObj?.name || (creatorObj?.firstName || creatorObj?.lastName ? `${creatorObj.firstName || ''} ${creatorObj.lastName || ''}`.trim() : ''));
        const creatorProfileImage = creatorObj?.profile?.profileImage || creatorObj?.profileImage || '';
        return {
            statusCode: 201,
            json: {
                success: true,
                message: 'Group created successfully',
                data: {
                    ...groupConversation.toObject(),
                    participants: participantsWithStatus,
                    createdBy: creatorObj ? { _id: creatorObj._id, name: creatorName, profileImage: creatorProfileImage } : null
                }
            }
        };
    } catch (error) {
        console.error('Create group error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to create group', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function updateGroupInfo(userId, groupId, body) {
    try {
        if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) {
            return { statusCode: 400, json: { success: false, message: 'Valid group ID is required' } };
        }
        const group = await Conversation.findById(groupId);
        if (!group) return { statusCode: 404, json: { success: false, message: 'Group not found' } };
        if (!group.isGroup) return { statusCode: 400, json: { success: false, message: 'This is not a group conversation' } };
        const isParticipant = group.participants.some(p => p.toString() === userId.toString());
        if (!isParticipant) return { statusCode: 403, json: { success: false, message: 'You are not a participant of this group' } };
        const isAdmin = group.admins?.some(adminId => adminId.toString() === userId.toString());
        const isCreator = group.createdBy?.toString() === userId.toString();
        if (!isAdmin && !isCreator) return { statusCode: 403, json: { success: false, message: 'Only group admins or creator can update group info' } };
        const { groupName } = body;
        if (groupName !== undefined) {
            if (typeof groupName !== 'string' || groupName.trim() === '') return { statusCode: 400, json: { success: false, message: 'Group name cannot be empty' } };
            group.groupName = groupName.trim();
        }
        await group.save();
        await group.populate('participants', 'profile.name.first profile.name.last profile.name.full profile.profileImage firstName lastName name profileImage');
        await group.populate('createdBy', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
        await group.populate('admins', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
        const participantsWithStatus = await Promise.all(group.participants.map(async (participant) => {
            const online = await isUserOnline(participant._id.toString());
            const lastSeen = await getUserLastSeen(participant._id.toString());
            return formatParticipant(participant, online, lastSeen);
        }));
        const creatorObj = group.createdBy?.toObject ? group.createdBy.toObject() : group.createdBy;
        const creatorName = creatorObj?.profile?.name?.full || (creatorObj?.profile?.name?.first && creatorObj?.profile?.name?.last ? `${creatorObj.profile.name.first} ${creatorObj.profile.name.last}`.trim() : creatorObj?.profile?.name?.first || creatorObj?.profile?.name?.last || creatorObj?.name || (creatorObj?.firstName || creatorObj?.lastName ? `${creatorObj.firstName || ''} ${creatorObj.lastName || ''}`.trim() : ''));
        const creatorProfileImage = creatorObj?.profile?.profileImage || creatorObj?.profileImage || '';
        const io = realtime.getIO();
        io.to(`conversation:${groupId}`).emit('group:updated', { groupId, groupName: group.groupName, updatedBy: userId.toString() });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Group info updated successfully',
                data: { ...group.toObject(), participants: participantsWithStatus, createdBy: creatorObj ? { _id: creatorObj._id, name: creatorName, profileImage: creatorProfileImage } : null }
            }
        };
    } catch (error) {
        console.error('Update group info error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to update group info', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function uploadGroupPhoto(userId, groupId, file) {
    try {
        if (!file) return { statusCode: 400, json: { success: false, message: 'No file uploaded' } };
        if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) return { statusCode: 400, json: { success: false, message: 'Valid group ID is required' } };
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedMimeTypes.includes(file.mimetype)) return { statusCode: 400, json: { success: false, message: 'Only image files are allowed for group photos (JPEG, PNG, GIF, WebP)' } };
        const group = await Conversation.findById(groupId);
        if (!group) return { statusCode: 404, json: { success: false, message: 'Group not found' } };
        if (!group.isGroup) return { statusCode: 400, json: { success: false, message: 'This is not a group conversation' } };
        const isParticipant = group.participants.some(p => p.toString() === userId.toString());
        if (!isParticipant) return { statusCode: 403, json: { success: false, message: 'You are not a participant of this group' } };
        const isAdmin = group.admins?.some(adminId => adminId.toString() === userId.toString());
        const isCreator = group.createdBy?.toString() === userId.toString();
        if (!isAdmin && !isCreator) return { statusCode: 403, json: { success: false, message: 'Only group admins or creator can upload group photo' } };
        if (group.groupImage) {
            try {
                const oldMedia = await Media.findOne({ url: group.groupImage });
                if (oldMedia?.public_id) await StorageService.delete(oldMedia.public_id);
                await Media.findOneAndDelete({ url: group.groupImage });
            } catch (e) { console.warn('Failed to delete old group image:', e.message); }
        }
        let uploadResult;
        if (file.path) uploadResult = await StorageService.uploadFromPath(file.path);
        else if (file.location && file.key) uploadResult = await StorageService.uploadFromRequest(file);
        else return { statusCode: 400, json: { success: false, message: 'Invalid file object: missing path (diskStorage) or location/key (multer-s3)' } };
        const format = file.mimetype.split('/')[1] || 'unknown';
        group.groupImage = uploadResult.url;
        await group.save();
        const mediaRecord = await Media.create({
            userId,
            url: uploadResult.url,
            public_id: uploadResult.key,
            format,
            resource_type: 'image',
            fileSize: file.size,
            originalFilename: file.originalname,
            folder: 'group_uploads',
            provider: uploadResult.provider
        });
        await group.populate('participants', 'profile.name.first profile.name.last profile.name.full profile.profileImage firstName lastName name profileImage');
        await group.populate('createdBy', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
        const participantsWithStatus = await Promise.all(group.participants.map(async (participant) => {
            const online = await isUserOnline(participant._id.toString());
            const lastSeen = await getUserLastSeen(participant._id.toString());
            return formatParticipant(participant, online, lastSeen);
        }));
        const creatorObj = group.createdBy?.toObject ? group.createdBy.toObject() : group.createdBy;
        const creatorName = creatorObj?.profile?.name?.full || (creatorObj?.profile?.name?.first && creatorObj?.profile?.name?.last ? `${creatorObj.profile.name.first} ${creatorObj.profile.name.last}`.trim() : creatorObj?.profile?.name?.first || creatorObj?.profile?.name?.last || creatorObj?.name || (creatorObj?.firstName || creatorObj?.lastName ? `${creatorObj.firstName || ''} ${creatorObj.lastName || ''}`.trim() : ''));
        const creatorProfileImage = creatorObj?.profile?.profileImage || creatorObj?.profileImage || '';
        const io = realtime.getIO();
        io.to(`conversation:${groupId}`).emit('group:photo:updated', { groupId, groupImage: uploadResult.url, updatedBy: userId.toString() });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Group photo uploaded successfully',
                data: {
                    id: mediaRecord._id,
                    url: uploadResult.url,
                    public_id: uploadResult.key,
                    format,
                    fileSize: file.size,
                    group: { ...group.toObject(), participants: participantsWithStatus, createdBy: creatorObj ? { _id: creatorObj._id, name: creatorName, profileImage: creatorProfileImage } : null },
                    uploadedAt: mediaRecord.createdAt
                }
            }
        };
    } catch (error) {
        console.error('Upload group photo error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to upload group photo', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function removeGroupPhoto(userId, groupId) {
    try {
        if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) return { statusCode: 400, json: { success: false, message: 'Valid group ID is required' } };
        const group = await Conversation.findById(groupId);
        if (!group) return { statusCode: 404, json: { success: false, message: 'Group not found' } };
        if (!group.isGroup) return { statusCode: 400, json: { success: false, message: 'This is not a group conversation' } };
        const isParticipant = group.participants.some(p => p.toString() === userId.toString());
        if (!isParticipant) return { statusCode: 403, json: { success: false, message: 'You are not a participant of this group' } };
        const isAdmin = group.admins?.some(adminId => adminId.toString() === userId.toString());
        const isCreator = group.createdBy?.toString() === userId.toString();
        if (!isAdmin && !isCreator) return { statusCode: 403, json: { success: false, message: 'Only group admins or creator can remove group photo' } };
        if (!group.groupImage) return { statusCode: 404, json: { success: false, message: 'No group photo found to remove' } };
        const groupImageUrl = group.groupImage;
        const media = await Media.findOne({ url: groupImageUrl });
        if (media?.public_id) { try { await StorageService.delete(media.public_id); } catch (e) { console.warn(e.message); } }
        if (media) await Media.findByIdAndDelete(media._id);
        group.groupImage = null;
        await group.save();
        await group.populate('participants', 'profile.name.first profile.name.last profile.name.full profile.profileImage firstName lastName name profileImage');
        await group.populate('createdBy', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
        const participantsWithStatus = await Promise.all(group.participants.map(async (participant) => {
            const online = await isUserOnline(participant._id.toString());
            const lastSeen = await getUserLastSeen(participant._id.toString());
            return formatParticipant(participant, online, lastSeen);
        }));
        const creatorObj = group.createdBy?.toObject ? group.createdBy.toObject() : group.createdBy;
        const creatorName = creatorObj?.profile?.name?.full || (creatorObj?.profile?.name?.first && creatorObj?.profile?.name?.last ? `${creatorObj.profile.name.first} ${creatorObj.profile.name.last}`.trim() : creatorObj?.profile?.name?.first || creatorObj?.profile?.name?.last || creatorObj?.name || (creatorObj?.firstName || creatorObj?.lastName ? `${creatorObj.firstName || ''} ${creatorObj.lastName || ''}`.trim() : ''));
        const creatorProfileImage = creatorObj?.profile?.profileImage || creatorObj?.profileImage || '';
        const io = realtime.getIO();
        io.to(`conversation:${groupId}`).emit('group:photo:removed', { groupId, groupImage: null, removedBy: userId.toString() });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Group photo removed successfully',
                data: { group: { ...group.toObject(), participants: participantsWithStatus, createdBy: creatorObj ? { _id: creatorObj._id, name: creatorName, profileImage: creatorProfileImage } : null } }
            }
        };
    } catch (error) {
        console.error('Remove group photo error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to remove group photo', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function removeGroupMember(userId, groupId, body) {
    try {
        const { memberId } = body;
        if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) return { statusCode: 400, json: { success: false, message: 'Valid group ID is required' } };
        if (!memberId || !mongoose.Types.ObjectId.isValid(memberId)) return { statusCode: 400, json: { success: false, message: 'Valid member ID is required' } };
        const group = await Conversation.findById(groupId);
        if (!group) return { statusCode: 404, json: { success: false, message: 'Group not found' } };
        if (!group.isGroup) return { statusCode: 400, json: { success: false, message: 'This is not a group conversation' } };
        const isParticipant = group.participants.some(p => p.toString() === userId.toString());
        if (!isParticipant) return { statusCode: 403, json: { success: false, message: 'You are not a participant of this group' } };
        const isAdmin = group.admins?.some(adminId => adminId.toString() === userId.toString());
        const isCreator = group.createdBy?.toString() === userId.toString();
        if (!isAdmin && !isCreator) return { statusCode: 403, json: { success: false, message: 'Only group admins or creator can remove members' } };
        const memberIndex = group.participants.findIndex(p => p.toString() === memberId.toString());
        if (memberIndex === -1) return { statusCode: 404, json: { success: false, message: 'Member not found in group' } };
        if (group.createdBy?.toString() === memberId.toString()) return { statusCode: 400, json: { success: false, message: 'Cannot remove the group creator' } };
        if (memberId.toString() === userId.toString() && isCreator) return { statusCode: 400, json: { success: false, message: 'Group creator cannot remove themselves from the group' } };
        group.participants = group.participants.filter(p => p.toString() !== memberId.toString());
        if (group.admins?.length) group.admins = group.admins.filter(adminId => adminId.toString() !== memberId.toString());
        await group.save();
        await group.populate('participants', 'profile.name.first profile.name.last profile.name.full profile.profileImage firstName lastName name profileImage');
        await group.populate('createdBy', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
        await group.populate('admins', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
        const participantsWithStatus = await Promise.all(group.participants.map(async (participant) => {
            const online = await isUserOnline(participant._id.toString());
            const lastSeen = await getUserLastSeen(participant._id.toString());
            return formatParticipant(participant, online, lastSeen);
        }));
        const creatorObj = group.createdBy?.toObject ? group.createdBy.toObject() : group.createdBy;
        const creatorName = creatorObj?.profile?.name?.full || (creatorObj?.profile?.name?.first && creatorObj?.profile?.name?.last ? `${creatorObj.profile.name.first} ${creatorObj.profile.name.last}`.trim() : creatorObj?.profile?.name?.first || creatorObj?.profile?.name?.last || creatorObj?.name || (creatorObj?.firstName || creatorObj?.lastName ? `${creatorObj.firstName || ''} ${creatorObj.lastName || ''}`.trim() : ''));
        const creatorProfileImage = creatorObj?.profile?.profileImage || creatorObj?.profileImage || '';
        const removedMember = await User.findById(memberId).select('profile.name.first profile.name.last profile.name.full profile.profileImage firstName lastName name profileImage');
        const removedMemberObj = removedMember?.toObject ? removedMember.toObject() : removedMember;
        const removedMemberName = removedMemberObj?.profile?.name?.full || (removedMemberObj?.profile?.name?.first && removedMemberObj?.profile?.name?.last ? `${removedMemberObj.profile.name.first} ${removedMemberObj.profile.name.last}`.trim() : removedMemberObj?.profile?.name?.first || removedMemberObj?.profile?.name?.last || removedMemberObj?.name || (removedMemberObj?.firstName || removedMemberObj?.lastName ? `${removedMemberObj.firstName || ''} ${removedMemberObj.lastName || ''}`.trim() : ''));
        const removedMemberProfileImage = removedMemberObj?.profile?.profileImage || removedMemberObj?.profileImage || '';
        const io = realtime.getIO();
        io.to(`conversation:${groupId}`).emit('group:member:removed', { groupId, removedMemberId: memberId, removedMember: removedMemberObj ? { _id: removedMemberObj._id, name: removedMemberName, profileImage: removedMemberProfileImage } : null, removedBy: userId.toString(), participants: participantsWithStatus });
        io.to(`user:${memberId}`).emit('group:removed', { groupId, groupName: group.groupName });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Member removed from group successfully',
                data: {
                    ...group.toObject(),
                    participants: participantsWithStatus,
                    createdBy: creatorObj ? { _id: creatorObj._id, name: creatorName, profileImage: creatorProfileImage } : null,
                    removedMember: removedMemberObj ? { _id: removedMemberObj._id, name: removedMemberName, profileImage: removedMemberProfileImage } : null
                }
            }
        };
    } catch (error) {
        console.error('Remove group member error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to remove member from group', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function addGroupAdmin(userId, groupId, body) {
    try {
        const { memberId } = body;
        if (!groupId || !mongoose.Types.ObjectId.isValid(groupId)) return { statusCode: 400, json: { success: false, message: 'Valid group ID is required' } };
        if (!memberId || !mongoose.Types.ObjectId.isValid(memberId)) return { statusCode: 400, json: { success: false, message: 'Valid member ID is required' } };
        const group = await Conversation.findById(groupId);
        if (!group) return { statusCode: 404, json: { success: false, message: 'Group not found' } };
        if (!group.isGroup) return { statusCode: 400, json: { success: false, message: 'This is not a group conversation' } };
        const isParticipant = group.participants.some(p => p.toString() === userId.toString());
        if (!isParticipant) return { statusCode: 403, json: { success: false, message: 'You are not a participant of this group' } };
        const isAdmin = group.admins?.some(adminId => adminId.toString() === userId.toString());
        const isCreator = group.createdBy?.toString() === userId.toString();
        if (!isAdmin && !isCreator) return { statusCode: 403, json: { success: false, message: 'Only group admins or creator can make members admin' } };
        const isMemberParticipant = group.participants.some(p => p.toString() === memberId.toString());
        if (!isMemberParticipant) return { statusCode: 404, json: { success: false, message: 'User is not a member of this group' } };
        const isAlreadyAdmin = group.admins?.some(adminId => adminId.toString() === memberId.toString());
        if (isAlreadyAdmin) return { statusCode: 400, json: { success: false, message: 'User is already an admin' } };
        if (!group.admins) group.admins = [];
        group.admins.push(new mongoose.Types.ObjectId(memberId));
        await group.save();
        await group.populate('participants', 'profile.name.first profile.name.last profile.name.full profile.profileImage firstName lastName name profileImage');
        await group.populate('createdBy', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
        await group.populate('admins', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
        const participantsWithStatus = await Promise.all(group.participants.map(async (participant) => {
            const online = await isUserOnline(participant._id.toString());
            const lastSeen = await getUserLastSeen(participant._id.toString());
            return formatParticipant(participant, online, lastSeen);
        }));
        const creatorObj = group.createdBy?.toObject ? group.createdBy.toObject() : group.createdBy;
        const creatorName = creatorObj?.profile?.name?.full || (creatorObj?.profile?.name?.first && creatorObj?.profile?.name?.last ? `${creatorObj.profile.name.first} ${creatorObj.profile.name.last}`.trim() : creatorObj?.profile?.name?.first || creatorObj?.profile?.name?.last || creatorObj?.name || (creatorObj?.firstName || creatorObj?.lastName ? `${creatorObj.firstName || ''} ${creatorObj.lastName || ''}`.trim() : ''));
        const creatorProfileImage = creatorObj?.profile?.profileImage || creatorObj?.profileImage || '';
        const newAdmin = await User.findById(memberId).select('profile.name.first profile.name.last profile.name.full profile.profileImage firstName lastName name profileImage');
        const newAdminObj = newAdmin?.toObject ? newAdmin.toObject() : newAdmin;
        const newAdminName = newAdminObj?.profile?.name?.full || (newAdminObj?.profile?.name?.first && newAdminObj?.profile?.name?.last ? `${newAdminObj.profile.name.first} ${newAdminObj.profile.name.last}`.trim() : newAdminObj?.profile?.name?.first || newAdminObj?.profile?.name?.last || newAdminObj?.name || (newAdminObj?.firstName || newAdminObj?.lastName ? `${newAdminObj.firstName || ''} ${newAdminObj.lastName || ''}`.trim() : ''));
        const newAdminProfileImage = newAdminObj?.profile?.profileImage || newAdminObj?.profileImage || '';
        const adminsWithStatus = await Promise.all(group.admins.map(async (admin) => {
            const adminObj = admin.toObject ? admin.toObject() : admin;
            const adminName = adminObj?.profile?.name?.full || (adminObj?.profile?.name?.first && adminObj?.profile?.name?.last ? `${adminObj.profile.name.first} ${adminObj.profile.name.last}`.trim() : adminObj?.profile?.name?.first || adminObj?.profile?.name?.last || adminObj?.name || (adminObj?.firstName || adminObj?.lastName ? `${adminObj.firstName || ''} ${adminObj.lastName || ''}`.trim() : ''));
            const adminProfileImage = adminObj?.profile?.profileImage || adminObj?.profileImage || '';
            return { _id: adminObj._id, name: adminName, profileImage: adminProfileImage };
        }));
        const io = realtime.getIO();
        io.to(`conversation:${groupId}`).emit('group:admin:added', { groupId, newAdminId: memberId, newAdmin: newAdminObj ? { _id: newAdminObj._id, name: newAdminName, profileImage: newAdminProfileImage } : null, addedBy: userId.toString(), admins: adminsWithStatus });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Member promoted to admin successfully',
                data: {
                    ...group.toObject(),
                    participants: participantsWithStatus,
                    admins: adminsWithStatus,
                    createdBy: creatorObj ? { _id: creatorObj._id, name: creatorName, profileImage: creatorProfileImage } : null,
                    newAdmin: newAdminObj ? { _id: newAdminObj._id, name: newAdminName, profileImage: newAdminProfileImage } : null
                }
            }
        };
    } catch (error) {
        console.error('Add group admin error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to make member admin', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

module.exports = {
    getConversations,
    getOrCreateConversation,
    getMessages,
    sendMessage,
    deleteMessage,
    markMessagesAsRead,
    getUnreadCount,
    createGroup,
    updateGroupInfo,
    uploadGroupPhoto,
    removeGroupPhoto,
    removeGroupMember,
    addGroupAdmin
};

/**
 * Friend requests and friends list business logic. Returns { statusCode, json } or throws.
 */

const User = require('../../models/authorization/User');
const FriendRequest = require('../../models/social/FriendRequest');
const mongoose = require('mongoose');
const { emitNotification } = require('../../core/infra/notificationEmitter');

async function getBlockedUserIds(userId) {
    try {
        const user = await User.findById(userId).select('blockedUsers social.blockedUsers');
        if (!user) return [];
        const rootBlocked = user.blockedUsers || [];
        const socialBlocked = user.social?.blockedUsers || [];
        const uniqueBlocked = [...new Set([...rootBlocked, ...socialBlocked].map(id => id.toString()))];
        return uniqueBlocked.map(id => mongoose.Types.ObjectId(id));
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

function formatFriend(friend) {
    const obj = friend.toObject ? friend.toObject() : friend;
    const name = obj.profile?.name?.full ||
        (obj.profile?.name?.first && obj.profile?.name?.last
            ? `${obj.profile.name.first} ${obj.profile.name.last}`.trim()
            : obj.profile?.name?.first || obj.profile?.name?.last || obj.name ||
                (obj.firstName || obj.lastName ? `${obj.firstName || ''} ${obj.lastName || ''}`.trim() : ''));
    const profileImage = obj.profile?.profileImage || obj.profileImage || '';
    const bio = obj.profile?.bio || obj.bio || '';
    return { _id: friend._id, name, profileImage, bio };
}

async function sendFriendRequest(senderId, receiverId) {
    try {
        if (!mongoose.Types.ObjectId.isValid(receiverId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid receiver ID' } };
        }
        if (senderId.toString() === receiverId) {
            return { statusCode: 400, json: { success: false, message: 'You cannot send a friend request to yourself' } };
        }
        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return { statusCode: 404, json: { success: false, message: 'User not found' } };
        }
        const senderBlocked = await isUserBlocked(senderId, receiverId);
        if (senderBlocked) {
            return { statusCode: 403, json: { success: false, message: 'You cannot send a friend request to a blocked user' } };
        }
        const receiverBlocked = await isUserBlocked(receiverId, senderId);
        if (receiverBlocked) {
            return { statusCode: 403, json: { success: false, message: 'Action not available' } };
        }
        const sender = await User.findById(senderId).select('social.friends');
        if (!sender) {
            return { statusCode: 404, json: { success: false, message: 'Sender user not found' } };
        }
        const senderFriends = sender.social?.friends || [];
        if (senderFriends.some(friendId => friendId.toString() === receiverId)) {
            return { statusCode: 400, json: { success: false, message: 'You are already friends with this user' } };
        }
        const existingRequest = await FriendRequest.findOne({
            $or: [
                { sender: senderId, receiver: receiverId, status: 'pending' },
                { sender: receiverId, receiver: senderId, status: 'pending' }
            ]
        });
        if (existingRequest) {
            if (existingRequest.sender.toString() === senderId.toString()) {
                return { statusCode: 400, json: { success: false, message: 'You have already sent a friend request to this user' } };
            }
            return { statusCode: 400, json: { success: false, message: 'This user has already sent you a friend request. Please accept or reject it first.' } };
        }
        const acceptedRequest = await FriendRequest.findOne({
            $or: [
                { sender: senderId, receiver: receiverId, status: 'accepted' },
                { sender: receiverId, receiver: senderId, status: 'accepted' }
            ]
        });
        if (acceptedRequest) {
            return { statusCode: 400, json: { success: false, message: 'You are already friends with this user' } };
        }
        const friendRequest = await FriendRequest.create({ sender: senderId, receiver: receiverId, status: 'pending' });
        await friendRequest.populate('sender', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email');
        await friendRequest.populate('receiver', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email');
        try {
            await emitNotification({
                recipientType: 'USER',
                recipientId: receiverId,
                category: 'SOCIAL',
                type: 'FRIEND_REQUEST_RECEIVED',
                title: 'New Friend Request',
                message: `${friendRequest.sender.profile?.name?.full || 'Someone'} sent you a friend request`,
                channels: ['IN_APP', 'PUSH'],
                entity: { type: 'FRIEND_REQUEST', id: friendRequest._id },
                payload: { senderId: senderId.toString(), senderName: friendRequest.sender.profile?.name?.full || 'Unknown' }
            });
        } catch (notifError) {
            console.error('Failed to emit friend request notification:', notifError);
        }
        return { statusCode: 201, json: { success: true, message: 'Friend request sent successfully', data: friendRequest } };
    } catch (error) {
        if (error.code === 11000) {
            return { statusCode: 400, json: { success: false, message: 'A friend request already exists between these users' } };
        }
        console.error('Send friend request error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to send friend request', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function acceptFriendRequest(userId, requestId) {
    try {
        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid request ID' } };
        }
        const friendRequest = await FriendRequest.findById(requestId);
        if (!friendRequest) {
            return { statusCode: 404, json: { success: false, message: 'Friend request not found' } };
        }
        if (friendRequest.receiver.toString() !== userId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You can only accept friend requests sent to you' } };
        }
        const currentUserBlocked = await isUserBlocked(userId, friendRequest.sender);
        if (currentUserBlocked) {
            return { statusCode: 403, json: { success: false, message: 'You cannot accept a friend request from a blocked user' } };
        }
        const senderBlocked = await isUserBlocked(friendRequest.sender, userId);
        if (senderBlocked) {
            return { statusCode: 403, json: { success: false, message: 'Action not available' } };
        }
        if (friendRequest.status !== 'pending') {
            return { statusCode: 400, json: { success: false, message: `This friend request has already been ${friendRequest.status}` } };
        }
        const senderId = friendRequest.sender;
        const receiverId = friendRequest.receiver;
        await User.findByIdAndUpdate(senderId, { $addToSet: { 'social.friends': receiverId } });
        await User.findByIdAndUpdate(receiverId, { $addToSet: { 'social.friends': senderId } });
        friendRequest.status = 'accepted';
        await friendRequest.save();
        await friendRequest.populate('sender', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email');
        await friendRequest.populate('receiver', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email');
        try {
            await emitNotification({
                recipientType: 'USER',
                recipientId: senderId,
                category: 'SOCIAL',
                type: 'FRIEND_REQUEST_ACCEPTED',
                title: 'Friend Request Accepted',
                message: `${friendRequest.receiver.profile?.name?.full || 'Someone'} accepted your friend request`,
                channels: ['IN_APP', 'PUSH'],
                entity: { type: 'FRIEND_REQUEST', id: friendRequest._id },
                payload: { receiverId: receiverId.toString(), receiverName: friendRequest.receiver.profile?.name?.full || 'Unknown' }
            });
        } catch (notifError) {
            console.error('Failed to emit friend request accepted notification:', notifError);
        }
        return { statusCode: 200, json: { success: true, message: 'Friend request accepted successfully', data: friendRequest } };
    } catch (error) {
        console.error('Accept friend request error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to accept friend request', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function rejectFriendRequest(userId, requestId) {
    try {
        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid request ID' } };
        }
        const friendRequest = await FriendRequest.findById(requestId);
        if (!friendRequest) {
            return { statusCode: 404, json: { success: false, message: 'Friend request not found' } };
        }
        if (friendRequest.receiver.toString() !== userId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You can only reject friend requests sent to you' } };
        }
        if (friendRequest.status !== 'pending') {
            return { statusCode: 400, json: { success: false, message: `This friend request has already been ${friendRequest.status}` } };
        }
        friendRequest.status = 'rejected';
        await friendRequest.save();
        await friendRequest.populate('sender', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email');
        await friendRequest.populate('receiver', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email');
        return { statusCode: 200, json: { success: true, message: 'Friend request rejected successfully', data: friendRequest } };
    } catch (error) {
        console.error('Reject friend request error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to reject friend request', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function listFriends(userId) {
    try {
        const user = await User.findById(userId)
            .populate('social.friends', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.bio')
            .select('social.friends');
        if (!user) {
            return { statusCode: 404, json: { success: false, message: 'User not found' } };
        }
        const blockedUserIds = await getBlockedUserIds(userId);
        const blockedUserIdsStrings = blockedUserIds.map(id => id.toString());
        const filteredFriends = (user.social?.friends || []).filter(friend =>
            !blockedUserIdsStrings.includes(friend._id.toString())
        );
        const friendsList = filteredFriends.map(formatFriend);
        return {
            statusCode: 200,
            json: { success: true, message: 'Friends retrieved successfully', data: { friends: friendsList, count: friendsList.length } }
        };
    } catch (error) {
        console.error('List friends error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve friends', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function listReceivedRequests(userId) {
    try {
        const blockedUserIds = await getBlockedUserIds(userId);
        const requests = await FriendRequest.find({
            receiver: userId,
            status: 'pending',
            sender: { $nin: blockedUserIds }
        })
            .populate('sender', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email profile.bio location.currentCity location.hometown')
            .sort({ createdAt: -1 });
        return {
            statusCode: 200,
            json: { success: true, message: 'Received friend requests retrieved successfully', data: { requests, count: requests.length } }
        };
    } catch (error) {
        console.error('List received requests error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve received friend requests', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function listSentRequests(userId) {
    try {
        const blockedUserIds = await getBlockedUserIds(userId);
        const requests = await FriendRequest.find({
            sender: userId,
            status: 'pending',
            receiver: { $nin: blockedUserIds }
        })
            .populate('receiver', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email profile.bio location.currentCity location.hometown')
            .sort({ createdAt: -1 });
        return {
            statusCode: 200,
            json: { success: true, message: 'Sent friend requests retrieved successfully', data: { requests, count: requests.length } }
        };
    } catch (error) {
        console.error('List sent requests error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve sent friend requests', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function unfriend(userId, friendId) {
    try {
        if (!mongoose.Types.ObjectId.isValid(friendId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid friend ID' } };
        }
        if (userId.toString() === friendId) {
            return { statusCode: 400, json: { success: false, message: 'You cannot unfriend yourself' } };
        }
        const friend = await User.findById(friendId);
        if (!friend) {
            return { statusCode: 404, json: { success: false, message: 'User not found' } };
        }
        const user = await User.findById(userId).select('social.friends');
        if (!user) {
            return { statusCode: 404, json: { success: false, message: 'User not found' } };
        }
        const friendIdStr = friendId.toString();
        const userFriends = user.social?.friends || [];
        const isFriend = userFriends.some(f => f.toString() === friendIdStr);
        if (!isFriend) {
            return { statusCode: 400, json: { success: false, message: 'You are not friends with this user' } };
        }
        await User.findByIdAndUpdate(userId, { $pull: { 'social.friends': friendId } });
        await User.findByIdAndUpdate(friendId, { $pull: { 'social.friends': userId } });
        await FriendRequest.updateMany(
            {
                $or: [
                    { sender: userId, receiver: friendId, status: 'accepted' },
                    { sender: friendId, receiver: userId, status: 'accepted' }
                ]
            },
            { status: 'rejected' }
        );
        return { statusCode: 200, json: { success: true, message: 'User unfriended successfully' } };
    } catch (error) {
        console.error('Unfriend error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to unfriend user', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function cancelSentRequest(userId, requestId) {
    try {
        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid request ID' } };
        }
        const friendRequest = await FriendRequest.findById(requestId);
        if (!friendRequest) {
            return { statusCode: 404, json: { success: false, message: 'Friend request not found' } };
        }
        if (friendRequest.sender.toString() !== userId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You can only cancel friend requests you sent' } };
        }
        if (friendRequest.status !== 'pending') {
            return { statusCode: 400, json: { success: false, message: `This friend request has already been ${friendRequest.status}` } };
        }
        await FriendRequest.findByIdAndDelete(requestId);
        return { statusCode: 200, json: { success: true, message: 'Friend request cancelled successfully' } };
    } catch (error) {
        console.error('Cancel sent request error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to cancel friend request', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function getFriendSuggestions(userId, limitParam) {
    try {
        const limit = parseInt(limitParam) || 10;
        const user = await User.findById(userId).select('social.friends');
        if (!user) {
            return { statusCode: 404, json: { success: false, message: 'User not found' } };
        }
        const blockedUserIds = await getBlockedUserIds(userId);
        const blockedUserIdStrings = blockedUserIds.map(id => id.toString());
        const userFriends = user.social?.friends || [];
        if (userFriends.length === 0) {
            const randomUsers = await User.find({
                _id: { $ne: userId, $nin: blockedUserIds },
                $and: [
                    { $or: [{ blockedUsers: { $ne: userId } }, { blockedUsers: { $exists: false } }] },
                    { $or: [{ 'social.blockedUsers': { $ne: userId } }, { 'social.blockedUsers': { $exists: false } }] }
                ]
            })
                .select('profile.name.first profile.name.last profile.name.full profile.profileImage profile.email profile.bio location.currentCity location.hometown firstName lastName name profileImage email bio currentCity hometown')
                .limit(limit)
                .lean();
            const formattedUsers = randomUsers.map(u => ({
                _id: u._id,
                name: u.profile?.name?.full || (u.profile?.name?.first && u.profile?.name?.last ? `${u.profile.name.first} ${u.profile.name.last}`.trim() : u.profile?.name?.first || u.profile?.name?.last || u.name || (u.firstName || u.lastName ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '')),
                profileImage: u.profile?.profileImage || u.profileImage || '',
                bio: u.profile?.bio || u.bio || ''
            }));
            return {
                statusCode: 200,
                json: {
                    success: true,
                    message: 'Friend suggestions retrieved successfully',
                    data: {
                        suggestions: formattedUsers.map(u => ({ user: u, mutualFriends: 0, mutualFriendsList: [] })),
                        count: formattedUsers.length
                    }
                }
            };
        }
        const friendsOfFriends = await User.find({ _id: { $in: userFriends } }).select('social.friends').lean();
        const suggestionMap = new Map();
        const userIdStr = userId.toString();
        for (const friend of friendsOfFriends) {
            const friendFriends = friend.social?.friends || [];
            for (const friendOfFriendId of friendFriends) {
                const friendOfFriendIdStr = friendOfFriendId.toString();
                if (friendOfFriendIdStr === userIdStr) continue;
                if (userFriends.some(f => f.toString() === friendOfFriendIdStr)) continue;
                if (blockedUserIdStrings.includes(friendOfFriendIdStr)) continue;
                if (!suggestionMap.has(friendOfFriendIdStr)) {
                    suggestionMap.set(friendOfFriendIdStr, { userId: friendOfFriendId, mutualFriends: [], count: 0 });
                }
                const suggestion = suggestionMap.get(friendOfFriendIdStr);
                const mutualFriend = friendsOfFriends.find(f => f._id.toString() === friend._id.toString());
                if (mutualFriend && !suggestion.mutualFriends.some(mf => mf.toString() === mutualFriend._id.toString())) {
                    suggestion.mutualFriends.push(mutualFriend._id);
                    suggestion.count = suggestion.mutualFriends.length;
                }
            }
        }
        const pendingRequests = await FriendRequest.find({
            $or: [{ sender: userId, status: 'pending' }, { receiver: userId, status: 'pending' }]
        }).select('sender receiver').lean();
        const excludedUserIds = new Set();
        pendingRequests.forEach(r => {
            if (r.sender.toString() === userIdStr) excludedUserIds.add(r.receiver.toString());
            else excludedUserIds.add(r.sender.toString());
        });
        const filteredSuggestions = Array.from(suggestionMap.values())
            .filter(s => !excludedUserIds.has(s.userId.toString()))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
        const suggestionUserIds = filteredSuggestions.map(s => s.userId);
        const suggestedUsers = await User.find({
            _id: { $in: suggestionUserIds },
            $and: [
                { $or: [{ blockedUsers: { $ne: userId } }, { blockedUsers: { $exists: false } }] },
                { $or: [{ 'social.blockedUsers': { $ne: userId } }, { 'social.blockedUsers': { $exists: false } }] }
            ]
        })
            .select('profile.name.first profile.name.last profile.name.full profile.profileImage profile.email profile.bio location.currentCity location.hometown firstName lastName name profileImage email bio currentCity hometown')
            .lean();
        const allMutualFriendIds = new Set();
        filteredSuggestions.forEach(s => s.mutualFriends.forEach(mf => allMutualFriendIds.add(mf.toString())));
        const mutualFriendsDetails = await User.find({ _id: { $in: Array.from(allMutualFriendIds) } })
            .select('profile.name.first profile.name.last profile.name.full profile.profileImage firstName lastName name profileImage')
            .lean();
        const mutualFriendsMap = new Map();
        mutualFriendsDetails.forEach(mf => {
            const name = mf.profile?.name?.full || (mf.profile?.name?.first && mf.profile?.name?.last ? `${mf.profile.name.first} ${mf.profile.name.last}`.trim() : mf.profile?.name?.first || mf.profile?.name?.last || mf.name || (mf.firstName || mf.lastName ? `${mf.firstName || ''} ${mf.lastName || ''}`.trim() : ''));
            mutualFriendsMap.set(mf._id.toString(), { _id: mf._id, name, profileImage: mf.profile?.profileImage || mf.profileImage || '' });
        });
        const finalSuggestions = filteredSuggestions.map(suggestion => {
            const userDetailsRaw = suggestedUsers.find(u => u._id.toString() === suggestion.userId.toString());
            let userDetails = null;
            if (userDetailsRaw) {
                userDetails = {
                    _id: userDetailsRaw._id,
                    name: userDetailsRaw.profile?.name?.full || (userDetailsRaw.profile?.name?.first && userDetailsRaw.profile?.name?.last ? `${userDetailsRaw.profile.name.first} ${userDetailsRaw.profile.name.last}`.trim() : userDetailsRaw.profile?.name?.first || userDetailsRaw.profile?.name?.last || userDetailsRaw.name || (userDetailsRaw.firstName || userDetailsRaw.lastName ? `${userDetailsRaw.firstName || ''} ${userDetailsRaw.lastName || ''}`.trim() : '')),
                    profileImage: userDetailsRaw.profile?.profileImage || userDetailsRaw.profileImage || '',
                    bio: userDetailsRaw.profile?.bio || userDetailsRaw.bio || ''
                };
            }
            const mutualFriendsList = suggestion.mutualFriends.map(mfId => mutualFriendsMap.get(mfId.toString())).filter(Boolean).slice(0, 3);
            return { user: userDetails, mutualFriendsCount: suggestion.count, mutualFriends: mutualFriendsList };
        });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Friend suggestions retrieved successfully',
                data: { suggestions: finalSuggestions, count: finalSuggestions.length }
            }
        };
    } catch (error) {
        console.error('Get friend suggestions error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve friend suggestions', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

module.exports = {
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    listFriends,
    listReceivedRequests,
    listSentRequests,
    unfriend,
    cancelSentRequest,
    getFriendSuggestions
};

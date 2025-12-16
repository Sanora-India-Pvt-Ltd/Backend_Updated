const User = require('../models/User');
const FriendRequest = require('../models/FriendRequest');
const mongoose = require('mongoose');

// Send friend request
const sendFriendRequest = async (req, res) => {
    try {
        const senderId = req.user._id;
        const { receiverId } = req.params;

        // Validate receiverId
        if (!mongoose.Types.ObjectId.isValid(receiverId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid receiver ID'
            });
        }

        // Check if sender is trying to send request to themselves
        if (senderId.toString() === receiverId) {
            return res.status(400).json({
                success: false,
                message: 'You cannot send a friend request to yourself'
            });
        }

        // Check if receiver exists
        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if sender has blocked the receiver
        const sender = await User.findById(senderId);
        if (sender.blockedUsers && sender.blockedUsers.includes(receiverId)) {
            return res.status(403).json({
                success: false,
                message: 'You cannot send a friend request to a blocked user'
            });
        }

        // Check if receiver has blocked the sender
        if (receiver.blockedUsers && receiver.blockedUsers.includes(senderId)) {
            return res.status(403).json({
                success: false,
                message: 'Action not available'
            });
        }

        // Check if they are already friends (sender already fetched above)
        if (sender.friends && sender.friends.includes(receiverId)) {
            return res.status(400).json({
                success: false,
                message: 'You are already friends with this user'
            });
        }

        // Check if there's already a pending request (in either direction)
        const existingRequest = await FriendRequest.findOne({
            $or: [
                { sender: senderId, receiver: receiverId, status: 'pending' },
                { sender: receiverId, receiver: senderId, status: 'pending' }
            ]
        });

        if (existingRequest) {
            if (existingRequest.sender.toString() === senderId.toString()) {
                return res.status(400).json({
                    success: false,
                    message: 'You have already sent a friend request to this user'
                });
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'This user has already sent you a friend request. Please accept or reject it first.'
                });
            }
        }

        // Check if there's an accepted request (they were friends before)
        const acceptedRequest = await FriendRequest.findOne({
            $or: [
                { sender: senderId, receiver: receiverId, status: 'accepted' },
                { sender: receiverId, receiver: senderId, status: 'accepted' }
            ]
        });

        if (acceptedRequest) {
            return res.status(400).json({
                success: false,
                message: 'You are already friends with this user'
            });
        }

        // Create friend request
        const friendRequest = await FriendRequest.create({
            sender: senderId,
            receiver: receiverId,
            status: 'pending'
        });

        // Populate sender and receiver details
        await friendRequest.populate('sender', 'firstName lastName name profileImage email');
        await friendRequest.populate('receiver', 'firstName lastName name profileImage email');

        res.status(201).json({
            success: true,
            message: 'Friend request sent successfully',
            data: friendRequest
        });
    } catch (error) {
        console.error('Send friend request error:', error);
        
        // Handle duplicate key error (unique index violation)
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'A friend request already exists between these users'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to send friend request',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Accept friend request
const acceptFriendRequest = async (req, res) => {
    try {
        const userId = req.user._id;
        const { requestId } = req.params;

        // Validate requestId
        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid request ID'
            });
        }

        // Find the friend request
        const friendRequest = await FriendRequest.findById(requestId);
        if (!friendRequest) {
            return res.status(404).json({
                success: false,
                message: 'Friend request not found'
            });
        }

        // Check if the current user is the receiver
        if (friendRequest.receiver.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only accept friend requests sent to you'
            });
        }

        // Check if either user has blocked the other
        const currentUser = await User.findById(userId).select('blockedUsers');
        const senderUser = await User.findById(friendRequest.sender).select('blockedUsers');
        
        if (currentUser.blockedUsers && currentUser.blockedUsers.includes(friendRequest.sender)) {
            return res.status(403).json({
                success: false,
                message: 'You cannot accept a friend request from a blocked user'
            });
        }

        if (senderUser.blockedUsers && senderUser.blockedUsers.includes(userId)) {
            return res.status(403).json({
                success: false,
                message: 'Action not available'
            });
        }

        // Check if request is already accepted or rejected
        if (friendRequest.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `This friend request has already been ${friendRequest.status}`
            });
        }

        const senderId = friendRequest.sender;
        const receiverId = friendRequest.receiver;

        // Update both users' friends arrays
        await User.findByIdAndUpdate(senderId, {
            $addToSet: { friends: receiverId }
        });

        await User.findByIdAndUpdate(receiverId, {
            $addToSet: { friends: senderId }
        });

        // Update request status
        friendRequest.status = 'accepted';
        await friendRequest.save();

        // Populate sender and receiver details
        await friendRequest.populate('sender', 'firstName lastName name profileImage email');
        await friendRequest.populate('receiver', 'firstName lastName name profileImage email');

        res.json({
            success: true,
            message: 'Friend request accepted successfully',
            data: friendRequest
        });
    } catch (error) {
        console.error('Accept friend request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to accept friend request',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Reject friend request
const rejectFriendRequest = async (req, res) => {
    try {
        const userId = req.user._id;
        const { requestId } = req.params;

        // Validate requestId
        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid request ID'
            });
        }

        // Find the friend request
        const friendRequest = await FriendRequest.findById(requestId);
        if (!friendRequest) {
            return res.status(404).json({
                success: false,
                message: 'Friend request not found'
            });
        }

        // Check if the current user is the receiver
        if (friendRequest.receiver.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only reject friend requests sent to you'
            });
        }

        // Check if request is already processed
        if (friendRequest.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `This friend request has already been ${friendRequest.status}`
            });
        }

        // Update request status to rejected
        friendRequest.status = 'rejected';
        await friendRequest.save();

        // Optionally delete the request (or keep it for history)
        // For now, we'll keep it with rejected status for audit purposes
        // If you want to delete it, uncomment the line below:
        // await FriendRequest.findByIdAndDelete(requestId);

        // Populate sender and receiver details
        await friendRequest.populate('sender', 'firstName lastName name profileImage email');
        await friendRequest.populate('receiver', 'firstName lastName name profileImage email');

        res.json({
            success: true,
            message: 'Friend request rejected successfully',
            data: friendRequest
        });
    } catch (error) {
        console.error('Reject friend request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject friend request',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// List all friends
const listFriends = async (req, res) => {
    try {
        const userId = req.user._id;

        // Get user with populated friends
        const user = await User.findById(userId)
            .populate('friends', 'firstName lastName name profileImage email bio currentCity hometown')
            .select('friends blockedUsers');
        
        // Filter out blocked users from friends list
        const blockedUserIds = user.blockedUsers ? user.blockedUsers.map(id => id.toString()) : [];
        const filteredFriends = (user.friends || []).filter(friend => 
            !blockedUserIds.includes(friend._id.toString())
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            message: 'Friends retrieved successfully',
            data: {
                friends: filteredFriends,
                count: filteredFriends.length
            }
        });
    } catch (error) {
        console.error('List friends error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve friends',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// List received friend requests (pending requests sent to current user)
const listReceivedRequests = async (req, res) => {
    try {
        const userId = req.user._id;

        // Get current user's blocked users
        const currentUser = await User.findById(userId).select('blockedUsers');
        const blockedUserIds = currentUser.blockedUsers || [];

        const requests = await FriendRequest.find({
            receiver: userId,
            status: 'pending',
            sender: { $nin: blockedUserIds } // Exclude requests from blocked users
        })
        .populate('sender', 'firstName lastName name profileImage email bio currentCity hometown')
        .sort({ createdAt: -1 });

        res.json({
            success: true,
            message: 'Received friend requests retrieved successfully',
            data: {
                requests: requests,
                count: requests.length
            }
        });
    } catch (error) {
        console.error('List received requests error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve received friend requests',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// List sent friend requests (pending requests sent by current user)
const listSentRequests = async (req, res) => {
    try {
        const userId = req.user._id;

        // Get current user's blocked users
        const currentUser = await User.findById(userId).select('blockedUsers');
        const blockedUserIds = currentUser.blockedUsers || [];

        const requests = await FriendRequest.find({
            sender: userId,
            status: 'pending',
            receiver: { $nin: blockedUserIds } // Exclude requests to blocked users
        })
        .populate('receiver', 'firstName lastName name profileImage email bio currentCity hometown')
        .sort({ createdAt: -1 });

        res.json({
            success: true,
            message: 'Sent friend requests retrieved successfully',
            data: {
                requests: requests,
                count: requests.length
            }
        });
    } catch (error) {
        console.error('List sent requests error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve sent friend requests',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Unfriend a user (optional feature)
const unfriend = async (req, res) => {
    try {
        const userId = req.user._id;
        const { friendId } = req.params;

        // Validate friendId
        if (!mongoose.Types.ObjectId.isValid(friendId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid friend ID'
            });
        }

        // Check if trying to unfriend themselves
        if (userId.toString() === friendId) {
            return res.status(400).json({
                success: false,
                message: 'You cannot unfriend yourself'
            });
        }

        // Check if friend exists
        const friend = await User.findById(friendId);
        if (!friend) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if they are friends
        const user = await User.findById(userId);
        if (!user.friends || !user.friends.includes(friendId)) {
            return res.status(400).json({
                success: false,
                message: 'You are not friends with this user'
            });
        }

        // Remove from both users' friends arrays
        await User.findByIdAndUpdate(userId, {
            $pull: { friends: friendId }
        });

        await User.findByIdAndUpdate(friendId, {
            $pull: { friends: userId }
        });

        // Update any accepted friend requests to rejected (optional - for history)
        // Or you can delete them
        await FriendRequest.updateMany(
            {
                $or: [
                    { sender: userId, receiver: friendId, status: 'accepted' },
                    { sender: friendId, receiver: userId, status: 'accepted' }
                ]
            },
            { status: 'rejected' }
        );

        res.json({
            success: true,
            message: 'User unfriended successfully'
        });
    } catch (error) {
        console.error('Unfriend error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unfriend user',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Cancel sent friend request (optional feature)
const cancelSentRequest = async (req, res) => {
    try {
        const userId = req.user._id;
        const { requestId } = req.params;

        // Validate requestId
        if (!mongoose.Types.ObjectId.isValid(requestId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid request ID'
            });
        }

        // Find the friend request
        const friendRequest = await FriendRequest.findById(requestId);
        if (!friendRequest) {
            return res.status(404).json({
                success: false,
                message: 'Friend request not found'
            });
        }

        // Check if the current user is the sender
        if (friendRequest.sender.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only cancel friend requests you sent'
            });
        }

        // Check if request is already processed
        if (friendRequest.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `This friend request has already been ${friendRequest.status}`
            });
        }

        // Delete the request
        await FriendRequest.findByIdAndDelete(requestId);

        res.json({
            success: true,
            message: 'Friend request cancelled successfully'
        });
    } catch (error) {
        console.error('Cancel sent request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel friend request',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get friend suggestions based on mutual friends
const getFriendSuggestions = async (req, res) => {
    try {
        const userId = req.user._id;
        const limit = parseInt(req.query.limit) || 10;

        // Get current user with friends and blocked users
        const user = await User.findById(userId).select('friends blockedUsers');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const blockedUserIds = user.blockedUsers ? user.blockedUsers.map(id => id.toString()) : [];

        // If user has no friends, return empty suggestions or random users
        if (!user.friends || user.friends.length === 0) {
            // Return random users (excluding current user and blocked users)
            const randomUsers = await User.find({
                _id: { $ne: userId, $nin: user.blockedUsers || [] }
            })
            .select('firstName lastName name profileImage email bio currentCity hometown')
            .limit(limit);

            return res.json({
                success: true,
                message: 'Friend suggestions retrieved successfully',
                data: {
                    suggestions: randomUsers.map(u => ({
                        user: u,
                        mutualFriends: 0,
                        mutualFriendsList: []
                    })),
                    count: randomUsers.length
                }
            });
        }

        // Get all friends of current user's friends (friends of friends)
        const friendsOfFriends = await User.find({
            _id: { $in: user.friends }
        })
        .select('friends')
        .lean();

        // Build a map of potential friends and their mutual friend count
        const suggestionMap = new Map();
        const userIdStr = userId.toString();

        // Iterate through each friend
        for (const friend of friendsOfFriends) {
            if (!friend.friends || friend.friends.length === 0) continue;

            // For each friend of this friend
            for (const friendOfFriendId of friend.friends) {
                const friendOfFriendIdStr = friendOfFriendId.toString();

                // Skip if it's the current user
                if (friendOfFriendIdStr === userIdStr) continue;

                // Skip if already a friend
                if (user.friends.some(f => f.toString() === friendOfFriendIdStr)) continue;

                // Skip if blocked
                if (blockedUserIds.includes(friendOfFriendIdStr)) continue;

                // Count mutual friends
                if (!suggestionMap.has(friendOfFriendIdStr)) {
                    suggestionMap.set(friendOfFriendIdStr, {
                        userId: friendOfFriendId,
                        mutualFriends: [],
                        count: 0
                    });
                }

                const suggestion = suggestionMap.get(friendOfFriendIdStr);
                // Add the mutual friend (the friend who connects them)
                const mutualFriend = friendsOfFriends.find(f => 
                    f._id.toString() === friend._id.toString()
                );
                if (mutualFriend && !suggestion.mutualFriends.some(mf => 
                    mf._id.toString() === mutualFriend._id.toString()
                )) {
                    suggestion.mutualFriends.push(mutualFriend._id);
                    suggestion.count = suggestion.mutualFriends.length;
                }
            }
        }

        // Get pending requests to exclude
        const pendingRequests = await FriendRequest.find({
            $or: [
                { sender: userId, status: 'pending' },
                { receiver: userId, status: 'pending' }
            ]
        }).select('sender receiver').lean();

        const excludedUserIds = new Set();
        pendingRequests.forEach(req => {
            if (req.sender.toString() === userIdStr) {
                excludedUserIds.add(req.receiver.toString());
            } else {
                excludedUserIds.add(req.sender.toString());
            }
        });

        // Filter out users with pending requests
        const filteredSuggestions = Array.from(suggestionMap.values())
            .filter(s => !excludedUserIds.has(s.userId.toString()))
            .sort((a, b) => b.count - a.count) // Sort by mutual friends count (descending)
            .slice(0, limit);

        // Get user details for suggestions
        const suggestionUserIds = filteredSuggestions.map(s => s.userId);
        const suggestedUsers = await User.find({
            _id: { $in: suggestionUserIds },
            blockedUsers: { $ne: userId } // Exclude users who have blocked the current user
        })
        .select('firstName lastName name profileImage email bio currentCity hometown')
        .lean();

        // Get mutual friend details
        const allMutualFriendIds = new Set();
        filteredSuggestions.forEach(s => {
            s.mutualFriends.forEach(mf => allMutualFriendIds.add(mf.toString()));
        });

        const mutualFriendsDetails = await User.find({
            _id: { $in: Array.from(allMutualFriendIds) }
        })
        .select('firstName lastName name profileImage')
        .lean();

        const mutualFriendsMap = new Map();
        mutualFriendsDetails.forEach(mf => {
            mutualFriendsMap.set(mf._id.toString(), mf);
        });

        // Build final suggestions with user details and mutual friends
        const finalSuggestions = filteredSuggestions.map(suggestion => {
            const userDetails = suggestedUsers.find(u => 
                u._id.toString() === suggestion.userId.toString()
            );

            const mutualFriendsList = suggestion.mutualFriends
                .map(mfId => mutualFriendsMap.get(mfId.toString()))
                .filter(Boolean)
                .slice(0, 3); // Show up to 3 mutual friends

            return {
                user: userDetails,
                mutualFriendsCount: suggestion.count,
                mutualFriends: mutualFriendsList
            };
        });

        res.json({
            success: true,
            message: 'Friend suggestions retrieved successfully',
            data: {
                suggestions: finalSuggestions,
                count: finalSuggestions.length
            }
        });
    } catch (error) {
        console.error('Get friend suggestions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve friend suggestions',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

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


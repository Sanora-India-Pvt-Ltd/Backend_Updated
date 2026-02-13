/**
 * User relationship service: block/unblock, list blocked users, friendship check.
 * Used by userController and by user.profile.service for visibility/search.
 */

const User = require('../../models/authorization/User');
const FriendRequest = require('../../models/social/FriendRequest');
const mongoose = require('mongoose');

async function areFriends(userId1, userId2) {
    try {
        const user1 = await User.findById(userId1).select('social.friends').lean();
        if (!user1) return false;
        const friendsList = user1.social?.friends || [];
        return friendsList.some(friendId => friendId.toString() === userId2.toString());
    } catch (error) {
        console.error('Error checking friendship:', error);
        return false;
    }
}

async function getBlockedUserIds(userId) {
    try {
        const user = await User.findById(userId).select('social.blockedUsers').lean();
        if (!user) return [];
        const blockedUsers = user.social?.blockedUsers || [];
        return blockedUsers.map(id => id.toString());
    } catch (error) {
        console.error('Error getting blocked users:', error);
        return [];
    }
}

async function isUserBlocked(blockerId, blockedId) {
    try {
        const blockedUserIds = await getBlockedUserIds(blockerId);
        return blockedUserIds.includes(blockedId.toString());
    } catch (error) {
        console.error('Error checking if user is blocked:', error);
        return false;
    }
}

async function blockUser(userId, blockedUserId) {
    try {
        if (!mongoose.Types.ObjectId.isValid(blockedUserId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid user ID' } };
        }
        if (userId.toString() === blockedUserId) {
            return { statusCode: 400, json: { success: false, message: 'You cannot block yourself' } };
        }
        const userToBlock = await User.findById(blockedUserId).lean();
        if (!userToBlock) {
            return { statusCode: 404, json: { success: false, message: 'User not found' } };
        }
        const currentUser = await User.findById(userId).lean();
        if (!currentUser) {
            return { statusCode: 404, json: { success: false, message: 'Current user not found' } };
        }
        const isAlreadyBlocked = await isUserBlocked(userId, blockedUserId);
        if (isAlreadyBlocked) {
            return { statusCode: 400, json: { success: false, message: 'User is already blocked' } };
        }
        await User.findByIdAndUpdate(userId, {
            $addToSet: { 'social.blockedUsers': blockedUserId }
        });
        await User.findByIdAndUpdate(userId, { $pull: { 'social.friends': blockedUserId } });
        await User.findByIdAndUpdate(blockedUserId, { $pull: { 'social.friends': userId } });
        await FriendRequest.deleteMany({
            $or: [
                { sender: userId, receiver: blockedUserId },
                { sender: blockedUserId, receiver: userId }
            ]
        });
        const updatedUser = await User.findById(userId)
            .populate('social.blockedUsers', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email')
            .select('social.blockedUsers')
            .lean();
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'User blocked successfully',
                data: {
                    blockedUser: {
                        _id: userToBlock._id,
                        firstName: userToBlock.profile?.name?.first,
                        lastName: userToBlock.profile?.name?.last,
                        name: userToBlock.profile?.name?.full,
                        profileImage: userToBlock.profile?.profileImage,
                        email: userToBlock.profile?.email
                    },
                    blockedUsers: updatedUser?.social?.blockedUsers || []
                }
            }
        };
    } catch (error) {
        console.error('Block user error:', error);
        return {
            statusCode: 500,
            json: {
                success: false,
                message: 'Failed to block user',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            }
        };
    }
}

async function unblockUser(userId, blockedUserId) {
    try {
        if (!mongoose.Types.ObjectId.isValid(blockedUserId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid user ID' } };
        }
        const userToUnblock = await User.findById(blockedUserId).lean();
        if (!userToUnblock) {
            return { statusCode: 404, json: { success: false, message: 'User not found' } };
        }
        const currentUser = await User.findById(userId).lean();
        if (!currentUser) {
            return { statusCode: 404, json: { success: false, message: 'Current user not found' } };
        }
        const isBlocked = await isUserBlocked(userId, blockedUserId);
        if (!isBlocked) {
            return { statusCode: 400, json: { success: false, message: 'User is not blocked' } };
        }
        await User.findByIdAndUpdate(userId, {
            $pull: { 'social.blockedUsers': blockedUserId }
        });
        const updatedUser = await User.findById(userId)
            .populate('social.blockedUsers', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email')
            .select('social.blockedUsers')
            .lean();
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'User unblocked successfully',
                data: {
                    unblockedUser: {
                        _id: userToUnblock._id,
                        firstName: userToUnblock.profile?.name?.first,
                        lastName: userToUnblock.profile?.name?.last,
                        name: userToUnblock.profile?.name?.full,
                        profileImage: userToUnblock.profile?.profileImage,
                        email: userToUnblock.profile?.email
                    },
                    blockedUsers: updatedUser?.social?.blockedUsers || []
                }
            }
        };
    } catch (error) {
        console.error('Unblock user error:', error);
        return {
            statusCode: 500,
            json: {
                success: false,
                message: 'Failed to unblock user',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            }
        };
    }
}

async function listBlockedUsers(userId) {
    try {
        const user = await User.findById(userId)
            .populate('social.blockedUsers', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email profile.bio location.currentCity location.hometown')
            .select('social.blockedUsers')
            .lean();
        if (!user) {
            return { statusCode: 404, json: { success: false, message: 'User not found' } };
        }
        const blockedUsers = user.social?.blockedUsers || [];
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Blocked users retrieved successfully',
                data: { blockedUsers, count: blockedUsers.length }
            }
        };
    } catch (error) {
        console.error('List blocked users error:', error);
        return {
            statusCode: 500,
            json: {
                success: false,
                message: 'Failed to retrieve blocked users',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            }
        };
    }
}

module.exports = {
    areFriends,
    getBlockedUserIds,
    isUserBlocked,
    blockUser,
    unblockUser,
    listBlockedUsers
};

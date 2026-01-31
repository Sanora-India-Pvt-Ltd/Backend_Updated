/**
 * Story business logic. Returns { statusCode, json } or throws.
 */

const Story = require('../../models/social/Story');
const User = require('../../models/authorization/User');
const StorageService = require('../../core/infra/storage');
const mongoose = require('mongoose');
const { isVideo } = require('../../core/infra/videoTranscoder');

async function getBlockedUserIds(userId) {
    try {
        const user = await User.findById(userId).select('social.blockedUsers');
        if (!user) return [];
        const blockedUsers = user.social?.blockedUsers || [];
        const uniqueBlocked = [...new Set(blockedUsers.map(id => id.toString()))];
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

async function createStory(user, body) {
    try {
        const { url, publicId, type, format } = body;
        if (!url || !publicId || !type) {
            return { statusCode: 400, json: { success: false, message: 'Story must have url, publicId, and type (image/video)' } };
        }
        if (!['image', 'video'].includes(type)) {
            return { statusCode: 400, json: { success: false, message: 'Media type must be either "image" or "video"' } };
        }
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);
        const story = await Story.create({
            userId: user._id,
            media: { url, publicId, type, format: format || null },
            expiresAt
        });
        await story.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');
        const userIdString = story.userId._id ? story.userId._id.toString() : story.userId.toString();
        const userInfo = story.userId._id ? {
            id: story.userId._id.toString(),
            firstName: story.userId.profile?.name?.first,
            lastName: story.userId.profile?.name?.last,
            name: story.userId.profile?.name?.full,
            email: story.userId.profile?.email,
            profileImage: story.userId.profile?.profileImage
        } : null;
        return {
            statusCode: 201,
            json: {
                success: true,
                message: 'Story created successfully',
                data: {
                    story: {
                        id: story._id.toString(),
                        userId: userIdString,
                        user: userInfo,
                        media: story.media,
                        createdAt: story.createdAt,
                        expiresAt: story.expiresAt
                    }
                }
            }
        };
    } catch (error) {
        console.error('Create story error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to create story', error: error.message } };
    }
}

async function getUserStories(userIdParam, viewingUserId) {
    try {
        if (!userIdParam || !mongoose.Types.ObjectId.isValid(userIdParam)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid user ID' } };
        }
        const user = await User.findById(userIdParam);
        if (!user) {
            return { statusCode: 404, json: { success: false, message: 'User not found' } };
        }
        if (viewingUserId) {
            const viewingUserBlocked = await isUserBlocked(viewingUserId, userIdParam);
            if (viewingUserBlocked) {
                return { statusCode: 403, json: { success: false, message: 'You cannot view stories from a blocked user' } };
            }
            const ownerBlocked = await isUserBlocked(userIdParam, viewingUserId);
            if (ownerBlocked) {
                return { statusCode: 403, json: { success: false, message: 'Content not available' } };
            }
        }
        const now = new Date();
        const stories = await Story.find({ userId: userIdParam, expiresAt: { $gt: now } })
            .populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage')
            .sort({ createdAt: -1 });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'User stories retrieved successfully',
                data: {
                    user: {
                        id: user._id.toString(),
                        name: user.profile?.name?.full,
                        email: user.profile?.email,
                        profileImage: user.profile?.profileImage
                    },
                    stories: stories.map(story => {
                        const userIdString = story.userId._id ? story.userId._id.toString() : story.userId.toString();
                        const userInfo = story.userId._id ? {
                            id: story.userId._id.toString(),
                            firstName: story.userId.profile?.name?.first,
                            lastName: story.userId.profile?.name?.last,
                            name: story.userId.profile?.name?.full,
                            email: story.userId.profile?.email,
                            profileImage: story.userId.profile?.profileImage
                        } : null;
                        return {
                            id: story._id.toString(),
                            userId: userIdString,
                            user: userInfo,
                            media: story.media,
                            createdAt: story.createdAt,
                            expiresAt: story.expiresAt
                        };
                    }),
                    count: stories.length
                }
            }
        };
    } catch (error) {
        console.error('Get user stories error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve user stories', error: error.message } };
    }
}

async function getAllFriendsStories(user) {
    try {
        const currentUser = await User.findById(user._id).select('social.friends');
        if (!currentUser) {
            return { statusCode: 404, json: { success: false, message: 'User not found' } };
        }
        const friendIds = currentUser.social?.friends || [];
        const blockedUserIds = await getBlockedUserIds(user._id);
        const unblockedFriendIds = friendIds.filter(friendId =>
            !blockedUserIds.some(blockedId => blockedId.toString() === friendId.toString())
        );
        const allUserIds = [...unblockedFriendIds, user._id];
        const now = new Date();
        let stories = await Story.find({ userId: { $in: allUserIds }, expiresAt: { $gt: now } })
            .populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage')
            .sort({ createdAt: -1 });
        const usersWhoBlockedMe = await User.find({ 'social.blockedUsers': user._id }).select('_id').lean();
        const blockedByUserIds = new Set(usersWhoBlockedMe.map(u => u._id.toString()));
        stories = stories.filter(story => {
            const storyUserId = story.userId._id ? story.userId._id.toString() : story.userId.toString();
            return !blockedByUserIds.has(storyUserId);
        });
        const storiesByUser = {};
        stories.forEach(story => {
            const userIdString = story.userId._id ? story.userId._id.toString() : story.userId.toString();
            if (!storiesByUser[userIdString]) {
                const userInfo = story.userId._id ? {
                    id: story.userId._id.toString(),
                    firstName: story.userId.profile?.name?.first,
                    lastName: story.userId.profile?.name?.last,
                    name: story.userId.profile?.name?.full,
                    email: story.userId.profile?.email,
                    profileImage: story.userId.profile?.profileImage
                } : null;
                storiesByUser[userIdString] = { user: userInfo, stories: [] };
            }
            storiesByUser[userIdString].stories.push({
                id: story._id.toString(),
                userId: userIdString,
                media: story.media,
                createdAt: story.createdAt,
                expiresAt: story.expiresAt
            });
        });
        const storiesArray = Object.values(storiesByUser).sort((a, b) => {
            const aLatest = a.stories[0]?.createdAt || new Date(0);
            const bLatest = b.stories[0]?.createdAt || new Date(0);
            return bLatest - aLatest;
        });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Friends stories retrieved successfully',
                data: { stories: storiesArray, count: storiesArray.length, totalStories: stories.length }
            }
        };
    } catch (error) {
        console.error('Get all friends stories error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve friends stories', error: error.message } };
    }
}

async function uploadStoryMedia(user, file) {
    try {
        if (!file) {
            return { statusCode: 400, json: { success: false, message: 'No file uploaded', error: 'Please provide a media file in the request' } };
        }
        if (!user || !user._id) {
            return { statusCode: 401, json: { success: false, message: 'Authentication required', error: 'User not authenticated' } };
        }
        const isVideoFile = isVideo(file.mimetype);
        let uploadResult;
        if (file.path) {
            uploadResult = await StorageService.uploadFromPath(file.path);
        } else if (file.location && file.key) {
            uploadResult = await StorageService.uploadFromRequest(file);
        } else {
            return { statusCode: 400, json: { success: false, message: 'Invalid file object: missing path (diskStorage) or location/key (multer-s3)' } };
        }
        const mediaType = isVideoFile ? 'video' : 'image';
        const format = file.mimetype.split('/')[1] || 'unknown';
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Story media uploaded successfully',
                data: {
                    url: uploadResult.url,
                    publicId: uploadResult.key,
                    type: mediaType,
                    format,
                    fileSize: file.size
                }
            }
        };
    } catch (error) {
        const errorMessage = error?.message || 'Unknown error occurred';
        const errorCode = error?.code;
        console.error('[StoryService] Story media upload error:', error);
        let statusCode = 500;
        let userMessage = 'Failed to upload story media';
        if (errorCode === 'ENOTFOUND' || errorCode === 'ECONNREFUSED' || errorCode === 'ETIMEDOUT') {
            statusCode = 503;
            userMessage = 'Unable to connect to media upload service';
        } else if (errorMessage?.includes('file') || errorMessage?.includes('path')) {
            statusCode = 400;
            userMessage = 'File upload error';
        } else if (errorCode === 'LIMIT_FILE_SIZE') {
            statusCode = 400;
            userMessage = 'File size exceeds maximum limit';
        }
        return {
            statusCode,
            json: {
                success: false,
                message: userMessage,
                error: process.env.NODE_ENV === 'development' ? errorMessage : 'Internal server error',
                ...(process.env.NODE_ENV === 'development' && errorCode ? { code: errorCode } : {})
            }
        };
    }
}

module.exports = {
    createStory,
    getUserStories,
    getAllFriendsStories,
    uploadStoryMedia
};

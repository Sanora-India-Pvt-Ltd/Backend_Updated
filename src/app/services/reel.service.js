/**
 * Reel business logic: upload, CRUD, likes, comments, report. Returns { statusCode, json } or throws.
 */

const { Reel, ALLOWED_CONTENT_TYPES } = require('../../models/social/Reel');
const Comment = require('../../models/social/Comment');
const User = require('../../models/authorization/User');
const StorageService = require('../../core/infra/storage');
const Media = require('../../models/Media');
const { Report, REPORT_REASONS } = require('../../models/social/Report');
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

function formatReelUser(reel) {
    const userIdString = reel.userId._id ? reel.userId._id.toString() : reel.userId.toString();
    const userInfo = reel.userId._id ? {
        id: reel.userId._id.toString(),
        firstName: reel.userId.profile?.name?.first,
        lastName: reel.userId.profile?.name?.last,
        name: reel.userId.profile?.name?.full,
        email: reel.userId.profile?.email,
        profileImage: reel.userId.profile?.profileImage
    } : null;
    return { userIdString, userInfo };
}

async function uploadReelMedia(user, file) {
    try {
        if (!file) return { statusCode: 400, json: { success: false, message: 'No file uploaded' } };
        const isVideoFile = isVideo(file.mimetype);
        if (!isVideoFile) return { statusCode: 400, json: { success: false, message: 'Reels require video uploads' } };
        const uploadResult = await StorageService.uploadFromRequest(file);
        const mediaType = 'video';
        const format = file.mimetype.split('/')[1] || 'mp4';
        const mediaRecord = await Media.create({
            userId: user._id,
            url: uploadResult.url,
            public_id: uploadResult.key,
            format,
            resource_type: mediaType,
            fileSize: file.size,
            originalFilename: file.originalname,
            folder: 'user_uploads',
            provider: uploadResult.provider
        });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Reel media uploaded successfully',
                data: {
                    url: uploadResult.url,
                    publicId: uploadResult.key,
                    type: mediaType,
                    format,
                    fileSize: file.size,
                    mediaId: mediaRecord._id
                }
            }
        };
    } catch (error) {
        console.error('[ReelService] Reel media upload error:', error);
        return {
            statusCode: 500,
            json: {
                success: false,
                message: 'Failed to upload reel media',
                error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
            }
        };
    }
}

async function createReelWithUpload(user, body, file) {
    try {
        const { caption, contentType, visibility } = body;
        if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
            return { statusCode: 400, json: { success: false, message: `contentType is required and must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}` } };
        }
        if (!file) return { statusCode: 400, json: { success: false, message: 'Video file is required for reel creation' } };
        const isVideoFile = isVideo(file.mimetype);
        if (!isVideoFile) return { statusCode: 400, json: { success: false, message: 'Reels require video uploads' } };
        const uploadResult = await StorageService.uploadFromRequest(file);
        const mediaType = 'video';
        const format = file.mimetype.split('/')[1] || 'mp4';
        const mediaRecord = await Media.create({
            userId: user._id,
            url: uploadResult.url,
            public_id: uploadResult.key,
            format,
            resource_type: mediaType,
            fileSize: file.size,
            originalFilename: file.originalname,
            folder: 'user_uploads',
            provider: uploadResult.provider
        });
        const reel = await Reel.create({
            userId: user._id,
            caption: caption || '',
            media: {
                url: uploadResult.url,
                publicId: uploadResult.key,
                thumbnailUrl: uploadResult.url,
                type: mediaType,
                format: format || '',
                size: file.size
            },
            contentType,
            visibility: visibility || 'public'
        });
        await reel.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');
        const { userIdString, userInfo } = formatReelUser(reel);
        const commentCount = await reel.getCommentCount();
        return {
            statusCode: 201,
            json: {
                success: true,
                message: 'Reel created successfully',
                data: {
                    reel: {
                        id: reel._id.toString(),
                        userId: userIdString,
                        user: userInfo,
                        caption: reel.caption,
                        media: reel.media,
                        contentType: reel.contentType,
                        visibility: reel.visibility,
                        views: reel.views || 0,
                        likes: reel.likes || [[], [], [], [], [], []],
                        likeCount: reel.likeCount,
                        commentCount,
                        createdAt: reel.createdAt,
                        updatedAt: reel.updatedAt
                    }
                }
            }
        };
    } catch (error) {
        console.error('[ReelService] Create reel with upload error:', error);
        return {
            statusCode: 500,
            json: { success: false, message: 'Failed to create reel', error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' }
        };
    }
}

async function createReel(user, body) {
    try {
        const { caption, media, contentType, visibility } = body;
        if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
            return { statusCode: 400, json: { success: false, message: `contentType is required and must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}` } };
        }
        if (!media || !media.url || !media.publicId || !media.type) {
            return { statusCode: 400, json: { success: false, message: 'media must include url, publicId, and type' } };
        }
        if (media.type !== 'video') {
            return { statusCode: 400, json: { success: false, message: 'Reels media type must be "video"' } };
        }
        const reel = await Reel.create({
            userId: user._id,
            caption: caption || '',
            media: {
                url: media.url,
                publicId: media.publicId,
                thumbnailUrl: media.thumbnailUrl || '',
                type: media.type,
                format: media.format || '',
                duration: media.duration,
                dimensions: media.width && media.height ? { width: media.width, height: media.height } : undefined,
                size: media.fileSize || media.size
            },
            contentType,
            visibility: visibility || 'public'
        });
        await reel.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');
        const { userIdString, userInfo } = formatReelUser(reel);
        const commentCount = await reel.getCommentCount();
        return {
            statusCode: 201,
            json: {
                success: true,
                message: 'Reel created successfully',
                data: {
                    reel: {
                        id: reel._id.toString(),
                        userId: userIdString,
                        user: userInfo,
                        caption: reel.caption,
                        media: reel.media,
                        contentType: reel.contentType,
                        visibility: reel.visibility,
                        views: reel.views || 0,
                        likes: reel.likes || [[], [], [], [], [], []],
                        likeCount: reel.likeCount,
                        commentCount,
                        createdAt: reel.createdAt,
                        updatedAt: reel.updatedAt
                    }
                }
            }
        };
    } catch (error) {
        console.error('Create reel error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to create reel', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function getReels(userId, queryParams) {
    try {
        const { contentType, page = 1, limit = 10 } = queryParams;
        if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
            return { statusCode: 400, json: { success: false, message: `Invalid contentType. Must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}` } };
        }
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 10;
        const skip = (pageNum - 1) * limitNum;
        let query = { contentType, visibility: 'public' };
        let blockedUserIds = [];
        if (userId) {
            blockedUserIds = await getBlockedUserIds(userId);
            const reportedReelIds = await Report.find({ userId, contentType: 'reel' }).distinct('contentId');
            if (reportedReelIds.length > 0) query._id = { $nin: reportedReelIds };
            const usersWhoBlockedMe = await User.find({ 'social.blockedUsers': userId }).select('_id').lean();
            const blockedByUserIds = usersWhoBlockedMe.map(u => u._id);
            const allExcludedUserIds = [...blockedUserIds, ...blockedByUserIds];
            if (allExcludedUserIds.length > 0) query.userId = { $nin: allExcludedUserIds };
        }
        const reels = await Reel.find(query)
            .populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage profile.visibility social.friends')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum * 2);
        const visibleReels = [];
        for (const reel of reels) {
            if (!reel.userId) continue;
            const reelUserId = reel.userId._id ? reel.userId._id : reel.userId;
            if (userId) {
                if (reelUserId.toString() === userId.toString()) {
                    visibleReels.push(reel);
                    if (visibleReels.length >= limitNum) break;
                    continue;
                }
                if (await isUserBlocked(userId, reelUserId)) continue;
                if (await isUserBlocked(reelUserId, userId)) continue;
            }
            const postOwner = await User.findById(reelUserId).select('profile.visibility social.friends');
            if (!postOwner) continue;
            const isProfilePrivate = postOwner.profile?.visibility === 'private';
            if (!isProfilePrivate) {
                visibleReels.push(reel);
                if (visibleReels.length >= limitNum) break;
                continue;
            }
            if (userId) {
                const friendsList = postOwner.social?.friends || [];
                const isFriend = friendsList.some(friendId => friendId.toString() === userId.toString());
                if (isFriend) {
                    visibleReels.push(reel);
                    if (visibleReels.length >= limitNum) break;
                }
            }
        }
        const totalReels = await Reel.countDocuments(query);
        const formattedReels = await Promise.all(visibleReels.slice(0, limitNum).map(async (reel) => {
            if (!reel.userId) return null;
            const { userIdString, userInfo } = formatReelUser(reel);
            const commentCount = await reel.getCommentCount();
            return {
                id: reel._id.toString(),
                userId: userIdString,
                user: userInfo,
                caption: reel.caption,
                media: reel.media,
                contentType: reel.contentType,
                visibility: reel.visibility,
                views: reel.views || 0,
                likes: reel.likes || [[], [], [], [], [], []],
                likeCount: reel.likeCount,
                commentCount,
                createdAt: reel.createdAt,
                updatedAt: reel.updatedAt
            };
        }));
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Reels retrieved successfully',
                data: {
                    reels: formattedReels.filter(Boolean),
                    pagination: {
                        currentPage: pageNum,
                        totalPages: Math.ceil(totalReels / limitNum),
                        totalReels,
                        hasNextPage: visibleReels.length === limitNum && pageNum < Math.ceil(totalReels / limitNum),
                        hasPrevPage: pageNum > 1
                    }
                }
            }
        };
    } catch (error) {
        console.error('Get reels error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve reels', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function getUserReels(viewingUserId, userIdParam, queryParams) {
    try {
        const { page = 1, limit = 10 } = queryParams;
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 10;
        const skip = (pageNum - 1) * limitNum;
        if (!userIdParam || !mongoose.Types.ObjectId.isValid(userIdParam)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid user ID' } };
        }
        const user = await User.findById(userIdParam).select('profile.visibility social.friends social.blockedUsers');
        if (!user) return { statusCode: 404, json: { success: false, message: 'User not found' } };
        if (viewingUserId) {
            const viewingUserBlocked = await isUserBlocked(viewingUserId, userIdParam);
            if (viewingUserBlocked) return { statusCode: 403, json: { success: false, message: 'You cannot view reels from a blocked user' } };
            const ownerBlocked = await isUserBlocked(userIdParam, viewingUserId);
            if (ownerBlocked) return { statusCode: 403, json: { success: false, message: 'Content not available' } };
            const isProfilePrivate = user.profile?.visibility === 'private';
            if (isProfilePrivate) {
                const friendsList = user.social?.friends || [];
                const isFriend = friendsList.some(friendId => friendId.toString() === viewingUserId.toString());
                if (userIdParam.toString() !== viewingUserId.toString() && !isFriend) {
                    return { statusCode: 403, json: { success: false, message: 'This user has a private profile. Only friends can view their reels.' } };
                }
            }
        } else {
            const isProfilePrivate = user.profile?.visibility === 'private';
            if (isProfilePrivate) {
                return { statusCode: 403, json: { success: false, message: 'This user has a private profile. Please log in to view their reels.' } };
            }
        }
        let query = { userId: userIdParam };
        if (viewingUserId) {
            const reportedReelIds = await Report.find({ userId: viewingUserId, contentType: 'reel' }).distinct('contentId');
            if (reportedReelIds.length > 0) query._id = { $nin: reportedReelIds };
        }
        const reels = await Reel.find(query)
            .populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limitNum);
        const totalReels = await Reel.countDocuments(query);
        const formattedReels = await Promise.all(reels.map(async (reel) => {
            const { userIdString, userInfo } = formatReelUser(reel);
            const commentCount = await reel.getCommentCount();
            return {
                id: reel._id.toString(),
                userId: userIdString,
                user: userInfo,
                caption: reel.caption,
                media: reel.media,
                contentType: reel.contentType,
                visibility: reel.visibility,
                views: reel.views || 0,
                likes: reel.likes || [[], [], [], [], [], []],
                likeCount: reel.likeCount,
                commentCount,
                createdAt: reel.createdAt,
                updatedAt: reel.updatedAt
            };
        }));
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'User reels retrieved successfully',
                data: {
                    user: { id: user._id.toString(), name: user.profile?.name?.full, email: user.profile?.email, profileImage: user.profile?.profileImage },
                    reels: formattedReels,
                    pagination: {
                        currentPage: pageNum,
                        totalPages: Math.ceil(totalReels / limitNum),
                        totalReels,
                        hasNextPage: pageNum < Math.ceil(totalReels / limitNum),
                        hasPrevPage: pageNum > 1
                    }
                }
            }
        };
    } catch (error) {
        console.error('Get user reels error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve user reels', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

const REACTION_MAP = { happy: 0, sad: 1, angry: 2, hug: 3, wow: 4, like: 5 };
function getReactionIndex(reaction) { return REACTION_MAP[reaction] || 5; }
function findUserReaction(likes, userId) {
    if (!likes || !Array.isArray(likes)) return null;
    const reactionTypes = ['happy', 'sad', 'angry', 'hug', 'wow', 'like'];
    for (let i = 0; i < likes.length; i++) {
        if (likes[i] && likes[i].some && likes[i].some(id => id.toString() === userId.toString())) return reactionTypes[i];
    }
    return null;
}

async function toggleLikeReel(user, reelId, body) {
    try {
        const { reaction = 'like' } = body;
        if (!reelId || !mongoose.Types.ObjectId.isValid(reelId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid reel ID' } };
        }
        const allowedReactions = ['happy', 'sad', 'angry', 'hug', 'wow', 'like'];
        const reactionType = reaction || 'like';
        if (!allowedReactions.includes(reactionType)) {
            return { statusCode: 400, json: { success: false, message: `Invalid reaction. Must be one of: ${allowedReactions.join(', ')}` } };
        }
        const reel = await Reel.findById(reelId);
        if (!reel) return { statusCode: 404, json: { success: false, message: 'Reel not found' } };
        if (!reel.likes || !Array.isArray(reel.likes)) reel.likes = [[], [], [], [], [], []];
        while (reel.likes.length < 6) reel.likes.push([]);
        const existingReaction = findUserReaction(reel.likes, user._id);
        const reactionIndex = getReactionIndex(reactionType);
        let action;
        let currentReaction = null;
        if (existingReaction) {
            const existingIndex = getReactionIndex(existingReaction);
            reel.likes[existingIndex] = reel.likes[existingIndex].filter(id => id.toString() !== user._id.toString());
            if (existingReaction === reactionType) {
                action = 'unliked';
            } else {
                if (!reel.likes[reactionIndex].some(id => id.toString() === user._id.toString())) reel.likes[reactionIndex].push(user._id);
                action = 'reaction_updated';
                currentReaction = reactionType;
            }
        } else {
            if (!reel.likes[reactionIndex].some(id => id.toString() === user._id.toString())) reel.likes[reactionIndex].push(user._id);
            action = 'liked';
            currentReaction = reactionType;
        }
        await reel.save();
        await reel.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');
        const { userIdString, userInfo } = formatReelUser(reel);
        const commentCount = await reel.getCommentCount();
        return {
            statusCode: 200,
            json: {
                success: true,
                message: `Reel ${action} successfully`,
                data: {
                    reel: {
                        id: reel._id.toString(),
                        userId: userIdString,
                        user: userInfo,
                        caption: reel.caption,
                        media: reel.media,
                        contentType: reel.contentType,
                        visibility: reel.visibility,
                        views: reel.views || 0,
                        likes: reel.likes || [[], [], [], [], [], []],
                        likeCount: reel.likeCount,
                        commentCount,
                        createdAt: reel.createdAt,
                        updatedAt: reel.updatedAt,
                        action,
                        reaction: currentReaction,
                        isLiked: action !== 'unliked'
                    }
                }
            }
        };
    } catch (error) {
        console.error('Toggle like reel error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to toggle like on reel', error: error.message } };
    }
}

async function addCommentReel(user, reelId, body) {
    try {
        const { text } = body;
        if (!reelId || !mongoose.Types.ObjectId.isValid(reelId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid reel ID' } };
        }
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return { statusCode: 400, json: { success: false, message: 'Comment text is required' } };
        }
        if (text.length > 500) return { statusCode: 400, json: { success: false, message: 'Comment text must be 500 characters or less' } };
        const reel = await Reel.findById(reelId);
        if (!reel) return { statusCode: 404, json: { success: false, message: 'Reel not found' } };
        const commentDoc = await Comment.getOrCreateCommentDoc(reelId, 'reel');
        await commentDoc.addComment(user._id, text.trim());
        await reel.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');
        const { userIdString, userInfo } = formatReelUser(reel);
        const commentCount = await reel.getCommentCount();
        return {
            statusCode: 201,
            json: {
                success: true,
                message: 'Comment added successfully - please use /api/comments endpoint for new comments',
                data: {
                    reel: {
                        id: reel._id.toString(),
                        userId: userIdString,
                        user: userInfo,
                        caption: reel.caption,
                        media: reel.media,
                        contentType: reel.contentType,
                        visibility: reel.visibility,
                        views: reel.views || 0,
                        likes: reel.likes || [[], [], [], [], [], []],
                        likeCount: reel.likeCount,
                        commentCount,
                        createdAt: reel.createdAt,
                        updatedAt: reel.updatedAt
                    }
                }
            }
        };
    } catch (error) {
        console.error('Add comment error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to add comment', error: error.message } };
    }
}

async function deleteCommentReel(user, reelId, commentId) {
    try {
        if (!reelId || !mongoose.Types.ObjectId.isValid(reelId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid reel ID' } };
        }
        if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid comment ID' } };
        }
        const reel = await Reel.findById(reelId);
        if (!reel) return { statusCode: 404, json: { success: false, message: 'Reel not found' } };
        const commentDoc = await Comment.findOne({ contentId: reelId, contentType: 'reel' });
        if (!commentDoc) return { statusCode: 404, json: { success: false, message: 'Comment document not found' } };
        const comment = commentDoc.comments.id(commentId);
        if (!comment) return { statusCode: 404, json: { success: false, message: 'Comment not found' } };
        const isCommentOwner = comment.userId.toString() === user._id.toString();
        const isReelOwner = reel.userId.toString() === user._id.toString();
        if (!isCommentOwner && !isReelOwner) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to delete this comment' } };
        }
        await commentDoc.removeComment(commentId);
        await reel.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');
        const { userIdString, userInfo } = formatReelUser(reel);
        const commentCount = await reel.getCommentCount();
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Comment deleted successfully - please use /api/comments endpoint for comment operations',
                data: {
                    reel: {
                        id: reel._id.toString(),
                        userId: userIdString,
                        user: userInfo,
                        caption: reel.caption,
                        media: reel.media,
                        contentType: reel.contentType,
                        visibility: reel.visibility,
                        views: reel.views || 0,
                        likes: reel.likes || [[], [], [], [], [], []],
                        likeCount: reel.likeCount,
                        commentCount,
                        createdAt: reel.createdAt,
                        updatedAt: reel.updatedAt
                    }
                }
            }
        };
    } catch (error) {
        console.error('Delete comment error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to delete comment', error: error.message } };
    }
}

async function deleteReel(user, reelId) {
    try {
        if (!reelId || !mongoose.Types.ObjectId.isValid(reelId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid reel ID' } };
        }
        const reel = await Reel.findById(reelId);
        if (!reel) return { statusCode: 404, json: { success: false, message: 'Reel not found' } };
        if (reel.userId.toString() !== user._id.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to delete this reel' } };
        }
        if (reel.media && reel.media.publicId) {
            try {
                await StorageService.delete(reel.media.publicId);
            } catch (deleteError) {
                console.warn('[ReelService] Failed to delete video from storage:', deleteError.message);
            }
        }
        await Comment.findOneAndDelete({ contentId: reelId, contentType: 'reel' });
        await Reel.findByIdAndDelete(reelId);
        return { statusCode: 200, json: { success: true, message: 'Reel deleted successfully' } };
    } catch (error) {
        console.error('[ReelService] Delete reel error:', error);
        return {
            statusCode: 500,
            json: { success: false, message: 'Failed to delete reel', error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' }
        };
    }
}

async function reportReel(user, reelId, body) {
    try {
        const { reason } = body;
        if (!reelId || !mongoose.Types.ObjectId.isValid(reelId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid reel ID' } };
        }
        if (!reason || !REPORT_REASONS.includes(reason)) {
            return { statusCode: 400, json: { success: false, message: `Invalid reason. Must be one of: ${REPORT_REASONS.join(', ')}` } };
        }
        const reel = await Reel.findById(reelId);
        if (!reel) return { statusCode: 404, json: { success: false, message: 'Reel not found' } };
        if (reel.userId.toString() === user._id.toString()) {
            return { statusCode: 400, json: { success: false, message: 'You cannot report your own reel' } };
        }
        const existingReport = await Report.findOne({ userId: user._id, contentId: reelId, contentType: 'reel' });
        if (existingReport) {
            return { statusCode: 400, json: { success: false, message: 'You have already reported this reel' } };
        }
        await Report.create({ userId: user._id, contentId: reelId, contentType: 'reel', reason });
        const reportsWithSameReason = await Report.countDocuments({ contentId: reelId, contentType: 'reel', reason });
        let reelDeleted = false;
        if (reportsWithSameReason >= 2) {
            if (reel.media && reel.media.publicId) {
                try { await StorageService.delete(reel.media.publicId); } catch (e) { console.warn(e.message); }
            }
            await Reel.findByIdAndDelete(reelId);
            reelDeleted = true;
        }
        return {
            statusCode: 200,
            json: {
                success: true,
                message: reelDeleted ? 'Reel reported and removed due to multiple reports with the same reason' : 'Reel reported successfully',
                data: { reelDeleted }
            }
        };
    } catch (error) {
        console.error('[ReelService] Report reel error:', error);
        return {
            statusCode: 500,
            json: { success: false, message: 'Failed to report reel', error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error' }
        };
    }
}

module.exports = {
    uploadReelMedia,
    createReelWithUpload,
    createReel,
    getReels,
    getUserReels,
    toggleLikeReel,
    addCommentReel,
    deleteCommentReel,
    deleteReel,
    reportReel
};

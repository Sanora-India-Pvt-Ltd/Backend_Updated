/**
 * Comments and likes business logic for posts/reels. Returns { statusCode, json } or throws.
 */

const Comment = require('../../models/social/Comment');
const Post = require('../../models/social/Post');
const { Reel } = require('../../models/social/Reel');
const Like = require('../../models/social/Like');
const User = require('../../models/authorization/User');
const mongoose = require('mongoose');

const REACTION_TYPES = { happy: 0, sad: 1, angry: 2, hug: 3, wow: 4, like: 5 };

// --- Comments ---

async function addComment(userId, body) {
    try {
        const { contentId, contentType, text } = body;
        if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid content ID' } };
        }
        if (!contentType || !['post', 'reel'].includes(contentType)) {
            return { statusCode: 400, json: { success: false, message: 'contentType must be either "post" or "reel"' } };
        }
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return { statusCode: 400, json: { success: false, message: 'Comment text is required' } };
        }
        const maxLength = contentType === 'reel' ? 500 : 1000;
        if (text.length > maxLength) {
            return { statusCode: 400, json: { success: false, message: `Comment text must be ${maxLength} characters or less for ${contentType}s` } };
        }
        const contentObjectId = new mongoose.Types.ObjectId(contentId);
        const contentModel = contentType === 'post' ? Post : Reel;
        const content = await contentModel.findById(contentObjectId);
        if (!content) {
            return { statusCode: 404, json: { success: false, message: `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} not found` } };
        }
        const commentDoc = await Comment.getOrCreateCommentDoc(contentId, contentType);
        const newComment = await commentDoc.addComment(userId, text);
        await commentDoc.populate('comments.userId', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
        const addedComment = commentDoc.comments.id(newComment._id);
        const commentUserInfo = addedComment.userId._id ? {
            id: addedComment.userId._id.toString(),
            firstName: addedComment.userId.profile?.name?.first || '',
            lastName: addedComment.userId.profile?.name?.last || '',
            name: addedComment.userId.profile?.name?.full || '',
            profileImage: addedComment.userId.profile?.profileImage
        } : null;
        return {
            statusCode: 201,
            json: {
                success: true,
                message: 'Comment added successfully',
                data: {
                    comment: {
                        id: addedComment._id.toString(),
                        userId: addedComment.userId._id ? addedComment.userId._id.toString() : addedComment.userId.toString(),
                        user: commentUserInfo,
                        text: addedComment.text,
                        replies: [],
                        replyCount: 0,
                        createdAt: addedComment.createdAt
                    }
                }
            }
        };
    } catch (error) {
        console.error('Add comment error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to add comment', error: error.message } };
    }
}

async function addReply(userId, commentIdParam, body) {
    try {
        const { contentId, contentType, text } = body;
        if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid content ID' } };
        }
        if (!contentType || !['post', 'reel'].includes(contentType)) {
            return { statusCode: 400, json: { success: false, message: 'contentType must be either "post" or "reel"' } };
        }
        if (!commentIdParam || !mongoose.Types.ObjectId.isValid(commentIdParam)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid comment ID' } };
        }
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return { statusCode: 400, json: { success: false, message: 'Reply text is required' } };
        }
        if (text.length > 1000) {
            return { statusCode: 400, json: { success: false, message: 'Reply text must be 1000 characters or less' } };
        }
        const commentDoc = await Comment.getOrCreateCommentDoc(contentId, contentType);
        const reply = await commentDoc.addReply(commentIdParam, userId, text);
        await commentDoc.populate('comments.replies.userId', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
        const comment = commentDoc.comments.id(commentIdParam);
        const newReply = comment.replies.id(reply._id);
        const replyUserInfo = newReply.userId._id ? {
            id: newReply.userId._id.toString(),
            firstName: newReply.userId.profile?.name?.first || '',
            lastName: newReply.userId.profile?.name?.last || '',
            name: newReply.userId.profile?.name?.full || '',
            profileImage: newReply.userId.profile?.profileImage
        } : null;
        return {
            statusCode: 201,
            json: {
                success: true,
                message: 'Reply added successfully',
                data: {
                    reply: {
                        id: newReply._id.toString(),
                        userId: newReply.userId._id ? newReply.userId._id.toString() : newReply.userId.toString(),
                        user: replyUserInfo,
                        text: newReply.text,
                        createdAt: newReply.createdAt
                    },
                    comment: { id: comment._id.toString(), replyCount: comment.replies ? comment.replies.length : 0 }
                }
            }
        };
    } catch (error) {
        console.error('Add reply error:', error);
        const msg = error.message === 'Comment not found' ? 'Comment not found' : 'Failed to add reply';
        return { statusCode: 500, json: { success: false, message: msg, error: error.message } };
    }
}

function formatCommentForResponse(comment) {
    const commentUserInfo = comment.userId._id ? {
        id: comment.userId._id.toString(),
        firstName: comment.userId.profile?.name?.first || '',
        lastName: comment.userId.profile?.name?.last || '',
        name: comment.userId.profile?.name?.full || '',
        profileImage: comment.userId.profile?.profileImage
    } : null;
    const formattedReplies = (comment.replies || []).map(reply => {
        const replyUserInfo = reply.userId._id ? {
            id: reply.userId._id.toString(),
            firstName: reply.userId.profile?.name?.first || '',
            lastName: reply.userId.profile?.name?.last || '',
            name: reply.userId.profile?.name?.full || '',
            profileImage: reply.userId.profile?.profileImage
        } : null;
        return {
            id: reply._id.toString(),
            userId: reply.userId._id ? reply.userId._id.toString() : reply.userId.toString(),
            user: replyUserInfo,
            text: reply.text,
            createdAt: reply.createdAt
        };
    });
    return {
        id: comment._id.toString(),
        userId: comment.userId._id ? comment.userId._id.toString() : comment.userId.toString(),
        user: commentUserInfo,
        text: comment.text,
        replies: formattedReplies,
        replyCount: comment.replyCount || formattedReplies.length,
        createdAt: comment.createdAt
    };
}

async function getComments(contentId, contentType, params) {
    try {
        if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid content ID' } };
        }
        if (!contentType || !['post', 'reel'].includes(contentType)) {
            return { statusCode: 400, json: { success: false, message: 'contentType must be either "post" or "reel"' } };
        }
        const contentModel = contentType === 'post' ? Post : Reel;
        const content = await contentModel.findById(contentId);
        if (!content) {
            return { statusCode: 404, json: { success: false, message: `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} not found` } };
        }
        const { page = 1, limit = 15, sortBy = 'createdAt', sortOrder = -1 } = params;
        const comments = await Comment.getCommentsByContent(contentId, contentType, {
            page: parseInt(page),
            limit: parseInt(limit),
            sortBy,
            sortOrder: parseInt(sortOrder)
        });
        const formattedComments = comments.map(formatCommentForResponse);
        const commentDoc = await Comment.findOne({ contentId, contentType }).lean();
        const totalComments = commentDoc && commentDoc.comments ? commentDoc.comments.length : 0;
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Comments retrieved successfully',
                data: {
                    comments: formattedComments,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: totalComments,
                        pages: Math.ceil(totalComments / parseInt(limit))
                    }
                }
            }
        };
    } catch (error) {
        console.error('Get comments error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve comments', error: error.message } };
    }
}

async function getCommentsByQuery(queryParams) {
    try {
        const { contentId, contentType, page = 1, limit = 15, sortBy = 'createdAt', sortOrder = -1 } = queryParams;
        if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid content ID. Please provide contentId as query parameter.' } };
        }
        if (!contentType || !['post', 'reel'].includes(contentType)) {
            return { statusCode: 400, json: { success: false, message: 'contentType must be either "post" or "reel". Please provide contentType as query parameter.' } };
        }
        const contentModel = contentType === 'post' ? Post : Reel;
        const content = await contentModel.findById(contentId);
        if (!content) {
            return { statusCode: 404, json: { success: false, message: `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} not found` } };
        }
        const comments = await Comment.getCommentsByContent(contentId, contentType, {
            page: parseInt(page),
            limit: parseInt(limit),
            sortBy,
            sortOrder: parseInt(sortOrder)
        });
        const formattedComments = comments.map(formatCommentForResponse);
        const commentDoc = await Comment.findOne({ contentId, contentType }).lean();
        const totalComments = commentDoc && commentDoc.comments ? commentDoc.comments.length : 0;
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Comments retrieved successfully',
                data: {
                    contentId,
                    contentType,
                    comments: formattedComments,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: totalComments,
                        pages: Math.ceil(totalComments / parseInt(limit))
                    }
                }
            }
        };
    } catch (error) {
        console.error('Get comments by query error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve comments', error: error.message } };
    }
}

async function getReplies(commentId, queryParams) {
    try {
        const { contentId, contentType, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 1 } = queryParams;
        if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid content ID' } };
        }
        if (!contentType || !['post', 'reel'].includes(contentType)) {
            return { statusCode: 400, json: { success: false, message: 'contentType must be either "post" or "reel"' } };
        }
        if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid comment ID' } };
        }
        const replies = await Comment.getRepliesByComment(contentId, contentType, commentId, {
            page: parseInt(page),
            limit: parseInt(limit),
            sortBy,
            sortOrder: parseInt(sortOrder)
        });
        const formattedReplies = replies.map(reply => {
            const replyUserInfo = reply.user && reply.user._id ? {
                id: reply.user._id.toString(),
                firstName: reply.user.profile?.name?.first || '',
                lastName: reply.user.profile?.name?.last || '',
                name: reply.user.profile?.name?.full || '',
                profileImage: reply.user.profile?.profileImage
            } : null;
            return {
                id: reply._id.toString(),
                userId: reply.userId.toString(),
                user: replyUserInfo,
                text: reply.text,
                createdAt: reply.createdAt
            };
        });
        const commentDoc = await Comment.findOne({ contentId, contentType }).lean();
        let totalReplies = 0;
        if (commentDoc && commentDoc.comments) {
            const comment = commentDoc.comments.find(c => c._id.toString() === commentId);
            totalReplies = comment && comment.replies ? comment.replies.length : 0;
        }
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Replies retrieved successfully',
                data: {
                    replies: formattedReplies,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: totalReplies,
                        pages: Math.ceil(totalReplies / parseInt(limit))
                    }
                }
            }
        };
    } catch (error) {
        console.error('Get replies error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve replies', error: error.message } };
    }
}

async function deleteComment(userId, commentId, query) {
    try {
        const { contentId, contentType } = query;
        if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid content ID (provide as query parameter: ?contentId=xxx&contentType=post)' } };
        }
        if (!contentType || !['post', 'reel'].includes(contentType)) {
            return { statusCode: 400, json: { success: false, message: 'contentType must be either "post" or "reel" (provide as query parameter: ?contentId=xxx&contentType=post)' } };
        }
        if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid comment ID' } };
        }
        const commentDoc = await Comment.findOne({ contentId, contentType });
        if (!commentDoc) {
            return { statusCode: 404, json: { success: false, message: 'Comment document not found' } };
        }
        const comment = commentDoc.comments.id(commentId);
        if (!comment) {
            return { statusCode: 404, json: { success: false, message: 'Comment not found' } };
        }
        const isOwner = comment.userId.toString() === userId.toString();
        let isContentOwner = false;
        if (contentType === 'post') {
            const post = await Post.findById(contentId);
            isContentOwner = post && post.userId.toString() === userId.toString();
        } else {
            const reel = await Reel.findById(contentId);
            isContentOwner = reel && reel.userId.toString() === userId.toString();
        }
        if (!isOwner && !isContentOwner) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to delete this comment' } };
        }
        await commentDoc.removeComment(commentId);
        return { statusCode: 200, json: { success: true, message: 'Comment deleted successfully' } };
    } catch (error) {
        console.error('Delete comment error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to delete comment', error: error.message } };
    }
}

async function deleteReply(userId, commentId, replyId, query) {
    try {
        const { contentId, contentType } = query;
        if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid content ID (provide as query parameter: ?contentId=xxx&contentType=post)' } };
        }
        if (!contentType || !['post', 'reel'].includes(contentType)) {
            return { statusCode: 400, json: { success: false, message: 'contentType must be either "post" or "reel" (provide as query parameter: ?contentId=xxx&contentType=post)' } };
        }
        if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid comment ID' } };
        }
        if (!replyId || !mongoose.Types.ObjectId.isValid(replyId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid reply ID' } };
        }
        const commentDoc = await Comment.findOne({ contentId, contentType });
        if (!commentDoc) {
            return { statusCode: 404, json: { success: false, message: 'Comment document not found' } };
        }
        const comment = commentDoc.comments.id(commentId);
        if (!comment) {
            return { statusCode: 404, json: { success: false, message: 'Comment not found' } };
        }
        const reply = comment.replies.id(replyId);
        if (!reply) {
            return { statusCode: 404, json: { success: false, message: 'Reply not found' } };
        }
        const isOwner = reply.userId.toString() === userId.toString();
        const isCommentOwner = comment.userId.toString() === userId.toString();
        let isContentOwner = false;
        if (contentType === 'post') {
            const post = await Post.findById(contentId);
            isContentOwner = post && post.userId.toString() === userId.toString();
        } else {
            const reel = await Reel.findById(contentId);
            isContentOwner = reel && reel.userId.toString() === userId.toString();
        }
        if (!isOwner && !isCommentOwner && !isContentOwner) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to delete this reply' } };
        }
        await commentDoc.removeReply(commentId, replyId);
        return { statusCode: 200, json: { success: true, message: 'Reply deleted successfully' } };
    } catch (error) {
        console.error('Delete reply error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to delete reply', error: error.message } };
    }
}

// --- Likes ---

async function handleLike(contentType, contentId, userId, reaction) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const contentModel = contentType === 'post' ? Post : Reel;
        const contentExists = await contentModel.exists({ _id: contentId }).session(session);
        if (!contentExists) throw new Error(`${contentType} not found`);
        let likeDoc = await Like.findOneAndUpdate(
            { content: contentType, contentId },
            { $setOnInsert: { likes: [[], [], [], [], [], []] } },
            { upsert: true, new: true, session }
        );
        const userIdStr = userId.toString();
        const reactionIndex = REACTION_TYPES[reaction] ?? 5;
        let action = 'liked';
        let existingReaction = null;
        let existingIndex = -1;
        for (let i = 0; i < likeDoc.likes.length; i++) {
            const idx = likeDoc.likes[i].findIndex(id => id && id.toString() === userIdStr);
            if (idx !== -1) {
                existingReaction = Object.keys(REACTION_TYPES)[i];
                existingIndex = i;
                break;
            }
        }
        const update = {};
        if (existingReaction === reaction) {
            update.$pull = { [`likes.${reactionIndex}`]: userId };
            action = 'unliked';
        } else if (existingReaction) {
            update.$pull = { [`likes.${existingIndex}`]: userId };
            update.$addToSet = { [`likes.${reactionIndex}`]: userId };
            action = 'reaction_updated';
        } else {
            update.$addToSet = { [`likes.${reactionIndex}`]: userId };
        }
        likeDoc = await Like.findOneAndUpdate({ _id: likeDoc._id }, update, { new: true, session });
        const populatedLikes = await Promise.all(likeDoc.likes.map(async (userIds) => {
            if (!userIds || userIds.length === 0) return [];
            return User.find({ _id: { $in: userIds } }).select('profile.name.full profile.profileImage').lean();
        }));
        await session.commitTransaction();
        const likeCount = populatedLikes.reduce((sum, users) => sum + (users?.length || 0), 0);
        return { action, reaction: action === 'unliked' ? null : reaction, likeCount, isLiked: action !== 'unliked', reactions: populatedLikes };
    } catch (error) {
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
}

async function toggleLikePost(userId, postId, body) {
    try {
        const { reaction = 'like' } = body;
        if (!mongoose.Types.ObjectId.isValid(postId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid post ID' } };
        }
        if (!Object.keys(REACTION_TYPES).includes(reaction)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid reaction type' } };
        }
        const result = await handleLike('post', postId, userId, reaction);
        return { statusCode: 200, json: { success: true, message: `Post ${result.action} successfully`, data: result } };
    } catch (error) {
        console.error('Toggle like error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to toggle like', error: error.message } };
    }
}

async function toggleLikeReel(userId, reelId, body) {
    try {
        const { reaction = 'like' } = body;
        if (!mongoose.Types.ObjectId.isValid(reelId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid reel ID' } };
        }
        if (!Object.keys(REACTION_TYPES).includes(reaction)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid reaction type' } };
        }
        const result = await handleLike('reel', reelId, userId, reaction);
        return { statusCode: 200, json: { success: true, message: `Reel ${result.action} successfully`, data: result } };
    } catch (error) {
        console.error('Toggle like error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to toggle like', error: error.message } };
    }
}

async function getReactions(content, contentId) {
    try {
        if (!['post', 'reel'].includes(content)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid content type. Must be "post" or "reel"' } };
        }
        if (!mongoose.Types.ObjectId.isValid(contentId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid content ID' } };
        }
        const likeDoc = await Like.findOne({ content, contentId }).lean();
        if (!likeDoc) {
            return { statusCode: 200, json: { success: true, data: {} } };
        }
        const reactionTypes = Object.keys(REACTION_TYPES);
        const result = {};
        await Promise.all(likeDoc.likes.map(async (userIds, index) => {
            const reaction = reactionTypes[index];
            if (!reaction || !Array.isArray(userIds) || userIds.length === 0) return;
            const users = await User.find({ _id: { $in: userIds } }).select('profile.name.full profile.profileImage').lean();
            result[reaction] = {
                count: users.length,
                users: users.map(user => ({ id: user._id, name: user.profile?.name?.full, profileImage: user.profile?.profileImage }))
            };
        }));
        return { statusCode: 200, json: { success: true, data: result } };
    } catch (error) {
        console.error('Get reactions error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to get reactions', error: error.message } };
    }
}

async function getMyReactions(userId, body) {
    try {
        const { content, contentIds } = body;
        if (!content || !['post', 'reel'].includes(content)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid content type. Must be "post" or "reel"' } };
        }
        if (!contentIds || !Array.isArray(contentIds) || contentIds.length === 0) {
            return { statusCode: 400, json: { success: false, message: 'contentIds must be a non-empty array' } };
        }
        const validIds = contentIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validIds.length === 0) {
            return { statusCode: 400, json: { success: false, message: 'No valid content IDs provided' } };
        }
        const likeDocs = await Like.find({ content, contentId: { $in: validIds } }).lean();
        const result = {};
        const reactionTypes = Object.keys(REACTION_TYPES);
        const userIdStr = userId.toString();
        validIds.forEach(id => { result[id.toString()] = null; });
        likeDocs.forEach(likeDoc => {
            const contentIdStr = likeDoc.contentId.toString();
            for (let i = 0; i < likeDoc.likes.length; i++) {
                const userIds = likeDoc.likes[i];
                if (Array.isArray(userIds) && userIds.some(id => id && id.toString() === userIdStr)) {
                    result[contentIdStr] = reactionTypes[i];
                    break;
                }
            }
        });
        return {
            statusCode: 200,
            json: { success: true, message: 'User reactions retrieved successfully', data: { reactions: result } }
        };
    } catch (error) {
        console.error('Get my reactions error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to get user reactions', error: error.message } };
    }
}

module.exports = {
    addComment,
    addReply,
    getComments,
    getCommentsByQuery,
    getReplies,
    deleteComment,
    deleteReply,
    toggleLikePost,
    toggleLikeReel,
    getReactions,
    getMyReactions
};

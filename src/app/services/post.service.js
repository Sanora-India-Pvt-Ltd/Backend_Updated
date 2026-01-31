const mongoose = require('mongoose');
const Post = require('../../models/social/Post');
const Comment = require('../../models/social/Comment');
const User = require('../../models/authorization/User');
const storage = require('../../core/infra/storage');
const Media = require('../../models/Media');
const Like = require('../../models/social/Like');
const { isVideo } = require('../../core/infra/videoTranscoder');
const { Report, REPORT_REASONS } = require('../../models/social/Report');
const eventBus = require('../../core/infra/eventBus');
const VideoTranscodingJob = require('../../models/VideoTranscodingJob');
const {
    batchGetUsers,
    batchCheckBlocked,
    batchCheckFriendships
} = require('../../utils/userDataLoader');
const AppError = require('../../core/errors/AppError');

async function getBlockedUserIds(userId) {
    try {
        const user = await User.findById(userId).select('social.blockedUsers').lean();
        if (!user) return [];
        const blockedUsers = user.social?.blockedUsers || [];
        const uniqueBlocked = [...new Set(blockedUsers.map((id) => id.toString()))];
        return uniqueBlocked.map((id) => mongoose.Types.ObjectId(id));
    } catch (err) {
        console.error('Error getting blocked users:', err);
        return [];
    }
}

async function isUserBlocked(blockerId, blockedId) {
    try {
        const blockedUserIds = await getBlockedUserIds(blockerId);
        return blockedUserIds.some((id) => id.toString() === blockedId.toString());
    } catch (err) {
        console.error('Error checking if user is blocked:', err);
        return false;
    }
}

async function batchCheckPostVisibility(postUserIds, viewingUserId) {
    try {
        const visibilityMap = new Map();
        if (!viewingUserId) {
            const users = await batchGetUsers(postUserIds, 'profile.visibility');
            for (const [userId, user] of users.entries()) {
                visibilityMap.set(userId, user?.profile?.visibility !== 'private');
            }
            return visibilityMap;
        }
        const viewingUserIdStr = viewingUserId.toString();
        const postOwners = await batchGetUsers(postUserIds, 'profile.visibility social.friends');
        const blockPairs = [];
        for (const postUserId of postUserIds) {
            const postUserIdStr = postUserId.toString();
            if (postUserIdStr !== viewingUserIdStr) {
                blockPairs.push({ blockerId: viewingUserIdStr, blockedId: postUserIdStr });
                blockPairs.push({ blockerId: postUserIdStr, blockedId: viewingUserIdStr });
            }
        }
        const blockedMap = await batchCheckBlocked(blockPairs);
        const friendshipPairs = [];
        for (const postUserId of postUserIds) {
            const postUserIdStr = postUserId.toString();
            if (postUserIdStr !== viewingUserIdStr) {
                const owner = postOwners.get(postUserIdStr);
                if (owner?.profile?.visibility === 'private') {
                    friendshipPairs.push({
                        userId1: postUserIdStr,
                        userId2: viewingUserIdStr
                    });
                }
            }
        }
        const friendsMap =
            friendshipPairs.length > 0
                ? await batchCheckFriendships(friendshipPairs)
                : new Map();

        for (const postUserId of postUserIds) {
            const postUserIdStr = postUserId.toString();
            if (postUserIdStr === viewingUserIdStr) {
                visibilityMap.set(postUserIdStr, true);
                continue;
            }
            const owner = postOwners.get(postUserIdStr);
            if (!owner) {
                visibilityMap.set(postUserIdStr, false);
                continue;
            }
            const viewerBlockedKey = `${viewingUserIdStr}_${postUserIdStr}`;
            const ownerBlockedKey = `${postUserIdStr}_${viewingUserIdStr}`;
            if (blockedMap.get(viewerBlockedKey) || blockedMap.get(ownerBlockedKey)) {
                visibilityMap.set(postUserIdStr, false);
                continue;
            }
            const isProfilePrivate = owner.profile?.visibility === 'private';
            if (!isProfilePrivate) {
                visibilityMap.set(postUserIdStr, true);
            } else {
                const friendshipKey = `${postUserIdStr}_${viewingUserIdStr}`;
                visibilityMap.set(postUserIdStr, friendsMap.get(friendshipKey) || false);
            }
        }
        return visibilityMap;
    } catch (err) {
        console.error('Error batch checking post visibility:', err);
        const visibilityMap = new Map();
        for (const postUserId of postUserIds) {
            visibilityMap.set(postUserId.toString(), false);
        }
        return visibilityMap;
    }
}

async function enrichMediaWithTranscodingStatus(mediaArray) {
    if (!mediaArray || mediaArray.length === 0) return mediaArray;
    const videoMedia = mediaArray.filter((m) => m.type === 'video');
    if (videoMedia.length === 0) return mediaArray;
    const publicIds = videoMedia
        .map((m) => m.publicId || m.public_id)
        .filter(Boolean);
    if (publicIds.length === 0) return mediaArray;

    const mediaRecords = await Media.find({
        public_id: { $in: publicIds }
    })
        .select('public_id url isTranscoding transcodingCompleted transcodingJobId')
        .lean();
    const mediaMap = new Map();
    mediaRecords.forEach((record) => mediaMap.set(record.public_id, record));

    return mediaArray.map((mediaItem) => {
        if (mediaItem.type !== 'video') return mediaItem;
        const publicId = mediaItem.publicId || mediaItem.public_id;
        const mediaRecord = mediaMap.get(publicId);
        if (!mediaRecord) {
            return {
                ...mediaItem,
                isTranscoding: false,
                transcodingCompleted: false,
                transcodingStatus: 'unknown'
            };
        }
        const enrichedMedia = {
            ...mediaItem,
            isTranscoding: mediaRecord.isTranscoding || false,
            transcodingCompleted: mediaRecord.transcodingCompleted || false,
            transcodingJobId: mediaRecord.transcodingJobId || null,
            transcodingStatus: mediaRecord.isTranscoding
                ? 'processing'
                : mediaRecord.transcodingCompleted
                    ? 'completed'
                    : 'pending'
        };
        if (mediaRecord.transcodingCompleted && mediaRecord.url) {
            enrichedMedia.url = mediaRecord.url;
            enrichedMedia.isPlayable = true;
        } else if (mediaRecord.isTranscoding) {
            enrichedMedia.isPlayable = false;
        } else {
            enrichedMedia.isPlayable = true;
        }
        return enrichedMedia;
    });
}

async function getCommentCountForPost(contentId) {
    try {
        const commentDoc = await Comment.findOne({
            contentId,
            contentType: 'post'
        })
            .select('contentId comments')
            .lean();
        if (!commentDoc || !commentDoc.comments) return 0;
        const top = commentDoc.comments.length;
        const replies = commentDoc.comments.reduce(
            (sum, c) => sum + (c.replies ? c.replies.length : 0),
            0
        );
        return top + replies;
    } catch (err) {
        return 0;
    }
}

function formatReplyForResponse(reply) {
    if (!reply.userId) {
        return {
            id: reply._id.toString(),
            userId: null,
            user: null,
            text: reply.text,
            createdAt: reply.createdAt
        };
    }
    const replyUserId =
        reply.userId._id ? reply.userId._id.toString() : reply.userId.toString();
    const replyUserInfo = reply.userId._id
        ? {
            id: reply.userId._id.toString(),
            firstName: reply.userId.profile?.name?.first,
            lastName: reply.userId.profile?.name?.last,
            name: reply.userId.profile?.name?.full,
            profileImage: reply.userId.profile?.profileImage
        }
        : null;
    return {
        id: reply._id.toString(),
        userId: replyUserId,
        user: replyUserInfo,
        text: reply.text,
        createdAt: reply.createdAt
    };
}

function formatCommentForResponse(comment) {
    if (!comment.userId) {
        return {
            id: comment._id.toString(),
            userId: null,
            user: null,
            text: comment.text,
            createdAt: comment.createdAt,
            replies: [],
            replyCount: 0
        };
    }
    const commentUserId =
        comment.userId._id ? comment.userId._id.toString() : comment.userId.toString();
    const commentUserInfo = comment.userId._id
        ? {
            id: comment.userId._id.toString(),
            firstName: comment.userId.profile?.name?.first,
            lastName: comment.userId.profile?.name?.last,
            name: comment.userId.profile?.name?.full,
            profileImage: comment.userId.profile?.profileImage
        }
        : null;
    const formattedReplies = (comment.replies || [])
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5)
        .map(formatReplyForResponse);
    return {
        id: comment._id.toString(),
        userId: commentUserId,
        user: commentUserInfo,
        text: comment.text,
        createdAt: comment.createdAt,
        replies: formattedReplies,
        replyCount: comment.replyCount || formattedReplies.length
    };
}

/**
 * Batch: comment counts and formatted comments for multiple post IDs (eliminates N+1).
 * Returns { commentCountMap: Map<contentIdStr, number>, formattedCommentsMap: Map<contentIdStr, array> }.
 */
async function getCommentCountsAndFormattedForPosts(postIds, limit = 15) {
    const commentCountMap = new Map();
    const formattedCommentsMap = new Map();
    if (!postIds || postIds.length === 0) return { commentCountMap, formattedCommentsMap };
    const ids = postIds.map((id) => (id && id.toString ? id.toString() : id));
    try {
        const commentDocs = await Comment.find({
            contentId: { $in: postIds },
            contentType: 'post'
        })
            .select('contentId comments')
            .populate('comments.userId', 'profile.name.first profile.name.last profile.name.full profile.profileImage')
            .populate('comments.replies.userId', 'profile.name.first profile.name.last profile.name.full profile.profileImage')
            .lean();
        for (const commentDoc of commentDocs) {
            const contentIdStr = commentDoc.contentId?.toString?.() || commentDoc.contentId;
            if (!contentIdStr) continue;
            if (commentDoc.comments && commentDoc.comments.length > 0) {
                const top = commentDoc.comments.length;
                const replyCount = commentDoc.comments.reduce(
                    (sum, c) => sum + (c.replies ? c.replies.length : 0),
                    0
                );
                commentCountMap.set(contentIdStr, top + replyCount);
                const sorted = [...commentDoc.comments].sort(
                    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
                );
                const paginated = sorted.slice(0, limit);
                formattedCommentsMap.set(
                    contentIdStr,
                    paginated.map(formatCommentForResponse)
                );
            } else {
                commentCountMap.set(contentIdStr, 0);
                formattedCommentsMap.set(contentIdStr, []);
            }
        }
        for (const id of ids) {
            const str = id.toString ? id.toString() : id;
            if (!commentCountMap.has(str)) {
                commentCountMap.set(str, 0);
                formattedCommentsMap.set(str, []);
            }
        }
    } catch (err) {
        console.error('Error batch fetching comments for posts:', err);
        for (const id of ids) {
            const str = id.toString ? id.toString() : id;
            commentCountMap.set(str, 0);
            formattedCommentsMap.set(str, []);
        }
    }
    return { commentCountMap, formattedCommentsMap };
}

async function getFormattedComments(contentId, limit = 15) {
    try {
        const comments = await Comment.getCommentsByContent(contentId, 'post', {
            page: 1,
            limit,
            sortBy: 'createdAt',
            sortOrder: -1
        });
        return comments.map(formatCommentForResponse);
    } catch (err) {
        console.error('Error fetching comments:', err);
        return [];
    }
}

function limitComments(comments) {
    return Array.isArray(comments) ? comments.slice(0, 15) : [];
}

function getReactionIndex(reaction) {
    const reactionMap = { happy: 0, sad: 1, angry: 2, hug: 3, wow: 4, like: 5 };
    return reactionMap[reaction] ?? 5;
}

function findUserReaction(likes, userId) {
    if (!likes || !Array.isArray(likes)) return null;
    const reactionTypes = ['happy', 'sad', 'angry', 'hug', 'wow', 'like'];
    for (let i = 0; i < likes.length; i++) {
        if (
            likes[i] &&
            Array.isArray(likes[i]) &&
            likes[i].some((id) => id.toString() === userId.toString())
        ) {
            return reactionTypes[i];
        }
    }
    return null;
}

function formatPostUser(postUserId) {
    if (!postUserId) return null;
    const id = postUserId._id ? postUserId._id.toString() : postUserId.toString();
    const profile = postUserId.profile || (postUserId._id && postUserId);
    return {
        id,
        firstName: profile?.name?.first,
        lastName: profile?.name?.last,
        name: profile?.name?.full,
        email: profile?.email,
        profileImage: profile?.profileImage
    };
}

/**
 * Create post. Returns { post, message } for response data.
 */
async function createPost(user, body, files) {
    const { caption } = body;
    const hasCaption = caption && String(caption).trim().length > 0;
    const fileList = files && (Array.isArray(files) ? files : [files]).filter(Boolean);
    const hasMedia = fileList && fileList.length > 0;

    if (!hasCaption && !hasMedia) {
        throw new AppError('Post must have either a caption or media (or both)', 400);
    }

    const media = [];
    const uploadedForResponse = [];

    if (hasMedia) {
        for (const file of fileList) {
            let transcodingJobId = null;
            try {
                const isVideoFile = isVideo(file.mimetype);
                let uploadResult;
                if (file.path) {
                    uploadResult = await storage.uploadFromPath(file.path);
                    if (isVideoFile) {
                        try {
                            transcodingJobId = await eventBus.addTranscodingJob({
                                inputPath: file.path,
                                userId: user._id.toString(),
                                jobType: 'post',
                                originalFilename: file.originalname
                            });
                        } catch (queueErr) {
                            console.error('[PostService] Failed to queue transcoding:', queueErr);
                        }
                    }
                } else if (file.location && file.key) {
                    uploadResult = await storage.uploadFromRequest(file);
                } else {
                    throw new Error('Invalid file object: missing path or location/key');
                }

                const mediaType = isVideoFile ? 'video' : 'image';
                const format = (file.mimetype || '').split('/')[1] || 'unknown';

                const mediaRecord = await Media.create({
                    userId: user._id,
                    url: uploadResult.url,
                    public_id: uploadResult.key,
                    format,
                    resource_type: mediaType,
                    fileSize: file.size,
                    originalFilename: file.originalname,
                    folder: 'user_uploads',
                    provider: uploadResult.provider,
                    transcodingJobId: transcodingJobId || null,
                    isTranscoding: isVideoFile && !!transcodingJobId
                });

                media.push({
                    url: uploadResult.url,
                    publicId: uploadResult.key,
                    type: mediaType,
                    format: format || null,
                    transcodingJobId: transcodingJobId || null,
                    isTranscoding: isVideoFile && !!transcodingJobId
                });
                uploadedForResponse.push({
                    url: uploadResult.url,
                    publicId: uploadResult.key,
                    type: mediaType,
                    format
                });
            } catch (fileErr) {
                console.error('Error processing file:', fileErr);
                if (transcodingJobId) {
                    try {
                        await VideoTranscodingJob.findByIdAndUpdate(transcodingJobId, {
                            status: 'failed',
                            error: fileErr.message
                        });
                    } catch (e) {
                        console.error('Error updating job status:', e);
                    }
                }
            }
        }
    }

    const post = await Post.create({
        userId: user._id,
        caption: caption || '',
        media
    });

    await post.populate(
        'userId',
        'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage'
    );
    const commentCount = await post.getCommentCount();
    const comments = await getFormattedComments(post._id, 15);

    return {
        post: {
            id: post._id.toString(),
            userId: (post.userId._id || post.userId).toString(),
            user: formatPostUser(post.userId),
            caption: post.caption,
            media: post.media,
            likes: post.likes || [[], [], [], [], [], []],
            comments,
            likeCount: post.likeCount,
            commentCount,
            createdAt: post.createdAt,
            updatedAt: post.updatedAt
        },
        message: 'Post created successfully'
    };
}

/**
 * Get all posts (feed). Returns { posts, pagination }.
 */
async function getAllPosts(query, userId) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    let blockedUserIds = [];
    if (userId) {
        blockedUserIds = await getBlockedUserIds(userId);
        const reportedPostIds = await Report.find({
            userId,
            contentType: 'post'
        }).distinct('contentId');
        if (reportedPostIds.length > 0) filter._id = { $nin: reportedPostIds };
        const usersWhoBlockedMe = await User.find({
            'social.blockedUsers': userId
        })
            .select('_id')
            .lean();
        const blockedByUserIds = usersWhoBlockedMe.map((u) => u._id);
        const allExcluded = [...blockedUserIds, ...blockedByUserIds];
        if (allExcluded.length > 0) filter.userId = { $nin: allExcluded };
    }

    const posts = await Post.find(filter)
        .select('userId caption media likes createdAt updatedAt')
        .populate(
            'userId',
            'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage profile.visibility social.friends'
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit * 2)
        .lean();

    const postIds = posts.map((p) => p._id);
    const likeCounts = await Like.aggregate([
        { $match: { content: 'post', contentId: { $in: postIds } } },
        {
            $project: {
                contentId: 1,
                totalLikes: {
                    $reduce: {
                        input: '$likes',
                        initialValue: 0,
                        in: { $add: ['$$value', { $size: '$$this' }] }
                    }
                }
            }
        }
    ]);
    const likesMap = new Map();
    likeCounts.forEach((item) => likesMap.set(item.contentId.toString(), item.totalLikes));

    const postUserIds = posts
        .filter((p) => p.userId)
        .map((p) => (p.userId._id ? p.userId._id : p.userId));
    const visibilityMap = await batchCheckPostVisibility(
        postUserIds,
        userId || null
    );

    const visiblePosts = [];
    for (const post of posts) {
        if (!post.userId) continue;
        const postUserIdStr = (
            post.userId._id ? post.userId._id : post.userId
        ).toString();
        if (visibilityMap.get(postUserIdStr)) {
            post.likeCount = likesMap.get(post._id.toString()) || 0;
            visiblePosts.push(post);
            if (visiblePosts.length >= limit) break;
        }
    }

    const totalPosts = await Post.countDocuments(filter);

    const visiblePostIds = visiblePosts.map((p) => p._id);
    const { commentCountMap, formattedCommentsMap } = await getCommentCountsAndFormattedForPosts(visiblePostIds, 15);

    const postsWithComments = visiblePosts.map((post) => {
        const userIdStr = (post.userId._id ? post.userId._id : post.userId).toString();
        const userInfo = formatPostUser(post.userId);
        const postIdStr = post._id.toString();
        const commentCount = commentCountMap.get(postIdStr) ?? 0;
        const comments = formattedCommentsMap.get(postIdStr) || [];
        return {
            id: postIdStr,
            userId: userIdStr,
            user: userInfo,
            caption: post.caption,
            media: post.media || [],
            likes: post.likes || [[], [], [], [], [], []],
            comments,
            likeCount: post.likeCount,
            commentCount,
            createdAt: post.createdAt,
            updatedAt: post.updatedAt
        };
    });
    const enrichedMediaArrays = await Promise.all(
        visiblePosts.map((post) => enrichMediaWithTranscodingStatus(post.media || []))
    );
    postsWithComments.forEach((item, idx) => {
        item.media = enrichedMediaArrays[idx];
    });

    return {
        posts: postsWithComments,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalPosts / limit),
            totalPosts,
            hasNextPage:
                visiblePosts.length === limit && page < Math.ceil(totalPosts / limit),
            hasPrevPage: page > 1
        },
        message: 'Posts retrieved successfully'
    };
}

/**
 * Get my posts. Returns { user, posts, pagination, message }.
 */
async function getMyPosts(user, query) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;

    const posts = await Post.find({ userId: user._id })
        .select('userId caption media likes createdAt updatedAt')
        .populate(
            'userId',
            'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage'
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

    const totalPosts = await Post.countDocuments({ userId: user._id });

    const postIds = posts.map((p) => p._id);
    const likeDocs = await Like.find({
        content: 'post',
        contentId: { $in: postIds }
    }).select('contentId likes').lean();
    const likesMap = new Map();
    likeDocs.forEach((doc) => {
        const total =
            doc.likes &&
            Array.isArray(doc.likes) &&
            doc.likes.reduce(
                (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
                0
            );
        likesMap.set(doc.contentId.toString(), total || 0);
    });

    const { commentCountMap, formattedCommentsMap } = await getCommentCountsAndFormattedForPosts(postIds, 15);
    const enrichedMediaArrays = await Promise.all(
        posts.map((post) => enrichMediaWithTranscodingStatus(post.media || []))
    );

    const postsWithComments = posts.map((post, idx) => {
        const userIdStr = (post.userId._id ? post.userId._id : post.userId).toString();
        const userInfo = formatPostUser(post.userId);
        const postIdStr = post._id.toString();
        const commentCount = commentCountMap.get(postIdStr) ?? 0;
        const comments = formattedCommentsMap.get(postIdStr) || [];
        const likeCount = likesMap.get(postIdStr) || 0;
        return {
            id: postIdStr,
            userId: userIdStr,
            user: userInfo,
            caption: post.caption,
            media: enrichedMediaArrays[idx],
            likes: (likeDocs.find((d) => d.contentId.toString() === postIdStr)?.likes) || [[], [], [], [], [], []],
            comments,
            likeCount,
            commentCount,
            createdAt: post.createdAt,
            updatedAt: post.updatedAt
        };
    });

    return {
        user: {
            id: user._id.toString(),
            name: user.profile?.name?.full,
            email: user.profile?.email,
            profileImage: user.profile?.profileImage
        },
        posts: postsWithComments,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalPosts / limit),
            totalPosts,
            hasNextPage: page < Math.ceil(totalPosts / limit),
            hasPrevPage: page > 1
        },
        message: 'My posts retrieved successfully'
    };
}

/**
 * Get user posts by user ID. Returns { user, posts, pagination, message }.
 */
async function getUserPosts(targetUserId, query, viewingUserId) {
    if (!targetUserId || !mongoose.Types.ObjectId.isValid(targetUserId)) {
        throw new AppError('Invalid user ID', 400);
    }
    const user = await User.findById(targetUserId).select(
        'profile.visibility profile.name.full profile.email profile.profileImage social.friends social.blockedUsers'
    ).lean();
    if (!user) {
        throw new AppError('User not found', 404);
    }

    if (viewingUserId) {
        const viewingBlocked = await isUserBlocked(viewingUserId, targetUserId);
        if (viewingBlocked) {
            throw new AppError('You cannot view posts from a blocked user', 403);
        }
        const ownerBlocked = await isUserBlocked(targetUserId, viewingUserId);
        if (ownerBlocked) {
            throw new AppError('Content not available', 403);
        }
        const isPrivate = user.profile?.visibility === 'private';
        if (isPrivate) {
            const friendsList = user.social?.friends || [];
            const isFriend = friendsList.some(
                (f) => f.toString() === viewingUserId.toString()
            );
            if (
                targetUserId.toString() !== viewingUserId.toString() &&
                !isFriend
            ) {
                throw new AppError(
                    'This user has a private profile. Only friends can view their posts.',
                    403
                );
            }
        }
    } else {
        if (user.profile?.visibility === 'private') {
            throw new AppError(
                'This user has a private profile. Please log in to view their posts.',
                403
            );
        }
    }

    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    const skip = (page - 1) * limit;
    const filter = { userId: targetUserId };
    if (viewingUserId) {
        const reportedIds = await Report.find({
            userId: viewingUserId,
            contentType: 'post'
        }).distinct('contentId');
        if (reportedIds.length > 0) filter._id = { $nin: reportedIds };
    }

    const posts = await Post.find(filter)
        .select('userId caption media likes createdAt updatedAt')
        .populate(
            'userId',
            'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage'
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
    const totalPosts = await Post.countDocuments(filter);
    const postIds = posts.map((p) => p._id);
    const likeDocs = await Like.find({
        content: 'post',
        contentId: { $in: postIds }
    }).select('contentId likes').lean();
    const likesMap = new Map();
    likeDocs.forEach((doc) => {
        likesMap.set(doc.contentId.toString(), doc.likes || [[], [], [], [], [], []]);
    });

    const { commentCountMap, formattedCommentsMap } = await getCommentCountsAndFormattedForPosts(postIds, 15);
    const enrichedMediaArrays = await Promise.all(
        posts.map((post) => enrichMediaWithTranscodingStatus(post.media || []))
    );

    const postsWithComments = posts.map((post, idx) => {
        const userIdStr = (post.userId._id ? post.userId._id : post.userId).toString();
        const userInfo = formatPostUser(post.userId);
        const postIdStr = post._id.toString();
        const commentCount = commentCountMap.get(postIdStr) ?? 0;
        const comments = formattedCommentsMap.get(postIdStr) || [];
        const postLikes = likesMap.get(postIdStr) || [[], [], [], [], [], []];
        const likeCount = Array.isArray(postLikes)
            ? postLikes.reduce(
                (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
                0
            )
            : 0;
        return {
            id: postIdStr,
            userId: userIdStr,
            user: userInfo,
            caption: post.caption,
            media: enrichedMediaArrays[idx],
            likes: postLikes,
            comments,
            likeCount,
            commentCount,
            createdAt: post.createdAt,
            updatedAt: post.updatedAt
        };
    });

    return {
        user: {
            id: user._id.toString(),
            name: user.profile?.name?.full,
            email: user.profile?.email,
            profileImage: user.profile?.profileImage
        },
        posts: postsWithComments,
        pagination: {
            currentPage: page,
            totalPages: Math.ceil(totalPosts / limit),
            totalPosts,
            hasNextPage: page < Math.ceil(totalPosts / limit),
            hasPrevPage: page > 1
        },
        message: 'User posts retrieved successfully'
    };
}

/**
 * Upload post media. Returns { url, publicId, type, format, fileSize, mediaId }.
 */
async function uploadPostMedia(user, file) {
    if (!file) {
        throw new AppError('No file uploaded', 400);
    }
    const isVideoFile = isVideo(file.mimetype);
    let uploadResult;
    if (file.path) {
        uploadResult = await storage.uploadFromPath(file.path);
    } else if (file.location && file.key) {
        uploadResult = await storage.uploadFromRequest(file);
    } else {
        throw new AppError('Invalid file object: missing path or location/key', 400);
    }
    const mediaType = isVideoFile ? 'video' : 'image';
    const format = (file.mimetype || '').split('/')[1] || 'unknown';
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
        url: uploadResult.url,
        publicId: uploadResult.key,
        type: mediaType,
        format,
        fileSize: file.size,
        mediaId: mediaRecord._id
    };
}

/**
 * Toggle like on post. Returns { post, action, reaction, isLiked }.
 */
async function toggleLikePost(user, postId, reactionType) {
    if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
        throw new AppError('Invalid post ID', 400);
    }
    const allowedReactions = ['happy', 'sad', 'angry', 'hug', 'wow', 'like'];
    const reaction = reactionType || 'like';
    if (!allowedReactions.includes(reaction)) {
        throw new AppError(
            `Invalid reaction. Must be one of: ${allowedReactions.join(', ')}`,
            400
        );
    }

    let likeDoc = await Like.findOne({ content: 'post', contentId: postId });
    if (!likeDoc) {
        likeDoc = await Like.create({
            content: 'post',
            contentId: postId,
            likes: [[], [], [], [], [], []]
        });
    }
    if (!likeDoc.likes || !Array.isArray(likeDoc.likes)) {
        likeDoc.likes = [[], [], [], [], [], []];
    }
    while (likeDoc.likes.length < 6) {
        likeDoc.likes.push([]);
    }

    const existingReaction = findUserReaction(likeDoc.likes, user._id);
    const reactionIndex = getReactionIndex(reaction);
    let action;
    let currentReaction = null;

    if (existingReaction) {
        const existingIndex = getReactionIndex(existingReaction);
        likeDoc.likes[existingIndex] = likeDoc.likes[existingIndex].filter(
            (id) => id.toString() !== user._id.toString()
        );
        if (existingReaction === reaction) {
            action = 'unliked';
        } else {
            if (
                !likeDoc.likes[reactionIndex].some(
                    (id) => id.toString() === user._id.toString()
                )
            ) {
                likeDoc.likes[reactionIndex].push(user._id);
            }
            action = 'reaction_updated';
            currentReaction = reaction;
        }
    } else {
        if (
            !likeDoc.likes[reactionIndex].some(
                (id) => id.toString() === user._id.toString()
            )
        ) {
            likeDoc.likes[reactionIndex].push(user._id);
        }
        action = 'liked';
        currentReaction = reaction;
    }
    await likeDoc.save();

    const post = await Post.findById(postId)
        .populate(
            'userId',
            'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage'
        )
        .lean();
    if (!post) {
        throw new AppError('Post not found', 404);
    }
    const commentCount = await getCommentCountForPost(postId);
    const likeCount = likeDoc.likes.reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
        0
    );
    const enrichedMedia = await enrichMediaWithTranscodingStatus(post.media || []);
    const comments = await getFormattedComments(postId, 15);

    return {
        post: {
            id: post._id.toString(),
            userId: (post.userId._id ? post.userId._id : post.userId).toString(),
            user: formatPostUser(post.userId),
            caption: post.caption,
            media: enrichedMedia,
            likes: likeDoc.likes,
            comments,
            likeCount,
            commentCount,
            createdAt: post.createdAt,
            updatedAt: post.updatedAt
        },
        action,
        reaction: currentReaction,
        isLiked: action !== 'unliked'
    };
}

/**
 * Delete post.
 */
async function deletePost(user, postId) {
    if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
        throw new AppError('Invalid post ID', 400);
    }
    const post = await Post.findById(postId).lean();
    if (!post) {
        throw new AppError('Post not found', 404);
    }
    if (post.userId.toString() !== user._id.toString()) {
        throw new AppError('You do not have permission to delete this post', 403);
    }
    if (post.media && post.media.length > 0) {
        for (const mediaItem of post.media) {
            try {
                await storage.delete(mediaItem.publicId);
            } catch (deleteErr) {
                console.warn(
                    `Failed to delete media ${mediaItem.publicId} from S3:`,
                    deleteErr.message
                );
            }
        }
    }
    await Comment.findOneAndDelete({
        contentId: postId,
        contentType: 'post'
    });
    await Like.findOneAndDelete({ content: 'post', contentId: postId });
    await Post.findByIdAndDelete(postId);
}

/**
 * Add comment (uses Comment collection). Returns { comment?, reply?, post, message }.
 */
async function addComment(user, postId, body) {
    const { text, parentCommentId } = body;
    if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
        throw new AppError('Invalid post ID', 400);
    }
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        throw new AppError('Comment text is required', 400);
    }
    if (text.length > 1000) {
        throw new AppError('Comment text must be 1000 characters or less', 400);
    }
    if (
        parentCommentId &&
        !mongoose.Types.ObjectId.isValid(parentCommentId)
    ) {
        throw new AppError('Invalid parent comment ID', 400);
    }

    const post = await Post.findById(postId)
        .select('userId caption media likes createdAt updatedAt')
        .populate(
            'userId',
            'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage'
        )
        .lean();
    if (!post) {
        throw new AppError('Post not found', 404);
    }

    const commentDoc = await Comment.getOrCreateCommentDoc(postId, 'post');

    if (parentCommentId) {
        const newReply = await commentDoc.addReply(
            parentCommentId,
            user._id,
            text.trim()
        );
        const comments = await getFormattedComments(postId, 15);
        const replyUserInfo = newReply.userId
            ? formatPostUser(
                await User.findById(newReply.userId).select(
                    'profile.name.first profile.name.last profile.name.full profile.profileImage'
                )
            )
            : null;
        return {
            reply: {
                id: newReply._id.toString(),
                userId: (newReply.userId && newReply.userId.toString()) || null,
                user: replyUserInfo,
                text: newReply.text,
                createdAt: newReply.createdAt,
                parentCommentId
            },
            post: await formatPostForResponse(post, comments),
            message: 'Reply added successfully'
        };
    }
    const newComment = await commentDoc.addComment(user._id, text.trim());
    const comments = await getFormattedComments(postId, 15);
    const commentUserInfo = newComment.userId
        ? formatPostUser(
            await User.findById(newComment.userId).select(
                'profile.name.first profile.name.last profile.name.full profile.profileImage'
            )
        )
        : null;
    return {
        comment: {
            id: newComment._id.toString(),
            userId: (newComment.userId && newComment.userId.toString()) || null,
            user: commentUserInfo,
            text: newComment.text,
            createdAt: newComment.createdAt,
            replies: (newComment.replies || []).map((r) => ({
                id: r._id.toString(),
                userId: r.userId?.toString(),
                user: null,
                text: r.text,
                createdAt: r.createdAt
            })),
            replyCount: (newComment.replies && newComment.replies.length) || 0
        },
        post: await formatPostForResponse(post, comments),
        message: 'Comment added successfully'
    };
}

async function formatPostForResponse(post, comments) {
    const userIdStr = (post.userId._id ? post.userId._id : post.userId).toString();
    const userInfo = formatPostUser(post.userId);
    const likeCount =
        post.likeCount != null
            ? post.likeCount
            : await (async () => {
                const likeDoc = await Like.findOne({
                    content: 'post',
                    contentId: post._id
                }).lean();
                if (!likeDoc || !likeDoc.likes) return 0;
                return likeDoc.likes.reduce(
                    (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
                    0
                );
            })();
    const commentCount =
        post.commentCount != null
            ? post.commentCount
            : await getCommentCountForPost(post._id);
    return {
        id: post._id.toString(),
        userId: userIdStr,
        user: userInfo,
        caption: post.caption,
        media: post.media || [],
        likes: post.likes || [[], [], [], [], [], []],
        comments: limitComments(comments),
        likeCount,
        commentCount,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt
    };
}

/**
 * Delete comment or reply.
 */
async function deleteComment(user, postId, commentId, replyId) {
    if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
        throw new AppError('Invalid post ID', 400);
    }
    if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
        throw new AppError('Invalid comment ID', 400);
    }
    if (replyId && !mongoose.Types.ObjectId.isValid(replyId)) {
        throw new AppError('Invalid reply ID', 400);
    }

    const post = await Post.findById(postId)
        .select('userId caption media likes createdAt updatedAt')
        .populate(
            'userId',
            'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage'
        );
    if (!post) {
        throw new AppError('Post not found', 404);
    }

    const commentDoc = await Comment.findOne({
        contentId: postId,
        contentType: 'post'
    })
        .select('contentId contentType comments')
        .populate('comments.userId', 'profile.name.first profile.name.last profile.name.full profile.profileImage')
        .populate('comments.replies.userId', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
    if (!commentDoc || !commentDoc.comments) {
        throw new AppError('Parent comment not found', 404);
    }

    if (replyId) {
        const parentComment = commentDoc.comments.id(commentId);
        if (!parentComment) {
            throw new AppError('Parent comment not found', 404);
        }
        if (!parentComment.replies || !parentComment.replies.length) {
            throw new AppError('Reply not found', 404);
        }
        const reply = parentComment.replies.id(replyId);
        if (!reply) {
            throw new AppError('Reply not found', 404);
        }
        const isReplyOwner = reply.userId.toString() === user._id.toString();
        const isCommentOwner = parentComment.userId.toString() === user._id.toString();
        const isPostOwner = post.userId.toString() === user._id.toString();
        if (!isReplyOwner && !isCommentOwner && !isPostOwner) {
            throw new AppError(
                'You do not have permission to delete this reply',
                403
            );
        }
        await commentDoc.removeReply(commentId, replyId);
    } else {
        const comment = commentDoc.comments.id(commentId);
        if (!comment) {
            throw new AppError('Comment not found', 404);
        }
        const isCommentOwner = comment.userId.toString() === user._id.toString();
        const isPostOwner = post.userId.toString() === user._id.toString();
        if (!isCommentOwner && !isPostOwner) {
            throw new AppError(
                'You do not have permission to delete this comment',
                403
            );
        }
        await commentDoc.removeComment(commentId);
    }

    const comments = await getFormattedComments(postId, 15);
    return {
        post: await formatPostForResponse(post, comments),
        message: replyId
            ? 'Reply deleted successfully'
            : 'Comment deleted successfully'
    };
}

/**
 * Report post. Returns { postDeleted, message }.
 */
async function reportPost(user, postId, reason) {
    if (!postId || !mongoose.Types.ObjectId.isValid(postId)) {
        throw new AppError('Invalid post ID', 400);
    }
    if (!reason || !REPORT_REASONS.includes(reason)) {
        throw new AppError(
            `Invalid reason. Must be one of: ${REPORT_REASONS.join(', ')}`,
            400
        );
    }
    const post = await Post.findById(postId).lean();
    if (!post) {
        throw new AppError('Post not found', 404);
    }
    if (post.userId.toString() === user._id.toString()) {
        throw new AppError('You cannot report your own post', 400);
    }
    const existingReport = await Report.findOne({
        userId: user._id,
        contentId: postId,
        contentType: 'post'
    });
    if (existingReport) {
        throw new AppError('You have already reported this post', 400);
    }
    await Report.create({
        userId: user._id,
        contentId: postId,
        contentType: 'post',
        reason
    });
    const reportsWithSameReason = await Report.countDocuments({
        contentId: postId,
        contentType: 'post',
        reason
    });
    let postDeleted = false;
    if (reportsWithSameReason >= 2) {
        if (post.media && post.media.length > 0) {
            for (const mediaItem of post.media) {
                try {
                    await storage.delete(mediaItem.publicId);
                } catch (deleteErr) {
                    console.warn(
                        `Failed to delete media ${mediaItem.publicId} from S3:`,
                        deleteErr.message
                    );
                }
            }
        }
        await Comment.findOneAndDelete({
            contentId: postId,
            contentType: 'post'
        });
        await Like.findOneAndDelete({ content: 'post', contentId: postId });
        await Post.findByIdAndDelete(postId);
        postDeleted = true;
    }
    return {
        postDeleted,
        message: postDeleted
            ? 'Post reported and removed due to multiple reports with the same reason'
            : 'Post reported successfully'
    };
}

module.exports = {
    getBlockedUserIds,
    batchCheckPostVisibility,
    enrichMediaWithTranscodingStatus,
    getFormattedComments,
    createPost,
    getAllPosts,
    getMyPosts,
    getUserPosts,
    uploadPostMedia,
    toggleLikePost,
    deletePost,
    addComment,
    deleteComment,
    reportPost,
    REPORT_REASONS
};

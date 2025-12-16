const Post = require('../models/Post');
const User = require('../models/User');
const cloudinary = require('../config/cloudinary');
const Media = require('../models/Media');
const mongoose = require('mongoose');
const { transcodeVideo, isVideo, cleanupFile } = require('../services/videoTranscoder');
const { Report, REPORT_REASONS } = require('../models/Report');

// Helper function to limit comments to 15 most recent
const limitComments = (comments) => {
    if (!comments || !Array.isArray(comments)) return [];
    // Sort by createdAt descending (newest first) and take first 15
    return comments
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 15);
};

// Create a new post
const createPost = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { caption, mediaUrls } = req.body;

        // Validate that at least caption or media is provided
        const hasCaption = caption && caption.trim().length > 0;
        const hasMedia = mediaUrls && Array.isArray(mediaUrls) && mediaUrls.length > 0;

        if (!hasCaption && !hasMedia) {
            return res.status(400).json({
                success: false,
                message: 'Post must have either a caption or media (or both)'
            });
        }

        // Validate media URLs structure if provided
        const media = [];
        if (hasMedia) {
            for (const mediaItem of mediaUrls) {
                if (!mediaItem.url || !mediaItem.publicId || !mediaItem.type) {
                    return res.status(400).json({
                        success: false,
                        message: 'Each media item must have url, publicId, and type (image/video)'
                    });
                }

                if (!['image', 'video'].includes(mediaItem.type)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Media type must be either "image" or "video"'
                    });
                }

                media.push({
                    url: mediaItem.url,
                    publicId: mediaItem.publicId,
                    type: mediaItem.type,
                    format: mediaItem.format || null
                });
            }
        }

        // Create the post
        const post = await Post.create({
            userId: user._id,
            caption: caption || '',
            media: media
        });

        // Populate user info for response
        await post.populate('userId', 'firstName lastName name email profileImage');

        // Extract userId as string (handle both populated and non-populated cases)
        const userIdString = post.userId._id ? post.userId._id.toString() : post.userId.toString();
        const userInfo = post.userId._id ? {
            id: post.userId._id.toString(),
            firstName: post.userId.firstName,
            lastName: post.userId.lastName,
            name: post.userId.name,
            email: post.userId.email,
            profileImage: post.userId.profileImage
        } : null;

        return res.status(201).json({
            success: true,
            message: 'Post created successfully',
            data: {
                post: {
                    id: post._id.toString(),
                    userId: userIdString,
                    user: userInfo,
                    caption: post.caption,
                    media: post.media,
                    likes: post.likes || [[], [], [], [], [], []],
                    comments: limitComments(post.comments),
                    likeCount: post.likeCount,
                    commentCount: post.commentCount,
                    createdAt: post.createdAt,
                    updatedAt: post.updatedAt
                }
            }
        });

    } catch (error) {
        console.error('Create post error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create post',
            error: error.message
        });
    }
};

// Get all posts (for feed) with pagination
const getAllPosts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Get user ID from token if authenticated (optional for feed)
        const userId = req.user?._id;

        // Build query to exclude reported posts and blocked users' posts if user is authenticated
        let query = {};
        let blockedUserIds = [];
        
        if (userId) {
            // Get current user's blocked users
            const currentUser = await User.findById(userId).select('blockedUsers');
            blockedUserIds = currentUser.blockedUsers || [];

            // Get all post IDs that the user has reported
            const reportedPostIds = await Report.find({
                userId: userId,
                contentType: 'post'
            }).distinct('contentId');

            // Exclude reported posts and posts from blocked users
            const excludeIds = [...reportedPostIds];
            if (blockedUserIds.length > 0) {
                // Also exclude posts from users who have blocked the current user
                const usersWhoBlockedMe = await User.find({
                    blockedUsers: userId
                }).select('_id').lean();
                const blockedByUserIds = usersWhoBlockedMe.map(u => u._id);
                excludeIds.push(...blockedByUserIds);
            }

            if (excludeIds.length > 0) {
                query._id = { $nin: excludeIds };
            }

            // Exclude posts from blocked users
            if (blockedUserIds.length > 0) {
                query.userId = { $nin: blockedUserIds };
            }
        }

        // Get posts sorted by newest first
        const posts = await Post.find(query)
            .populate('userId', 'firstName lastName name email profileImage')
            .populate('comments.userId', 'firstName lastName name profileImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get total count for pagination
        const totalPosts = await Post.countDocuments(query);

        return res.status(200).json({
            success: true,
            message: 'Posts retrieved successfully',
            data: {
                posts: posts.map(post => {
                    const userIdString = post.userId._id ? post.userId._id.toString() : post.userId.toString();
                    const userInfo = post.userId._id ? {
                        id: post.userId._id.toString(),
                        firstName: post.userId.firstName,
                        lastName: post.userId.lastName,
                        name: post.userId.name,
                        email: post.userId.email,
                        profileImage: post.userId.profileImage
                    } : null;

                    return {
                        id: post._id.toString(),
                        userId: userIdString,
                        user: userInfo,
                        caption: post.caption,
                        media: post.media,
                        likes: post.likes || [[], [], [], [], [], []],
                        comments: limitComments(post.comments),
                        likeCount: post.likeCount,
                        commentCount: post.commentCount,
                        createdAt: post.createdAt,
                        updatedAt: post.updatedAt
                    };
                }),
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalPosts / limit),
                    totalPosts: totalPosts,
                    hasNextPage: page < Math.ceil(totalPosts / limit),
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Get all posts error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve posts',
            error: error.message
        });
    }
};

// Get posts for the currently authenticated user (no user ID needed)
const getMyPosts = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Get posts for the authenticated user
        const posts = await Post.find({ userId: user._id })
            .populate('userId', 'firstName lastName name email profileImage')
            .populate('comments.userId', 'firstName lastName name profileImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get total count for pagination
        const totalPosts = await Post.countDocuments({ userId: user._id });

        return res.status(200).json({
            success: true,
            message: 'My posts retrieved successfully',
            data: {
                user: {
                    id: user._id.toString(),
                    name: user.name,
                    email: user.email,
                    profileImage: user.profileImage
                },
                posts: posts.map(post => {
                    const userIdString = post.userId._id ? post.userId._id.toString() : post.userId.toString();
                    const userInfo = post.userId._id ? {
                        id: post.userId._id.toString(),
                        firstName: post.userId.firstName,
                        lastName: post.userId.lastName,
                        name: post.userId.name,
                        email: post.userId.email,
                        profileImage: post.userId.profileImage
                    } : null;

                    return {
                        id: post._id.toString(),
                        userId: userIdString,
                        user: userInfo,
                        caption: post.caption,
                        media: post.media,
                        likes: post.likes || [[], [], [], [], [], []],
                        comments: limitComments(post.comments),
                        likeCount: post.likeCount,
                        commentCount: post.commentCount,
                        createdAt: post.createdAt,
                        updatedAt: post.updatedAt
                    };
                }),
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalPosts / limit),
                    totalPosts: totalPosts,
                    hasNextPage: page < Math.ceil(totalPosts / limit),
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Get my posts error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve my posts',
            error: error.message
        });
    }
};

// Get posts by user ID with pagination
const getUserPosts = async (req, res) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Validate user ID
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID'
            });
        }

        // Check if user exists
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get user ID from token if authenticated (optional)
        const viewingUserId = req.user?._id;

        // Check if viewing user is blocked by the post owner or vice versa
        if (viewingUserId) {
            const viewingUser = await User.findById(viewingUserId).select('blockedUsers');
            const postOwner = await User.findById(id).select('blockedUsers');

            // Check if viewing user has blocked the post owner
            if (viewingUser.blockedUsers && viewingUser.blockedUsers.includes(id)) {
                return res.status(403).json({
                    success: false,
                    message: 'You cannot view posts from a blocked user'
                });
            }

            // Check if post owner has blocked the viewing user
            if (postOwner.blockedUsers && postOwner.blockedUsers.includes(viewingUserId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Content not available'
                });
            }
        }

        // Build query to exclude reported posts if viewing user is authenticated
        let query = { userId: id };
        if (viewingUserId) {
            // Get all post IDs that the viewing user has reported
            const reportedPostIds = await Report.find({
                userId: viewingUserId,
                contentType: 'post'
            }).distinct('contentId');

            // Exclude reported posts
            if (reportedPostIds.length > 0) {
                query._id = { $nin: reportedPostIds };
            }
        }

        // Get posts for this user
        const posts = await Post.find(query)
            .populate('userId', 'firstName lastName name email profileImage')
            .populate('comments.userId', 'firstName lastName name profileImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get total count for pagination
        const totalPosts = await Post.countDocuments(query);

        return res.status(200).json({
            success: true,
            message: 'User posts retrieved successfully',
            data: {
                user: {
                    id: user._id.toString(),
                    name: user.name,
                    email: user.email,
                    profileImage: user.profileImage
                },
                posts: posts.map(post => {
                    const userIdString = post.userId._id ? post.userId._id.toString() : post.userId.toString();
                    const userInfo = post.userId._id ? {
                        id: post.userId._id.toString(),
                        firstName: post.userId.firstName,
                        lastName: post.userId.lastName,
                        name: post.userId.name,
                        email: post.userId.email,
                        profileImage: post.userId.profileImage
                    } : null;

                    return {
                        id: post._id.toString(),
                        userId: userIdString,
                        user: userInfo,
                        caption: post.caption,
                        media: post.media,
                        likes: post.likes || [[], [], [], [], [], []],
                        comments: limitComments(post.comments),
                        likeCount: post.likeCount,
                        commentCount: post.commentCount,
                        createdAt: post.createdAt,
                        updatedAt: post.updatedAt
                    };
                }),
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalPosts / limit),
                    totalPosts: totalPosts,
                    hasNextPage: page < Math.ceil(totalPosts / limit),
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Get user posts error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve user posts',
            error: error.message
        });
    }
};

// Upload media for posts (separate endpoint - Option A flow)
const uploadPostMedia = async (req, res) => {
    let transcodedPath = null;
    let originalPath = req.file?.path;

    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const user = req.user; // From protect middleware

        // User-specific folder path for post media
        const userFolder = `user_uploads/${user._id}/posts`;

        // Check if uploaded file is a video
        const isVideoFile = isVideo(req.file.mimetype);
        let fileToUpload = originalPath;

        // Transcode video if it's a video file
        if (isVideoFile) {
            try {
                console.log('Transcoding video for post...');
                const transcoded = await transcodeVideo(originalPath);
                transcodedPath = transcoded.outputPath;
                fileToUpload = transcodedPath;
                console.log('Video transcoded successfully:', transcodedPath);
            } catch (transcodeError) {
                console.error('Video transcoding failed:', transcodeError);
                // Continue with original file if transcoding fails
                console.warn('Uploading original video without transcoding');
            }
        }

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(fileToUpload, {
            folder: userFolder,
            upload_preset: process.env.UPLOAD_PRESET,
            resource_type: 'auto', // auto = images + videos
            quality: '100'
        });

        // Determine media type
        const mediaType = result.resource_type === 'video' ? 'video' : 'image';

        // Save upload record to database
        const mediaRecord = await Media.create({
            userId: user._id,
            url: result.secure_url,
            public_id: result.public_id,
            format: result.format,
            resource_type: result.resource_type,
            fileSize: result.bytes || req.file.size,
            originalFilename: req.file.originalname,
            folder: result.folder || userFolder
        });

        // Cleanup transcoded file after successful upload
        if (transcodedPath) {
            await cleanupFile(transcodedPath);
        }

        return res.status(200).json({
            success: true,
            message: 'Media uploaded successfully',
            data: {
                url: result.secure_url,
                publicId: result.public_id,
                type: mediaType,
                format: result.format,
                fileSize: result.bytes || req.file.size,
                mediaId: mediaRecord._id
            }
        });

    } catch (error) {
        console.error('Post media upload error:', error);
        
        // Cleanup transcoded file on error
        if (transcodedPath) {
            await cleanupFile(transcodedPath);
        }

        return res.status(500).json({
            success: false,
            message: 'Failed to upload media',
            error: error.message
        });
    }
};

// Helper function to get reaction index
const getReactionIndex = (reaction) => {
    const reactionMap = { happy: 0, sad: 1, angry: 2, hug: 3, wow: 4, like: 5 };
    return reactionMap[reaction] || 5; // default to like
};

// Helper function to find user's current reaction
const findUserReaction = (likes, userId) => {
    if (!likes || !Array.isArray(likes)) return null;
    const reactionTypes = ['happy', 'sad', 'angry', 'hug', 'wow', 'like'];
    for (let i = 0; i < likes.length; i++) {
        if (likes[i] && likes[i].includes && likes[i].some(id => id.toString() === userId.toString())) {
            return reactionTypes[i];
        }
    }
    return null;
};

// Like/Unlike a post (toggle) with reactions
const toggleLikePost = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { id } = req.params;
        const { reaction } = req.body;

        // Validate post ID
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid post ID'
            });
        }

        // Validate reaction type
        const allowedReactions = ['happy', 'sad', 'angry', 'hug', 'wow', 'like'];
        const reactionType = reaction || 'like';
        if (!allowedReactions.includes(reactionType)) {
            return res.status(400).json({
                success: false,
                message: `Invalid reaction. Must be one of: ${allowedReactions.join(', ')}`
            });
        }

        // Find the post
        const post = await Post.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        // Initialize likes array if not present
        if (!post.likes || !Array.isArray(post.likes)) {
            post.likes = [[], [], [], [], [], []]; // [happy, sad, angry, hug, wow, like]
        }

        // Ensure we have 6 arrays
        while (post.likes.length < 6) {
            post.likes.push([]);
        }

        // Find user's current reaction
        const existingReaction = findUserReaction(post.likes, user._id);
        const reactionIndex = getReactionIndex(reactionType);

        let action;
        let currentReaction = null;

        if (existingReaction) {
            const existingIndex = getReactionIndex(existingReaction);
            // Remove user from existing reaction array
            post.likes[existingIndex] = post.likes[existingIndex].filter(
                userId => userId.toString() !== user._id.toString()
            );

            // If same reaction, just remove it (unlike)
            if (existingReaction === reactionType) {
                action = 'unliked';
            } else {
                // Add to new reaction array
                if (!post.likes[reactionIndex].some(id => id.toString() === user._id.toString())) {
                    post.likes[reactionIndex].push(user._id);
                }
                action = 'reaction_updated';
                currentReaction = reactionType;
            }
        } else {
            // Add new reaction
            if (!post.likes[reactionIndex].some(id => id.toString() === user._id.toString())) {
                post.likes[reactionIndex].push(user._id);
            }
            action = 'liked';
            currentReaction = reactionType;
        }

        // Save the post
        await post.save();

        // Populate for response
        await post.populate('userId', 'firstName lastName name email profileImage');

        // Extract userId as string
        const userIdString = post.userId._id ? post.userId._id.toString() : post.userId.toString();
        const userInfo = post.userId._id ? {
            id: post.userId._id.toString(),
            firstName: post.userId.firstName,
            lastName: post.userId.lastName,
            name: post.userId.name,
            email: post.userId.email,
            profileImage: post.userId.profileImage
        } : null;

        return res.status(200).json({
            success: true,
            message: `Post ${action} successfully`,
            data: {
                post: {
                    id: post._id.toString(),
                    userId: userIdString,
                    user: userInfo,
                    caption: post.caption,
                    media: post.media,
                    likes: post.likes || [[], [], [], [], [], []],
                    comments: limitComments(post.comments),
                    likeCount: post.likeCount,
                    commentCount: post.commentCount,
                    createdAt: post.createdAt,
                    updatedAt: post.updatedAt
                },
                action: action,
                reaction: currentReaction,
                isLiked: action !== 'unliked'
            }
        });

    } catch (error) {
        console.error('Toggle like post error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to toggle like on post',
            error: error.message
        });
    }
};

// Delete a post
const deletePost = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { id } = req.params;

        // Validate post ID
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid post ID'
            });
        }

        // Find the post
        const post = await Post.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        // Check if the user owns the post
        if (post.userId.toString() !== user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete this post'
            });
        }

        // Delete media from Cloudinary if any
        if (post.media && post.media.length > 0) {
            for (const mediaItem of post.media) {
                try {
                    await cloudinary.uploader.destroy(mediaItem.publicId, { invalidate: true });
                } catch (cloudinaryError) {
                    console.warn(`Failed to delete media ${mediaItem.publicId} from Cloudinary:`, cloudinaryError.message);
                    // Continue with deletion even if Cloudinary deletion fails
                }
            }
        }

        // Delete the post from database
        await Post.findByIdAndDelete(id);

        return res.status(200).json({
            success: true,
            message: 'Post deleted successfully'
        });

    } catch (error) {
        console.error('Delete post error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete post',
            error: error.message
        });
    }
};

// Add a comment to a post (text only)
const addComment = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { id } = req.params;
        const { text } = req.body;

        // Validate post ID
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid post ID'
            });
        }

        // Validate comment text
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Comment text is required'
            });
        }

        if (text.length > 1000) {
            return res.status(400).json({
                success: false,
                message: 'Comment text must be 1000 characters or less'
            });
        }

        // Find the post
        const post = await Post.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        // Add the comment
        post.comments.push({
            userId: user._id,
            text: text.trim(),
            createdAt: new Date()
        });

        // Save the post
        await post.save();

        // Populate for response
        await post.populate('userId', 'firstName lastName name email profileImage');
        await post.populate('comments.userId', 'firstName lastName name profileImage');

        // Extract userId as string
        const userIdString = post.userId._id ? post.userId._id.toString() : post.userId.toString();
        const userInfo = post.userId._id ? {
            id: post.userId._id.toString(),
            firstName: post.userId.firstName,
            lastName: post.userId.lastName,
            name: post.userId.name,
            email: post.userId.email,
            profileImage: post.userId.profileImage
        } : null;

        // Get the newly added comment (last one in array)
        const newComment = post.comments[post.comments.length - 1];
        const commentUserInfo = newComment.userId._id ? {
            id: newComment.userId._id.toString(),
            firstName: newComment.userId.firstName,
            lastName: newComment.userId.lastName,
            name: newComment.userId.name,
            profileImage: newComment.userId.profileImage
        } : null;

        return res.status(201).json({
            success: true,
            message: 'Comment added successfully',
            data: {
                comment: {
                    id: newComment._id.toString(),
                    userId: newComment.userId._id ? newComment.userId._id.toString() : newComment.userId.toString(),
                    user: commentUserInfo,
                    text: newComment.text,
                    createdAt: newComment.createdAt
                },
                post: {
                    id: post._id.toString(),
                    userId: userIdString,
                    user: userInfo,
                    caption: post.caption,
                    media: post.media,
                    likes: post.likes || [[], [], [], [], [], []],
                    comments: limitComments(post.comments),
                    likeCount: post.likeCount,
                    commentCount: post.commentCount,
                    createdAt: post.createdAt,
                    updatedAt: post.updatedAt
                }
            }
        });

    } catch (error) {
        console.error('Add comment error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to add comment',
            error: error.message
        });
    }
};

// Delete a comment from a post
const deleteComment = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { id, commentId } = req.params;

        // Validate post ID
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid post ID'
            });
        }

        // Validate comment ID
        if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid comment ID'
            });
        }

        // Find the post
        const post = await Post.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        // Find the comment
        const commentIndex = post.comments.findIndex(
            comment => comment._id.toString() === commentId
        );

        if (commentIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Comment not found'
            });
        }

        const comment = post.comments[commentIndex];

        // Check if user is the comment owner or post owner
        const isCommentOwner = comment.userId.toString() === user._id.toString();
        const isPostOwner = post.userId.toString() === user._id.toString();

        if (!isCommentOwner && !isPostOwner) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete this comment'
            });
        }

        // Remove the comment
        post.comments.splice(commentIndex, 1);

        // Save the post
        await post.save();

        // Populate for response
        await post.populate('userId', 'firstName lastName name email profileImage');
        await post.populate('comments.userId', 'firstName lastName name profileImage');

        // Extract userId as string
        const userIdString = post.userId._id ? post.userId._id.toString() : post.userId.toString();
        const userInfo = post.userId._id ? {
            id: post.userId._id.toString(),
            firstName: post.userId.firstName,
            lastName: post.userId.lastName,
            name: post.userId.name,
            email: post.userId.email,
            profileImage: post.userId.profileImage
        } : null;

        return res.status(200).json({
            success: true,
            message: 'Comment deleted successfully',
            data: {
                post: {
                    id: post._id.toString(),
                    userId: userIdString,
                    user: userInfo,
                    caption: post.caption,
                    media: post.media,
                    likes: post.likes || [[], [], [], [], [], []],
                    comments: limitComments(post.comments),
                    likeCount: post.likeCount,
                    commentCount: post.commentCount,
                    createdAt: post.createdAt,
                    updatedAt: post.updatedAt
                }
            }
        });

    } catch (error) {
        console.error('Delete comment error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete comment',
            error: error.message
        });
    }
};

// Report a post
const reportPost = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { id } = req.params;
        const { reason } = req.body;

        // Validate post ID
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid post ID'
            });
        }

        // Validate reason
        if (!reason || !REPORT_REASONS.includes(reason)) {
            return res.status(400).json({
                success: false,
                message: `Invalid reason. Must be one of: ${REPORT_REASONS.join(', ')}`
            });
        }

        // Find the post
        const post = await Post.findById(id);

        if (!post) {
            return res.status(404).json({
                success: false,
                message: 'Post not found'
            });
        }

        // Check if user is trying to report their own post
        if (post.userId.toString() === user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'You cannot report your own post'
            });
        }

        // Check if user already reported this post
        const existingReport = await Report.findOne({
            userId: user._id,
            contentId: id,
            contentType: 'post'
        });

        if (existingReport) {
            return res.status(400).json({
                success: false,
                message: 'You have already reported this post'
            });
        }

        // Create the report
        await Report.create({
            userId: user._id,
            contentId: id,
            contentType: 'post',
            reason: reason
        });

        // Check if 2 users reported with the same reason
        const reportsWithSameReason = await Report.countDocuments({
            contentId: id,
            contentType: 'post',
            reason: reason
        });

        let postDeleted = false;

        if (reportsWithSameReason >= 2) {
            // Delete media from Cloudinary if any
            if (post.media && post.media.length > 0) {
                for (const mediaItem of post.media) {
                    try {
                        await cloudinary.uploader.destroy(mediaItem.publicId, { invalidate: true });
                    } catch (cloudinaryError) {
                        console.warn(`Failed to delete media ${mediaItem.publicId} from Cloudinary:`, cloudinaryError.message);
                    }
                }
            }

            // Delete the post from database
            await Post.findByIdAndDelete(id);
            postDeleted = true;

            console.log(`Post ${id} deleted due to 2 reports with reason: ${reason}`);
        }

        return res.status(200).json({
            success: true,
            message: postDeleted 
                ? 'Post reported and removed due to multiple reports with the same reason'
                : 'Post reported successfully',
            data: {
                postDeleted: postDeleted
            }
        });

    } catch (error) {
        console.error('Report post error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to report post',
            error: error.message
        });
    }
};

module.exports = {
    createPost,
    getAllPosts,
    getMyPosts,
    getUserPosts,
    uploadPostMedia,
    toggleLikePost,
    deletePost,
    addComment,
    deleteComment,
    reportPost
};


const Post = require('../models/Post');
const User = require('../models/User');
const cloudinary = require('../config/cloudinary');
const Media = require('../models/Media');
const mongoose = require('mongoose');

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
                    likes: post.likes || [],
                    comments: post.comments || [],
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

        // Get posts sorted by newest first
        const posts = await Post.find()
            .populate('userId', 'firstName lastName name email profileImage')
            .populate('likes.userId', 'firstName lastName name profileImage')
            .populate('comments.userId', 'firstName lastName name profileImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get total count for pagination
        const totalPosts = await Post.countDocuments();

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
                        likes: post.likes || [],
                        comments: post.comments || [],
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

        // Get posts for this user
        const posts = await Post.find({ userId: id })
            .populate('userId', 'firstName lastName name email profileImage')
            .populate('likes.userId', 'firstName lastName name profileImage')
            .populate('comments.userId', 'firstName lastName name profileImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get total count for pagination
        const totalPosts = await Post.countDocuments({ userId: id });

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
                        likes: post.likes || [],
                        comments: post.comments || [],
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

        // Upload to Cloudinary
        const result = await cloudinary.uploader.upload(req.file.path, {
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
        return res.status(500).json({
            success: false,
            message: 'Failed to upload media',
            error: error.message
        });
    }
};

module.exports = {
    createPost,
    getAllPosts,
    getUserPosts,
    uploadPostMedia
};


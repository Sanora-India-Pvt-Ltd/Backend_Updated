const Story = require('../models/Story');
const User = require('../models/User');
const cloudinary = require('../config/cloudinary');
const mongoose = require('mongoose');
const { transcodeVideo, isVideo, cleanupFile } = require('../services/videoTranscoder');

// Create a new story
const createStory = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { url, publicId, type, format } = req.body;

        // Validate required fields
        if (!url || !publicId || !type) {
            return res.status(400).json({
                success: false,
                message: 'Story must have url, publicId, and type (image/video)'
            });
        }

        // Validate media type
        if (!['image', 'video'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Media type must be either "image" or "video"'
            });
        }

        // Calculate expiration time (24 hours from now)
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        // Create the story
        const story = await Story.create({
            userId: user._id,
            media: {
                url: url,
                publicId: publicId,
                type: type,
                format: format || null
            },
            expiresAt: expiresAt
        });

        // Populate user info for response
        await story.populate('userId', 'firstName lastName name email profileImage');

        // Extract userId as string (handle both populated and non-populated cases)
        const userIdString = story.userId._id ? story.userId._id.toString() : story.userId.toString();
        const userInfo = story.userId._id ? {
            id: story.userId._id.toString(),
            firstName: story.userId.firstName,
            lastName: story.userId.lastName,
            name: story.userId.name,
            email: story.userId.email,
            profileImage: story.userId.profileImage
        } : null;

        return res.status(201).json({
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
        });

    } catch (error) {
        console.error('Create story error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create story',
            error: error.message
        });
    }
};

// Get stories for a specific user
const getUserStories = async (req, res) => {
    try {
        const { id } = req.params;

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

        // Check if viewing user is blocked by the story owner or vice versa
        if (viewingUserId) {
            const viewingUser = await User.findById(viewingUserId).select('blockedUsers');
            const storyOwner = await User.findById(id).select('blockedUsers');

            // Check if viewing user has blocked the story owner
            if (viewingUser.blockedUsers && viewingUser.blockedUsers.includes(id)) {
                return res.status(403).json({
                    success: false,
                    message: 'You cannot view stories from a blocked user'
                });
            }

            // Check if story owner has blocked the viewing user
            if (storyOwner.blockedUsers && storyOwner.blockedUsers.includes(viewingUserId)) {
                return res.status(403).json({
                    success: false,
                    message: 'Content not available'
                });
            }
        }

        // Get active stories (expiresAt > now) for this user
        const now = new Date();
        const stories = await Story.find({
            userId: id,
            expiresAt: { $gt: now }
        })
        .populate('userId', 'firstName lastName name email profileImage')
        .sort({ createdAt: -1 }); // Most recent first

        return res.status(200).json({
            success: true,
            message: 'User stories retrieved successfully',
            data: {
                user: {
                    id: user._id.toString(),
                    name: user.name,
                    email: user.email,
                    profileImage: user.profileImage
                },
                stories: stories.map(story => {
                    const userIdString = story.userId._id ? story.userId._id.toString() : story.userId.toString();
                    const userInfo = story.userId._id ? {
                        id: story.userId._id.toString(),
                        firstName: story.userId.firstName,
                        lastName: story.userId.lastName,
                        name: story.userId.name,
                        email: story.userId.email,
                        profileImage: story.userId.profileImage
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
        });

    } catch (error) {
        console.error('Get user stories error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve user stories',
            error: error.message
        });
    }
};

// Get all stories from friends (grouped by user)
const getAllFriendsStories = async (req, res) => {
    try {
        const user = req.user; // From protect middleware

        // Get user's friends list and blocked users
        const currentUser = await User.findById(user._id).select('friends blockedUsers');
        if (!currentUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Include current user's own stories as well
        const friendIds = currentUser.friends || [];
        const blockedUserIds = currentUser.blockedUsers || [];
        
        // Filter out blocked users from friend list
        const unblockedFriendIds = friendIds.filter(
            friendId => !blockedUserIds.some(blockedId => blockedId.toString() === friendId.toString())
        );
        
        const allUserIds = [...unblockedFriendIds, user._id]; // Keep as ObjectIds for MongoDB query

        // Get active stories (expiresAt > now) from friends and self
        const now = new Date();
        let stories = await Story.find({
            userId: { $in: allUserIds },
            expiresAt: { $gt: now }
        })
            .populate('userId', 'firstName lastName name email profileImage')
            .sort({ createdAt: -1 }); // Most recent first

        // Also filter out stories from users who have blocked the current user
        const usersWhoBlockedMe = await User.find({
            blockedUsers: user._id
        }).select('_id').lean();
        const blockedByUserIds = new Set(usersWhoBlockedMe.map(u => u._id.toString()));
        
        stories = stories.filter(story => {
            const storyUserId = story.userId._id ? story.userId._id.toString() : story.userId.toString();
            return !blockedByUserIds.has(storyUserId);
        });

        // Group stories by user
        const storiesByUser = {};
        stories.forEach(story => {
            const userIdString = story.userId._id ? story.userId._id.toString() : story.userId.toString();
            
            if (!storiesByUser[userIdString]) {
                const userInfo = story.userId._id ? {
                    id: story.userId._id.toString(),
                    firstName: story.userId.firstName,
                    lastName: story.userId.lastName,
                    name: story.userId.name,
                    email: story.userId.email,
                    profileImage: story.userId.profileImage
                } : null;

                storiesByUser[userIdString] = {
                    user: userInfo,
                    stories: []
                };
            }

            storiesByUser[userIdString].stories.push({
                id: story._id.toString(),
                userId: userIdString,
                media: story.media,
                createdAt: story.createdAt,
                expiresAt: story.expiresAt
            });
        });

        // Convert to array and sort by most recent story
        const storiesArray = Object.values(storiesByUser).sort((a, b) => {
            const aLatest = a.stories[0]?.createdAt || new Date(0);
            const bLatest = b.stories[0]?.createdAt || new Date(0);
            return bLatest - aLatest; // Most recent first
        });

        return res.status(200).json({
            success: true,
            message: 'Friends stories retrieved successfully',
            data: {
                stories: storiesArray,
                count: storiesArray.length,
                totalStories: stories.length
            }
        });

    } catch (error) {
        console.error('Get all friends stories error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve friends stories',
            error: error.message
        });
    }
};

// Upload media for stories (similar to posts)
const uploadStoryMedia = async (req, res) => {
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

        // User-specific folder path for story media
        const userFolder = `user_uploads/${user._id}/stories`;

        // Check if uploaded file is a video
        const isVideoFile = isVideo(req.file.mimetype);
        let fileToUpload = originalPath;

        // Transcode video if it's a video file
        if (isVideoFile) {
            try {
                console.log('Transcoding video for story...');
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

        // Cleanup transcoded file after successful upload
        if (transcodedPath) {
            await cleanupFile(transcodedPath);
        }

        return res.status(200).json({
            success: true,
            message: 'Story media uploaded successfully',
            data: {
                url: result.secure_url,
                publicId: result.public_id,
                type: mediaType,
                format: result.format,
                fileSize: result.bytes || req.file.size
            }
        });

    } catch (error) {
        console.error('Story media upload error:', error);
        
        // Cleanup transcoded file on error
        if (transcodedPath) {
            await cleanupFile(transcodedPath);
        }

        return res.status(500).json({
            success: false,
            message: 'Failed to upload story media',
            error: error.message
        });
    }
};

module.exports = {
    createStory,
    getUserStories,
    getAllFriendsStories,
    uploadStoryMedia
};


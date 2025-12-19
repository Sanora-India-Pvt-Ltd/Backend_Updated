const { Reel, ALLOWED_CONTENT_TYPES } = require('../models/Reel');
const User = require('../models/User');
const cloudinary = require('../config/cloudinary');
const Media = require('../models/Media');
const mongoose = require('mongoose');
const { transcodeVideo, isVideo, cleanupFile } = require('../services/videoTranscoder');
const fs = require('fs').promises;
const { Report, REPORT_REASONS } = require('../models/Report');

// Helper function to get all blocked user IDs (checks both root and social.blockedUsers)
const getBlockedUserIds = async (userId) => {
    try {
        const user = await User.findById(userId).select('blockedUsers social.blockedUsers');
        if (!user) return [];
        
        // Get blocked users from both locations
        const rootBlocked = user.blockedUsers || [];
        const socialBlocked = user.social?.blockedUsers || [];
        
        // Combine and deduplicate
        const allBlocked = [...rootBlocked, ...socialBlocked];
        const uniqueBlocked = [...new Set(allBlocked.map(id => id.toString()))];
        
        return uniqueBlocked.map(id => mongoose.Types.ObjectId(id));
    } catch (error) {
        console.error('Error getting blocked users:', error);
        return [];
    }
};

// Helper function to check if a user is blocked (checks both locations)
const isUserBlocked = async (blockerId, blockedId) => {
    try {
        const blockedUserIds = await getBlockedUserIds(blockerId);
        return blockedUserIds.some(id => id.toString() === blockedId.toString());
    } catch (error) {
        console.error('Error checking if user is blocked:', error);
        return false;
    }
};

// Helper function to limit comments to 15 most recent and format with user info
const limitComments = (comments) => {
    if (!comments || !Array.isArray(comments)) return [];
    // Sort by createdAt descending (newest first) and take first 15
    return comments
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 15)
        .map(comment => {
            const commentUserId = comment.userId._id ? comment.userId._id.toString() : comment.userId.toString();
            const commentUserInfo = comment.userId._id ? {
                id: comment.userId._id.toString(),
                firstName: comment.userId.profile?.name?.first,
                lastName: comment.userId.profile?.name?.last,
                name: comment.userId.profile?.name?.full,
                profileImage: comment.userId.profile?.profileImage
            } : null;

            return {
                id: comment._id.toString(),
                userId: commentUserId,
                user: commentUserInfo,
                text: comment.text,
                createdAt: comment.createdAt
            };
        });
};

// Upload video for reels
const uploadReelMedia = async (req, res) => {
    let transcodedPath = null;
    let originalPath = req.file?.path;
    let cleanupFiles = []; // Track files for cleanup

    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }

        const user = req.user; // From protect middleware
        const userFolder = `user_uploads/${user._id}/reels`;
        originalPath = req.file.path;
        cleanupFiles.push(originalPath); // Track original for cleanup

        // Check if uploaded file is a video
        const isVideoFile = isVideo(req.file.mimetype);
        let fileToUpload = originalPath;

        // Transcode video if it's a video file
        if (isVideoFile) {
            try {
                console.log('[ReelController] Starting video transcoding for reel...');
                console.log('[ReelController] Input:', originalPath);
                console.log('[ReelController] Target: H.264 Baseline Profile 3.1, yuv420p, faststart');
                
                const transcoded = await transcodeVideo(originalPath);
                transcodedPath = transcoded.outputPath;
                fileToUpload = transcodedPath;
                cleanupFiles.push(transcodedPath); // Track transcoded for cleanup
                
                console.log('[ReelController] Video transcoded successfully');
                console.log('[ReelController] Output:', transcodedPath);
                console.log('[ReelController] Dimensions:', `${transcoded.width}x${transcoded.height}`);
                console.log('[ReelController] File size:', (transcoded.fileSize / 1024 / 1024).toFixed(2), 'MB');
            } catch (transcodeError) {
                console.error('[ReelController] Video transcoding failed:', transcodeError);
                console.error('[ReelController] Error details:', {
                    message: transcodeError.message,
                    stack: transcodeError.stack
                });
                // Continue with original file if transcoding fails
                console.warn('[ReelController] Uploading original video without transcoding (may have compatibility issues)');
                fileToUpload = originalPath;
            }
        }

        // Upload to Cloudinary with transformations to ensure compatible format
        // Note: Since we already transcoded with H.264 Baseline 3.1, yuv420p, and faststart,
        // we only need to tell Cloudinary to preserve the codec format
        const uploadOptions = {
            folder: userFolder,
            upload_preset: process.env.UPLOAD_PRESET,
            resource_type: 'auto', // auto = images + videos
            quality: 'auto',
            format: 'mp4', // Force MP4 format
            // Video-specific parameters to ensure Cloudinary preserves our transcoded format
            ...(isVideoFile && {
                // Cloudinary video codec parameters (faststart is already in the file from transcoding)
                video_codec: 'h264',
                video_profile: 'baseline',
                video_level: '3.1'
                // Note: pixel_format and faststart are already in the transcoded file, no need to specify
            })
        };

        // Log upload details
        if (isVideoFile && transcodedPath) {
            console.log('[ReelController] Uploading transcoded video to Cloudinary');
            console.log('[ReelController] Format: H.264 Baseline Profile 3.1, yuv420p, faststart');
        }

        let result;
        try {
            result = await cloudinary.uploader.upload(fileToUpload, uploadOptions);
            console.log('[ReelController] Video uploaded successfully to Cloudinary');
        } catch (uploadError) {
            console.error('[ReelController] Cloudinary upload error:', uploadError);
            throw new Error(`Failed to upload video to Cloudinary: ${uploadError.message}`);
        }

        // Determine media type
        const mediaType = result.resource_type === 'video' ? 'video' : 'image';
        if (mediaType !== 'video') {
            // Cleanup files
            for (const file of cleanupFiles) {
                await cleanupFile(file, 'invalid_media_type');
            }
            return res.status(400).json({
                success: false,
                message: 'Reels require video uploads (resource_type must be video)'
            });
        }

        // Save upload record to database
        let mediaRecord;
        try {
            mediaRecord = await Media.create({
                userId: user._id,
                url: result.secure_url,
                public_id: result.public_id,
                format: result.format,
                resource_type: result.resource_type,
                fileSize: result.bytes || req.file.size,
                originalFilename: req.file.originalname,
                folder: result.folder || userFolder
            });
            console.log('[ReelController] Media record created:', mediaRecord._id);
        } catch (dbError) {
            console.error('[ReelController] Database error:', dbError);
            // Cleanup files on database error
            for (const file of cleanupFiles) {
                await cleanupFile(file, 'database_error');
            }
            throw new Error(`Failed to save media record: ${dbError.message}`);
        }

        // Cleanup temporary files after successful upload
        for (const file of cleanupFiles) {
            await cleanupFile(file, 'success');
        }

        console.log('[ReelController] Reel media upload completed successfully');

        return res.status(200).json({
            success: true,
            message: 'Reel media uploaded successfully',
            data: {
                url: result.secure_url,
                publicId: result.public_id,
                type: mediaType,
                format: result.format,
                duration: result.duration,
                width: result.width,
                height: result.height,
                fileSize: result.bytes || req.file.size,
                mediaId: mediaRecord._id
            }
        });
    } catch (error) {
        console.error('[ReelController] Reel media upload error:', error);
        console.error('[ReelController] Error details:', {
            message: error.message,
            stack: error.stack,
            originalPath,
            transcodedPath
        });
        
        // Cleanup all temporary files on error
        for (const file of cleanupFiles) {
            await cleanupFile(file, 'error');
        }

        return res.status(500).json({
            success: false,
            message: 'Failed to upload reel media',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Create a new reel with video upload and creation in one API call (combined)
const createReelWithUpload = async (req, res) => {
    let transcodedPath = null;
    let originalPath = req.file?.path;
    let cleanupFiles = []; // Track files for cleanup

    try {
        const user = req.user;
        const { caption, contentType, visibility } = req.body;

        // Validate contentType
        if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
            return res.status(400).json({
                success: false,
                message: `contentType is required and must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}`
            });
        }

        // Validate that video file is provided
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Video file is required for reel creation'
            });
        }

        const userFolder = `user_uploads/${user._id}/reels`;
        originalPath = req.file.path;
        cleanupFiles.push(originalPath); // Track original for cleanup

        // Check if uploaded file is a video
        const isVideoFile = isVideo(req.file.mimetype);
        let fileToUpload = originalPath;

        if (!isVideoFile) {
            // Cleanup files
            for (const file of cleanupFiles) {
                await cleanupFile(file, 'invalid_media_type');
            }
            return res.status(400).json({
                success: false,
                message: 'Reels require video uploads'
            });
        }

        // Transcode video if it's a video file
        if (isVideoFile) {
            try {
                console.log('[ReelController] Starting video transcoding for reel...');
                console.log('[ReelController] Input:', originalPath);
                console.log('[ReelController] Target: H.264 Baseline Profile 3.1, yuv420p, faststart');
                
                const transcoded = await transcodeVideo(originalPath);
                transcodedPath = transcoded.outputPath;
                fileToUpload = transcodedPath;
                cleanupFiles.push(transcodedPath); // Track transcoded for cleanup
                
                console.log('[ReelController] Video transcoded successfully');
                console.log('[ReelController] Output:', transcodedPath);
                console.log('[ReelController] Dimensions:', `${transcoded.width}x${transcoded.height}`);
                console.log('[ReelController] File size:', (transcoded.fileSize / 1024 / 1024).toFixed(2), 'MB');
            } catch (transcodeError) {
                console.error('[ReelController] Video transcoding failed:', transcodeError);
                console.error('[ReelController] Error details:', {
                    message: transcodeError.message,
                    stack: transcodeError.stack
                });
                // Continue with original file if transcoding fails
                console.warn('[ReelController] Uploading original video without transcoding (may have compatibility issues)');
                fileToUpload = originalPath;
            }
        }

        // Upload to Cloudinary with transformations to ensure compatible format
        const uploadOptions = {
            folder: userFolder,
            upload_preset: process.env.UPLOAD_PRESET,
            resource_type: 'auto', // auto = images + videos
            quality: 'auto',
            format: 'mp4', // Force MP4 format
            // Video-specific parameters to ensure Cloudinary preserves our transcoded format
            ...(isVideoFile && {
                video_codec: 'h264',
                video_profile: 'baseline',
                video_level: '3.1'
            })
        };

        // Log upload details
        if (isVideoFile && transcodedPath) {
            console.log('[ReelController] Uploading transcoded video to Cloudinary');
            console.log('[ReelController] Format: H.264 Baseline Profile 3.1, yuv420p, faststart');
        }

        let result;
        try {
            result = await cloudinary.uploader.upload(fileToUpload, uploadOptions);
            console.log('[ReelController] Video uploaded successfully to Cloudinary');
        } catch (uploadError) {
            console.error('[ReelController] Cloudinary upload error:', uploadError);
            // Cleanup files on upload error
            for (const file of cleanupFiles) {
                await cleanupFile(file, 'upload_error');
            }
            throw new Error(`Failed to upload video to Cloudinary: ${uploadError.message}`);
        }

        // Determine media type
        const mediaType = result.resource_type === 'video' ? 'video' : 'image';
        if (mediaType !== 'video') {
            // Cleanup files
            for (const file of cleanupFiles) {
                await cleanupFile(file, 'invalid_media_type');
            }
            return res.status(400).json({
                success: false,
                message: 'Reels require video uploads (resource_type must be video)'
            });
        }

        // Save upload record to database
        let mediaRecord;
        try {
            mediaRecord = await Media.create({
                userId: user._id,
                url: result.secure_url,
                public_id: result.public_id,
                format: result.format,
                resource_type: result.resource_type,
                fileSize: result.bytes || req.file.size,
                originalFilename: req.file.originalname,
                folder: result.folder || userFolder
            });
            console.log('[ReelController] Media record created:', mediaRecord._id);
        } catch (dbError) {
            console.error('[ReelController] Database error:', dbError);
            // Cleanup files on database error
            for (const file of cleanupFiles) {
                await cleanupFile(file, 'database_error');
            }
            throw new Error(`Failed to save media record: ${dbError.message}`);
        }

        // Cleanup temporary files after successful upload
        for (const file of cleanupFiles) {
            await cleanupFile(file, 'success');
        }

        // Create the reel
        const reel = await Reel.create({
            userId: user._id,
            caption: caption || '',
            media: {
                url: result.secure_url,
                publicId: result.public_id,
                thumbnailUrl: result.secure_url, // Use video URL as thumbnail for now
                type: mediaType,
                format: result.format || '',
                duration: result.duration,
                dimensions: result.width && result.height ? {
                    width: result.width,
                    height: result.height
                } : undefined,
                size: result.bytes || req.file.size
            },
            contentType,
            visibility: visibility || 'public'
        });

        // Populate user info for response
        await reel.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');

        // Extract userId as string (handle both populated and non-populated cases)
        const userIdString = reel.userId._id ? reel.userId._id.toString() : reel.userId.toString();
        const userInfo = reel.userId._id ? {
            id: reel.userId._id.toString(),
            firstName: reel.userId.profile?.name?.first,
            lastName: reel.userId.profile?.name?.last,
            name: reel.userId.profile?.name?.full,
            email: reel.userId.profile?.email,
            profileImage: reel.userId.profile?.profileImage
        } : null;

        console.log('[ReelController] Reel created successfully with upload');

        return res.status(201).json({
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
                    comments: limitComments(reel.comments),
                    likeCount: reel.likeCount,
                    commentCount: reel.commentCount,
                    createdAt: reel.createdAt,
                    updatedAt: reel.updatedAt
                }
            }
        });

    } catch (error) {
        console.error('[ReelController] Create reel with upload error:', error);
        console.error('[ReelController] Error details:', {
            message: error.message,
            stack: error.stack,
            originalPath,
            transcodedPath
        });
        
        // Cleanup all temporary files on error
        for (const file of cleanupFiles) {
            await cleanupFile(file, 'error');
        }

        return res.status(500).json({
            success: false,
            message: 'Failed to create reel',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Create a new reel with mandatory contentType key (legacy - for backward compatibility)
const createReel = async (req, res) => {
    try {
        const user = req.user;
        const { caption, media, contentType, visibility } = req.body;

        if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
            return res.status(400).json({
                success: false,
                message: `contentType is required and must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}`
            });
        }

        if (!media || !media.url || !media.publicId || !media.type) {
            return res.status(400).json({
                success: false,
                message: 'media must include url, publicId, and type'
            });
        }

        if (media.type !== 'video') {
            return res.status(400).json({
                success: false,
                message: 'Reels media type must be "video"'
            });
        }

        // Create the reel
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
                dimensions: media.width && media.height ? {
                    width: media.width,
                    height: media.height
                } : undefined,
                size: media.fileSize || media.size
            },
            contentType,
            visibility: visibility || 'public'
        });

        // Populate user info for response
        await reel.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');

        // Extract userId as string (handle both populated and non-populated cases)
        const userIdString = reel.userId._id ? reel.userId._id.toString() : reel.userId.toString();
        const userInfo = reel.userId._id ? {
            id: reel.userId._id.toString(),
            firstName: reel.userId.profile?.name?.first,
            lastName: reel.userId.profile?.name?.last,
            name: reel.userId.profile?.name?.full,
            email: reel.userId.profile?.email,
            profileImage: reel.userId.profile?.profileImage
        } : null;

        return res.status(201).json({
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
                    comments: limitComments(reel.comments),
                    likeCount: reel.likeCount,
                    commentCount: reel.commentCount,
                    createdAt: reel.createdAt,
                    updatedAt: reel.updatedAt
                }
            }
        });
    } catch (error) {
        console.error('Create reel error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create reel',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Fetch reels with simple pagination
const getReels = async (req, res) => {
    try {
        const contentType = req.query.contentType;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Validation
        if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
            return res.status(400).json({
                success: false,
                message: `Invalid contentType. Must be one of: ${ALLOWED_CONTENT_TYPES.join(', ')}`
            });
        }

        // Get user ID from token if authenticated (optional for feed)
        const userId = req.user?._id;

        // Build query to exclude reported reels and blocked users' reels if user is authenticated
        let query = { contentType, visibility: 'public' };
        let blockedUserIds = [];
        
        if (userId) {
            // Get current user's blocked users (from both locations)
            blockedUserIds = await getBlockedUserIds(userId);

            // Get all reel IDs that the user has reported
            const reportedReelIds = await Report.find({
                userId: userId,
                contentType: 'reel'
            }).distinct('contentId');

            // Exclude reported reels from feed
            const excludeIds = [...reportedReelIds];
            if (excludeIds.length > 0) {
                query._id = { $nin: excludeIds };
            }

            // Get users who have blocked the current user (check both locations)
            const usersWhoBlockedMe = await User.find({
                $or: [
                    { blockedUsers: userId },
                    { 'social.blockedUsers': userId }
                ]
            }).select('_id').lean();
            const blockedByUserIds = usersWhoBlockedMe.map(u => u._id);

            // Exclude reels from blocked users AND users who have blocked the current user
            const allExcludedUserIds = [...blockedUserIds, ...blockedByUserIds];
            if (allExcludedUserIds.length > 0) {
                query.userId = { $nin: allExcludedUserIds };
            }
        }

        // Get reels sorted by newest first
        // We need to populate profile.visibility to check privacy
        const reels = await Reel.find(query)
            .populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage profile.visibility social.friends friends')
            .populate('comments.userId', 'profile.name.first profile.name.last profile.name.full profile.profileImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit * 2); // Get more reels to account for filtering

        // Filter reels based on privacy settings and blocking
        const visibleReels = [];
        for (const reel of reels) {
            const reelUserId = reel.userId._id ? reel.userId._id : reel.userId;
            
            // If viewing user is authenticated, check blocking in both directions
            if (userId) {
                // If viewing own reels, always allow
                if (reelUserId.toString() === userId.toString()) {
                    visibleReels.push(reel);
                    if (visibleReels.length >= limit) break;
                    continue;
                }

                // Check if viewing user has blocked the reel owner (check both locations)
                const viewerBlocked = await isUserBlocked(userId, reelUserId);
                if (viewerBlocked) {
                    continue; // Viewer has blocked the reel owner, skip
                }

                // Check if reel owner has blocked the viewing user (check both locations)
                const ownerBlocked = await isUserBlocked(reelUserId, userId);
                if (ownerBlocked) {
                    continue; // Reel owner has blocked the viewer, skip
                }
            }
            
            // Check if profile is private
            const postOwner = await User.findById(reelUserId).select('profile.visibility social.friends friends');
            if (!postOwner) continue;

            const isProfilePrivate = postOwner.profile?.visibility === 'private';
            
            // If profile is public, reel is visible
            if (!isProfilePrivate) {
                visibleReels.push(reel);
                if (visibleReels.length >= limit) break;
                continue;
            }

            // If profile is private, check if viewer is a friend
            if (userId) {
                const friendsList = postOwner.social?.friends || postOwner.friends || [];
                const isFriend = friendsList.some(friendId => 
                    friendId.toString() === userId.toString()
                );

                if (isFriend) {
                    visibleReels.push(reel);
                    if (visibleReels.length >= limit) break;
                }
            }
            // If not authenticated and profile is private, skip
        }

        // Get total count for pagination
        const totalReels = await Reel.countDocuments(query);

        return res.status(200).json({
            success: true,
            message: 'Reels retrieved successfully',
            data: {
                reels: visibleReels.map(reel => {
                    const userIdString = reel.userId._id ? reel.userId._id.toString() : reel.userId.toString();
                    const userInfo = reel.userId._id ? {
                        id: reel.userId._id.toString(),
                        firstName: reel.userId.profile?.name?.first,
                        lastName: reel.userId.profile?.name?.last,
                        name: reel.userId.profile?.name?.full,
                        email: reel.userId.profile?.email,
                        profileImage: reel.userId.profile?.profileImage
                    } : null;

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
                        comments: limitComments(reel.comments),
                        likeCount: reel.likeCount,
                        commentCount: reel.commentCount,
                        createdAt: reel.createdAt,
                        updatedAt: reel.updatedAt
                    };
                }),
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalReels / limit),
                    totalReels: totalReels,
                    hasNextPage: visibleReels.length === limit && page < Math.ceil(totalReels / limit),
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Get reels error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve reels',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get reels by user ID with pagination
const getUserReels = async (req, res) => {
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
        const user = await User.findById(id).select('profile.visibility social.friends friends blockedUsers');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get user ID from token if authenticated (optional)
        const viewingUserId = req.user?._id;

        // Check if viewing user is blocked by the reel owner or vice versa
        if (viewingUserId) {
            // Check if viewing user has blocked the reel owner (check both locations)
            const viewingUserBlocked = await isUserBlocked(viewingUserId, id);
            if (viewingUserBlocked) {
                return res.status(403).json({
                    success: false,
                    message: 'You cannot view reels from a blocked user'
                });
            }

            // Check if reel owner has blocked the viewing user (check both locations)
            const ownerBlocked = await isUserBlocked(id, viewingUserId);
            if (ownerBlocked) {
                return res.status(403).json({
                    success: false,
                    message: 'Content not available'
                });
            }

            // Check privacy settings: if profile is private and viewer is not a friend, deny access
            const isProfilePrivate = user.profile?.visibility === 'private';
            if (isProfilePrivate) {
                const friendsList = user.social?.friends || user.friends || [];
                const isFriend = friendsList.some(friendId => 
                    friendId.toString() === viewingUserId.toString()
                );

                // If viewing own reels, always allow
                if (id.toString() !== viewingUserId.toString() && !isFriend) {
                    return res.status(403).json({
                        success: false,
                        message: 'This user has a private profile. Only friends can view their reels.'
                    });
                }
            }
        } else {
            // If not authenticated and profile is private, deny access
            const isProfilePrivate = user.profile?.visibility === 'private';
            if (isProfilePrivate) {
                return res.status(403).json({
                    success: false,
                    message: 'This user has a private profile. Please log in to view their reels.'
                });
            }
        }

        // Build query to exclude reported reels if viewing user is authenticated
        let query = { userId: id };
        if (viewingUserId) {
            // Get all reel IDs that the viewing user has reported
            const reportedReelIds = await Report.find({
                userId: viewingUserId,
                contentType: 'reel'
            }).distinct('contentId');

            // Exclude reported reels
            if (reportedReelIds.length > 0) {
                query._id = { $nin: reportedReelIds };
            }
        }

        // Get reels for this user
        const reels = await Reel.find(query)
            .populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage')
            .populate('comments.userId', 'profile.name.first profile.name.last profile.name.full profile.profileImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get total count for pagination
        const totalReels = await Reel.countDocuments(query);

        return res.status(200).json({
            success: true,
            message: 'User reels retrieved successfully',
            data: {
                user: {
                    id: user._id.toString(),
                    name: user.profile?.name?.full,
                    email: user.profile?.email,
                    profileImage: user.profile?.profileImage
                },
                reels: reels.map(reel => {
                    const userIdString = reel.userId._id ? reel.userId._id.toString() : reel.userId.toString();
                    const userInfo = reel.userId._id ? {
                        id: reel.userId._id.toString(),
                        firstName: reel.userId.profile?.name?.first,
                        lastName: reel.userId.profile?.name?.last,
                        name: reel.userId.profile?.name?.full,
                        email: reel.userId.profile?.email,
                        profileImage: reel.userId.profile?.profileImage
                    } : null;

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
                        comments: limitComments(reel.comments),
                        likeCount: reel.likeCount,
                        commentCount: reel.commentCount,
                        createdAt: reel.createdAt,
                        updatedAt: reel.updatedAt
                    };
                }),
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalReels / limit),
                    totalReels: totalReels,
                    hasNextPage: page < Math.ceil(totalReels / limit),
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Get user reels error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve user reels',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
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

// Like/Unlike a reel (toggle) with reactions
const toggleLikeReel = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { id } = req.params;
        const { reaction } = req.body;

        // Validate reel ID
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reel ID'
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

        // Find the reel
        const reel = await Reel.findById(id);

        if (!reel) {
            return res.status(404).json({
                success: false,
                message: 'Reel not found'
            });
        }

        // Initialize likes array if not present
        if (!reel.likes || !Array.isArray(reel.likes)) {
            reel.likes = [[], [], [], [], [], []]; // [happy, sad, angry, hug, wow, like]
        }

        // Ensure we have 6 arrays
        while (reel.likes.length < 6) {
            reel.likes.push([]);
        }

        // Find user's current reaction
        const existingReaction = findUserReaction(reel.likes, user._id);
        const reactionIndex = getReactionIndex(reactionType);

        let action;
        let currentReaction = null;

        if (existingReaction) {
            const existingIndex = getReactionIndex(existingReaction);
            // Remove user from existing reaction array
            reel.likes[existingIndex] = reel.likes[existingIndex].filter(
                userId => userId.toString() !== user._id.toString()
            );

            // If same reaction, just remove it (unlike)
            if (existingReaction === reactionType) {
                action = 'unliked';
            } else {
                // Add to new reaction array
                if (!reel.likes[reactionIndex].some(id => id.toString() === user._id.toString())) {
                    reel.likes[reactionIndex].push(user._id);
                }
                action = 'reaction_updated';
                currentReaction = reactionType;
            }
        } else {
            // Add new reaction
            if (!reel.likes[reactionIndex].some(id => id.toString() === user._id.toString())) {
                reel.likes[reactionIndex].push(user._id);
            }
            action = 'liked';
            currentReaction = reactionType;
        }

        // Save the reel
        await reel.save();

        // Populate for response
        await reel.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');
        await reel.populate('comments.userId', 'profile.name.first profile.name.last profile.name.full profile.profileImage');

        // Extract userId as string
        const userIdString = reel.userId._id ? reel.userId._id.toString() : reel.userId.toString();
        const userInfo = reel.userId._id ? {
            id: reel.userId._id.toString(),
            firstName: reel.userId.profile?.name?.first,
            lastName: reel.userId.profile?.name?.last,
            name: reel.userId.profile?.name?.full,
            email: reel.userId.profile?.email,
            profileImage: reel.userId.profile?.profileImage
        } : null;

        return res.status(200).json({
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
                    comments: limitComments(reel.comments),
                    likeCount: reel.likeCount,
                    commentCount: reel.commentCount,
                    createdAt: reel.createdAt,
                    updatedAt: reel.updatedAt,
                    action: action,
                    reaction: currentReaction,
                    isLiked: action !== 'unliked'
                }
            }
        });

    } catch (error) {
        console.error('Toggle like reel error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to toggle like on reel',
            error: error.message
        });
    }
};

// Add a comment to a reel (text only)
const addComment = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { id } = req.params;
        const { text } = req.body;

        // Validate reel ID
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reel ID'
            });
        }

        // Validate comment text
        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Comment text is required'
            });
        }

        if (text.length > 500) {
            return res.status(400).json({
                success: false,
                message: 'Comment text must be 500 characters or less'
            });
        }

        // Find the reel
        const reel = await Reel.findById(id);

        if (!reel) {
            return res.status(404).json({
                success: false,
                message: 'Reel not found'
            });
        }

        // Add the comment
        reel.comments.push({
            userId: user._id,
            text: text.trim(),
            createdAt: new Date()
        });

        // Save the reel
        await reel.save();

        // Populate for response
        await reel.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');
        await reel.populate('comments.userId', 'profile.name.first profile.name.last profile.name.full profile.profileImage');

        // Extract userId as string
        const userIdString = reel.userId._id ? reel.userId._id.toString() : reel.userId.toString();
        const userInfo = reel.userId._id ? {
            id: reel.userId._id.toString(),
            firstName: reel.userId.profile?.name?.first,
            lastName: reel.userId.profile?.name?.last,
            name: reel.userId.profile?.name?.full,
            email: reel.userId.profile?.email,
            profileImage: reel.userId.profile?.profileImage
        } : null;

        // Get the newly added comment (last one in array)
        const newComment = reel.comments[reel.comments.length - 1];
        const commentUserInfo = newComment.userId._id ? {
            id: newComment.userId._id.toString(),
            firstName: newComment.userId.profile?.name?.first,
            lastName: newComment.userId.profile?.name?.last,
            name: newComment.userId.profile?.name?.full,
            profileImage: newComment.userId.profile?.profileImage
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
                    comments: limitComments(reel.comments),
                    likeCount: reel.likeCount,
                    commentCount: reel.commentCount,
                    createdAt: reel.createdAt,
                    updatedAt: reel.updatedAt
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

// Delete a comment from a reel
const deleteComment = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { id, commentId } = req.params;

        // Validate reel ID
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reel ID'
            });
        }

        // Validate comment ID
        if (!commentId || !mongoose.Types.ObjectId.isValid(commentId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid comment ID'
            });
        }

        // Find the reel
        const reel = await Reel.findById(id);

        if (!reel) {
            return res.status(404).json({
                success: false,
                message: 'Reel not found'
            });
        }

        // Find the comment
        const commentIndex = reel.comments.findIndex(
            comment => comment._id.toString() === commentId
        );

        if (commentIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Comment not found'
            });
        }

        const comment = reel.comments[commentIndex];

        // Check if user is the comment owner or reel owner
        const isCommentOwner = comment.userId.toString() === user._id.toString();
        const isReelOwner = reel.userId.toString() === user._id.toString();

        if (!isCommentOwner && !isReelOwner) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete this comment'
            });
        }

        // Remove the comment
        reel.comments.splice(commentIndex, 1);

        // Save the reel
        await reel.save();

        // Populate for response
        await reel.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');
        await reel.populate('comments.userId', 'profile.name.first profile.name.last profile.name.full profile.profileImage');

        // Extract userId as string
        const userIdString = reel.userId._id ? reel.userId._id.toString() : reel.userId.toString();
        const userInfo = reel.userId._id ? {
            id: reel.userId._id.toString(),
            firstName: reel.userId.profile?.name?.first,
            lastName: reel.userId.profile?.name?.last,
            name: reel.userId.profile?.name?.full,
            email: reel.userId.profile?.email,
            profileImage: reel.userId.profile?.profileImage
        } : null;

        return res.status(200).json({
            success: true,
            message: 'Comment deleted successfully',
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
                    comments: limitComments(reel.comments),
                    likeCount: reel.likeCount,
                    commentCount: reel.commentCount,
                    createdAt: reel.createdAt,
                    updatedAt: reel.updatedAt
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

// Delete a reel
const deleteReel = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { id } = req.params;

        // Validate reel ID
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reel ID'
            });
        }

        // Find the reel
        const reel = await Reel.findById(id);

        if (!reel) {
            return res.status(404).json({
                success: false,
                message: 'Reel not found'
            });
        }

        // Check if the user owns the reel
        if (reel.userId.toString() !== user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete this reel'
            });
        }

        // Delete media from Cloudinary if any
        if (reel.media && reel.media.publicId) {
            try {
                // Delete the main video
                await cloudinary.uploader.destroy(reel.media.publicId, { 
                    resource_type: 'video',
                    invalidate: true 
                });
                console.log(`[ReelController] Deleted video ${reel.media.publicId} from Cloudinary`);
            } catch (cloudinaryError) {
                console.warn(`[ReelController] Failed to delete video ${reel.media.publicId} from Cloudinary:`, cloudinaryError.message);
                // Continue with deletion even if Cloudinary deletion fails
            }

            // Delete thumbnail if it exists and has a different publicId
            if (reel.media.thumbnailUrl && reel.media.thumbnailUrl !== reel.media.url) {
                try {
                    // Extract publicId from thumbnail URL if it's different
                    // Thumbnails are usually generated, so we might need to extract the publicId
                    const thumbnailPublicId = reel.media.thumbnailUrl.split('/').slice(-2).join('/').split('.')[0];
                    if (thumbnailPublicId && thumbnailPublicId !== reel.media.publicId) {
                        await cloudinary.uploader.destroy(thumbnailPublicId, { 
                            resource_type: 'image',
                            invalidate: true 
                        });
                        console.log(`[ReelController] Deleted thumbnail ${thumbnailPublicId} from Cloudinary`);
                    }
                } catch (thumbnailError) {
                    console.warn(`[ReelController] Failed to delete thumbnail from Cloudinary:`, thumbnailError.message);
                    // Continue with deletion even if thumbnail deletion fails
                }
            }
        }

        // Delete the reel from database
        await Reel.findByIdAndDelete(id);

        console.log(`[ReelController] Reel ${id} deleted successfully by user ${user._id}`);

        return res.status(200).json({
            success: true,
            message: 'Reel deleted successfully'
        });

    } catch (error) {
        console.error('[ReelController] Delete reel error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete reel',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// Report a reel
const reportReel = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { id } = req.params;
        const { reason } = req.body;

        // Validate reel ID
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reel ID'
            });
        }

        // Validate reason
        if (!reason || !REPORT_REASONS.includes(reason)) {
            return res.status(400).json({
                success: false,
                message: `Invalid reason. Must be one of: ${REPORT_REASONS.join(', ')}`
            });
        }

        // Find the reel
        const reel = await Reel.findById(id);

        if (!reel) {
            return res.status(404).json({
                success: false,
                message: 'Reel not found'
            });
        }

        // Check if user is trying to report their own reel
        if (reel.userId.toString() === user._id.toString()) {
            return res.status(400).json({
                success: false,
                message: 'You cannot report your own reel'
            });
        }

        // Check if user already reported this reel
        const existingReport = await Report.findOne({
            userId: user._id,
            contentId: id,
            contentType: 'reel'
        });

        if (existingReport) {
            return res.status(400).json({
                success: false,
                message: 'You have already reported this reel'
            });
        }

        // Create the report
        await Report.create({
            userId: user._id,
            contentId: id,
            contentType: 'reel',
            reason: reason
        });

        // Check if 2 users reported with the same reason
        const reportsWithSameReason = await Report.countDocuments({
            contentId: id,
            contentType: 'reel',
            reason: reason
        });

        let reelDeleted = false;

        if (reportsWithSameReason >= 2) {
            // Delete media from Cloudinary if any
            if (reel.media && reel.media.publicId) {
                try {
                    // Delete the main video
                    await cloudinary.uploader.destroy(reel.media.publicId, { 
                        resource_type: 'video',
                        invalidate: true 
                    });
                    console.log(`[ReelController] Deleted video ${reel.media.publicId} from Cloudinary due to reports`);
                } catch (cloudinaryError) {
                    console.warn(`[ReelController] Failed to delete video ${reel.media.publicId} from Cloudinary:`, cloudinaryError.message);
                }

                // Delete thumbnail if it exists and has a different publicId
                if (reel.media.thumbnailUrl && reel.media.thumbnailUrl !== reel.media.url) {
                    try {
                        const thumbnailPublicId = reel.media.thumbnailUrl.split('/').slice(-2).join('/').split('.')[0];
                        if (thumbnailPublicId && thumbnailPublicId !== reel.media.publicId) {
                            await cloudinary.uploader.destroy(thumbnailPublicId, { 
                                resource_type: 'image',
                                invalidate: true 
                            });
                            console.log(`[ReelController] Deleted thumbnail ${thumbnailPublicId} from Cloudinary due to reports`);
                        }
                    } catch (thumbnailError) {
                        console.warn(`[ReelController] Failed to delete thumbnail from Cloudinary:`, thumbnailError.message);
                    }
                }
            }

            // Delete the reel from database
            await Reel.findByIdAndDelete(id);
            reelDeleted = true;

            console.log(`[ReelController] Reel ${id} deleted due to 2 reports with reason: ${reason}`);
        }

        return res.status(200).json({
            success: true,
            message: reelDeleted 
                ? 'Reel reported and removed due to multiple reports with the same reason'
                : 'Reel reported successfully',
            data: {
                reelDeleted: reelDeleted
            }
        });

    } catch (error) {
        console.error('[ReelController] Report reel error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to report reel',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

module.exports = {
    uploadReelMedia,
    createReelWithUpload,
    createReel,
    getReels,
    getUserReels,
    toggleLikeReel,
    addComment,
    deleteComment,
    deleteReel,
    reportReel
};


const Post = require('../../models/social/Post');
const Comment = require('../../models/social/Comment');
const User = require('../../models/authorization/User');
const StorageService = require('../../services/storage.service');
const Media = require('../../models/Media');
const mongoose = require('mongoose');
const Like = require('../../models/social/Like');
const { isVideo } = require('../../services/videoTranscoder');
const { Report, REPORT_REASONS } = require('../../models/social/Report');
const videoTranscodingQueue = require('../../services/videoTranscodingQueue');
const VideoTranscodingJob = require('../../models/VideoTranscodingJob');
const { batchGetUsers, batchGetBlockedUsers, batchCheckBlocked, batchCheckFriendships } = require('../../utils/userDataLoader');

// Helper function to get all blocked user IDs
const getBlockedUserIds = async (userId) => {
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
};

// Helper function to check if a user is blocked
const isUserBlocked = async (blockerId, blockedId) => {
    try {
        const blockedUserIds = await getBlockedUserIds(blockerId);
        return blockedUserIds.some(id => id.toString() === blockedId.toString());
    } catch (error) {
        console.error('Error checking if user is blocked:', error);
        return false;
    }
};

// Helper function to check if two users are friends
const areFriends = async (userId1, userId2) => {
    try {
        const user1 = await User.findById(userId1).select('social.friends');
        if (!user1) return false;
        
        const friendsList = user1.social?.friends || [];
        return friendsList.some(friendId => 
            friendId.toString() === userId2.toString()
        );
    } catch (error) {
        console.error('Error checking friendship:', error);
        return false;
    }
};

// Batch version: Check visibility for multiple posts at once
const batchCheckPostVisibility = async (postUserIds, viewingUserId) => {
    try {
        const visibilityMap = new Map();
        
        // If no viewing user (public feed), only show posts from public profiles
        if (!viewingUserId) {
            const users = await batchGetUsers(postUserIds, 'profile.visibility');
            for (const [userId, user] of users.entries()) {
                visibilityMap.set(userId, user?.profile?.visibility !== 'private');
            }
            return visibilityMap;
        }

        const viewingUserIdStr = viewingUserId.toString();
        
        // Batch fetch all post owners' data
        const postOwners = await batchGetUsers(postUserIds, 'profile.visibility social.friends');
        
        // Batch check blocked relationships
        const blockPairs = [];
        for (const postUserId of postUserIds) {
            const postUserIdStr = postUserId.toString();
            if (postUserIdStr !== viewingUserIdStr) {
                blockPairs.push({ blockerId: viewingUserIdStr, blockedId: postUserIdStr });
                blockPairs.push({ blockerId: postUserIdStr, blockedId: viewingUserIdStr });
            }
        }
        const blockedMap = await batchCheckBlocked(blockPairs);
        
        // Batch check friendships for private profiles
        const friendshipPairs = [];
        for (const postUserId of postUserIds) {
            const postUserIdStr = postUserId.toString();
            if (postUserIdStr !== viewingUserIdStr) {
                const owner = postOwners.get(postUserIdStr);
                if (owner?.profile?.visibility === 'private') {
                    friendshipPairs.push({ userId1: postUserIdStr, userId2: viewingUserIdStr });
                }
            }
        }
        const friendsMap = friendshipPairs.length > 0 
            ? await batchCheckFriendships(friendshipPairs)
            : new Map();

        // Determine visibility for each post
        for (const postUserId of postUserIds) {
            const postUserIdStr = postUserId.toString();
            
            // Own posts are always visible
            if (postUserIdStr === viewingUserIdStr) {
                visibilityMap.set(postUserIdStr, true);
                continue;
            }

            const owner = postOwners.get(postUserIdStr);
            if (!owner) {
                visibilityMap.set(postUserIdStr, false);
                continue;
            }

            // Check if blocked
            const viewerBlockedKey = `${viewingUserIdStr}_${postUserIdStr}`;
            const ownerBlockedKey = `${postUserIdStr}_${viewingUserIdStr}`;
            if (blockedMap.get(viewerBlockedKey) || blockedMap.get(ownerBlockedKey)) {
                visibilityMap.set(postUserIdStr, false);
                continue;
            }

            // Check visibility based on profile privacy
            const isProfilePrivate = owner.profile?.visibility === 'private';
            if (!isProfilePrivate) {
                visibilityMap.set(postUserIdStr, true);
            } else {
                // Private profile - check if viewer is a friend
                const friendshipKey = `${postUserIdStr}_${viewingUserIdStr}`;
                visibilityMap.set(postUserIdStr, friendsMap.get(friendshipKey) || false);
            }
        }

        return visibilityMap;
    } catch (error) {
        console.error('Error batch checking post visibility:', error);
        // Return all false on error (fail closed)
        const visibilityMap = new Map();
        for (const postUserId of postUserIds) {
            visibilityMap.set(postUserId.toString(), false);
        }
        return visibilityMap;
    }
};

// Legacy single-post version (for backward compatibility)
const isPostVisible = async (postUserId, viewingUserId) => {
    const visibilityMap = await batchCheckPostVisibility([postUserId], viewingUserId);
    return visibilityMap.get(postUserId.toString()) || false;
};

// Helper function to enrich media with transcoding status
const enrichMediaWithTranscodingStatus = async (mediaArray) => {
    if (!mediaArray || mediaArray.length === 0) {
        return mediaArray;
    }

    // Find all video media items
    const videoMedia = mediaArray.filter(m => m.type === 'video');
    if (videoMedia.length === 0) {
        return mediaArray; // No videos, return as-is
    }

    // Get all publicIds for video media (handle both camelCase and snake_case)
    const publicIds = videoMedia.map(m => m.publicId || m.public_id).filter(Boolean);

    if (publicIds.length === 0) {
        return mediaArray; // No valid publicIds
    }

    // Fetch Media records in batch
    const mediaRecords = await Media.find({
        public_id: { $in: publicIds }
    }).select('public_id url isTranscoding transcodingCompleted transcodingJobId').lean();

    // Create a map of publicId -> Media record (normalize to handle both formats)
    const mediaMap = new Map();
    mediaRecords.forEach(record => {
        // Map by both formats for compatibility
        mediaMap.set(record.public_id, record);
    });

    // Enrich media array with transcoding status
    return mediaArray.map(mediaItem => {
        if (mediaItem.type !== 'video') {
            return mediaItem; // Images don't need transcoding status
        }

        // Get publicId (handle both camelCase and snake_case)
        const publicId = mediaItem.publicId || mediaItem.public_id;
        const mediaRecord = mediaMap.get(publicId);
        if (!mediaRecord) {
            // Media record not found, return original with unknown status
            return {
                ...mediaItem,
                isTranscoding: false,
                transcodingCompleted: false,
                transcodingStatus: 'unknown'
            };
        }

        // If transcoding is complete, use the transcoded URL from Media record
        // Otherwise, use the original URL but include status
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

        // If transcoding is complete, use the transcoded URL (from Media record)
        // The Media record's URL should be the transcoded version after completion
        if (mediaRecord.transcodingCompleted && mediaRecord.url) {
            // Use transcoded URL from Media record
            enrichedMedia.url = mediaRecord.url;
            enrichedMedia.publicId = mediaRecord.public_id; // Update publicId to match
            enrichedMedia.isPlayable = true;
            if (process.env.NODE_ENV === 'development') {
                console.log(`[PostController] Using transcoded video URL for publicId ${publicId}`);
            }
        } else if (mediaRecord.isTranscoding) {
            // Still transcoding - return original URL but mark as not playable yet
            enrichedMedia.isPlayable = false;
        } else {
            // Transcoding not started or failed - return original URL
            enrichedMedia.isPlayable = true; // Original might work on some devices
        }

        return enrichedMedia;
    });
};

// Helper function to fetch and format comments from Comment collection
const getFormattedComments = async (contentId, limit = 15) => {
    try {
        const comments = await Comment.getCommentsByContent(contentId, 'post', {
            page: 1,
            limit: limit,
            sortBy: 'createdAt',
            sortOrder: -1
        });

        return comments.map(comment => {
            const commentUserId = comment.userId._id ? comment.userId._id.toString() : comment.userId.toString();
            const commentUserInfo = comment.userId._id ? {
                id: comment.userId._id.toString(),
                firstName: comment.userId.profile?.name?.first,
                lastName: comment.userId.profile?.name?.last,
                name: comment.userId.profile?.name?.full,
                profileImage: comment.userId.profile?.profileImage
            } : null;

            // Format replies (limit to 5 most recent)
            const formattedReplies = (comment.replies || [])
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 5)
                .map(reply => {
                    const replyUserId = reply.userId._id ? reply.userId._id.toString() : reply.userId.toString();
                    const replyUserInfo = reply.userId._id ? {
                        id: reply.userId._id.toString(),
                        firstName: reply.userId.profile?.name?.first,
                        lastName: reply.userId.profile?.name?.last,
                        name: reply.userId.profile?.name?.full,
                        profileImage: reply.userId.profile?.profileImage
                    } : null;

                    return {
                        id: reply._id.toString(),
                        userId: replyUserId,
                        user: replyUserInfo,
                        text: reply.text,
                        createdAt: reply.createdAt
                    };
                });

            return {
                id: comment._id.toString(),
                userId: commentUserId,
                user: commentUserInfo,
                text: comment.text,
                createdAt: comment.createdAt,
                replies: formattedReplies,
                replyCount: comment.replyCount || formattedReplies.length
            };
        });
    } catch (error) {
        console.error('Error fetching comments:', error);
        return [];
    }
};

// Create a new post (with optional file uploads)
const createPost = async (req, res) => {
    const uploadedFiles = [];

    try {
        const user = req.user; // From protect middleware
        const { caption } = req.body;
        
        // Get files from request (can be single file or array of files)
        const files = req.files || (req.file ? [req.file] : []);
        
        // Validate that at least caption or media is provided
        const hasCaption = caption && caption.trim().length > 0;
        const hasMedia = files && files.length > 0;

        if (!hasCaption && !hasMedia) {
            return res.status(400).json({
                success: false,
                message: 'Post must have either a caption or media (or both)'
            });
        }

        // Process uploaded files (if any)
        const media = [];
        
        if (hasMedia) {

            for (const file of files) {
                let transcodingJobId = null; // Declare outside try block so it's accessible in catch
                try {
                    // Check if uploaded file is a video
                    const isVideoFile = isVideo(file.mimetype);

                    // Handle file upload based on storage type
                    // diskUpload provides file.path, multer-s3 provides file.location and file.key
                    let uploadResult;
                    if (file.path) {
                        // File was saved to disk (diskStorage) - upload to S3
                        uploadResult = await StorageService.uploadFromPath(file.path);
                        
                        // For videos: queue transcoding job (async processing)
                        if (isVideoFile) {
                            try {
                                console.log('[PostController] Queueing video transcoding job...');
                                transcodingJobId = await videoTranscodingQueue.addJob({
                                    inputPath: file.path,
                                    userId: user._id.toString(),
                                    jobType: 'post',
                                    originalFilename: file.originalname
                                });
                                console.log('[PostController] Video transcoding job queued:', transcodingJobId);
                            } catch (queueError) {
                                console.error('[PostController] Failed to queue transcoding job:', queueError);
                                // Continue without transcoding if queueing fails
                            }
                        }
                    } else if (file.location && file.key) {
                        // File was already uploaded via multer-s3
                        uploadResult = await StorageService.uploadFromRequest(file);
                    } else {
                        throw new Error('Invalid file object: missing path (diskStorage) or location/key (multer-s3)');
                    }

                    // Determine media type from mimetype
                    const mediaType = isVideoFile ? 'video' : 'image';
                    const format = file.mimetype.split('/')[1] || 'unknown';

                    // Save upload record to database
                    const mediaRecord = await Media.create({
                        userId: user._id,
                        url: uploadResult.url,
                        public_id: uploadResult.key, // Store S3 key in public_id field for backward compatibility
                        format: format,
                        resource_type: mediaType,
                        fileSize: file.size,
                        originalFilename: file.originalname,
                        folder: 'user_uploads',
                        provider: uploadResult.provider,
                        transcodingJobId: transcodingJobId || null,
                        isTranscoding: isVideoFile && transcodingJobId ? true : false
                    });

                    // Store callback data for later (after post is created) if video transcoding
                    if (isVideoFile && transcodingJobId) {
                        uploadedFiles.push({
                            _callbackData: {
                                transcodingJobId,
                                mediaRecordId: mediaRecord._id.toString(),
                                publicId: uploadResult.key,
                                postId: null // Will be set after post creation
                            }
                        });
                    }

                    uploadedFiles.push({
                        url: uploadResult.url,
                        publicId: uploadResult.key, // Use key as publicId
                        type: mediaType,
                        format: format
                    });

                    media.push({
                        url: uploadResult.url,
                        publicId: uploadResult.key, // Use key as publicId
                        type: mediaType,
                        format: format || null,
                        transcodingJobId: transcodingJobId || null,
                        isTranscoding: isVideoFile && transcodingJobId ? true : false
                    });

                } catch (fileError) {
                    console.error('Error processing file:', fileError);
                    // If transcoding job was created, mark it as failed
                    if (transcodingJobId) {
                        try {
                            await VideoTranscodingJob.findByIdAndUpdate(transcodingJobId, {
                                status: 'failed',
                                error: fileError.message
                            });
                        } catch (updateError) {
                            console.error('Error updating job status:', updateError);
                        }
                    }
                    // Continue with other files, but log the error
                    console.warn(`Failed to process file ${file.originalname}, continuing with other files...`);
                }
            }
        }

        // Create the post
        const post = await Post.create({
            userId: user._id,
            caption: caption || '',
            media: media
        });

        // Set up callbacks for video transcoding completion (after post is created)
        for (const fileData of uploadedFiles) {
            if (fileData._callbackData) {
                const { transcodingJobId, mediaRecordId, publicId } = fileData._callbackData;
                
                // Update callback data with post ID
                fileData._callbackData.postId = post._id.toString();
                
                // Listen for job completion
                const onJobComplete = async ({ jobId, result: transcodedResult }) => {
                    if (jobId === transcodingJobId) {
                        try {
                            console.log(`[PostController] Transcoding completed for job ${jobId}, updating media ${mediaRecordId}`);
                            
                            // Upload transcoded video to S3
                            const transcodedKey = `transcoded/${publicId}`;
                            const transcodedUploadResult = await StorageService.uploadFromPath(
                                transcodedResult.outputPath,
                                transcodedKey
                            );

                            // Update media record with transcoded version
                            await Media.findByIdAndUpdate(mediaRecordId, {
                                url: transcodedUploadResult.url,
                                public_id: transcodedUploadResult.key,
                                fileSize: transcodedResult.fileSize,
                                isTranscoding: false,
                                transcodingCompleted: true
                            });
                            console.log(`[PostController] Media record ${mediaRecordId} updated with transcoded URL: ${transcodedUploadResult.url}`);

                            // Update post media array with new URL - use more reliable method
                            // First, find the post to verify it exists
                            const postDoc = await Post.findById(post._id);
                            if (!postDoc) {
                                console.error(`[PostController] Post ${post._id} not found for transcoding update`);
                                throw new Error(`Post ${post._id} not found`);
                            }

                            // Find the media item index by publicId
                            const mediaIndex = postDoc.media.findIndex(m => 
                                (m.publicId && m.publicId === publicId) || 
                                (m.public_id && m.public_id === publicId)
                            );

                            if (mediaIndex === -1) {
                                console.error(`[PostController] Media item with publicId ${publicId} not found in Post ${post._id}`);
                                console.error(`[PostController] Post media array:`, JSON.stringify(postDoc.media.map(m => ({ publicId: m.publicId, public_id: m.public_id }))));
                                // Try to update using the transcodingJobId as fallback
                                const fallbackIndex = postDoc.media.findIndex(m => 
                                    m.transcodingJobId && m.transcodingJobId.toString() === transcodingJobId.toString()
                                );
                                if (fallbackIndex !== -1) {
                                    postDoc.media[fallbackIndex].url = transcodedUploadResult.url;
                                    postDoc.media[fallbackIndex].publicId = transcodedUploadResult.key;
                                    postDoc.media[fallbackIndex].isTranscoding = false;
                                    await postDoc.save();
                                    console.log(`[PostController] Post updated using fallback method (transcodingJobId match)`);
                                } else {
                                    throw new Error(`Media item not found in Post ${post._id} by publicId or transcodingJobId`);
                                }
                            } else {
                                // Update using positional operator with verified index
                                const updateResult = await Post.updateOne(
                                    { _id: post._id, [`media.${mediaIndex}.publicId`]: publicId },
                                    { 
                                        $set: { 
                                            [`media.${mediaIndex}.url`]: transcodedUploadResult.url,
                                            [`media.${mediaIndex}.publicId`]: transcodedUploadResult.key,
                                            [`media.${mediaIndex}.isTranscoding`]: false
                                        } 
                                    }
                                );
                                
                                // If positional operator fails, use direct array update
                                if (updateResult.matchedCount === 0) {
                                    console.warn(`[PostController] Positional operator failed, using direct array update`);
                                    postDoc.media[mediaIndex].url = transcodedUploadResult.url;
                                    postDoc.media[mediaIndex].publicId = transcodedUploadResult.key;
                                    postDoc.media[mediaIndex].isTranscoding = false;
                                    await postDoc.save();
                                    console.log(`[PostController] Post updated using direct array update`);
                                } else {
                                    console.log(`[PostController] Post updated successfully: matched=${updateResult.matchedCount}, modified=${updateResult.modifiedCount}`);
                                }
                            }

                            // Cleanup transcoded file
                            const { cleanupFile } = require('../../services/videoTranscoder');
                            await cleanupFile(transcodedResult.outputPath);
                            
                            console.log(`[PostController] Media ${mediaRecordId} updated with transcoded video`);
                            
                            // Remove listener to prevent memory leaks
                            videoTranscodingQueue.removeListener('job:completed', onJobComplete);
                        } catch (updateError) {
                            console.error(`[PostController] Error updating media after transcoding:`, updateError);
                        }
                    }
                };

                videoTranscodingQueue.once('job:completed', onJobComplete);
                
                // Clean up callback data from response
                delete fileData._callbackData;
            }
        }

        // Populate user info for response
        await post.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');

        // Extract userId as string (handle both populated and non-populated cases)
        const userIdString = post.userId._id ? post.userId._id.toString() : post.userId.toString();
        const userInfo = post.userId._id ? {
            id: post.userId._id.toString(),
            firstName: post.userId.profile?.name?.first,
            lastName: post.userId.profile?.name?.last,
            name: post.userId.profile?.name?.full,
            email: post.userId.profile?.email,
            profileImage: post.userId.profile?.profileImage
        } : null;

        // Get comment count
        const commentCount = await post.getCommentCount();
        const comments = await getFormattedComments(post._id, 15);

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
                    comments: comments,
                    likeCount: post.likeCount,
                    commentCount: commentCount,
                    createdAt: post.createdAt,
                    updatedAt: post.updatedAt
                }
            }
        });

    } catch (error) {
        console.error('Create post error:', error);

        // If post creation failed but files were uploaded, try to clean up S3
        if (uploadedFiles.length > 0) {
            console.warn('Post creation failed, but files were uploaded. Consider cleanup.');
            // Note: We don't delete from S3 here as the post might be created later
            // This is a trade-off - you may want to implement cleanup logic if needed
        }

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
            blockedUserIds = await getBlockedUserIds(userId);

            // Get all post IDs that the user has reported
            const reportedPostIds = await Report.find({
                userId: userId,
                contentType: 'post'
            }).distinct('contentId');

            // Exclude reported posts
            const excludeIds = [...reportedPostIds];
            if (excludeIds.length > 0) {
                query._id = { $nin: excludeIds };
            }

            // Get users who have blocked the current user
            const usersWhoBlockedMe = await User.find({
                'social.blockedUsers': userId
            }).select('_id').lean();
            const blockedByUserIds = usersWhoBlockedMe.map(u => u._id);

            // Exclude posts from blocked users AND users who have blocked the current user
            const allExcludedUserIds = [...blockedUserIds, ...blockedByUserIds];
            if (allExcludedUserIds.length > 0) {
                query.userId = { $nin: allExcludedUserIds };
            }
        }

        // Get posts sorted by newest first
        // We need to populate profile.visibility to check privacy
        const posts = await Post.find(query)
            .populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage profile.visibility social.friends')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit * 2); // Get more posts to account for filtering

        // Get all post IDs to fetch like counts in a single query
        const postIds = posts.map(post => post._id);
        const likeCounts = await Like.aggregate([
            { 
                $match: { 
                    content: 'post',
                    contentId: { $in: postIds }
                }
            },
            {
                $project: {
                    contentId: 1,
                    totalLikes: {
                        $reduce: {
                            input: "$likes",
                            initialValue: 0,
                            in: { $add: ["$$value", { $size: "$$this" }] }
                        }
                    }
                }
            }
        ]);

        // Create a map of postId to like count
        const likesMap = new Map();
        likeCounts.forEach(item => {
            likesMap.set(item.contentId.toString(), item.totalLikes);
        });

        // Batch check visibility for all posts at once (fixes N+1 query problem)
        const postUserIds = posts
            .filter(post => post.userId)
            .map(post => post.userId._id ? post.userId._id : post.userId);
        
        const visibilityMap = userId 
            ? await batchCheckPostVisibility(postUserIds, userId)
            : await batchCheckPostVisibility(postUserIds, null);

        // Filter posts based on privacy settings and add like counts
        const visiblePosts = [];
        for (const post of posts) {
            if (!post.userId) {
                continue;
            }
            const postUserId = post.userId._id ? post.userId._id : post.userId;
            const postUserIdStr = postUserId.toString();
            const isVisible = visibilityMap.get(postUserIdStr);
            
            if (isVisible) {
                // Add like count to the post
                post.likeCount = likesMap.get(post._id.toString()) || 0;
                visiblePosts.push(post);
                // Stop once we have enough posts
                if (visiblePosts.length >= limit) break;
            }
        }

        // Get total count for pagination (we'll need to estimate or fetch more)
        // For accurate pagination, we'd need to filter in the query, but that's complex
        // So we'll use the filtered count
        const totalPosts = await Post.countDocuments(query);

        // Fetch comments and comment counts for all visible posts
        const postsWithComments = await Promise.all(
            visiblePosts.map(async (post) => {
                if (!post.userId) {
                    return null;
                }
                const userIdString = post.userId._id ? post.userId._id.toString() : post.userId.toString();
                const userInfo = post.userId._id ? {
                    id: post.userId._id.toString(),
                    firstName: post.userId.profile?.name?.first,
                    lastName: post.userId.profile?.name?.last,
                    name: post.userId.profile?.name?.full,
                    email: post.userId.profile?.email,
                    profileImage: post.userId.profile?.profileImage
                } : null;

                const commentCount = await post.getCommentCount();
                const comments = await getFormattedComments(post._id, 15);
                
                // Enrich media with transcoding status for videos
                const enrichedMedia = await enrichMediaWithTranscodingStatus(post.media || []);

                return {
                    id: post._id.toString(),
                    userId: userIdString,
                    user: userInfo,
                    caption: post.caption,
                    media: enrichedMedia,
                    likes: post.likes || [[], [], [], [], [], []],
                    comments: comments,
                    likeCount: post.likeCount,
                    commentCount: commentCount,
                    createdAt: post.createdAt,
                    updatedAt: post.updatedAt
                };
            })
        );

        return res.status(200).json({
            success: true,
            message: 'Posts retrieved successfully',
            data: {
                posts: postsWithComments.filter(Boolean),
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalPosts / limit),
                    totalPosts: totalPosts,
                    hasNextPage: visiblePosts.length === limit && page < Math.ceil(totalPosts / limit),
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Get all posts error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve postss',
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
            .populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get total count for pagination
        const totalPosts = await Post.countDocuments({ userId: user._id });

        // Fetch comments and comment counts for all posts
        const postsWithComments = await Promise.all(
            posts.map(async (post) => {
                const userIdString = post.userId._id ? post.userId._id.toString() : post.userId.toString();
                const userInfo = post.userId._id ? {
                    id: post.userId._id.toString(),
                    firstName: post.userId.profile?.name?.first,
                    lastName: post.userId.profile?.name?.last,
                    name: post.userId.profile?.name?.full,
                    email: post.userId.profile?.email,
                    profileImage: post.userId.profile?.profileImage
                } : null;

                const commentCount = await post.getCommentCount();
                const comments = await getFormattedComments(post._id, 15);
                
                // Enrich media with transcoding status for videos
                const enrichedMedia = await enrichMediaWithTranscodingStatus(post.media || []);

                return {
                    id: post._id.toString(),
                    userId: userIdString,
                    user: userInfo,
                    caption: post.caption,
                    media: enrichedMedia,
                    likes: post.likes || [[], [], [], [], [], []],
                    comments: comments,
                    likeCount: post.likeCount,
                    commentCount: commentCount,
                    createdAt: post.createdAt,
                    updatedAt: post.updatedAt
                };
            })
        );

        return res.status(200).json({
            success: true,
            message: 'My posts retrieved successfully',
            data: {
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
        const user = await User.findById(id).select('profile.visibility social.friends social.blockedUsers');
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
            // Check if viewing user has blocked the post owner
            const viewingUserBlocked = await isUserBlocked(viewingUserId, id);
            if (viewingUserBlocked) {
                return res.status(403).json({
                    success: false,
                    message: 'You cannot view posts from a blocked user'
                });
            }

            // Check if post owner has blocked the viewing user
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
                const friendsList = user.social?.friends || [];
                const isFriend = friendsList.some(friendId => 
                    friendId.toString() === viewingUserId.toString()
                );

                // If viewing own posts, always allow
                if (id.toString() !== viewingUserId.toString() && !isFriend) {
                    return res.status(403).json({
                        success: false,
                        message: 'This user has a private profile. Only friends can view their posts.'
                    });
                }
            }
        } else {
            // If not authenticated and profile is private, deny access
            const isProfilePrivate = user.profile?.visibility === 'private';
            if (isProfilePrivate) {
                return res.status(403).json({
                    success: false,
                    message: 'This user has a private profile. Please log in to view their posts.'
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
            .populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get total count for pagination
        const totalPosts = await Post.countDocuments(query);

        // Fetch comments and comment counts for all posts
        const postsWithComments = await Promise.all(
            posts.map(async (post) => {
                const userIdString = post.userId._id ? post.userId._id.toString() : post.userId.toString();
                const userInfo = post.userId._id ? {
                    id: post.userId._id.toString(),
                    firstName: post.userId.profile?.name?.first,
                    lastName: post.userId.profile?.name?.last,
                    name: post.userId.profile?.name?.full,
                    email: post.userId.profile?.email,
                    profileImage: post.userId.profile?.profileImage
                } : null;

                const commentCount = await post.getCommentCount();
                const comments = await getFormattedComments(post._id, 15);
                
                // Enrich media with transcoding status for videos
                const enrichedMedia = await enrichMediaWithTranscodingStatus(post.media || []);

                return {
                    id: post._id.toString(),
                    userId: userIdString,
                    user: userInfo,
                    caption: post.caption,
                    media: enrichedMedia,
                    likes: post.likes || [[], [], [], [], [], []],
                    comments: comments,
                    likeCount: post.likeCount,
                    commentCount: commentCount,
                    createdAt: post.createdAt,
                    updatedAt: post.updatedAt
                };
            })
        );

        return res.status(200).json({
            success: true,
            message: 'User posts retrieved successfully',
            data: {
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

        // Check if uploaded file is a video
        const isVideoFile = isVideo(req.file.mimetype);

        // Handle file upload based on storage type
        // diskUpload provides file.path, multer-s3 provides file.location and file.key
        let uploadResult;
        if (req.file.path) {
            // File was saved to disk (diskStorage) - upload to S3
            uploadResult = await StorageService.uploadFromPath(req.file.path);
        } else if (req.file.location && req.file.key) {
            // File was already uploaded via multer-s3
            uploadResult = await StorageService.uploadFromRequest(req.file);
        } else {
            throw new Error('Invalid file object: missing path (diskStorage) or location/key (multer-s3)');
        }

        // Determine media type from mimetype
        const mediaType = isVideoFile ? 'video' : 'image';
        const format = req.file.mimetype.split('/')[1] || 'unknown';

        // Save upload record to database
        const mediaRecord = await Media.create({
            userId: user._id,
            url: uploadResult.url,
            public_id: uploadResult.key, // Store S3 key in public_id field for backward compatibility
            format: format,
            resource_type: mediaType,
            fileSize: req.file.size,
            originalFilename: req.file.originalname,
            folder: 'user_uploads',
            provider: uploadResult.provider
        });

        return res.status(200).json({
            success: true,
            message: 'Media uploaded successfully',
            data: {
                url: uploadResult.url,
                publicId: uploadResult.key, // Use key as publicId
                type: mediaType,
                format: format,
                fileSize: req.file.size,
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
        await post.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');

        // Extract userId as string
        const userIdString = post.userId._id ? post.userId._id.toString() : post.userId.toString();
        const userInfo = post.userId._id ? {
            id: post.userId._id.toString(),
            firstName: post.userId.profile?.name?.first,
            lastName: post.userId.profile?.name?.last,
            name: post.userId.profile?.name?.full,
            email: post.userId.profile?.email,
            profileImage: post.userId.profile?.profileImage
        } : null;

        // Enrich media with transcoding status for videos
        const enrichedMedia = await enrichMediaWithTranscodingStatus(post.media || []);

        return res.status(200).json({
            success: true,
            message: `Post ${action} successfully`,
            data: {
                post: {
                    id: post._id.toString(),
                    userId: userIdString,
                    user: userInfo,
                    caption: post.caption,
                    media: enrichedMedia,
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

        // Delete media from S3 if any
        if (post.media && post.media.length > 0) {
            for (const mediaItem of post.media) {
                try {
                    // publicId contains the S3 key
                    await StorageService.delete(mediaItem.publicId);
                } catch (deleteError) {
                    console.warn(`Failed to delete media ${mediaItem.publicId} from S3:`, deleteError.message);
                    // Continue with deletion even if S3 deletion fails
                }
            }
        }

        // Delete the comment document associated with this post (one document per post)
        await Comment.findOneAndDelete({
            contentId: id,
            contentType: 'post'
        });

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

// DEPRECATED: Use /api/comments endpoint instead
// Add a comment to a post (text only) or reply to a comment
const addComment = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { id } = req.params;
        const { text, parentCommentId } = req.body;

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

        // Validate parentCommentId if provided
        if (parentCommentId && !mongoose.Types.ObjectId.isValid(parentCommentId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid parent comment ID'
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

        let newComment;
        let newReply = null;

        // If parentCommentId is provided, add as a reply to that comment
        if (parentCommentId) {
            // Find the parent comment
            const parentComment = post.comments.id(parentCommentId);
            
            if (!parentComment) {
                return res.status(404).json({
                    success: false,
                    message: 'Parent comment not found'
                });
            }

            // Initialize replies array if it doesn't exist
            if (!parentComment.replies) {
                parentComment.replies = [];
            }

            // Add the reply
            parentComment.replies.push({
                userId: user._id,
                text: text.trim(),
                createdAt: new Date()
            });

            // Save the post
            await post.save();

            // Get the newly added reply
            newReply = parentComment.replies[parentComment.replies.length - 1];
            newComment = parentComment; // For response formatting
        } else {
            // Add as a top-level comment
            post.comments.push({
                userId: user._id,
                text: text.trim(),
                createdAt: new Date()
            });

            // Save the post
            await post.save();

            // Get the newly added comment (last one in array)
            newComment = post.comments[post.comments.length - 1];
        }

        // Populate for response
        await post.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');

        // Extract userId as string
        const userIdString = post.userId._id ? post.userId._id.toString() : post.userId.toString();
        const userInfo = post.userId._id ? {
            id: post.userId._id.toString(),
            firstName: post.userId.profile?.name?.first,
            lastName: post.userId.profile?.name?.last,
            name: post.userId.profile?.name?.full,
            email: post.userId.profile?.email,
            profileImage: post.userId.profile?.profileImage
        } : null;

        // Format response based on whether it's a reply or top-level comment
        if (newReply) {
            const replyUserInfo = newReply.userId._id ? {
                id: newReply.userId._id.toString(),
                firstName: newReply.userId.profile?.name?.first,
                lastName: newReply.userId.profile?.name?.last,
                name: newReply.userId.profile?.name?.full,
                profileImage: newReply.userId.profile?.profileImage
            } : null;

            return res.status(201).json({
                success: true,
                message: 'Reply added successfully',
                data: {
                    reply: {
                        id: newReply._id.toString(),
                        userId: newReply.userId._id ? newReply.userId._id.toString() : newReply.userId.toString(),
                        user: replyUserInfo,
                        text: newReply.text,
                        createdAt: newReply.createdAt,
                        parentCommentId: parentCommentId
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
        } else {
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
                        createdAt: newComment.createdAt,
                        replies: newComment.replies ? newComment.replies.map(reply => {
                            const replyUserId = reply.userId._id ? reply.userId._id.toString() : reply.userId.toString();
                            const replyUserInfo = reply.userId._id ? {
                                id: reply.userId._id.toString(),
                                firstName: reply.userId.profile?.name?.first,
                                lastName: reply.userId.profile?.name?.last,
                                name: reply.userId.profile?.name?.full,
                                profileImage: reply.userId.profile?.profileImage
                            } : null;
                            return {
                                id: reply._id.toString(),
                                userId: replyUserId,
                                user: replyUserInfo,
                                text: reply.text,
                                createdAt: reply.createdAt
                            };
                        }) : [],
                        replyCount: newComment.replies ? newComment.replies.length : 0
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
        }

    } catch (error) {
        console.error('Add comment error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to add comment',
            error: error.message
        });
    }
};

// Delete a comment from a post or a reply to a comment
const deleteComment = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { id, commentId } = req.params;
        const { replyId } = req.query; // Optional: if provided, delete a reply instead of top-level comment

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

        // Validate reply ID if provided
        if (replyId && !mongoose.Types.ObjectId.isValid(replyId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reply ID'
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

        // If replyId is provided, delete the reply
        if (replyId) {
            // Find the parent comment
            const parentComment = post.comments.id(commentId);

            if (!parentComment) {
                return res.status(404).json({
                    success: false,
                    message: 'Parent comment not found'
                });
            }

            // Find the reply
            const reply = parentComment.replies.id(replyId);

            if (!reply) {
                return res.status(404).json({
                    success: false,
                    message: 'Reply not found'
                });
            }

            // Check if user is the reply owner, comment owner, or post owner
            const isReplyOwner = reply.userId.toString() === user._id.toString();
            const isCommentOwner = parentComment.userId.toString() === user._id.toString();
            const isPostOwner = post.userId.toString() === user._id.toString();

            if (!isReplyOwner && !isCommentOwner && !isPostOwner) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to delete this reply'
                });
            }

            // Remove the reply
            reply.remove();

            // Save the post
            await post.save();

            // Populate for response
            await post.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');
            await post.populate('comments.userId', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
            await post.populate('comments.replies.userId', 'profile.name.first profile.name.last profile.name.full profile.profileImage');

            // Extract userId as string
            const userIdString = post.userId._id ? post.userId._id.toString() : post.userId.toString();
            const userInfo = post.userId._id ? {
                id: post.userId._id.toString(),
                firstName: post.userId.profile?.name?.first,
                lastName: post.userId.profile?.name?.last,
                name: post.userId.profile?.name?.full,
                email: post.userId.profile?.email,
                profileImage: post.userId.profile?.profileImage
            } : null;

            return res.status(200).json({
                success: true,
                message: 'Reply deleted successfully',
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
        } else {
            // Delete top-level comment
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

            // Remove the comment (this will also remove all its replies)
            post.comments.splice(commentIndex, 1);

            // Save the post
            await post.save();

            // Populate for response
            await post.populate('userId', 'profile.name.first profile.name.last profile.name.full profile.email profile.profileImage');
            await post.populate('comments.userId', 'profile.name.first profile.name.last profile.name.full profile.profileImage');
            await post.populate('comments.replies.userId', 'profile.name.first profile.name.last profile.name.full profile.profileImage');

            // Extract userId as string
            const userIdString = post.userId._id ? post.userId._id.toString() : post.userId.toString();
            const userInfo = post.userId._id ? {
                id: post.userId._id.toString(),
                firstName: post.userId.profile?.name?.first,
                lastName: post.userId.profile?.name?.last,
                name: post.userId.profile?.name?.full,
                email: post.userId.profile?.email,
                profileImage: post.userId.profile?.profileImage
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
        }

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
            // Delete media from S3 if any
            if (post.media && post.media.length > 0) {
                for (const mediaItem of post.media) {
                    try {
                        // publicId contains the S3 key
                        await StorageService.delete(mediaItem.publicId);
                    } catch (deleteError) {
                        console.warn(`Failed to delete media ${mediaItem.publicId} from S3:`, deleteError.message);
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
    toggleLikePost,
    deletePost,
    // addComment and deleteComment are deprecated - use /api/comments endpoints instead
    addComment, // Deprecated - redirects to use Comment API
    deleteComment, // Deprecated - redirects to use Comment API
    reportPost
};
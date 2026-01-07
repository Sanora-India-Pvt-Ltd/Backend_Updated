const Video = require('../../models/course/Video');
const Playlist = require('../../models/course/Playlist');
const Course = require('../../models/course/Course');
const videoService = require('../../services/video/videoService');

/**
 * Upload video (handle S3 upload, create video document)
 */
const uploadVideoController = async (req, res) => {
    try {
        const { playlistId, title, description, order } = req.body;
        const file = req.file; // From multer middleware
        const universityId = req.universityId; // From middleware

        if (!playlistId || !title) {
            return res.status(400).json({
                success: false,
                message: 'Playlist ID and title are required'
            });
        }

        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'Video file is required'
            });
        }

        // Verify playlist ownership
        const playlist = await Playlist.findById(playlistId);
        if (!playlist) {
            return res.status(404).json({
                success: false,
                message: 'Playlist not found'
            });
        }

        const course = await Course.findById(playlist.courseId);
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to upload videos to this playlist'
            });
        }

        // Upload to S3 and create video document
        const videoData = await videoService.uploadVideo(file, {
            playlistId,
            courseId: playlist.courseId,
            title,
            description: description || '',
            order: order || 0
        });

        res.status(201).json({
            success: true,
            message: 'Video uploaded successfully',
            data: { video: videoData }
        });
    } catch (error) {
        console.error('Upload video error:', error);
        res.status(500).json({
            success: false,
            message: 'Error uploading video',
            error: error.message
        });
    }
};

/**
 * Get video with progress tracking
 */
const getVideo = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId; // From user auth middleware (optional)

        const video = await Video.findById(id)
            .populate('playlistId', 'name')
            .populate('courseId', 'name')
            .lean();

        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'Video not found'
            });
        }

        // Get user progress if authenticated
        let progress = null;
        if (userId) {
            const UserVideoProgress = require('../../models/progress/UserVideoProgress');
            progress = await UserVideoProgress.findOne({ userId, videoId: id }).lean();
        }

        res.status(200).json({
            success: true,
            message: 'Video retrieved successfully',
            data: {
                video,
                progress: progress || {
                    lastWatchedSecond: 0,
                    completed: false
                }
            }
        });
    } catch (error) {
        console.error('Get video error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving video',
            error: error.message
        });
    }
};

/**
 * Get all videos in playlist
 */
const getPlaylistVideos = async (req, res) => {
    try {
        const { playlistId } = req.params;
        const userId = req.userId; // From user auth middleware (optional)

        const videos = await Video.find({ playlistId })
            .sort({ order: 1, createdAt: 1 })
            .lean();

        // Get user progress for all videos if authenticated
        let progressMap = {};
        if (userId) {
            const UserVideoProgress = require('../../models/progress/UserVideoProgress');
            const videoIds = videos.map(v => v._id);
            const progressList = await UserVideoProgress.find({
                userId,
                videoId: { $in: videoIds }
            }).lean();

            progressList.forEach(p => {
                progressMap[p.videoId.toString()] = {
                    lastWatchedSecond: p.lastWatchedSecond,
                    completed: p.completed
                };
            });
        }

        // Attach progress to videos
        const videosWithProgress = videos.map(video => ({
            ...video,
            progress: progressMap[video._id.toString()] || {
                lastWatchedSecond: 0,
                completed: false
            }
        }));

        res.status(200).json({
            success: true,
            message: 'Videos retrieved successfully',
            data: { videos: videosWithProgress }
        });
    } catch (error) {
        console.error('Get playlist videos error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving videos',
            error: error.message
        });
    }
};

/**
 * Update video metadata
 */
const updateVideo = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, order } = req.body;
        const universityId = req.universityId; // From middleware

        const video = await Video.findById(id);

        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'Video not found'
            });
        }

        // Verify ownership
        const course = await Course.findById(video.courseId);
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update this video'
            });
        }

        // Update fields
        if (title !== undefined) video.title = title;
        if (description !== undefined) video.description = description;
        if (order !== undefined) video.order = order;

        await video.save();

        res.status(200).json({
            success: true,
            message: 'Video updated successfully',
            data: { video }
        });
    } catch (error) {
        console.error('Update video error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating video',
            error: error.message
        });
    }
};

/**
 * Delete video (delete from S3 & DB)
 */
const deleteVideoController = async (req, res) => {
    try {
        const { id } = req.params;
        const universityId = req.universityId; // From middleware

        const video = await Video.findById(id);

        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'Video not found'
            });
        }

        // Verify ownership
        const course = await Course.findById(video.courseId);
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete this video'
            });
        }

        // Delete from S3
        if (video.s3Key) {
            await videoService.deleteVideo(video.s3Key);
        }

        // Delete video document
        await Video.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Video deleted successfully'
        });
    } catch (error) {
        console.error('Delete video error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting video',
            error: error.message
        });
    }
};

/**
 * Update video thumbnail (upload thumbnail to S3)
 */
const updateVideoThumbnail = async (req, res) => {
    try {
        const { id } = req.params;
        const file = req.file; // From multer middleware
        const universityId = req.universityId; // From middleware

        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'Thumbnail file is required'
            });
        }

        const video = await Video.findById(id);

        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'Video not found'
            });
        }

        // Verify ownership
        const course = await Course.findById(video.courseId);
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update this video thumbnail'
            });
        }

        // Upload thumbnail
        const thumbnailUrl = await videoService.uploadThumbnail(file, video._id);

        // Update video
        video.thumbnail = thumbnailUrl;
        await video.save();

        res.status(200).json({
            success: true,
            message: 'Thumbnail updated successfully',
            data: { thumbnail: thumbnailUrl }
        });
    } catch (error) {
        console.error('Update thumbnail error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating thumbnail',
            error: error.message
        });
    }
};

/**
 * Track product view (non-blocking)
 * POST /api/videos/:videoId/product-view
 */
const trackProductView = async (req, res) => {
    try {
        const { videoId } = req.params;
        const userId = req.userId; // From protect middleware

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Fire-and-forget: Don't wait for analytics update
        Video.findByIdAndUpdate(
            videoId,
            { $inc: { 'productAnalytics.views': 1 } },
            { new: false }
        ).catch(err => {
            console.error('Error tracking product view:', err);
            // Silently fail - analytics shouldn't break the flow
        });

        // Return immediately
        res.status(200).json({
            success: true,
            message: 'Product view tracked'
        });
    } catch (error) {
        console.error('Track product view error:', error);
        // Even on error, return success to not break user flow
        res.status(200).json({
            success: true,
            message: 'Product view tracked'
        });
    }
};

/**
 * Track product click (non-blocking)
 * POST /api/videos/:videoId/product-click
 */
const trackProductClick = async (req, res) => {
    try {
        const { videoId } = req.params;
        const userId = req.userId; // From protect middleware

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Fire-and-forget: Don't wait for analytics update
        Video.findByIdAndUpdate(
            videoId,
            { $inc: { 'productAnalytics.clicks': 1 } },
            { new: false }
        ).catch(err => {
            console.error('Error tracking product click:', err);
            // Silently fail - analytics shouldn't break the flow
        });

        // Return immediately
        res.status(200).json({
            success: true,
            message: 'Product click tracked'
        });
    } catch (error) {
        console.error('Track product click error:', error);
        // Even on error, return success to not break user flow
        res.status(200).json({
            success: true,
            message: 'Product click tracked'
        });
    }
};

module.exports = {
    uploadVideo: uploadVideoController,
    getVideo,
    getPlaylistVideos,
    updateVideo,
    deleteVideo: deleteVideoController,
    updateVideoThumbnail,
    trackProductView,
    trackProductClick
};


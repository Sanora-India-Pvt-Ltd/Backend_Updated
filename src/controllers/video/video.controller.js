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
 * Allows both enrolled users and course owners (universities) to access
 */
const getVideo = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId; // From user auth middleware (optional)
        const universityId = req.universityId; // From university auth middleware (optional)

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

        // Check access permissions
        const course = await Course.findById(video.courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // If university is accessing, verify ownership
        if (universityId) {
            if (course.universityId.toString() !== universityId.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to access this video'
                });
            }
        } else if (userId) {
            // If user is accessing, check if enrolled
            const UserCourseProgress = require('../../models/progress/UserCourseProgress');
            const progress = await UserCourseProgress.findOne({ 
                userId, 
                courseId: video.courseId 
            });
            
            if (!progress) {
                return res.status(403).json({
                    success: false,
                    message: 'You must be enrolled in this course to access videos'
                });
            }
        }

        // Get user progress if authenticated as user
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
                progress: progress ? {
                    lastWatchedSecond: progress.progress.lastWatchedSecond,
                    completed: progress.progress.completed
                } : {
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
 * Allows both enrolled users and course owners (universities) to access
 */
const getPlaylistVideos = async (req, res) => {
    try {
        const { playlistId } = req.params;
        const userId = req.userId; // From user auth middleware (optional)
        const universityId = req.universityId; // From university auth middleware (optional)

        // Get playlist to find course
        const playlist = await Playlist.findById(playlistId);
        if (!playlist) {
            return res.status(404).json({
                success: false,
                message: 'Playlist not found'
            });
        }

        // Check access permissions
        const course = await Course.findById(playlist.courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // If university is accessing, verify ownership
        // Course owners can see ALL videos in their playlists (no restrictions)
        if (universityId) {
            if (course.universityId.toString() !== universityId.toString()) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to access videos in this playlist'
                });
            }
            // Course owner verified - they can see all videos, continue to fetch
        } else if (userId) {
            // If user is accessing, check if enrolled
            const UserCourseProgress = require('../../models/progress/UserCourseProgress');
            const progress = await UserCourseProgress.findOne({ 
                userId, 
                courseId: playlist.courseId 
            });
            
            if (!progress) {
                return res.status(403).json({
                    success: false,
                    message: 'You must be enrolled in this course to access videos'
                });
            }
        }

        // Fetch ALL videos in the playlist (course owners see everything, enrolled users see everything they're allowed to)
        const videos = await Video.find({ playlistId })
            .sort({ order: 1, createdAt: 1 })
            .lean();

        // Get user progress for all videos if authenticated as user
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
                    lastWatchedSecond: p.progress.lastWatchedSecond,
                    completed: p.progress.completed
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
        if (title !== undefined) video.details.title = title;
        if (description !== undefined) video.details.description = description;
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
        if (video.media.s3Key) {
            await videoService.deleteVideo(video.media.s3Key);
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
            // Check if error was from file filter
            if (req.fileValidationError) {
                return res.status(400).json({
                    success: false,
                    message: req.fileValidationError
                });
            }
            return res.status(400).json({
                success: false,
                message: 'Thumbnail file is required'
            });
        }

        // Validate it's an image
        if (!file.mimetype.startsWith('image/')) {
            return res.status(400).json({
                success: false,
                message: 'Only image files are allowed for thumbnails'
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
        video.details.thumbnail = thumbnailUrl;
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

module.exports = {
    uploadVideo: uploadVideoController,
    getVideo,
    getPlaylistVideos,
    updateVideo,
    deleteVideo: deleteVideoController,
    updateVideoThumbnail
};


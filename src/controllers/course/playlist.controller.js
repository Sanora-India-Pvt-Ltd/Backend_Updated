const Playlist = require('../../models/course/Playlist');
const Video = require('../../models/course/Video');
const Course = require('../../models/course/Course');
const videoService = require('../../services/video/videoService');

/**
 * Create playlist (course owner only)
 */
const createPlaylist = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { name, description, thumbnail, order } = req.body;
        const universityId = req.universityId; // From middleware

        // Verify course ownership
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to create playlists for this course'
            });
        }

        const playlist = await Playlist.create({
            courseId,
            details: {
                name,
                description: description || '',
                thumbnail: thumbnail || null
            },
            order: order || 0
        });

        res.status(201).json({
            success: true,
            message: 'Playlist created successfully',
            data: { playlist }
        });
    } catch (error) {
        console.error('Create playlist error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating playlist',
            error: error.message
        });
    }
};

/**
 * Get all playlists for a course
 */
const getPlaylists = async (req, res) => {
    try {
        const { courseId } = req.params;

        const playlists = await Playlist.find({ courseId })
            .sort({ order: 1, createdAt: 1 })
            .lean();

        res.status(200).json({
            success: true,
            message: 'Playlists retrieved successfully',
            data: { playlists }
        });
    } catch (error) {
        console.error('Get playlists error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving playlists',
            error: error.message
        });
    }
};

/**
 * Get single playlist by ID
 */
const getPlaylistById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId; // From user auth middleware (optional)
        const universityId = req.universityId; // From university auth middleware (optional)

        const playlist = await Playlist.findById(id).lean();

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
        if (universityId && course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to access this playlist'
            });
        }

        // If user is accessing, check if enrolled
        if (userId && !universityId) {
            const UserCourseProgress = require('../../models/progress/UserCourseProgress');
            const progress = await UserCourseProgress.findOne({ 
                userId, 
                courseId: playlist.courseId 
            });
            
            if (!progress) {
                return res.status(403).json({
                    success: false,
                    message: 'You must be enrolled in this course to access playlists'
                });
            }
        }

        // Get videos in playlist if user has access
        const videos = await Video.find({ playlistId: id })
            .sort({ order: 1, createdAt: 1 })
            .select('details.title details.thumbnail media.duration order')
            .lean();

        res.status(200).json({
            success: true,
            message: 'Playlist retrieved successfully',
            data: {
                playlist: {
                    ...playlist,
                    videos
                }
            }
        });
    } catch (error) {
        console.error('Get playlist error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving playlist',
            error: error.message
        });
    }
};

/**
 * Update playlist (reorder, rename)
 */
const updatePlaylist = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, thumbnail, order } = req.body;
        const universityId = req.universityId; // From middleware

        const playlist = await Playlist.findById(id).populate('courseId');

        if (!playlist) {
            return res.status(404).json({
                success: false,
                message: 'Playlist not found'
            });
        }

        // Verify course ownership
        const course = await Course.findById(playlist.courseId);
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update this playlist'
            });
        }

        // Update fields
        if (name !== undefined) playlist.details.name = name;
        if (description !== undefined) playlist.details.description = description;
        if (thumbnail !== undefined) playlist.details.thumbnail = thumbnail;
        if (order !== undefined) playlist.order = order;

        await playlist.save();

        res.status(200).json({
            success: true,
            message: 'Playlist updated successfully',
            data: { playlist }
        });
    } catch (error) {
        console.error('Update playlist error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating playlist',
            error: error.message
        });
    }
};

/**
 * Delete playlist (handle video cleanup)
 */
const deletePlaylist = async (req, res) => {
    try {
        const { id } = req.params;
        const universityId = req.universityId; // From middleware

        const playlist = await Playlist.findById(id);

        if (!playlist) {
            return res.status(404).json({
                success: false,
                message: 'Playlist not found'
            });
        }

        // Verify course ownership
        const course = await Course.findById(playlist.courseId);
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete this playlist'
            });
        }

        // Delete all videos in playlist
        await Video.deleteMany({ playlistId: id });

        // Delete playlist
        await Playlist.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Playlist deleted successfully'
        });
    } catch (error) {
        console.error('Delete playlist error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting playlist',
            error: error.message
        });
    }
};

/**
 * Update playlist thumbnail (upload thumbnail to S3)
 */
const updatePlaylistThumbnail = async (req, res) => {
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

        const playlist = await Playlist.findById(id);

        if (!playlist) {
            return res.status(404).json({
                success: false,
                message: 'Playlist not found'
            });
        }

        // Verify course ownership
        const course = await Course.findById(playlist.courseId);
        if (!course || course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update this playlist thumbnail'
            });
        }

        // Upload thumbnail
        const thumbnailUrl = await videoService.uploadThumbnail(file, `playlist-${playlist._id}`);

        // Update playlist
        playlist.details.thumbnail = thumbnailUrl;
        await playlist.save();

        res.status(200).json({
            success: true,
            message: 'Playlist thumbnail updated successfully',
            data: { thumbnail: thumbnailUrl }
        });
    } catch (error) {
        console.error('Update playlist thumbnail error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating playlist thumbnail',
            error: error.message
        });
    }
};

module.exports = {
    createPlaylist,
    getPlaylists,
    getPlaylistById,
    updatePlaylist,
    deletePlaylist,
    updatePlaylistThumbnail
};


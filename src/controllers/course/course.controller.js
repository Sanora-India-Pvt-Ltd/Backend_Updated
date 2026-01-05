const Course = require('../../models/course/Course');
const Playlist = require('../../models/course/Playlist');
const Video = require('../../models/course/Video');
const CourseInvite = require('../../models/course/CourseInvite');
const UserCourseProgress = require('../../models/progress/UserCourseProgress');
const videoService = require('../../services/video/videoService');

/**
 * Create a new course
 */
const createCourse = async (req, res) => {
    try {
        const { name, description, thumbnail, inviteOnly } = req.body;
        const universityId = req.universityId; // From middleware

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Course name is required'
            });
        }

        const course = await Course.create({
            universityId,
            details: {
                name,
                description: description || '',
                thumbnail: thumbnail || null
            },
            settings: {
                inviteOnly: inviteOnly !== undefined ? inviteOnly : true
            }
        });

        res.status(201).json({
            success: true,
            message: 'Course created successfully',
            data: { course }
        });
    } catch (error) {
        console.error('Create course error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating course',
            error: error.message
        });
    }
};

/**
 * Get all courses for logged-in university
 */
const getCourses = async (req, res) => {
    try {
        const universityId = req.universityId; // From middleware

        const courses = await Course.find({ universityId })
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            message: 'Courses retrieved successfully',
            data: { courses }
        });
    } catch (error) {
        console.error('Get courses error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving courses',
            error: error.message
        });
    }
};

/**
 * Get single course details
 */
const getCourseById = async (req, res) => {
    try {
        const { id } = req.params;
        const universityId = req.universityId; // From middleware (optional for public access)

        const course = await Course.findById(id).lean();

        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // Check if user is owner or has access
        if (universityId && course.universityId.toString() !== universityId.toString()) {
            // Check if user is enrolled (has progress)
            const userId = req.userId; // From user auth middleware
            if (userId) {
                const progress = await UserCourseProgress.findOne({ userId, courseId: id });
                if (!progress) {
                    return res.status(403).json({
                        success: false,
                        message: 'Access denied. You must be enrolled in this course.'
                    });
                }
            } else {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }
        }

        res.status(200).json({
            success: true,
            message: 'Course retrieved successfully',
            data: { course }
        });
    } catch (error) {
        console.error('Get course error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving course',
            error: error.message
        });
    }
};

/**
 * Update course (university owner only)
 */
const updateCourse = async (req, res) => {
    try {
        const { id } = req.params;
        const universityId = req.universityId; // From middleware
        const { name, description, thumbnail, inviteOnly } = req.body;

        const course = await Course.findById(id);

        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // Verify ownership
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update this course'
            });
        }

        // Update fields
        if (name !== undefined) course.details.name = name;
        if (description !== undefined) course.details.description = description;
        if (thumbnail !== undefined) course.details.thumbnail = thumbnail;
        if (inviteOnly !== undefined) course.settings.inviteOnly = inviteOnly;

        await course.save();

        res.status(200).json({
            success: true,
            message: 'Course updated successfully',
            data: { course }
        });
    } catch (error) {
        console.error('Update course error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating course',
            error: error.message
        });
    }
};

/**
 * Delete course (university owner only)
 */
const deleteCourse = async (req, res) => {
    try {
        const { id } = req.params;
        const universityId = req.universityId; // From middleware

        const course = await Course.findById(id);

        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // Verify ownership
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete this course'
            });
        }

        // Cascade delete: playlists, videos, invites, progress
        await Playlist.deleteMany({ courseId: id });
        await Video.deleteMany({ courseId: id });
        await CourseInvite.deleteMany({ courseId: id });
        await UserCourseProgress.deleteMany({ courseId: id });

        // Delete course
        await Course.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Course deleted successfully'
        });
    } catch (error) {
        console.error('Delete course error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting course',
            error: error.message
        });
    }
};

/**
 * Update course thumbnail (upload thumbnail to S3)
 */
const updateCourseThumbnail = async (req, res) => {
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

        const course = await Course.findById(id);

        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // Verify ownership
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update this course thumbnail'
            });
        }

        // Upload thumbnail
        const thumbnailUrl = await videoService.uploadThumbnail(file, `course-${course._id}`);

        // Update course
        course.details.thumbnail = thumbnailUrl;
        await course.save();

        res.status(200).json({
            success: true,
            message: 'Course thumbnail updated successfully',
            data: { thumbnail: thumbnailUrl }
        });
    } catch (error) {
        console.error('Update course thumbnail error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating course thumbnail',
            error: error.message
        });
    }
};

module.exports = {
    createCourse,
    getCourses,
    getCourseById,
    updateCourse,
    deleteCourse,
    updateCourseThumbnail
};


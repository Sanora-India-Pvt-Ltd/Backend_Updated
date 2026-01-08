const Course = require('../../models/course/Course');
const Playlist = require('../../models/course/Playlist');
const Video = require('../../models/course/Video');
const CourseInvite = require('../../models/course/CourseInvite');
const CourseEnrollment = require('../../models/course/CourseEnrollment');
const UserCourseProgress = require('../../models/progress/UserCourseProgress');
const TokenTransaction = require('../../models/wallet/TokenTransaction');
const videoService = require('../../services/video/videoService');

/**
 * Create a new course
 */
const createCourse = async (req, res) => {
    try {
        console.log('CONTENT-TYPE >>>', req.headers['content-type']);
        console.log('REQ BODY >>>', req.body);

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
            name,
            description: description || '',
            thumbnail: thumbnail || null,
            inviteOnly: inviteOnly !== undefined ? inviteOnly : true,
            maxCompletions: req.body.maxCompletions ?? null,
            completionDeadline: req.body.completionDeadline ?? null,
            rewardTokensPerCompletion: req.body.rewardTokensPerCompletion ?? 0,
            status: 'DRAFT'
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

        // Cascade delete: playlists, videos, invites, progress, enrollments
        await Playlist.deleteMany({ courseId: id });
        await Video.deleteMany({ courseId: id });
        await CourseInvite.deleteMany({ courseId: id });
        await UserCourseProgress.deleteMany({ courseId: id });
        await CourseEnrollment.deleteMany({ courseId: id });

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

/**
 * Request enrollment in a course
 * POST /api/courses/:courseId/enroll-request
 */
const requestEnrollment = async (req, res) => {
    try {
        const { courseId } = req.params;
        const userId = req.userId; // From protect middleware

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Check if course exists
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // Check if user already has an enrollment request
        const existingEnrollment = await CourseEnrollment.findOne({
            userId,
            courseId
        });

        if (existingEnrollment) {
            return res.status(400).json({
                success: false,
                message: 'Enrollment request already exists',
                data: {
                    enrollment: existingEnrollment,
                    status: existingEnrollment.status
                }
            });
        }

        // Determine enrollment status based on course settings
        const isInviteOnly = course.isInviteOnly !== undefined ? course.isInviteOnly : course.inviteOnly;
        const enrollmentStatus = isInviteOnly ? 'REQUESTED' : 'APPROVED';

        // Create enrollment
        const enrollmentData = {
            userId,
            courseId,
            status: enrollmentStatus
        };

        // If auto-approved, set approvedAt and expiresAt
        if (enrollmentStatus === 'APPROVED') {
            enrollmentData.approvedAt = new Date();
            if (course.completionDeadline) {
                enrollmentData.expiresAt = course.completionDeadline;
            }
        }

        const enrollment = await CourseEnrollment.create(enrollmentData);

        res.status(201).json({
            success: true,
            message: enrollmentStatus === 'APPROVED' 
                ? 'Enrollment approved automatically' 
                : 'Enrollment request submitted',
            data: { enrollment }
        });
    } catch (error) {
        console.error('Request enrollment error:', error);
        
        // Handle duplicate key error (unique index violation)
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Enrollment request already exists'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error processing enrollment request',
            error: error.message
        });
    }
};

/**
 * Get all enrollments for a course (University only)
 * GET /api/courses/:courseId/enrollments
 */
const getCourseEnrollments = async (req, res) => {
    try {
        const { courseId } = req.params;
        const universityId = req.universityId; // From protectUniversity middleware

        // Check if course exists and belongs to university
        const course = await Course.findById(courseId);
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
                message: 'You do not have permission to view enrollments for this course'
            });
        }

        // Get all enrollments
        const enrollments = await CourseEnrollment.find({ courseId })
            .populate('userId', 'profile.name.first profile.name.last profile.email')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            message: 'Enrollments retrieved successfully',
            data: { enrollments }
        });
    } catch (error) {
        console.error('Get course enrollments error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving enrollments',
            error: error.message
        });
    }
};

/**
 * Approve enrollment (University only)
 * POST /api/courses/:courseId/enrollments/:enrollmentId/approve
 */
const approveEnrollment = async (req, res) => {
    try {
        const { courseId, enrollmentId } = req.params;
        const universityId = req.universityId; // From protectUniversity middleware

        // Check if course exists and belongs to university
        const course = await Course.findById(courseId);
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
                message: 'You do not have permission to approve enrollments for this course'
            });
        }

        // Check if enrollment exists and belongs to this course
        const enrollment = await CourseEnrollment.findOne({
            _id: enrollmentId,
            courseId
        });

        if (!enrollment) {
            return res.status(404).json({
                success: false,
                message: 'Enrollment not found'
            });
        }

        // Safety rule: Check completion limit
        if (course.maxCompletions !== null && course.maxCompletions !== undefined) {
            if (course.completedCount >= course.maxCompletions) {
                // Update course status to FULL
                course.status = 'FULL';
                await course.save();

                return res.status(400).json({
                    success: false,
                    message: 'Course enrollment limit reached',
                    data: {
                        maxCompletions: course.maxCompletions,
                        completedCount: course.completedCount,
                        courseStatus: 'FULL'
                    }
                });
            }
        }

        // Update enrollment status
        enrollment.status = 'APPROVED';
        enrollment.approvedAt = new Date();
        
        // Set expiration date if course has completion deadline
        if (course.completionDeadline) {
            enrollment.expiresAt = course.completionDeadline;
        }

        // Pre-save hook will check expiry automatically
        await enrollment.save();

        res.status(200).json({
            success: true,
            message: 'Enrollment approved successfully',
            data: { enrollment }
        });
    } catch (error) {
        console.error('Approve enrollment error:', error);
        res.status(500).json({
            success: false,
            message: 'Error approving enrollment',
            error: error.message
        });
    }
};

/**
 * Reject enrollment (University only)
 * POST /api/courses/:courseId/enrollments/:enrollmentId/reject
 */
const rejectEnrollment = async (req, res) => {
    try {
        const { courseId, enrollmentId } = req.params;
        const universityId = req.universityId; // From protectUniversity middleware

        // Check if course exists and belongs to university
        const course = await Course.findById(courseId);
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
                message: 'You do not have permission to reject enrollments for this course'
            });
        }

        // Check if enrollment exists and belongs to this course
        const enrollment = await CourseEnrollment.findOne({
            _id: enrollmentId,
            courseId
        });

        if (!enrollment) {
            return res.status(404).json({
                success: false,
                message: 'Enrollment not found'
            });
        }

        // Update enrollment status
        enrollment.status = 'REJECTED';
        await enrollment.save();

        res.status(200).json({
            success: true,
            message: 'Enrollment rejected successfully',
            data: { enrollment }
        });
    } catch (error) {
        console.error('Reject enrollment error:', error);
        res.status(500).json({
            success: false,
            message: 'Error rejecting enrollment',
            error: error.message
        });
    }
};

/**
 * Get course analytics (University only, read-only)
 * GET /api/university/courses/:courseId/analytics
 */
const getCourseAnalytics = async (req, res) => {
    try {
        const { courseId } = req.params;
        const universityId = req.universityId; // From protectUniversity middleware

        // Verify course exists and belongs to university
        const course = await Course.findById(courseId).lean();
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
                message: 'You do not have permission to view analytics for this course'
            });
        }

        // STEP 2 & 3: Parallel queries for performance (using indexed fields)
        const [
            enrollmentStats,
            tokenStats,
            videos
        ] = await Promise.all([
            // Enrollment statistics (using indexed courseId field)
            CourseEnrollment.aggregate([
                { $match: { courseId: course._id } },
                {
                    $group: {
                        _id: '$status',
                        count: { $sum: 1 }
                    }
                }
            ]),
            // Token statistics (using indexed sourceId field)
            TokenTransaction.aggregate([
                {
                    $match: {
                        source: 'COURSE_COMPLETION',
                        sourceId: course._id
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalTokensIssued: { $sum: '$amount' }
                    }
                }
            ]),
            // Videos with product analytics (using indexed courseId field)
            Video.find({ courseId: course._id })
                .select('_id title productAnalytics attachedProductId')
                .lean()
        ]);

        // Process enrollment stats
        const enrollmentMap = {};
        enrollmentStats.forEach(stat => {
            enrollmentMap[stat._id] = stat.count;
        });

        // Process token stats
        const totalTokensIssued = tokenStats.length > 0 ? tokenStats[0].totalTokensIssued : 0;

        // Process video analytics with conversion rates
        const videoAnalytics = videos.map(video => {
            const views = video.productAnalytics?.views || 0;
            const clicks = video.productAnalytics?.clicks || 0;
            const purchases = video.productAnalytics?.purchases || 0;
            
            // Safe division for conversion rate
            const conversionRate = clicks > 0 ? (purchases / clicks) * 100 : 0;

            return {
                videoId: video._id,
                title: video.title,
                productAnalytics: {
                    views,
                    clicks,
                    purchases,
                    conversionRate: Math.round(conversionRate * 100) / 100 // Round to 2 decimal places
                }
            };
        });

        // Build response
        const analytics = {
            course: {
                title: course.name,
                maxCompletions: course.maxCompletions || null,
                completedCount: course.completedCount || 0,
                status: course.status || 'DRAFT'
            },
            enrollments: {
                totalRequested: enrollmentMap['REQUESTED'] || 0,
                totalApproved: enrollmentMap['APPROVED'] || 0,
                totalCompleted: enrollmentMap['COMPLETED'] || 0,
                totalExpired: enrollmentMap['EXPIRED'] || 0,
                totalRejected: enrollmentMap['REJECTED'] || 0,
                totalInProgress: enrollmentMap['IN_PROGRESS'] || 0
            },
            tokens: {
                totalTokensIssued
            },
            videos: videoAnalytics
        };

        res.status(200).json({
            success: true,
            message: 'Course analytics retrieved successfully',
            data: { analytics }
        });
    } catch (error) {
        console.error('Get course analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving course analytics',
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
    updateCourseThumbnail,
    requestEnrollment,
    getCourseEnrollments,
    approveEnrollment,
    rejectEnrollment,
    getCourseAnalytics
};


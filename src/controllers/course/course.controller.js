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
 * Get all courses
 * - UNIVERSITY token: Returns ALL courses owned by that university (DRAFT, LIVE, FULL, COMPLETED)
 * - USER token or no token: Returns ONLY public courses (LIVE, FULL)
 */
const getCourses = async (req, res) => {
    try {
        let query = {};

        // Detect token type: If req.universityId exists, this is a UNIVERSITY request
        if (req.universityId) {
            // UNIVERSITY: Return all courses owned by this university (any status)
            query = {
                universityId: req.universityId
            };
        } else {
            // USER / Public: Return only LIVE and FULL courses
            query = {
                status: { $in: ['LIVE', 'FULL'] }
            };
        }

        const courses = await Course.find(query)
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
 * Returns videos if user has APPROVED/IN_PROGRESS/COMPLETED enrollment
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

        // Check if user has enrollment with access to videos
        let enrollment = null;
        let videos = null;

        // 1. If university owns the course, return all videos (bypass enrollment check)
        if (req.universityId && course.universityId.toString() === req.universityId.toString()) {
            // Fetch all videos with status READY for the owning university
            videos = await Video.find({
                courseId: course._id,
                status: 'READY'
            })
            .select('_id title videoUrl status attachedProductId')
            .lean();
        }
        // 2. If user exists, check enrollment-based access
        else if (req.user && req.user._id) {
            // Query CourseEnrollment for this user and course
            enrollment = await CourseEnrollment.findOne({
                userId: req.user._id,
                courseId: course._id
            }).lean();

            // If enrollment exists and status allows video access
            if (enrollment && ['APPROVED', 'IN_PROGRESS', 'COMPLETED'].includes(enrollment.status)) {
                // Fetch videos with status READY
                videos = await Video.find({
                    courseId: course._id,
                    status: 'READY'
                })
                .select('_id title videoUrl status attachedProductId')
                .lean();
            }
        }

        // Build response
        const responseData = {
            course
        };

        // Include enrollment status and videos if user has access
        if (enrollment && videos !== null) {
            responseData.enrollmentStatus = enrollment.status;
            responseData.videos = videos;
        }
        // Include videos if university owns the course (even if empty array)
        else if (videos !== null) {
            responseData.videos = videos;
        }

        res.status(200).json({
            success: true,
            message: 'Course retrieved successfully',
            data: responseData
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
const requestEnrollment = async (req, res, next) => {
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

        // 1. Reject if course is not LIVE
        if (course.status !== 'LIVE') {
            return res.status(400).json({
                success: false,
                message: `Course is not available for enrollment. Current status: ${course.status}`
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

        // Determine if course is invite-only
        const isInviteOnly = course.isInviteOnly !== undefined ? course.isInviteOnly : course.inviteOnly;

        // 2. If invite-only, create enrollment with REQUESTED status (manual approval)
        if (isInviteOnly) {
            const enrollment = await CourseEnrollment.create({
                userId,
                courseId,
                status: 'REQUESTED'
            });

            return res.status(201).json({
                success: true,
                message: 'Enrollment request submitted',
                data: { enrollment }
            });
        }

        // 3. For non-invite-only courses: Check maxCompletions cap
        if (course.maxCompletions !== null && course.maxCompletions !== undefined) {
            // Count existing enrollments with active statuses
            const activeEnrollmentCount = await CourseEnrollment.countDocuments({
                courseId,
                status: { $in: ['APPROVED', 'IN_PROGRESS', 'COMPLETED'] }
            });

            // 5. If count >= maxCompletions, reject and mark course as FULL
            if (activeEnrollmentCount >= course.maxCompletions) {
                // Update course status to FULL if not already
                if (course.status !== 'FULL') {
                    await Course.findByIdAndUpdate(courseId, { status: 'FULL' });
                }

                return res.status(400).json({
                    success: false,
                    message: 'Course enrollment limit reached. This course is now full.',
                    data: {
                        maxCompletions: course.maxCompletions,
                        currentEnrollments: activeEnrollmentCount
                    }
                });
            }
        }

        // 4. Auto-approve enrollment (under limit or no limit set)
        const enrollmentData = {
            userId,
            courseId,
            status: 'APPROVED',
            approvedAt: new Date()
        };

        // Set expiresAt if course has completionDeadline
        if (course.completionDeadline) {
            enrollmentData.expiresAt = course.completionDeadline;
        }

        const enrollment = await CourseEnrollment.create(enrollmentData);

        res.status(201).json({
            success: true,
            message: 'Enrollment approved automatically',
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

        return res.status(500).json({
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

/**
 * Publish a course (DRAFT → LIVE)
 * POST /api/university/courses/:courseId/publish
 */
const publishCourse = async (req, res) => {
    try {
        const { courseId } = req.params;
        const universityId = req.universityId;

        // Validate courseId
        if (!courseId) {
            return res.status(400).json({
                success: false,
                message: 'Course ID is required'
            });
        }

        // Fetch course
        const course = await Course.findById(courseId);

        // Verify course exists
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
                message: 'You do not have permission to publish this course'
            });
        }

        // Validate publishing conditions
        // 1. Course must be in DRAFT status
        if (course.status !== 'DRAFT') {
            return res.status(400).json({
                success: false,
                message: `Course cannot be published. Current status: ${course.status}. Only DRAFT courses can be published.`
            });
        }

        // 2. At least ONE Video must exist for this course
        const videoCount = await Video.countDocuments({ courseId: course._id });
        if (videoCount === 0) {
            return res.status(400).json({
                success: false,
                message: 'Course must have at least one video before it can be published'
            });
        }

        // 3. If maxCompletions is set, it must be > 0
        if (course.maxCompletions !== null && course.maxCompletions !== undefined && course.maxCompletions <= 0) {
            return res.status(400).json({
                success: false,
                message: 'maxCompletions must be greater than 0 if set'
            });
        }

        // All validations passed - publish the course
        course.status = 'LIVE';
        course.publishedAt = new Date();
        await course.save();

        res.status(200).json({
            success: true,
            message: 'Course is now live',
            data: {
                courseId: course._id.toString(),
                status: course.status,
                publishedAt: course.publishedAt
            }
        });
    } catch (error) {
        console.error('Publish course error:', error);
        res.status(500).json({
            success: false,
            message: 'Error publishing course',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    getCourseAnalytics,
    publishCourse
};


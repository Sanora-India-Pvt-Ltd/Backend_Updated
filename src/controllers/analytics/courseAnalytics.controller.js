const CourseAnalytics = require('../../models/analytics/CourseAnalytics');
const Course = require('../../models/course/Course');
const UserActivity = require('../../models/progress/UserActivity');
const UserCourseProgress = require('../../models/progress/UserCourseProgress');

/**
 * Return pre-aggregated analytics for course
 */
const getCourseAnalytics = async (req, res) => {
    try {
        const { courseId } = req.params;
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
                message: 'You do not have permission to view analytics for this course'
            });
        }

        // Get analytics
        let analytics = await CourseAnalytics.findOne({ courseId }).lean();

        if (!analytics) {
            // Create default analytics
            analytics = await CourseAnalytics.create({
                courseId,
                totalUsers: 0,
                avgCompletionTime: null,
                mostRepeatedSegments: []
            });
        }

        res.status(200).json({
            success: true,
            message: 'Analytics retrieved successfully',
            data: { analytics }
        });
    } catch (error) {
        console.error('Get course analytics error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving analytics',
            error: error.message
        });
    }
};

/**
 * Find segments with most replays
 */
const getMostRepeatedSegments = async (req, res) => {
    try {
        const { courseId } = req.params;
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
                message: 'You do not have permission to view analytics for this course'
            });
        }

        // Get analytics
        const analytics = await CourseAnalytics.findOne({ courseId }).lean();

        if (!analytics || !analytics.mostRepeatedSegments || analytics.mostRepeatedSegments.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No repeated segments found',
                data: { segments: [] }
            });
        }

        // Sort by count (descending)
        const segments = analytics.mostRepeatedSegments.sort((a, b) => b.count - a.count);

        res.status(200).json({
            success: true,
            message: 'Repeated segments retrieved successfully',
            data: { segments }
        });
    } catch (error) {
        console.error('Get most repeated segments error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving repeated segments',
            error: error.message
        });
    }
};

/**
 * Get users with no activity > X days
 */
const getIdleUsers = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { days = 7 } = req.query; // Default 7 days
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
                message: 'You do not have permission to view analytics for this course'
            });
        }

        // Calculate cutoff date
        const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        // Get all users enrolled in course
        const enrolledUsers = await UserCourseProgress.find({ courseId }).select('userId').lean();
        const userIds = enrolledUsers.map(u => u.userId);

        // Get users with activity after cutoff
        const activeUsers = await UserActivity.find({
            userId: { $in: userIds },
            'activity.lastActiveAt': { $gte: cutoffDate }
        }).select('userId').lean();

        const activeUserIds = new Set(activeUsers.map(u => u.userId.toString()));

        // Find idle users (enrolled but not active)
        const idleUserIds = userIds.filter(
            id => !activeUserIds.has(id.toString())
        );

        // Get user details
        const User = require('../../models/authorization/User');
        const idleUsers = await User.find({ _id: { $in: idleUserIds } })
            .select('profile.name.full profile.email')
            .lean();

        res.status(200).json({
            success: true,
            message: 'Idle users retrieved successfully',
            data: {
                idleUsers,
                totalIdle: idleUsers.length,
                days
            }
        });
    } catch (error) {
        console.error('Get idle users error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving idle users',
            error: error.message
        });
    }
};

/**
 * Time spent, videos watched, etc.
 */
const getUserEngagementMetrics = async (req, res) => {
    try {
        const { courseId } = req.params;
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
                message: 'You do not have permission to view analytics for this course'
            });
        }

        // Get all enrolled users
        const enrolledUsers = await UserCourseProgress.find({ courseId }).lean();

        // Get video progress for all users
        const Video = require('../../models/course/Video');
        const videos = await Video.find({ courseId }).select('_id duration').lean();
        const videoIds = videos.map(v => v._id);

        const UserVideoProgress = require('../../models/progress/UserVideoProgress');
        const videoProgress = await UserVideoProgress.find({
            videoId: { $in: videoIds },
            completed: true
        }).lean();

        // Calculate metrics
        const totalVideosWatched = videoProgress.length;
        const totalTimeSpent = videos.reduce((sum, video) => {
            const watchedCount = videoProgress.filter(vp => vp.videoId.toString() === video._id.toString()).length;
            return sum + (video.duration * watchedCount);
        }, 0); // in seconds

        const avgCompletionRate = enrolledUsers.length > 0
            ? enrolledUsers.reduce((sum, u) => sum + (u.progress?.completionPercent || 0), 0) / enrolledUsers.length
            : 0;

        res.status(200).json({
            success: true,
            message: 'Engagement metrics retrieved successfully',
            data: {
                metrics: {
                    totalEnrolledUsers: enrolledUsers.length,
                    totalVideosWatched,
                    totalTimeSpentMinutes: Math.round(totalTimeSpent / 60),
                    avgCompletionRate: Math.round(avgCompletionRate * 100) / 100
                }
            }
        });
    } catch (error) {
        console.error('Get engagement metrics error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving engagement metrics',
            error: error.message
        });
    }
};

module.exports = {
    getCourseAnalytics,
    getMostRepeatedSegments,
    getIdleUsers,
    getUserEngagementMetrics
};


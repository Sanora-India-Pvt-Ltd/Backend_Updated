const UserCourseProgress = require('../../models/progress/UserCourseProgress');
const UserVideoProgress = require('../../models/progress/UserVideoProgress');
const Video = require('../../models/course/Video');
const Course = require('../../models/course/Course');

/**
 * Get aggregated stats for user in course
 */
const getCourseProgress = async (req, res) => {
    try {
        const { courseId } = req.params;
        const userId = req.userId; // From user auth middleware

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Get course progress
        const courseProgress = await UserCourseProgress.findOne({
            userId,
            courseId
        }).lean();

        if (!courseProgress) {
            return res.status(404).json({
                success: false,
                message: 'You are not enrolled in this course'
            });
        }

        // Get total videos in course
        const totalVideos = await Video.countDocuments({ courseId });

        res.status(200).json({
            success: true,
            message: 'Course progress retrieved successfully',
            data: {
                progress: {
                    ...courseProgress.progress,
                    totalVideos,
                    remainingVideos: totalVideos - courseProgress.progress.completedVideos
                }
            }
        });
    } catch (error) {
        console.error('Get course progress error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving course progress',
            error: error.message
        });
    }
};

/**
 * Get overall completion % & other stats
 */
const getCompletionStats = async (req, res) => {
    try {
        const userId = req.userId; // From user auth middleware

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Get all course progress
        const courseProgressList = await UserCourseProgress.find({ userId }).lean();

        // Get stats for each course
        const stats = await Promise.all(
            courseProgressList.map(async (progress) => {
                const totalVideos = await Video.countDocuments({ courseId: progress.courseId });
                const course = await Course.findById(progress.courseId).select('name').lean();

                return {
                    courseId: progress.courseId,
                    courseName: course?.details?.name || 'Unknown',
                    completedVideos: progress.progress.completedVideos,
                    totalVideos,
                    completionPercent: progress.progress.completionPercent
                };
            })
        );

        res.status(200).json({
            success: true,
            message: 'Completion stats retrieved successfully',
            data: { stats }
        });
    } catch (error) {
        console.error('Get completion stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving completion stats',
            error: error.message
        });
    }
};

/**
 * Reset progress (admin only)
 */
const resetProgress = async (req, res) => {
    try {
        const { courseId, userId: targetUserId } = req.params;
        const userId = req.userId; // From user auth middleware

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Check if user is admin (you can add admin check here)
        // For now, allow course owner to reset progress
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // Verify admin or course owner
        const User = require('../../models/authorization/User');
        const user = await User.findById(userId);
        const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'admin';
        const isCourseOwner = course.universityId.toString() === userId.toString();

        if (!isAdmin && !isCourseOwner) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to reset progress'
            });
        }

        const targetUserIdToReset = targetUserId || userId;

        // Delete video progress
        const videos = await Video.find({ courseId }).select('_id').lean();
        const videoIds = videos.map(v => v._id);
        await UserVideoProgress.deleteMany({
            userId: targetUserIdToReset,
            videoId: { $in: videoIds }
        });

        // Reset course progress
        await UserCourseProgress.findOneAndUpdate(
            { userId: targetUserIdToReset, courseId },
            {
                progress: {
                    completedVideos: 0,
                    completionPercent: 0,
                    lastAccessedAt: new Date()
                }
            },
            { upsert: true }
        );

        res.status(200).json({
            success: true,
            message: 'Progress reset successfully'
        });
    } catch (error) {
        console.error('Reset progress error:', error);
        res.status(500).json({
            success: false,
            message: 'Error resetting progress',
            error: error.message
        });
    }
};

module.exports = {
    getCourseProgress,
    getCompletionStats,
    resetProgress
};


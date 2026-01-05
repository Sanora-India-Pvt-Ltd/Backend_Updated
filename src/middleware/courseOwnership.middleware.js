const Course = require('../models/course/Course');
const UserCourseProgress = require('../models/progress/UserCourseProgress');

/**
 * Verify user is course owner (university)
 */
const verifyCourseOwner = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const universityId = req.universityId;

        if (!universityId) {
            return res.status(401).json({
                success: false,
                message: 'University authentication required'
            });
        }

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
                message: 'You do not have permission to access this course'
            });
        }

        req.course = course;
        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Verify user is enrolled in course
 */
const verifyCourseEnrollment = async (req, res, next) => {
    try {
        const { courseId } = req.params;
        const userId = req.userId || req.user?._id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'User authentication required'
            });
        }

        const progress = await UserCourseProgress.findOne({ userId, courseId });

        if (!progress) {
            return res.status(403).json({
                success: false,
                message: 'You must be enrolled in this course to access it'
            });
        }

        req.courseProgress = progress;
        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Attach course data to request
 */
const attachCourse = async (req, res, next) => {
    try {
        const { courseId } = req.params;

        if (!courseId) {
            return res.status(400).json({
                success: false,
                message: 'Course ID is required'
            });
        }

        const course = await Course.findById(courseId);

        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        req.course = course;
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = {
    verifyCourseOwner,
    verifyCourseEnrollment,
    attachCourse
};


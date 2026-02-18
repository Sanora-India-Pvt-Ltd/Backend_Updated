const logger = require('../../core/logger');
const UserVideoProgress = require('../../models/progress/UserVideoProgress');
const UserCourseProgress = require('../../models/progress/UserCourseProgress');
const CourseEnrollment = require('../../models/course/CourseEnrollment');
const Course = require('../../models/course/Course');
const Video = require('../../models/course/Video');
const TokenWallet = require('../../models/wallet/TokenWallet');
const TokenTransaction = require('../../models/wallet/TokenTransaction');
const { emitNotification } = require('./notificationEmitter');

/**
 * UPSERT user video progress (throttled, 10 sec interval)
 */
const upsertVideoProgress = async (userId, videoId, progressData) => {
    const progress = await UserVideoProgress.findOneAndUpdate(
        { userId, videoId },
        {
            ...progressData,
            updatedAt: new Date()
        },
        { upsert: true, new: true }
    );

    return progress;
};

/**
 * Calculate course completion %
 */
const calculateCourseCompletion = async (userId, courseId) => {
    const totalVideos = await Video.countDocuments({ courseId });

    if (totalVideos === 0) {
        return { completedVideos: 0, completionPercent: 0 };
    }

    const videos = await Video.find({ courseId }).select('_id').lean();
    const videoIds = videos.map(v => v._id);

    const completedCount = await UserVideoProgress.countDocuments({
        userId,
        videoId: { $in: videoIds },
        completed: true
    });

    const completionPercent = Math.round((completedCount / totalVideos) * 100);

    return {
        completedVideos: completedCount,
        completionPercent
    };
};

/**
 * Get aggregated progress stats
 */
const getAggregatedProgress = async (userId, courseId) => {
    const courseProgress = await UserCourseProgress.findOne({ userId, courseId }).lean();

    if (!courseProgress) {
        return null;
    }

    const videos = await Video.find({ courseId }).select('_id').lean();
    const videoIds = videos.map(v => v._id);

    const videoProgress = await UserVideoProgress.find({
        userId,
        videoId: { $in: videoIds }
    }).lean();

    return {
        courseProgress,
        videoProgress
    };
};

/**
 * Handle batched updates
 */
const batchUpdateProgress = async (updates) => {
    const operations = updates.map(update => ({
        updateOne: {
            filter: { userId: update.userId, videoId: update.videoId },
            update: {
                $set: {
                    lastWatchedSecond: update.lastWatchedSecond,
                    completed: update.completed,
                    updatedAt: new Date()
                }
            },
            upsert: true
        }
    }));

    await UserVideoProgress.bulkWrite(operations);
};

/**
 * Update course progress (called when video is completed)
 */
const updateCourseProgress = async (userId, courseId) => {
    const completion = await calculateCourseCompletion(userId, courseId);

    await UserCourseProgress.findOneAndUpdate(
        { userId, courseId },
        {
            completedVideos: completion.completedVideos,
            completionPercent: completion.completionPercent,
            lastAccessedAt: new Date(),
            updatedAt: new Date()
        },
        { upsert: true }
    );

    await markEnrollmentInProgress(userId, courseId);

    if (completion.completionPercent >= 100) {
        await handleCourseCompletion(userId, courseId);
    }

    return completion;
};

/**
 * Mark enrollment as IN_PROGRESS when user first accesses course
 */
const markEnrollmentInProgress = async (userId, courseId) => {
    try {
        const enrollment = await CourseEnrollment.findOne({
            userId,
            courseId,
            status: 'enrolled'
        });

        if (enrollment) {
            enrollment.status = 'in_progress';
            await enrollment.save();
        }
    } catch (error) {
        logger.error('Error marking enrollment in progress', { error: error.message });
    }
};

/**
 * Handle course completion: Update enrollment status and consume slot
 */
const handleCourseCompletion = async (userId, courseId) => {
    try {
        const enrollment = await CourseEnrollment.findOne({
            userId,
            courseId
        });

        if (!enrollment) {
            return;
        }

        if (enrollment.status === 'completed') {
            return;
        }

        const now = new Date();
        if (enrollment.expiresAt && now > enrollment.expiresAt) {
            if (enrollment.status === 'enrolled' || enrollment.status === 'in_progress') {
                enrollment.status = 'dropped';
                await enrollment.save();
            }
            return;
        }

        enrollment.status = 'completed';
        enrollment.completedAt = now;
        await enrollment.save();

        const course = await Course.findById(courseId);

        if (course) {
            try {
                await emitNotification({
                    recipientType: 'USER',
                    recipientId: userId,
                    category: 'COURSE',
                    type: 'COURSE_COMPLETED',
                    title: 'Course Completed',
                    message: `Congratulations! You've completed "${course.name}"`,
                    channels: ['IN_APP', 'PUSH'],
                    entity: {
                        type: 'COURSE',
                        id: courseId
                    },
                    payload: {
                        courseId: courseId.toString(),
                        courseName: course.name,
                        enrollmentId: enrollment._id.toString()
                    }
                });
            } catch (notifError) {
                logger.error('Failed to emit course completion notification', { error: notifError.message });
            }
        }
        if (course) {
            const updatedCourse = await Course.findByIdAndUpdate(
                courseId,
                { $inc: { completedCount: 1 } },
                { new: true }
            );

            if (updatedCourse.maxCompletions !== null &&
                updatedCourse.maxCompletions !== undefined &&
                updatedCourse.completedCount >= updatedCourse.maxCompletions) {
                updatedCourse.status = 'down';
                await updatedCourse.save();
            }

            if (updatedCourse.rewardTokensPerCompletion > 0) {
                issueCompletionTokens(userId, courseId, enrollment._id, updatedCourse.rewardTokensPerCompletion)
                    .catch(err => {
                        logger.error('Error issuing completion tokens', { error: err.message });
                    });
            }
        }

        logger.info('Course completion recorded', { userId, courseId });
    } catch (error) {
        logger.error('Error handling course completion', { error: error.message });
    }
};

/**
 * Issue tokens for course completion (idempotent)
 */
const issueCompletionTokens = async (userId, courseId, enrollmentId, amount) => {
    try {
        const existingTransaction = await TokenTransaction.findOne({
            userId,
            source: 'COURSE_COMPLETION',
            enrollmentId
        });

        if (existingTransaction) {
            logger.info('Tokens already issued for enrollment, skipping', { enrollmentId: enrollmentId.toString() });
            return;
        }

        let wallet = await TokenWallet.findOne({ userId });
        if (!wallet) {
            wallet = await TokenWallet.create({
                userId,
                balance: 0
            });
        }

        try {
            const transaction = await TokenTransaction.create({
                userId,
                source: 'COURSE_COMPLETION',
                sourceId: courseId,
                enrollmentId,
                amount,
                status: 'CREDITED'
            });

            wallet.balance += amount;
            await wallet.save();

            logger.info('Issued completion tokens to user', { userId, courseId, amount });
            return transaction;
        } catch (error) {
            if (error.code === 11000) {
                logger.info('Token transaction already exists for enrollment, skipping', { enrollmentId: enrollmentId.toString() });
                return;
            }
            throw error;
        }
    } catch (error) {
        logger.error('Error issuing completion tokens', { error: error.message });
        throw error;
    }
};

/**
 * Check and update expired enrollments (background-safe)
 */
const checkExpiredEnrollments = async (courseId = null) => {
    try {
        const now = new Date();
        const query = {
            status: { $in: ['enrolled', 'in_progress'] },
            expiresAt: { $lt: now }
        };

        if (courseId) {
            query.courseId = courseId;
        }

        const expiredEnrollments = await CourseEnrollment.find(query);

        for (const enrollment of expiredEnrollments) {
            enrollment.status = 'dropped';
            await enrollment.save();
        }

        if (expiredEnrollments.length > 0) {
            logger.info('Marked enrollments as dropped', { count: expiredEnrollments.length });
        }

        return expiredEnrollments.length;
    } catch (error) {
        logger.error('Error checking expired enrollments', { error: error.message });
        return 0;
    }
};

module.exports = {
    upsertVideoProgress,
    calculateCourseCompletion,
    getAggregatedProgress,
    batchUpdateProgress,
    updateCourseProgress,
    handleCourseCompletion,
    checkExpiredEnrollments,
    issueCompletionTokens
};

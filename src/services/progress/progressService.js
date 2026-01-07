const UserVideoProgress = require('../../models/progress/UserVideoProgress');
const UserCourseProgress = require('../../models/progress/UserCourseProgress');
const CourseEnrollment = require('../../models/course/CourseEnrollment');
const Course = require('../../models/course/Course');
const Video = require('../../models/course/Video');
const TokenWallet = require('../../models/wallet/TokenWallet');
const TokenTransaction = require('../../models/wallet/TokenTransaction');

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
    // Get total videos in course
    const totalVideos = await Video.countDocuments({ courseId });

    if (totalVideos === 0) {
        return { completedVideos: 0, completionPercent: 0 };
    }

    // Get completed videos
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

    // Get video progress
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

    // Mark enrollment as IN_PROGRESS if it's APPROVED (first access)
    await markEnrollmentInProgress(userId, courseId);

    // STEP 1 & 2: Detect course completion and consume slot
    if (completion.completionPercent >= 100) {
        await handleCourseCompletion(userId, courseId);
    }

    return completion;
};

/**
 * Mark enrollment as IN_PROGRESS when user first accesses course
 * (Non-blocking, doesn't affect existing APIs)
 */
const markEnrollmentInProgress = async (userId, courseId) => {
    try {
        const enrollment = await CourseEnrollment.findOne({
            userId,
            courseId,
            status: 'APPROVED'
        });

        if (enrollment) {
            enrollment.status = 'IN_PROGRESS';
            await enrollment.save();
        }
    } catch (error) {
        // Silently fail - this is a convenience feature
        console.error('Error marking enrollment in progress:', error);
    }
};

/**
 * Handle course completion: Update enrollment status and consume slot
 */
const handleCourseCompletion = async (userId, courseId) => {
    try {
        // Find the enrollment
        const enrollment = await CourseEnrollment.findOne({
            userId,
            courseId
        });

        if (!enrollment) {
            // No enrollment record - user might be in an old course without enrollment
            // Skip completion tracking for backward compatibility
            return;
        }

        // STEP 3: Prevent double counting - check if already completed
        if (enrollment.status === 'COMPLETED') {
            return; // Already counted, ignore
        }

        // STEP 4: Check expiry before processing completion
        const now = new Date();
        if (enrollment.expiresAt && now > enrollment.expiresAt) {
            // Enrollment expired - mark as EXPIRED but don't count completion
            if (enrollment.status === 'APPROVED' || enrollment.status === 'IN_PROGRESS') {
                enrollment.status = 'EXPIRED';
                await enrollment.save();
            }
            return; // No slot consumed for expired enrollments
        }

        // Update enrollment status to COMPLETED
        enrollment.status = 'COMPLETED';
        enrollment.completedAt = now;
        await enrollment.save();

        // STEP 2: Increment course completedCount (first-time completion only)
        const course = await Course.findById(courseId);
        if (course) {
            // Use atomic increment to prevent race conditions
            const updatedCourse = await Course.findByIdAndUpdate(
                courseId,
                { $inc: { completedCount: 1 } },
                { new: true }
            );

            // Check if limit reached
            if (updatedCourse.maxCompletions !== null && 
                updatedCourse.maxCompletions !== undefined &&
                updatedCourse.completedCount >= updatedCourse.maxCompletions) {
                // Set course status to COMPLETED
                updatedCourse.status = 'COMPLETED';
                await updatedCourse.save();
            }

            // STEP 4: Issue tokens on completion (non-blocking)
            if (updatedCourse.rewardTokensPerCompletion > 0) {
                issueCompletionTokens(userId, courseId, enrollment._id, updatedCourse.rewardTokensPerCompletion)
                    .catch(err => {
                        console.error('Error issuing completion tokens:', err);
                        // Don't throw - token issuance failure shouldn't break completion
                    });
            }
        }

        console.log(`✅ Course completion recorded: User ${userId} completed course ${courseId}`);
    } catch (error) {
        console.error('Error handling course completion:', error);
        // Don't throw - completion tracking failure shouldn't break progress updates
    }
};

/**
 * Issue tokens for course completion (idempotent)
 * 
 * ⚠️ IMPORTANT: Tokens are EARN-ONLY.
 * Redemption is intentionally disabled until payment integration.
 * 
 * This function only CREDITS tokens (earns them).
 * Debit/redemption operations are blocked by feature flag.
 */
const issueCompletionTokens = async (userId, courseId, enrollmentId, amount) => {
    try {
        // STEP 5: Check if transaction already exists (idempotency)
        const existingTransaction = await TokenTransaction.findOne({
            userId,
            source: 'COURSE_COMPLETION',
            enrollmentId
        });

        if (existingTransaction) {
            // Already credited - skip to prevent double-crediting
            console.log(`⏭️  Tokens already issued for enrollment ${enrollmentId}, skipping`);
            return;
        }

        // Create or get wallet
        let wallet = await TokenWallet.findOne({ userId });
        if (!wallet) {
            wallet = await TokenWallet.create({
                userId,
                balance: 0
            });
        }

        // Create transaction (unique index will prevent duplicates if race condition occurs)
        try {
            const transaction = await TokenTransaction.create({
                userId,
                source: 'COURSE_COMPLETION',
                sourceId: courseId,
                enrollmentId,
                amount,
                status: 'CREDITED'
            });

            // Increment wallet balance atomically
            wallet.balance += amount;
            await wallet.save();

            console.log(`💰 Issued ${amount} tokens to user ${userId} for completing course ${courseId}`);
            return transaction;
        } catch (error) {
            // Handle unique index violation (race condition)
            if (error.code === 11000) {
                console.log(`⏭️  Token transaction already exists for enrollment ${enrollmentId}, skipping`);
                return;
            }
            throw error;
        }
    } catch (error) {
        console.error('Error issuing completion tokens:', error);
        throw error;
    }
};

/**
 * Check and update expired enrollments (background-safe)
 * Can be called periodically or on-demand
 */
const checkExpiredEnrollments = async (courseId = null) => {
    try {
        const now = new Date();
        const query = {
            status: { $in: ['APPROVED', 'IN_PROGRESS'] },
            expiresAt: { $lt: now }
        };

        if (courseId) {
            query.courseId = courseId;
        }

        const expiredEnrollments = await CourseEnrollment.find(query);

        for (const enrollment of expiredEnrollments) {
            enrollment.status = 'EXPIRED';
            await enrollment.save();
        }

        if (expiredEnrollments.length > 0) {
            console.log(`⏰ Marked ${expiredEnrollments.length} enrollment(s) as EXPIRED`);
        }

        return expiredEnrollments.length;
    } catch (error) {
        console.error('Error checking expired enrollments:', error);
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


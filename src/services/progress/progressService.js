const UserVideoProgress = require('../../models/progress/UserVideoProgress');
const UserCourseProgress = require('../../models/progress/UserCourseProgress');
const Video = require('../../models/course/Video');

/**
 * UPSERT user video progress (throttled, 10 sec interval)
 */
const upsertVideoProgress = async (userId, videoId, progressData) => {
    const progress = await UserVideoProgress.findOneAndUpdate(
        { userId, videoId },
        {
            progress: {
                ...progressData,
                updatedAt: new Date()
            }
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
        'progress.completed': true
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
                    progress: {
                        lastWatchedSecond: update.lastWatchedSecond,
                        completed: update.completed,
                        updatedAt: new Date()
                    }
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
            progress: {
                completedVideos: completion.completedVideos,
                completionPercent: completion.completionPercent,
                lastAccessedAt: new Date(),
                updatedAt: new Date()
            }
        },
        { upsert: true }
    );

    return completion;
};

module.exports = {
    upsertVideoProgress,
    calculateCourseCompletion,
    getAggregatedProgress,
    batchUpdateProgress,
    updateCourseProgress
};


const CourseAnalytics = require('../../models/analytics/CourseAnalytics');
const AnalyticsEvent = require('../../models/analytics/AnalyticsEvent');
const UserActivity = require('../../models/progress/UserActivity');

/**
 * Process video events from queue (Kafka/SQS)
 * This would be called by a background worker
 */
const processAnalyticsEvent = async (eventData) => {
    const { userId, courseId, videoId, eventType, timestamp, metadata } = eventData;

    // Store event
    await AnalyticsEvent.create({
        userId,
        courseId,
        videoId,
        eventType,
        timestamp,
        metadata
    });

    // Update user activity
    await UserActivity.findOneAndUpdate(
        { userId },
        { 
            activity: {
                lastActiveAt: new Date(),
                updatedAt: new Date()
            }
        },
        { upsert: true }
    );

    // Process replay segments
    if (eventType === 'replay_segment' && metadata.from && metadata.to) {
        await updateRepeatedSegments(courseId, metadata.from, metadata.to);
    }
};

/**
 * Aggregate and store in CourseAnalytics
 */
const aggregateCourseAnalytics = async (courseId) => {
    // Get all events for course
    const events = await AnalyticsEvent.find({ courseId }).lean();

    // Calculate metrics
    const totalUsers = new Set(events.map(e => e.userId.toString())).size;

    // Calculate average completion time (simplified)
    const completionEvents = events.filter(e => e.eventType === 'complete');
    const avgCompletionTime = completionEvents.length > 0
        ? completionEvents.reduce((sum, e) => sum + (e.timestamp || 0), 0) / completionEvents.length / 60 // Convert to minutes
        : null;

    // Update analytics
    await CourseAnalytics.findOneAndUpdate(
        { courseId },
        {
            totalUsers,
            avgCompletionTime,
            updatedAt: new Date()
        },
        { upsert: true }
    );
};

/**
 * Update repeated segments
 */
const updateRepeatedSegments = async (courseId, from, to) => {
    const analytics = await CourseAnalytics.findOne({ courseId });

    if (!analytics) {
        await CourseAnalytics.create({
            courseId,
            mostRepeatedSegments: [{ from, to, count: 1 }]
        });
        return;
    }

    // Find existing segment
    const segmentIndex = analytics.mostRepeatedSegments.findIndex(
        s => s.from === from && s.to === to
    );

    if (segmentIndex >= 0) {
        analytics.mostRepeatedSegments[segmentIndex].count += 1;
    } else {
        analytics.mostRepeatedSegments.push({ from, to, count: 1 });
    }

    // Keep only top 10 segments
    analytics.mostRepeatedSegments.sort((a, b) => b.count - a.count);
    analytics.mostRepeatedSegments = analytics.mostRepeatedSegments.slice(0, 10);

    await analytics.save();
};

/**
 * Calculate idle users (materialized view)
 */
const calculateIdleUsers = async (courseId, days = 7) => {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get enrolled users
    const UserCourseProgress = require('../../models/progress/UserCourseProgress');
    const enrolledUsers = await UserCourseProgress.find({ courseId }).select('userId').lean();
    const userIds = enrolledUsers.map(u => u.userId);

    // Get active users
    const activeUsers = await UserActivity.find({
        userId: { $in: userIds },
        'activity.lastActiveAt': { $gte: cutoffDate }
    }).select('userId').lean();

    const activeUserIds = new Set(activeUsers.map(u => u.userId.toString()));
    const idleUserIds = userIds.filter(id => !activeUserIds.has(id.toString()));

    return idleUserIds;
};

/**
 * Generate reports (pre-aggregated)
 */
const generateReport = async (courseId) => {
    const analytics = await CourseAnalytics.findOne({ courseId }).lean();

    if (!analytics) {
        return null;
    }

    return {
        totalUsers: analytics.totalUsers,
        avgCompletionTime: analytics.avgCompletionTime,
        mostRepeatedSegments: analytics.mostRepeatedSegments
    };
};

module.exports = {
    processAnalyticsEvent,
    aggregateCourseAnalytics,
    updateRepeatedSegments,
    calculateIdleUsers,
    generateReport
};


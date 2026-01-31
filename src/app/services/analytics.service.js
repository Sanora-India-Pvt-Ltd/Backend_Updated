/**
 * Course analytics business logic.
 * Used by courseAnalytics.controller.
 */

const CourseAnalytics = require('../../models/analytics/CourseAnalytics');
const Course = require('../../models/course/Course');
const UserActivity = require('../../models/progress/UserActivity');
const UserCourseProgress = require('../../models/progress/UserCourseProgress');
const User = require('../../models/authorization/User');
const Video = require('../../models/course/Video');
const UserVideoProgress = require('../../models/progress/UserVideoProgress');

async function getCourseAnalytics(universityId, params) {
  const { courseId } = params;

  const course = await Course.findById(courseId);
  if (!course) {
    return { statusCode: 404, json: { success: false, message: 'Course not found' } };
  }
  if (course.universityId.toString() !== universityId.toString()) {
    return {
      statusCode: 403,
      json: { success: false, message: 'You do not have permission to view analytics for this course' }
    };
  }

  let analytics = await CourseAnalytics.findOne({ courseId }).lean();
  if (!analytics) {
    analytics = await CourseAnalytics.create({
      courseId,
      totalUsers: 0,
      avgCompletionTime: null,
      mostRepeatedSegments: []
    });
  }

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Analytics retrieved successfully',
      data: { analytics }
    }
  };
}

async function getMostRepeatedSegments(universityId, params) {
  const { courseId } = params;

  const course = await Course.findById(courseId);
  if (!course) {
    return { statusCode: 404, json: { success: false, message: 'Course not found' } };
  }
  if (course.universityId.toString() !== universityId.toString()) {
    return {
      statusCode: 403,
      json: { success: false, message: 'You do not have permission to view analytics for this course' }
    };
  }

  const analytics = await CourseAnalytics.findOne({ courseId }).lean();
  if (!analytics || !analytics.mostRepeatedSegments || analytics.mostRepeatedSegments.length === 0) {
    return {
      statusCode: 200,
      json: { success: true, message: 'No repeated segments found', data: { segments: [] } }
    };
  }

  const segments = analytics.mostRepeatedSegments.sort((a, b) => b.count - a.count);
  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Repeated segments retrieved successfully',
      data: { segments }
    }
  };
}

async function getIdleUsers(universityId, params, query) {
  const { courseId } = params;
  const days = Number(query?.days) || 7;

  const course = await Course.findById(courseId);
  if (!course) {
    return { statusCode: 404, json: { success: false, message: 'Course not found' } };
  }
  if (course.universityId.toString() !== universityId.toString()) {
    return {
      statusCode: 403,
      json: { success: false, message: 'You do not have permission to view analytics for this course' }
    };
  }

  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const enrolledUsers = await UserCourseProgress.find({ courseId }).select('userId').lean();
  const userIds = enrolledUsers.map((u) => u.userId);

  const activeUsers = await UserActivity.find({
    userId: { $in: userIds },
    lastActiveAt: { $gte: cutoffDate }
  })
    .select('userId')
    .lean();

  const activeUserIds = new Set(activeUsers.map((u) => u.userId.toString()));
  const idleUserIds = userIds.filter((id) => !activeUserIds.has(id.toString()));

  const idleUsers = await User.find({ _id: { $in: idleUserIds } })
    .select('profile.name.full profile.email')
    .lean();

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Idle users retrieved successfully',
      data: { idleUsers, totalIdle: idleUsers.length, days }
    }
  };
}

async function getUserEngagementMetrics(universityId, params) {
  const { courseId } = params;

  const course = await Course.findById(courseId);
  if (!course) {
    return { statusCode: 404, json: { success: false, message: 'Course not found' } };
  }
  if (course.universityId.toString() !== universityId.toString()) {
    return {
      statusCode: 403,
      json: { success: false, message: 'You do not have permission to view analytics for this course' }
    };
  }

  const enrolledUsers = await UserCourseProgress.find({ courseId }).lean();
  const videos = await Video.find({ courseId }).select('_id duration').lean();
  const videoIds = videos.map((v) => v._id);

  const videoProgress = await UserVideoProgress.find({
    videoId: { $in: videoIds },
    completed: true
  }).lean();

  const totalVideosWatched = videoProgress.length;
  const totalTimeSpent = videos.reduce((sum, video) => {
    const watchedCount = videoProgress.filter(
      (vp) => vp.videoId.toString() === video._id.toString()
    ).length;
    return sum + video.duration * watchedCount;
  }, 0);

  const avgCompletionRate =
    enrolledUsers.length > 0
      ? enrolledUsers.reduce((sum, u) => sum + u.completionPercent, 0) / enrolledUsers.length
      : 0;

  return {
    statusCode: 200,
    json: {
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
    }
  };
}

module.exports = {
  getCourseAnalytics,
  getMostRepeatedSegments,
  getIdleUsers,
  getUserEngagementMetrics
};

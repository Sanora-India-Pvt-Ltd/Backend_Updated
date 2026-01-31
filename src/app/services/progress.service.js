/**
 * Course and video progress business logic.
 * Used by progress controllers (courseProgress, userProgress).
 */

const UserCourseProgress = require('../../models/progress/UserCourseProgress');
const UserVideoProgress = require('../../models/progress/UserVideoProgress');
const Video = require('../../models/course/Video');
const Course = require('../../models/course/Course');
const User = require('../../models/authorization/User');
const { updateCourseProgress } = require('./progressService');

const progressUpdateCache = new Map();

async function getCourseProgress(userId, params) {
  const { courseId } = params;
  if (!userId) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }

  const courseProgress = await UserCourseProgress.findOne({ userId, courseId }).lean();
  if (!courseProgress) {
    return { statusCode: 404, json: { success: false, message: 'You are not enrolled in this course' } };
  }

  const totalVideos = await Video.countDocuments({ courseId });
  const completedVideos = courseProgress.completedVideos ?? 0;
  const completionPercent = courseProgress.completionPercent ?? 0;
  const {
    _id,
    userId: progressUserId,
    courseId: progressCourseId,
    lastAccessedAt,
    updatedAt,
    createdAt
  } = courseProgress;

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Course progress retrieved successfully',
      data: {
        progress: {
          _id,
          userId: progressUserId,
          courseId: progressCourseId,
          completedVideos,
          completionPercent,
          lastAccessedAt,
          updatedAt,
          createdAt,
          totalVideos,
          remainingVideos: totalVideos - completedVideos
        }
      }
    }
  };
}

async function getCompletionStats(userId) {
  if (!userId) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }

  const courseProgressList = await UserCourseProgress.find({ userId }).lean();
  const stats = await Promise.all(
    courseProgressList.map(async (progress) => {
      const totalVideos = await Video.countDocuments({ courseId: progress.courseId });
      const course = await Course.findById(progress.courseId).select('name').lean();
      return {
        courseId: progress.courseId,
        courseName: course?.name || 'Unknown',
        completedVideos: progress.completedVideos ?? 0,
        totalVideos,
        completionPercent: progress.completionPercent ?? 0
      };
    })
  );

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Completion stats retrieved successfully',
      data: { stats }
    }
  };
}

async function resetProgress(userId, params) {
  const { courseId, userId: targetUserId } = params;
  if (!userId) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }

  const course = await Course.findById(courseId);
  if (!course) {
    return { statusCode: 404, json: { success: false, message: 'Course not found' } };
  }

  const user = await User.findById(userId);
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'admin';
  const isCourseOwner = course.universityId.toString() === userId.toString();

  if (!isAdmin && !isCourseOwner) {
    return { statusCode: 403, json: { success: false, message: 'You do not have permission to reset progress' } };
  }

  const targetUserIdToReset = targetUserId || userId;
  const videos = await Video.find({ courseId }).select('_id').lean();
  const videoIds = videos.map((v) => v._id);
  await UserVideoProgress.deleteMany({
    userId: targetUserIdToReset,
    videoId: { $in: videoIds }
  });

  await UserCourseProgress.findOneAndUpdate(
    { userId: targetUserIdToReset, courseId },
    {
      completedVideos: 0,
      completionPercent: 0,
      lastAccessedAt: new Date()
    },
    { upsert: true }
  );

  return { statusCode: 200, json: { success: true, message: 'Progress reset successfully' } };
}

async function updateVideoProgress(userId, params, body) {
  const videoId = params.videoId || body.videoId;
  const { lastWatchedSecond, progressPercent } = body || {};

  if (!userId) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }
  if (!videoId) {
    return { statusCode: 400, json: { success: false, message: 'videoId is required' } };
  }

  const video = await Video.findById(videoId);
  if (!video) {
    return { statusCode: 404, json: { success: false, message: 'Video not found' } };
  }

  const cacheKey = `${userId}:${videoId}`;
  const lastUpdate = progressUpdateCache.get(cacheKey);
  const now = Date.now();
  if (lastUpdate && now - lastUpdate < 10000) {
    return {
      statusCode: 200,
      json: { success: true, message: 'Progress update throttled (10 second interval)', data: { throttled: true } }
    };
  }
  progressUpdateCache.set(cacheKey, now);

  const existingProgress = await UserVideoProgress.findOne({ userId, videoId });
  const wasAlreadyCompleted = existingProgress && existingProgress.completed;

  const updateData = { updatedAt: new Date() };
  if (progressPercent !== undefined && progressPercent !== null) {
    updateData.progressPercent = Math.min(100, Math.max(0, progressPercent));
  }
  if (lastWatchedSecond !== undefined && lastWatchedSecond !== null) {
    updateData.lastWatchedSecond = Math.max(0, lastWatchedSecond);
  }
  if (
    progressPercent !== undefined &&
    progressPercent !== null &&
    progressPercent >= 100 &&
    !wasAlreadyCompleted
  ) {
    updateData.completed = true;
    updateData.completedAt = new Date();
  }

  const progress = await UserVideoProgress.findOneAndUpdate(
    { userId, videoId },
    updateData,
    { upsert: true, new: true }
  );

  const justCompleted = progress.completed && !wasAlreadyCompleted;
  if (justCompleted) {
    updateCourseProgress(userId, video.courseId).catch(() => {});
  }

  return {
    statusCode: 200,
    json: { success: true, message: 'Progress updated successfully', data: { progress } }
  };
}

async function getVideoProgress(userId, params) {
  const { videoId } = params;
  if (!userId) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }

  const progress = await UserVideoProgress.findOne({ userId, videoId }).lean();
  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Progress retrieved successfully',
      data: {
        progress: progress || { lastWatchedSecond: 0, completed: false }
      }
    }
  };
}

async function getMultipleProgress(userId, params) {
  const { playlistId } = params;
  if (!userId) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }

  const videos = await Video.find({ playlistId }).select('_id').lean();
  const videoIds = videos.map((v) => v._id);
  const progressList = await UserVideoProgress.find({
    userId,
    videoId: { $in: videoIds }
  }).lean();

  const progressMap = {};
  progressList.forEach((p) => {
    progressMap[p.videoId.toString()] = {
      lastWatchedSecond: p.lastWatchedSecond,
      completed: p.completed
    };
  });

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Progress retrieved successfully',
      data: { progress: progressMap }
    }
  };
}

async function markVideoComplete(userId, params) {
  const { videoId } = params;
  if (!userId) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }

  const video = await Video.findById(videoId);
  if (!video) {
    return { statusCode: 404, json: { success: false, message: 'Video not found' } };
  }

  const progress = await UserVideoProgress.findOneAndUpdate(
    { userId, videoId },
    { completed: true, updatedAt: new Date() },
    { upsert: true, new: true }
  );

  updateCourseProgress(userId, video.courseId).catch(() => {});

  return {
    statusCode: 200,
    json: { success: true, message: 'Video marked as complete', data: { progress } }
  };
}

module.exports = {
  getCourseProgress,
  getCompletionStats,
  resetProgress,
  updateVideoProgress,
  getVideoProgress,
  getMultipleProgress,
  markVideoComplete
};

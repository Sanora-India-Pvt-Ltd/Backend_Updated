/**
 * Notifications, device tokens, and broadcast business logic.
 * Used by notification.controller, deviceToken.controller, broadcast.controller.
 */

const mongoose = require('mongoose');
const Notification = require('../../models/notification/Notification');
const DeviceToken = require('../../models/notification/DeviceToken');
const User = require('../../models/authorization/User');
const University = require('../../models/auth/University');
const { getCategoryMeta } = require('../../utils/notificationCategoryMeta');
const { NOTIFICATION_CATEGORIES } = require('../../core/constants/notificationCategories');
const { emitNotification } = require('../../core/infra/notificationEmitter');

function getRecipient(req) {
  if (req.user && req.userId) {
    return { recipientId: req.userId, recipientType: 'USER' };
  }
  if (req.universityId) {
    return { recipientId: req.universityId, recipientType: 'UNIVERSITY' };
  }
  return null;
}

async function getMyNotifications(recipientId, recipientType, query) {
  if (!recipientId || !recipientType) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }

  const page = Math.max(1, parseInt(query?.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(query?.limit) || 20));
  const skip = (page - 1) * limit;
  const unreadOnly = query?.unreadOnly === 'true' || query?.unreadOnly === true;
  const { category } = query || {};

  const findQuery = { recipientId, recipientType };
  if (unreadOnly) findQuery.isRead = false;
  if (category && NOTIFICATION_CATEGORIES.includes(category.toUpperCase())) {
    findQuery.category = category.toUpperCase();
  }

  const [notifications, totalCount] = await Promise.all([
    Notification.find(findQuery).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(findQuery)
  ]);

  const enrichedNotifications = notifications.map((notification) => {
    const categoryMeta = getCategoryMeta(notification.category || 'SYSTEM');
    return { ...notification, categoryMeta };
  });

  const totalPages = Math.ceil(totalCount / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Notifications retrieved successfully',
      data: {
        notifications: enrichedNotifications,
        pagination: {
          currentPage: page,
          limit,
          totalCount,
          totalPages,
          hasNextPage,
          hasPrevPage
        }
      }
    }
  };
}

async function getUnreadCount(recipientId, recipientType) {
  if (!recipientId || !recipientType) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }

  const unreadCount = await Notification.countDocuments({
    recipientId,
    recipientType,
    isRead: false
  });

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Unread count retrieved successfully',
      data: { unreadCount }
    }
  };
}

async function markAsRead(notificationId, recipientId, recipientType) {
  if (!recipientId || !recipientType) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    return { statusCode: 400, json: { success: false, message: 'Invalid notification ID' } };
  }

  const notification = await Notification.findById(notificationId);
  if (!notification) {
    return { statusCode: 404, json: { success: false, message: 'Notification not found' } };
  }
  if (
    notification.recipientId.toString() !== recipientId.toString() ||
    notification.recipientType !== recipientType
  ) {
    return {
      statusCode: 403,
      json: { success: false, message: 'You do not have permission to mark this notification as read' }
    };
  }

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }

  return { statusCode: 200, json: { success: true, message: 'Notification marked as read' } };
}

async function markAllAsRead(recipientId, recipientType) {
  if (!recipientId || !recipientType) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }

  const result = await Notification.updateMany(
    { recipientId, recipientType, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'All notifications marked as read',
      data: { updatedCount: result.modifiedCount }
    }
  };
}

async function markCategoryAsRead(category, recipientId, recipientType) {
  if (!recipientId || !recipientType) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }
  if (!category) {
    return { statusCode: 400, json: { success: false, message: 'Category is required' } };
  }

  const categoryUpper = category.toUpperCase();
  if (!NOTIFICATION_CATEGORIES.includes(categoryUpper)) {
    return {
      statusCode: 400,
      json: {
        success: false,
        message: `Invalid category. Allowed categories: ${NOTIFICATION_CATEGORIES.join(', ')}`
      }
    };
  }

  const result = await Notification.updateMany(
    { recipientId, recipientType, category: categoryUpper, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Category notifications marked as read',
      data: { category: categoryUpper, updatedCount: result.modifiedCount }
    }
  };
}

async function registerDeviceToken(body, recipientId, role) {
  if (!recipientId || !role) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }

  const { token, platform } = body || {};
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return { statusCode: 400, json: { success: false, message: 'Token is required and must be a non-empty string' } };
  }
  if (!platform || !['ANDROID', 'IOS', 'WEB'].includes(platform)) {
    return { statusCode: 400, json: { success: false, message: 'Platform is required and must be one of: ANDROID, IOS, WEB' } };
  }

  const tokenData = {
    token: token.trim(),
    platform,
    role,
    isActive: true,
    lastUsedAt: new Date()
  };
  if (role === 'USER') {
    tokenData.userId = recipientId;
  } else {
    tokenData.universityId = recipientId;
  }

  const existingToken = await DeviceToken.findOne({ token: token.trim() });

  if (existingToken) {
    if (
      existingToken.userId?.toString() === recipientId.toString() ||
      existingToken.universityId?.toString() === recipientId.toString()
    ) {
      existingToken.isActive = true;
      existingToken.lastUsedAt = new Date();
      existingToken.platform = platform;
      await existingToken.save();
    } else {
      existingToken.isActive = false;
      await existingToken.save();
      await DeviceToken.create(tokenData);
    }
  } else {
    await DeviceToken.create(tokenData);
  }

  return {
    statusCode: 200,
    json: { success: true, message: 'Device token registered successfully', data: { platform, role } }
  };
}

async function unregisterDeviceToken(token, recipientId, role) {
  if (!recipientId || !role) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }
  if (!token) {
    return { statusCode: 400, json: { success: false, message: 'Token is required' } };
  }

  const query = { token: token.trim(), role };
  if (role === 'USER') query.userId = recipientId;
  else query.universityId = recipientId;

  const deviceToken = await DeviceToken.findOne(query);
  if (!deviceToken) {
    return { statusCode: 404, json: { success: false, message: 'Device token not found' } };
  }

  deviceToken.isActive = false;
  await deviceToken.save();

  return {
    statusCode: 200,
    json: { success: true, message: 'Device token unregistered successfully' }
  };
}

async function sendBroadcast(body, isSystem) {
  const { title, message, category, scope, payload, priority, channels } = body || {};

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return { statusCode: 400, json: { success: false, message: 'Title is required and must be a non-empty string' } };
  }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return { statusCode: 400, json: { success: false, message: 'Message is required and must be a non-empty string' } };
  }
  if (!category || !NOTIFICATION_CATEGORIES.includes(category)) {
    return {
      statusCode: 400,
      json: { success: false, message: `Category is required and must be one of: ${NOTIFICATION_CATEGORIES.join(', ')}` }
    };
  }
  if (!scope || !['ALL', 'USERS', 'UNIVERSITIES'].includes(scope)) {
    return {
      statusCode: 400,
      json: { success: false, message: 'Scope is required and must be one of: ALL, USERS, UNIVERSITIES' }
    };
  }

  const createdBy = isSystem ? 'SYSTEM' : 'ADMIN';
  const recipients = [];
  const batchSize = 500;

  if (scope === 'USERS' || scope === 'ALL') {
    let userSkip = 0;
    let hasMoreUsers = true;
    while (hasMoreUsers) {
      const users = await User.find({}).select('_id').skip(userSkip).limit(batchSize).lean();
      if (users.length === 0) hasMoreUsers = false;
      else {
        users.forEach((user) => {
          recipients.push({ recipientId: user._id, recipientType: 'USER' });
        });
        userSkip += batchSize;
        if (users.length < batchSize) hasMoreUsers = false;
      }
    }
  }

  if (scope === 'UNIVERSITIES' || scope === 'ALL') {
    let universitySkip = 0;
    let hasMoreUniversities = true;
    while (hasMoreUniversities) {
      const universities = await University.find({}).select('_id').skip(universitySkip).limit(batchSize).lean();
      if (universities.length === 0) hasMoreUniversities = false;
      else {
        universities.forEach((university) => {
          recipients.push({ recipientId: university._id, recipientType: 'UNIVERSITY' });
        });
        universitySkip += batchSize;
        if (universities.length < batchSize) hasMoreUniversities = false;
      }
    }
  }

  if (recipients.length === 0) {
    return { statusCode: 400, json: { success: false, message: 'No recipients found for the specified scope' } };
  }

  let processedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < recipients.length; i += batchSize) {
    const batch = recipients.slice(i, i + batchSize);
    const batchPromises = batch.map(async (recipient) => {
      try {
        await emitNotification({
          recipientId: recipient.recipientId,
          recipientType: recipient.recipientType,
          category,
          type: 'BROADCAST',
          title: title.trim(),
          message: message.trim(),
          payload: payload || {},
          priority: priority || 'NORMAL',
          channels: channels || ['IN_APP', 'PUSH'],
          _broadcast: true,
          _broadcastScope: scope,
          _createdBy: createdBy
        });
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });
    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach((r) => (r.success ? processedCount++ : failedCount++));
  }

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Broadcast notification sent successfully',
      data: {
        totalRecipients: recipients.length,
        processed: processedCount,
        failed: failedCount,
        scope,
        category
      }
    }
  };
}

module.exports = {
  getRecipient,
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  markCategoryAsRead,
  registerDeviceToken,
  unregisterDeviceToken,
  sendBroadcast
};

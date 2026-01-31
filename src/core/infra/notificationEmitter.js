/**
 * Global Notification Emitter (infrastructure).
 * Full implementation. Replaces legacy src/services/notification/notificationEmitter.js.
 *
 * Any part of the backend can emit notifications using this single function
 * without knowing how notifications are stored or delivered.
 *
 * Design: Fail-safe, fire-and-forget, validation, structured logging.
 */

const logger = require('../logger');
const Notification = require('../../models/notification/Notification');
const mongoose = require('mongoose');
const { enqueueNotificationDelivery } = require('../../queues/notification.queue');

/**
 * Emit a notification
 *
 * @param {Object} payload - Notification payload
 * @param {ObjectId} payload.recipientId - ID of the recipient (User/University/Admin)
 * @param {String} payload.recipientType - 'USER' | 'UNIVERSITY' | 'ADMIN'
 * @param {String} payload.category - 'COURSE' | 'VIDEO' | 'SOCIAL' | 'MARKETPLACE' | 'WALLET' | 'SYSTEM'
 * @param {String} payload.type - Event identifier (e.g. 'COURSE_ENROLL_APPROVED')
 * @param {String} payload.title - Short notification title
 * @param {String} payload.message - Human-readable message
 * @param {Object} [payload.entity] - Optional entity reference { type: String, id: ObjectId }
 * @param {Object} [payload.payload] - Optional extra data for frontend
 * @param {String} [payload.priority] - 'LOW' | 'NORMAL' | 'HIGH' (default: 'NORMAL')
 * @param {Array<String>} [payload.channels] - Delivery channels (default: ['IN_APP'])
 * @returns {Promise<void>} - Resolves when notification is created (or fails silently)
 */
const emitNotification = async (payload) => {
  try {
    const requiredFields = ['recipientId', 'recipientType', 'category', 'type', 'title', 'message'];
    const missingFields = requiredFields.filter(
      (field) => !payload || payload[field] === undefined || payload[field] === null
    );

    if (missingFields.length > 0) {
      logger.error('Notification emitter operation failed', {
        reason: 'Missing required fields',
        missingFields,
        providedPayload: payload ? Object.keys(payload) : 'null'
      });
      return;
    }

    const validRecipientTypes = ['USER', 'UNIVERSITY', 'ADMIN'];
    if (!validRecipientTypes.includes(payload.recipientType)) {
      logger.error('Notification emitter operation failed', {
        reason: 'Invalid recipientType',
        recipientType: payload.recipientType,
        validTypes: validRecipientTypes
      });
      return;
    }

    const validCategories = ['COURSE', 'VIDEO', 'SOCIAL', 'MARKETPLACE', 'WALLET', 'SYSTEM'];
    if (!validCategories.includes(payload.category)) {
      logger.error('Notification emitter operation failed', {
        reason: 'Invalid category',
        category: payload.category,
        validCategories
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(payload.recipientId)) {
      logger.error('Notification emitter operation failed', {
        reason: 'Invalid recipientId',
        recipientId: payload.recipientId
      });
      return;
    }

    if (payload.entity && payload.entity.id && !mongoose.Types.ObjectId.isValid(payload.entity.id)) {
      logger.error('Notification emitter operation failed', {
        reason: 'Invalid entity.id',
        entityId: payload.entity.id
      });
      return;
    }

    if (payload.priority) {
      const validPriorities = ['LOW', 'NORMAL', 'HIGH'];
      if (!validPriorities.includes(payload.priority)) {
        logger.error('Notification emitter operation failed', {
          reason: 'Invalid priority',
          priority: payload.priority,
          validPriorities
        });
        return;
      }
    }

    const notificationData = {
      recipientId: payload.recipientId,
      recipientType: payload.recipientType,
      category: payload.category,
      type: payload.type,
      title: payload.title.trim(),
      message: payload.message.trim(),
      entity: payload.entity || undefined,
      payload: payload.payload || {},
      priority: payload.priority || 'NORMAL',
      channels: payload.channels || ['IN_APP'],
      isRead: false,
      readAt: null,
      broadcast: payload._broadcast || false,
      broadcastScope: payload._broadcastScope || null,
      createdBy: payload._createdBy || null
    };

    const notification = await Notification.create(notificationData);

    try {
      await enqueueNotificationDelivery({
        notificationId: notification._id.toString(),
        recipient: {
          id: payload.recipientId.toString(),
          role: payload.recipientType
        }
      });
    } catch (queueError) {
      logger.error('Notification emitter operation failed', {
        reason: 'Enqueue delivery failed (notification still saved)',
        error: queueError,
        notificationId: notification._id
      });
    }

    logger.info('Notification emitted', {
      notificationId: notification._id,
      type: payload.type,
      recipientType: payload.recipientType,
      recipientId: payload.recipientId.toString(),
      category: payload.category,
      priority: notificationData.priority,
      channels: notificationData.channels
    });
  } catch (error) {
    logger.error('Notification emitter operation failed', {
      error,
      payload: payload
        ? {
            type: payload.type,
            recipientType: payload.recipientType,
            recipientId: payload.recipientId?.toString(),
            category: payload.category
          }
        : 'null'
    });
  }
};

/**
 * Emit notification (fire-and-forget wrapper). Never throws.
 */
const emitNotificationSync = (payload) => {
  emitNotification(payload).catch(() => {});
};

module.exports = {
  emitNotification,
  emitNotificationSync
};

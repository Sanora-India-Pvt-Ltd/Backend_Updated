/**
 * Push notification delivery (FCM). Full implementation.
 * Replaces legacy src/services/notification/pushNotification.service.js.
 */

const logger = require('../logger');
const DeviceToken = require('../../models/notification/DeviceToken');
const { getMessaging } = require('../../config/firebase');

const sendPushNotification = async ({ recipientId, recipientType, title, body, data = {} }) => {
  try {
    const messaging = getMessaging();

    if (!messaging) {
      return {
        success: false,
        reason: 'Firebase not configured',
        sentCount: 0,
        failedTokens: []
      };
    }

    if (!recipientId || !recipientType) {
      logger.warn('Push notification skipped: Missing recipient info');
      return {
        success: false,
        reason: 'Missing recipient info',
        sentCount: 0,
        failedTokens: []
      };
    }

    const query = { role: recipientType, isActive: true };
    if (recipientType === 'USER') {
      query.userId = recipientId;
    } else {
      query.universityId = recipientId;
    }

    const deviceTokens = await DeviceToken.find(query).select('token platform').lean();

    if (!deviceTokens || deviceTokens.length === 0) {
      return {
        success: true,
        reason: 'No active device tokens',
        sentCount: 0,
        failedTokens: []
      };
    }

    const tokens = deviceTokens.map((dt) => dt.token);

    const message = {
      notification: { title, body },
      data: {
        notificationId: data.notificationId?.toString() || '',
        category: data.category || '',
        type: data.type || '',
        ...Object.keys(data).reduce((acc, key) => {
          if (key !== 'notificationId' && key !== 'category' && key !== 'type') {
            acc[key] = typeof data[key] === 'object' ? JSON.stringify(data[key]) : String(data[key] || '');
          }
          return acc;
        }, {})
      },
      android: {
        priority: 'high',
        notification: { sound: 'default', channelId: 'default' }
      },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      webpush: {
        notification: { icon: '/icon-192x192.png', badge: '/badge-72x72.png' }
      }
    };

    const response = await messaging.sendEachForMulticast({
      tokens,
      ...message
    });

    const sentCount = response.successCount;
    const failedCount = response.failureCount;
    const failedTokens = [];

    if (response.responses) {
      response.responses.forEach((result, index) => {
        if (!result.success) {
          const token = tokens[index];
          failedTokens.push({ token, error: result.error?.code || 'unknown' });

          const invalidTokenErrors = [
            'messaging/invalid-registration-token',
            'messaging/registration-token-not-registered',
            'messaging/invalid-argument'
          ];

          if (result.error && invalidTokenErrors.includes(result.error.code)) {
            DeviceToken.updateOne({ token }, { isActive: false }).catch((err) =>
              logger.error('Failed to deactivate invalid token', err)
            );
            logger.info('Token invalidated', { tokenPrefix: token.substring(0, 20) });
          }
        } else {
          DeviceToken.updateOne({ token: tokens[index] }, { lastUsedAt: new Date() }).catch(() => {});
        }
      });
    }

    if (sentCount > 0) {
      logger.info('Push notification sent', {
        recipientType,
        recipientId: recipientId.toString(),
        sentCount,
        failedCount,
        totalTokens: tokens.length
      });
    }

    if (failedCount > 0) {
      logger.warn('Push notification partial failure', {
        recipientType,
        recipientId: recipientId.toString(),
        sentCount,
        failedCount,
        failedTokensCount: failedTokens.length
      });
    }

    return {
      success: sentCount > 0,
      sentCount,
      failedCount,
      failedTokens: failedTokens.map((ft) => ft.token),
      totalTokens: tokens.length
    };
  } catch (error) {
    logger.error('Push notification error (silently handled)', {
      error: error.message,
      recipientType,
      recipientId: recipientId?.toString()
    });

    return {
      success: false,
      reason: error.message,
      sentCount: 0,
      failedTokens: []
    };
  }
};

module.exports = {
  sendPushNotification
};

const express = require('express');
const router = express.Router();
const { flexibleAuth } = require('../../middleware/flexibleAuth.middleware');
const {
    getMyNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    markCategoryAsRead
} = require('../../controllers/notification/notification.controller');
const {
    registerDeviceToken,
    unregisterDeviceToken
} = require('../../controllers/notification/deviceToken.controller');
const {
    getPreferences,
    updatePreference
} = require('../../controllers/notification/notificationPreference.controller');

/**
 * Notification Routes
 * 
 * All routes use flexibleAuth to support both USER and UNIVERSITY tokens.
 * No role guards needed - both user types can access their own notifications.
 */

// Get user's notifications (paginated)
// GET /api/notifications?page=1&limit=20&unreadOnly=false
router.get('/', flexibleAuth, getMyNotifications);

// Get unread notification count
// GET /api/notifications/unread-count
router.get('/unread-count', flexibleAuth, getUnreadCount);

// Mark all notifications as read
// PUT /api/notifications/read-all
router.put('/read-all', flexibleAuth, markAllAsRead);

// Mark all notifications of a category as read
// PUT /api/notifications/read-category
router.put('/read-category', flexibleAuth, markCategoryAsRead);

// Mark a single notification as read
// PUT /api/notifications/:notificationId/read
router.put('/:notificationId/read', flexibleAuth, markAsRead);

// Register device token for push notifications
// POST /api/notifications/device-token
router.post('/device-token', flexibleAuth, registerDeviceToken);

// Unregister device token
// DELETE /api/notifications/device-token/:token
router.delete('/device-token/:token', flexibleAuth, unregisterDeviceToken);

// Get notification preferences
// GET /api/notifications/preferences
router.get('/preferences', flexibleAuth, getPreferences);

// Update notification preference
// PUT /api/notifications/preferences
router.put('/preferences', flexibleAuth, updatePreference);

module.exports = router;

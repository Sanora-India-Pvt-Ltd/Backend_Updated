const notificationService = require('../../app/services/notification.service');

const getMyNotifications = async (req, res) => {
  try {
    const recipient = notificationService.getRecipient(req);
    if (!recipient) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const result = await notificationService.getMyNotifications(
      recipient.recipientId,
      recipient.recipientType,
      req.query
    );
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve notifications',
      error: err.message
    });
  }
};

const getUnreadCount = async (req, res) => {
  try {
    const recipient = notificationService.getRecipient(req);
    if (!recipient) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const result = await notificationService.getUnreadCount(
      recipient.recipientId,
      recipient.recipientType
    );
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve unread count',
      error: err.message
    });
  }
};

const markAsRead = async (req, res) => {
  try {
    const recipient = notificationService.getRecipient(req);
    if (!recipient) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const result = await notificationService.markAsRead(
      req.params.notificationId,
      recipient.recipientId,
      recipient.recipientType
    );
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: err.message
    });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    const recipient = notificationService.getRecipient(req);
    if (!recipient) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const result = await notificationService.markAllAsRead(
      recipient.recipientId,
      recipient.recipientType
    );
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: err.message
    });
  }
};

const markCategoryAsRead = async (req, res) => {
  try {
    const recipient = notificationService.getRecipient(req);
    if (!recipient) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const result = await notificationService.markCategoryAsRead(
      req.body?.category,
      recipient.recipientId,
      recipient.recipientType
    );
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to mark category notifications as read',
      error: err.message
    });
  }
};

module.exports = {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  markCategoryAsRead
};

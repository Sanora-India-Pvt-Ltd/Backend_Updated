const notificationService = require('../../app/services/notification.service');

const sendBroadcast = async (req, res) => {
  try {
    const result = await notificationService.sendBroadcast(req.body, req.isSystem);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to send broadcast notification',
      error: err.message
    });
  }
};

module.exports = {
  sendBroadcast
};

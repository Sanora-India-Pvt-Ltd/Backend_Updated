const asyncHandler = require('../../core/utils/asyncHandler');
const notificationService = require('../../app/services/notification.service');

const registerDeviceToken = asyncHandler(async (req, res) => {
  const recipientId = req.user && req.userId ? req.userId : req.universityId;
  const role = req.user && req.userId ? 'USER' : 'UNIVERSITY';
  const result = await notificationService.registerDeviceToken(req.body, recipientId, role);
  return res.status(result.statusCode).json(result.json);
});

const unregisterDeviceToken = asyncHandler(async (req, res) => {
  const recipientId = req.user && req.userId ? req.userId : req.universityId;
  const role = req.user && req.userId ? 'USER' : 'UNIVERSITY';
  const result = await notificationService.unregisterDeviceToken(
    req.params.token,
    recipientId,
    role
  );
  return res.status(result.statusCode).json(result.json);
});

module.exports = {
  registerDeviceToken,
  unregisterDeviceToken
};

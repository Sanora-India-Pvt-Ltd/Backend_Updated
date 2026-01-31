/**
 * Debug Notification Test Routes
 * Wiring only. Logic lives in controller and app service.
 * WARNING: Debug endpoint with no authentication. Remove or secure in production.
 */

const express = require('express');
const router = express.Router();
const debugNotificationTestController = require('../../controllers/debug/debugNotificationTest.controller');

router.post('/emit-test', debugNotificationTestController.emitTest);

module.exports = router;

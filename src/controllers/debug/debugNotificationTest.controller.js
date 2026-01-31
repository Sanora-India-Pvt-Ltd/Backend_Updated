/**
 * Thin controller for debug notification test.
 * Reads req, calls debugNotification.service, sends HTTP response.
 */

const debugNotificationService = require('../../app/services/debugNotification.service');

async function emitTest(req, res) {
    const result = await debugNotificationService.emitTest(req.body);
    res.status(result.statusCode).json(result.json);
}

module.exports = {
    emitTest
};

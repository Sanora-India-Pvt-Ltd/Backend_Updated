/**
 * Debug notification service.
 * Used only for debug/test endpoints. Calls core/infra notificationEmitter.
 */

const mongoose = require('mongoose');
const { emitNotification } = require('../../core/infra/notificationEmitter');

async function emitTest(body) {
    const { recipientId } = body || {};

    if (!recipientId) {
        return { statusCode: 400, json: { success: false, message: 'recipientId is required' } };
    }

    if (!mongoose.Types.ObjectId.isValid(recipientId)) {
        return { statusCode: 400, json: { success: false, message: 'Invalid recipientId format' } };
    }

    try {
        await emitNotification({
            recipientId,
            recipientType: 'USER',
            category: 'SYSTEM',
            type: 'TEST_NOTIFICATION',
            title: 'Test',
            message: 'Notification system working',
            channels: ['IN_APP', 'PUSH'],
            payload: {
                source: 'debug',
                timestamp: new Date().toISOString()
            }
        });

        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Test notification emitted',
                data: { recipientId }
            }
        };
    } catch (error) {
        return {
            statusCode: 500,
            json: {
                success: false,
                message: 'Failed to emit test notification',
                error: error.message
            }
        };
    }
}

module.exports = {
    emitTest
};

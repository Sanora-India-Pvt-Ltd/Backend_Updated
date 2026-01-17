const express = require('express');
const router = express.Router();
const { emitNotification } = require('../../services/notification/notificationEmitter');
const mongoose = require('mongoose');

/**
 * Debug Notification Test Routes
 * 
 * Temporary API for testing notification system.
 * Verifies that notifications are saved to database and processed correctly.
 * 
 * WARNING: This is a debug endpoint with no authentication.
 * Remove or secure this in production.
 */

/**
 * Emit test notification
 * POST /api/debug/notifications/emit-test
 */
router.post('/emit-test', async (req, res) => {
    try {
        const { recipientId } = req.body;

        // Validate recipientId
        if (!recipientId) {
            return res.status(400).json({
                success: false,
                message: 'recipientId is required'
            });
        }

        if (!mongoose.Types.ObjectId.isValid(recipientId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid recipientId format'
            });
        }

        // Emit test notification using existing notificationEmitter
        await emitNotification({
            recipientId: recipientId,
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

        return res.status(200).json({
            success: true,
            message: 'Test notification emitted',
            data: {
                recipientId
            }
        });

    } catch (error) {
        console.error('Debug notification test error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to emit test notification',
            error: error.message
        });
    }
});

module.exports = router;

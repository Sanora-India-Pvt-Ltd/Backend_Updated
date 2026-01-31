const { Worker } = require('bullmq');
const { createRedisConnection } = require('../core/infra/cache');
const Notification = require('../models/notification/Notification');
const NotificationPreference = require('../models/notification/NotificationPreference');
const { sendPushNotification } = require('../core/infra/pushNotification');
const mongoose = require('mongoose');

/**
 * Notification Delivery Worker
 * 
 * Processes notification delivery jobs from the queue.
 * Handles:
 * - Socket.IO delivery (real-time)
 * - Push notification delivery (FCM)
 * - Preference checking
 * - Retry logic (via BullMQ)
 * 
 * This worker is stateless and can run in a separate process.
 */

let notificationWorker = null;

/**
 * Get Socket.IO instance
 * Tries multiple methods to access the io instance
 */
const getSocketIO = () => {
    try {
        // Method 1: From socketServer module
        const realtime = require('../core/infra/realtime');
        return realtime.getIO();
    } catch (error) {
        // Method 2: From global (if set)
        if (global.io) {
            return global.io;
        }
        // Method 3: From app.locals (if available)
        try {
            const app = require('../server');
            if (app && app.locals && app.locals.io) {
                return app.locals.io;
            }
        } catch (err) {
            // App not available in worker context
        }
        
        return null;
    }
};

/**
 * Process notification delivery job
 * 
 * @param {Object} job - BullMQ job
 * @param {Object} job.data - { notificationId, recipient: { id, role } }
 */
const processNotificationDelivery = async (job) => {
    const { notificationId, recipient } = job.data;

    try {
        // Convert recipient.id to ObjectId if it's a string
        const recipientId = mongoose.Types.ObjectId.isValid(recipient.id)
            ? (typeof recipient.id === 'string' ? new mongoose.Types.ObjectId(recipient.id) : recipient.id)
            : recipient.id;

        console.log('🚚 Job processing', {
            jobId: job.id,
            notificationId,
            recipientId: recipientId.toString(),
            recipientRole: recipient.role,
            attempt: job.attemptsMade + 1
        });

        // Fetch notification from DB
        const notification = await Notification.findById(notificationId).lean();

        if (!notification) {
            throw new Error(`Notification ${notificationId} not found`);
        }

        // Check user preferences
        let shouldDeliver = true;
        let shouldDeliverInApp = true;
        let shouldDeliverPush = true;

        try {
            const preferenceQuery = {
                role: recipient.role,
                category: notification.category
            };

            if (recipient.role === 'USER') {
                preferenceQuery.userId = recipientId;
            } else {
                preferenceQuery.universityId = recipientId;
            }

            const preference = await NotificationPreference.findOne(preferenceQuery).lean();

            if (preference) {
                if (preference.muted === true) {
                    // Completely muted - stop all delivery
                    shouldDeliver = false;
                    shouldDeliverInApp = false;
                    shouldDeliverPush = false;
                    console.log('🔕 Notification muted by preference', {
                        notificationId,
                        recipientId: recipientId.toString(),
                        category: notification.category
                    });
                } else {
                    // Check channel preferences
                    shouldDeliverInApp = preference.channels?.inApp !== false;
                    shouldDeliverPush = preference.channels?.push !== false;
                    
                    if (!shouldDeliverInApp && !shouldDeliverPush) {
                        shouldDeliver = false;
                    }
                }
            }
        } catch (preferenceError) {
            // Preference check failure - allow delivery (fail-open)
            console.warn('⚠️  Preference check error (allowing delivery):', {
                error: preferenceError.message,
                notificationId
            });
        }

        // If muted, skip delivery but don't throw error (job succeeds)
        if (!shouldDeliver) {
            console.log('✅ Job completed (muted)', {
                jobId: job.id,
                notificationId
            });
            return { delivered: false, reason: 'muted' };
        }

        // Deliver via Socket.IO (if inApp enabled)
        if (shouldDeliverInApp) {
            try {
                const io = getSocketIO();
                
                if (io) {
                    // Standardize room naming: user:${recipientId} or university:${recipientId}
                    const recipientType = recipient.role.toLowerCase();
                    const room = `${recipientType}:${recipientId.toString()}`;

                    // Build notification payload
                    const notificationPayload = {
                        id: notification._id.toString(),
                        title: notification.title,
                        message: notification.message,
                        category: notification.category,
                        type: notification.type,
                        createdAt: notification.createdAt,
                        entity: notification.entity || null,
                        payload: notification.payload || {}
                    };

                    // Debug log BEFORE emitting
                    console.log('[SOCKET-EMIT]', {
                        room,
                        event: 'notification',
                        recipientId: recipientId.toString(),
                        recipientType: recipient.role
                    });

                    // Emit to room with standardized event name
                    io.to(room).emit('notification', notificationPayload);

                    console.log('🔔 Real-time notification delivered', {
                        notificationId,
                        recipientId: recipientId.toString(),
                        room
                    });
                } else {
                    console.warn('⚠️  Socket.IO not available for delivery', {
                        notificationId
                    });
                }
            } catch (socketError) {
                // Socket delivery failure - throw to trigger retry
                throw new Error(`Socket delivery failed: ${socketError.message}`);
            }
        } else {
            console.log('🔔 Channel skipped: inApp', {
                notificationId,
                recipientId: recipientId.toString()
            });
        }

        // Deliver via Push (if push enabled and channels include PUSH)
        const hasPushChannel = notification.channels && notification.channels.includes('PUSH');
        
        if (hasPushChannel && shouldDeliverPush) {
            try {
                await sendPushNotification({
                    recipientId: recipientId,
                    recipientType: recipient.role,
                    title: notification.title,
                    body: notification.message,
                    data: {
                        notificationId: notification._id.toString(),
                        category: notification.category,
                        type: notification.type,
                        entity: notification.entity ? JSON.stringify(notification.entity) : '',
                        ...notification.payload
                    }
                });
            } catch (pushError) {
                // Push delivery failure - log but don't throw (non-critical)
                console.error('⚠️  Push delivery failed (non-critical):', {
                    error: pushError.message,
                    notificationId
                });
            }
        } else if (hasPushChannel && !shouldDeliverPush) {
            console.log('🔔 Channel skipped: push', {
                notificationId,
                recipientId: recipient.id.toString()
            });
        }

        console.log('✅ Job delivered', {
            jobId: job.id,
            notificationId,
            recipientId: recipientId.toString(),
            inApp: shouldDeliverInApp,
            push: hasPushChannel && shouldDeliverPush
        });

        return {
            delivered: true,
            inApp: shouldDeliverInApp,
            push: hasPushChannel && shouldDeliverPush
        };

    } catch (error) {
        console.error('❌ Job failed', {
            jobId: job.id,
            notificationId,
            error: error.message,
            attempt: job.attemptsMade + 1,
            maxAttempts: job.opts.attempts
        });

        // Throw error to trigger retry
        throw error;
    }
};

/**
 * Start notification worker
 */
const startNotificationWorker = () => {
    if (notificationWorker) {
        console.log('ℹ️  Notification worker already running');
        return notificationWorker;
    }

    const redisConnection = createRedisConnection();
    
    if (!redisConnection) {
        console.warn('⚠️  Redis not configured. Notification worker will not start.');
        return null;
    }

    try {
        notificationWorker = new Worker(
            'notification-delivery',
            async (job) => {
                return await processNotificationDelivery(job);
            },
            {
                connection: redisConnection,
                concurrency: 10, // Process 10 jobs concurrently
                limiter: {
                    max: 100, // Max 100 jobs
                    duration: 1000 // Per second
                }
            }
        );

        // Worker event handlers
        notificationWorker.on('completed', (job) => {
            console.log('✅ Job completed', {
                jobId: job.id,
                notificationId: job.data.notificationId
            });
        });

        notificationWorker.on('failed', (job, err) => {
            console.error('❌ Job failed (max retries reached)', {
                jobId: job.id,
                notificationId: job.data?.notificationId,
                error: err.message,
                attempts: job.attemptsMade
            });
        });

        notificationWorker.on('error', (err) => {
            console.error('❌ Worker error:', err.message);
        });

        // Graceful shutdown
        process.on('SIGTERM', async () => {
            console.log('🛑 Shutting down notification worker...');
            await notificationWorker.close();
            process.exit(0);
        });

        process.on('SIGINT', async () => {
            console.log('🛑 Shutting down notification worker...');
            await notificationWorker.close();
            process.exit(0);
        });

        console.log('✅ Notification worker started');

        return notificationWorker;
    } catch (error) {
        console.error('❌ Failed to start notification worker:', error.message);
        return null;
    }
};

/**
 * Stop notification worker
 */
const stopNotificationWorker = async () => {
    if (notificationWorker) {
        try {
            await notificationWorker.close();
            console.log('🔌 Notification worker stopped');
        } catch (error) {
            console.error('Error stopping notification worker:', error.message);
        }
        notificationWorker = null;
    }
};

module.exports = {
    startNotificationWorker,
    stopNotificationWorker,
    getNotificationWorker: () => notificationWorker
};

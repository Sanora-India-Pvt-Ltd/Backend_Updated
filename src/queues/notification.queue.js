const { Queue } = require('bullmq');
const { createRedisConnection } = require('../core/infra/cache');

/**
 * Notification Delivery Queue
 * 
 * Queue for processing notification delivery (socket + push).
 * Uses BullMQ with Redis for job management and retry logic.
 * 
 * Queue Configuration:
 * - attempts: 5 (retry up to 5 times)
 * - backoff: exponential (2s, 5s, 10s, 20s, 40s)
 * - removeOnComplete: true (clean up completed jobs)
 * - removeOnFail: false (keep failed jobs for debugging)
 */

let notificationQueue = null;

/**
 * Get or create notification queue
 */
const getNotificationQueue = () => {
    if (notificationQueue) {
        return notificationQueue;
    }

    const redisConnection = createRedisConnection();
    
    if (!redisConnection) {
        console.warn('⚠️  Redis not configured. Notification queue will not be available.');
        return null;
    }

    try {
        notificationQueue = new Queue('notification-delivery', {
            connection: redisConnection,
            defaultJobOptions: {
                attempts: 5,
                backoff: {
                    type: 'exponential',
                    delay: 2000 // Start with 2 seconds, then 5s, 10s, 20s, 40s
                },
                removeOnComplete: {
                    age: 3600, // Keep completed jobs for 1 hour
                    count: 1000 // Keep last 1000 completed jobs
                },
                removeOnFail: false // Keep failed jobs for debugging
            }
        });

        console.log('✅ Notification queue initialized');

        return notificationQueue;
    } catch (error) {
        console.error('❌ Failed to initialize notification queue:', error.message);
        return null;
    }
};

/**
 * Add notification delivery job to queue
 * 
 * @param {Object} jobData
 * @param {String} jobData.notificationId - Notification document ID
 * @param {Object} jobData.recipient - { id: ObjectId, role: 'USER' | 'UNIVERSITY' }
 * 
 * @returns {Promise<String>} Job ID
 */
const enqueueNotificationDelivery = async (jobData) => {
    try {
        const queue = getNotificationQueue();
        
        if (!queue) {
            // Queue not available - log but don't throw
            console.warn('⚠️  Notification queue not available. Delivery skipped.');
            return null;
        }

        const job = await queue.add('deliver', jobData, {
            jobId: `notification:${jobData.notificationId}:${jobData.recipient.id.toString()}`,
            // Prevent duplicate jobs for same notification+recipient
            removeOnComplete: true,
            removeOnFail: false
        });

        console.log('📥 Job enqueued', {
            jobId: job.id,
            notificationId: jobData.notificationId,
            recipientId: jobData.recipient.id.toString(),
            recipientRole: jobData.recipient.role
        });

        return job.id;
    } catch (error) {
        // Enqueue failure should not break notification creation
        console.error('❌ Failed to enqueue notification delivery:', {
            error: error.message,
            notificationId: jobData.notificationId
        });
        return null;
    }
};

/**
 * Close queue connection (for graceful shutdown)
 */
const closeNotificationQueue = async () => {
    if (notificationQueue) {
        try {
            await notificationQueue.close();
            console.log('🔌 Notification queue closed');
        } catch (error) {
            console.error('Error closing notification queue:', error.message);
        }
        notificationQueue = null;
    }
};

module.exports = {
    getNotificationQueue,
    enqueueNotificationDelivery,
    closeNotificationQueue
};

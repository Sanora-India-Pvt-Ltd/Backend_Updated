const { getClient: getRedis } = require('../../core/infra/cache');
const { emitNotification } = require('../../core/infra/notificationEmitter');

/**
 * Notification Queue Service
 * 
 * Uses Redis to queue notifications for async processing with retry logic.
 * This decouples notification creation from delivery, making the system
 * more resilient and scalable.
 * 
 * Queue Structure:
 * - Queue: notification:queue (Redis LIST)
 * - Processing: notification:processing (Redis SET)
 * - Failed: notification:failed (Redis LIST)
 * - Retry: notification:retry:{attempt} (Redis LIST)
 */

const QUEUE_KEY = 'notification:queue';
const PROCESSING_KEY = 'notification:processing';
const FAILED_KEY = 'notification:failed';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 60000]; // 5s, 15s, 60s

/**
 * Add notification to queue
 * 
 * @param {Object} notificationPayload - Notification payload for emitNotification
 * @returns {Promise<string>} Job ID
 */
const enqueueNotification = async (notificationPayload) => {
    try {
        const redis = getRedis();
        
        if (!redis) {
            // Redis not available - process immediately (fallback)
            console.warn('⚠️  Redis not available, processing notification immediately');
            await emitNotification(notificationPayload);
            return 'immediate';
        }

        // Generate job ID
        const jobId = `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Create job data
        const jobData = {
            jobId,
            payload: notificationPayload,
            attempts: 0,
            createdAt: Date.now(),
            status: 'PENDING'
        };

        // Add to queue (left push for FIFO)
        await redis.lpush(QUEUE_KEY, JSON.stringify(jobData));
        
        // Set expiration on queue key (prevent memory leaks)
        await redis.expire(QUEUE_KEY, 86400); // 24 hours

        console.log('📥 Notification queued', {
            jobId,
            recipientType: notificationPayload.recipientType,
            category: notificationPayload.category
        });

        return jobId;

    } catch (error) {
        console.error('❌ Queue error (processing immediately):', error.message);
        // Fallback: process immediately if queue fails
        try {
            await emitNotification(notificationPayload);
        } catch (fallbackError) {
            console.error('❌ Fallback notification error:', fallbackError.message);
        }
        return 'fallback';
    }
};

/**
 * Process a single notification job
 * 
 * @param {Object} jobData - Job data from queue
 * @returns {Promise<boolean>} Success status
 */
const processNotificationJob = async (jobData) => {
    const { jobId, payload, attempts } = jobData;

    try {
        // Emit notification
        await emitNotification(payload);

        console.log('✅ Notification processed', {
            jobId,
            attempts: attempts + 1
        });

        return true;

    } catch (error) {
        console.error('❌ Notification processing error', {
            jobId,
            attempts: attempts + 1,
            error: error.message
        });

        // Check if we should retry
        if (attempts < MAX_RETRIES) {
            await scheduleRetry(jobData);
            return false;
        } else {
            // Max retries reached - move to failed
            await moveToFailed(jobData, error.message);
            return false;
        }
    }
};

/**
 * Schedule retry for failed notification
 * 
 * @param {Object} jobData - Job data
 */
const scheduleRetry = async (jobData) => {
    try {
        const redis = getRedis();
        if (!redis) return;

        const { jobId, attempts } = jobData;
        const retryAttempt = attempts + 1;
        const delay = RETRY_DELAYS[attempts] || RETRY_DELAYS[RETRY_DELAYS.length - 1];

        // Update job data
        jobData.attempts = retryAttempt;
        jobData.retryAt = Date.now() + delay;
        jobData.status = 'RETRYING';

        // Schedule retry using Redis delayed list
        // Use sorted set for delayed execution
        const retryKey = `notification:retry:${retryAttempt}`;
        await redis.zadd(retryKey, jobData.retryAt, JSON.stringify(jobData));
        await redis.expire(retryKey, 86400); // 24 hours

        console.log('🔄 Notification retry scheduled', {
            jobId,
            attempt: retryAttempt,
            retryAt: new Date(jobData.retryAt).toISOString()
        });

    } catch (error) {
        console.error('❌ Retry scheduling error:', error.message);
    }
};

/**
 * Move notification to failed queue
 * 
 * @param {Object} jobData - Job data
 * @param {String} errorMessage - Error message
 */
const moveToFailed = async (jobData, errorMessage) => {
    try {
        const redis = getRedis();
        if (!redis) return;

        jobData.status = 'FAILED';
        jobData.failedAt = Date.now();
        jobData.error = errorMessage;

        await redis.lpush(FAILED_KEY, JSON.stringify(jobData));
        await redis.expire(FAILED_KEY, 604800); // 7 days

        console.log('❌ Notification moved to failed queue', {
            jobId: jobData.jobId,
            attempts: jobData.attempts,
            error: errorMessage
        });

    } catch (error) {
        console.error('❌ Failed queue error:', error.message);
    }
};

/**
 * Process queue (worker function)
 * Processes notifications from the queue
 */
const processQueue = async () => {
    try {
        const redis = getRedis();
        if (!redis) {
            // Redis not available - skip processing
            return;
        }

        // Check for ready retries first
        await processRetries();

        // Process main queue
        const jobDataStr = await redis.brpop(QUEUE_KEY, 1); // Blocking pop with 1s timeout

        if (!jobDataStr || !jobDataStr[1]) {
            // No jobs available
            return;
        }

        const jobData = JSON.parse(jobDataStr[1]);
        const { jobId } = jobData;

        // Mark as processing
        await redis.sadd(PROCESSING_KEY, jobId);
        await redis.expire(PROCESSING_KEY, 300); // 5 minutes

        try {
            // Process notification
            const success = await processNotificationJob(jobData);

            if (success) {
                // Remove from processing
                await redis.srem(PROCESSING_KEY, jobId);
            }
            // If failed, it's handled in processNotificationJob (retry or failed queue)

        } catch (error) {
            // Unexpected error - remove from processing and retry
            await redis.srem(PROCESSING_KEY, jobId);
            await scheduleRetry(jobData);
        }

    } catch (error) {
        // Queue processing error - log but don't throw
        console.error('⚠️  Queue processing error (non-critical):', error.message);
    }
};

/**
 * Process retry queue
 * Checks for retries that are ready to be processed
 */
const processRetries = async () => {
    try {
        const redis = getRedis();
        if (!redis) return;

        const now = Date.now();

        // Check each retry attempt level
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const retryKey = `notification:retry:${attempt}`;
            
            // Get ready retries (score <= now)
            const readyRetries = await redis.zrangebyscore(retryKey, 0, now, 'LIMIT', 0, 10);

            if (readyRetries.length > 0) {
                // Move ready retries back to main queue
                for (const jobDataStr of readyRetries) {
                    await redis.lpush(QUEUE_KEY, jobDataStr);
                    await redis.zrem(retryKey, jobDataStr);
                }

                if (readyRetries.length > 0) {
                    console.log(`🔄 Moved ${readyRetries.length} retries back to queue (attempt ${attempt})`);
                }
            }
        }

    } catch (error) {
        console.error('⚠️  Retry processing error:', error.message);
    }
};

/**
 * Start queue worker
 * Continuously processes the notification queue
 */
const startQueueWorker = () => {
    const processInterval = setInterval(async () => {
        await processQueue();
    }, 1000); // Process every second

    console.log('🔄 Notification queue worker started');

    // Graceful shutdown
    process.on('SIGTERM', () => {
        clearInterval(processInterval);
        console.log('🔄 Notification queue worker stopped');
    });

    process.on('SIGINT', () => {
        clearInterval(processInterval);
        console.log('🔄 Notification queue worker stopped');
    });

    return processInterval;
};

/**
 * Get queue stats
 * 
 * @returns {Promise<Object>} Queue statistics
 */
const getQueueStats = async () => {
    try {
        const redis = getRedis();
        if (!redis) {
            return {
                queueSize: 0,
                processing: 0,
                failed: 0,
                retries: {}
            };
        }

        const [queueSize, processing, failed] = await Promise.all([
            redis.llen(QUEUE_KEY),
            redis.scard(PROCESSING_KEY),
            redis.llen(FAILED_KEY)
        ]);

        // Count retries by attempt
        const retries = {};
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            const retryKey = `notification:retry:${attempt}`;
            retries[attempt] = await redis.zcard(retryKey);
        }

        return {
            queueSize,
            processing,
            failed,
            retries
        };

    } catch (error) {
        console.error('Queue stats error:', error.message);
        return {
            queueSize: 0,
            processing: 0,
            failed: 0,
            retries: {}
        };
    }
};

module.exports = {
    enqueueNotification,
    processQueue,
    processRetries,
    startQueueWorker,
    getQueueStats
};

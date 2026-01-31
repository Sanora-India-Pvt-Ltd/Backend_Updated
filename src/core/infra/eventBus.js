/**
 * Event bus / job queue abstraction.
 * Services use this instead of requiring services/videoTranscodingQueue directly.
 * Behavior is unchanged: transcoding jobs and events delegate to the queue.
 * Logs on failure.
 */

const videoTranscodingQueue = require('./videoTranscodingQueue');
const logger = require('../logger');

/**
 * Add a video transcoding job.
 * @param {Object} options - Job options
 * @param {string} options.inputPath - Path to input video file
 * @param {string} options.userId - User ID
 * @param {string} options.jobType - Type: post, reel, story, media, course
 * @param {string} options.originalFilename - Original filename
 * @param {string} [options.videoId] - Video ID (course)
 * @param {string} [options.courseId] - Course ID (course)
 * @param {string} [options.createdBy] - Creator ID (course)
 * @returns {Promise<string>} Job ID
 */
async function addTranscodingJob(options) {
    try {
        return await videoTranscodingQueue.addJob(options);
    } catch (err) {
        logger.error('EventBus addTranscodingJob failed', { jobType: options?.jobType, error: err.message });
        throw err;
    }
}

/**
 * Get status of a transcoding job.
 * @param {string} jobId - Job ID
 * @returns {Promise<Object|null>} Job status or null
 */
async function getTranscodingJobStatus(jobId) {
    try {
        return await videoTranscodingQueue.getJobStatus(jobId);
    } catch (err) {
        logger.error('EventBus getTranscodingJobStatus failed', { jobId, error: err.message });
        throw err;
    }
}

/**
 * Get queue statistics.
 * @returns {Object} Queue stats
 */
function getTranscodingQueueStats() {
    return videoTranscodingQueue.getStats();
}

/**
 * Subscribe to job completion (same as queue.once('job:completed', ...)).
 * @param {string} event - Event name ('job:completed' or 'job:failed')
 * @param {Function} handler - Handler function
 */
function once(event, handler) {
    return videoTranscodingQueue.once(event, handler);
}

/**
 * Subscribe to job completion (same as queue.on('job:completed', ...)).
 * @param {string} event - Event name
 * @param {Function} handler - Handler function
 */
function on(event, handler) {
    return videoTranscodingQueue.on(event, handler);
}

/**
 * Remove a listener.
 * @param {string} event - Event name
 * @param {Function} handler - Handler function
 */
function removeListener(event, handler) {
    return videoTranscodingQueue.removeListener(event, handler);
}

module.exports = {
    addTranscodingJob,
    getTranscodingJobStatus,
    getTranscodingQueueStats,
    once,
    on,
    removeListener
};

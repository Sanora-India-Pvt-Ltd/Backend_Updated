/**
 * Mock for core/infra/eventBus (transcoding queue).
 */

const addTranscodingJob = jest.fn(() => Promise.resolve('mock-job-id'));
const getTranscodingJobStatus = jest.fn(() => Promise.resolve({ status: 'completed' }));
const getTranscodingQueueStats = jest.fn(() => ({}));
const once = jest.fn();
const on = jest.fn();
const removeListener = jest.fn();

module.exports = {
    addTranscodingJob,
    getTranscodingJobStatus,
    getTranscodingQueueStats,
    once,
    on,
    removeListener
};

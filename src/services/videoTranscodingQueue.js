/**
 * In-Memory Video Transcoding Job Queue
 * 
 * This provides a simple job queue for video transcoding that works without Redis.
 * When Redis is enabled, this can be upgraded to use Bull/BullMQ.
 */

const EventEmitter = require('events');
const { transcodeVideo, isVideo, cleanupFile } = require('./videoTranscoder');
const VideoTranscodingJob = require('../models/VideoTranscodingJob');
const Video = require('../models/course/Video');
const MCQGenerationJob = require('../models/course/MCQGenerationJob');
const StorageService = require('./storage.service');

class VideoTranscodingQueue extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.processing = false;
        this.maxConcurrentJobs = 2; // Process 2 videos at a time
        this.activeJobs = 0;
    }

    /**
     * Add a job to the queue
     * @param {Object} jobData - Job data
     * @param {string} jobData.inputPath - Path to input video file
     * @param {string} jobData.userId - User ID who uploaded the video
     * @param {string} jobData.jobType - Type of job (post, reel, story, media, course)
     * @param {string} jobData.originalFilename - Original filename
     * @param {string} jobData.videoId - Video ID (for course videos)
     * @param {string} jobData.courseId - Course ID (for course videos)
     * @param {string} jobData.createdBy - Creator ID (for course videos)
     * @returns {Promise<string>} - Job ID
     */
    async addJob(jobData) {
        const { inputPath, userId, jobType, originalFilename, videoId, courseId, createdBy } = jobData;

        // Create job record in database
        const job = await VideoTranscodingJob.create({
            userId,
            inputPath,
            jobType,
            originalFilename,
            status: 'queued',
            progress: 0,
            videoId: videoId || null,
            courseId: courseId || null,
            createdBy: createdBy || null
        });

        // Add to queue
        this.queue.push({
            jobId: job._id.toString(),
            inputPath,
            userId,
            jobType,
            originalFilename,
            videoId: videoId || null,
            courseId: courseId || null,
            createdBy: createdBy || null,
            createdAt: new Date()
        });

        console.log(`[VideoQueue] Job ${job._id} added to queue. Queue length: ${this.queue.length}`);

        // Start processing if not already running
        if (!this.processing) {
            this.startProcessing();
        }

        return job._id.toString();
    }

    /**
     * Start processing jobs from the queue
     */
    async startProcessing() {
        if (this.processing) {
            return;
        }

        this.processing = true;
        console.log('[VideoQueue] Starting job processor...');

        while (this.queue.length > 0 || this.activeJobs > 0) {
            // Wait if we're at max concurrent jobs
            if (this.activeJobs >= this.maxConcurrentJobs) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            // Get next job from queue
            const job = this.queue.shift();
            if (!job) {
                // No jobs in queue, but might have active jobs
                if (this.activeJobs > 0) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    continue;
                }
                break;
            }

            // Process job asynchronously
            this.processJob(job).catch(error => {
                console.error(`[VideoQueue] Error processing job ${job.jobId}:`, error);
            });
        }

        this.processing = false;
        console.log('[VideoQueue] Job processor stopped (queue empty)');
    }

    /**
     * Process a single job
     * @param {Object} job - Job to process
     */
    async processJob(job) {
        this.activeJobs++;
        const { jobId, inputPath, userId, jobType, originalFilename, videoId, courseId } = job;

        try {
            // Update job status to processing
            await VideoTranscodingJob.findByIdAndUpdate(jobId, {
                status: 'processing',
                startedAt: new Date(),
                progress: 10
            });

            console.log(`[VideoQueue] Processing job ${jobId}: ${originalFilename}`);

            // Create a progress callback
            let lastProgressUpdate = Date.now();
            const progressInterval = setInterval(async () => {
                // Update progress every 5 seconds (estimate based on time elapsed)
                const elapsed = Date.now() - lastProgressUpdate;
                // Rough estimate: assume 30-60 seconds for transcoding
                // Update progress gradually
                try {
                    const currentJob = await VideoTranscodingJob.findById(jobId);
                    if (currentJob && currentJob.status === 'processing') {
                        let newProgress = currentJob.progress || 10;
                        // Increment progress slowly (10% to 90% over time)
                        if (newProgress < 90) {
                            newProgress = Math.min(90, newProgress + 5);
                            await VideoTranscodingJob.findByIdAndUpdate(jobId, {
                                progress: newProgress
                            });
                        }
                    }
                } catch (err) {
                    // Ignore progress update errors
                }
            }, 5000);

            // Transcode video
            const result = await transcodeVideo(inputPath);

            clearInterval(progressInterval);

            // Update job with success
            await VideoTranscodingJob.findByIdAndUpdate(jobId, {
                status: 'completed',
                progress: 100,
                completedAt: new Date(),
                outputPath: result.outputPath,
                duration: result.duration,
                width: result.width,
                height: result.height,
                fileSize: result.fileSize
            });

            console.log(`[VideoQueue] Job ${jobId} completed successfully`);

            // Update Video document if this is a course video
            if (jobType === 'course' && videoId) {
                try {
                    // Upload transcoded video to S3
                    const s3Key = `videos/${courseId || 'course'}/${videoId}-${Date.now()}.mp4`;
                    const uploadResult = await StorageService.uploadFromPath(result.outputPath, s3Key);

                    // Update Video document
                    await Video.updateOne(
                        { _id: videoId },
                        {
                            status: 'READY',
                            videoUrl: uploadResult.url,
                            s3Key: uploadResult.key,
                            duration: result.duration
                        }
                    );

                    console.log(`[VideoQueue] Video ${videoId} updated to READY status`);

                    // Queue MCQ generation job (asynchronous, non-blocking)
                    try {
                        // Fetch the updated video to get courseId
                        const video = await Video.findById(videoId);
                        
                        if (video && video.videoUrl) {
                            // Check if MCQ generation job already exists for this video
                            const existingJob = await MCQGenerationJob.findOne({
                                videoId: videoId,
                                status: { $in: ['PENDING', 'PROCESSING'] }
                            });

                            if (!existingJob) {
                                // Create MCQ generation job (will be processed by background worker)
                                await MCQGenerationJob.create({
                                    videoId: videoId,
                                    courseId: courseId || video.courseId,
                                    status: 'PENDING',
                                    provider: 'DRISHTI_AI'
                                });
                                console.log(`[VideoQueue] MCQ generation job queued for video ${videoId}`);
                            } else {
                                console.log(`[VideoQueue] MCQ generation job already exists for video ${videoId}`);
                            }
                        } else {
                            console.warn(`[VideoQueue] Video ${videoId} missing videoUrl, skipping MCQ job creation`);
                        }
                    } catch (jobError) {
                        // Log error but don't fail transcoding
                        console.error(`[VideoQueue] Failed to create MCQ generation job for video ${videoId}:`, jobError.message);
                        // Do NOT throw - transcoding should still be considered successful
                    }

                    // Cleanup transcoded file after upload
                    try {
                        await cleanupFile(result.outputPath);
                    } catch (cleanupError) {
                        console.warn(`[VideoQueue] Failed to cleanup file ${result.outputPath}:`, cleanupError);
                    }
                } catch (videoUpdateError) {
                    // Log error but don't crash the worker
                    console.error(`[VideoQueue] Failed to update Video ${videoId} after transcoding:`, videoUpdateError);
                    // Optionally update Video status to FAILED
                    try {
                        await Video.updateOne(
                            { _id: videoId },
                            { status: 'FAILED' }
                        );
                    } catch (statusUpdateError) {
                        console.error(`[VideoQueue] Failed to update Video ${videoId} status to FAILED:`, statusUpdateError);
                    }
                }
            }

            this.emit('job:completed', { jobId, result });

        } catch (error) {
            console.error(`[VideoQueue] Job ${jobId} failed:`, error);

            // Update job with error
            await VideoTranscodingJob.findByIdAndUpdate(jobId, {
                status: 'failed',
                error: error.message,
                failedAt: new Date()
            });

            this.emit('job:failed', { jobId, error: error.message });
        } finally {
            this.activeJobs--;
        }
    }

    /**
     * Get job status
     * @param {string} jobId - Job ID
     * @returns {Promise<Object>} - Job status
     */
    async getJobStatus(jobId) {
        try {
            const job = await VideoTranscodingJob.findById(jobId);
            if (!job) {
                return null;
            }

            return {
                jobId: job._id.toString(),
                userId: job.userId.toString(),
                status: job.status,
                progress: job.progress,
                inputPath: job.inputPath,
                outputPath: job.outputPath,
                error: job.error,
                jobType: job.jobType,
                originalFilename: job.originalFilename,
                createdAt: job.createdAt,
                startedAt: job.startedAt,
                completedAt: job.completedAt,
                failedAt: job.failedAt,
                duration: job.duration,
                width: job.width,
                height: job.height,
                fileSize: job.fileSize
            };
        } catch (error) {
            console.error(`[VideoQueue] Error getting job status ${jobId}:`, error);
            return null;
        }
    }

    /**
     * Get queue statistics
     * @returns {Object} - Queue stats
     */
    getStats() {
        return {
            queueLength: this.queue.length,
            activeJobs: this.activeJobs,
            maxConcurrentJobs: this.maxConcurrentJobs,
            isProcessing: this.processing
        };
    }
}

// Singleton instance
const videoTranscodingQueue = new VideoTranscodingQueue();

module.exports = videoTranscodingQueue;


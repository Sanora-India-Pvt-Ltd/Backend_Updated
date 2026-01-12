/**
 * Background Worker for MCQ Generation Jobs
 * 
 * Processes MCQGenerationJob documents asynchronously.
 * This worker runs independently and handles long-running AI API calls.
 */

const axios = require('axios');
const MCQGenerationJob = require('../models/course/MCQGenerationJob');
const VideoQuestion = require('../models/course/VideoQuestion');
const Video = require('../models/course/Video');

class MCQGenerationWorker {
    constructor() {
        this.isRunning = false;
        this.processingInterval = null;
        this.maxRetries = 3;
        this.pollInterval = 30000; // Check for new jobs every 30 seconds
        this.maxConcurrentJobs = 2; // Process 2 jobs concurrently
        this.activeJobs = 0;
    }

    /**
     * Start the worker
     */
    start() {
        if (this.isRunning) {
            console.log('[MCQWorker] Worker is already running');
            return;
        }

        this.isRunning = true;
        console.log('[MCQWorker] Starting MCQ generation worker...');

        // Start processing loop
        this.processJobs();
    }

    /**
     * Stop the worker
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        if (this.processingInterval) {
            clearInterval(this.processingInterval);
            this.processingInterval = null;
        }
        console.log('[MCQWorker] Worker stopped');
    }

    /**
     * Main processing loop
     */
    async processJobs() {
        while (this.isRunning) {
            try {
                // Wait if we're at max concurrent jobs
                if (this.activeJobs >= this.maxConcurrentJobs) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue;
                }

                // Fetch next PENDING job
                const job = await MCQGenerationJob.findOne({
                    status: 'PENDING'
                }).sort({ createdAt: 1 }); // Process oldest first

                if (job) {
                    // Process job asynchronously (don't await)
                    this.processJob(job).catch(error => {
                        console.error(`[MCQWorker] Error processing job ${job._id}:`, error);
                    });
                } else {
                    // No jobs available, wait before checking again
                    await new Promise(resolve => setTimeout(resolve, this.pollInterval));
                }
            } catch (error) {
                console.error('[MCQWorker] Error in processing loop:', error);
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    /**
     * Process a single MCQ generation job
     * @param {Object} job - MCQGenerationJob document
     */
    async processJob(job) {
        this.activeJobs++;
        const jobId = job._id.toString();

        try {
            // Mark job as PROCESSING
            await MCQGenerationJob.findByIdAndUpdate(jobId, {
                status: 'PROCESSING',
                attempts: job.attempts + 1
            });

            console.log(`[MCQWorker] Processing MCQ generation job ${jobId} for video ${job.videoId}`);

            // Fetch video to get videoUrl
            const video = await Video.findById(job.videoId);
            if (!video || !video.videoUrl) {
                throw new Error(`Video ${job.videoId} not found or missing videoUrl`);
            }

            // Check if questions already exist (idempotency)
            const existingQuestions = await VideoQuestion.countDocuments({
                videoId: job.videoId,
                source: 'AI'
            });

            if (existingQuestions > 0) {
                console.log(`[MCQWorker] AI questions already exist for video ${job.videoId}, marking job as COMPLETED`);
                await MCQGenerationJob.findByIdAndUpdate(jobId, {
                    status: 'COMPLETED',
                    completedAt: new Date()
                });
                return;
            }

            // Call external AI API
            const aiResponse = await axios.post(
                'https://api.drishtifilmproductions.com/videos/mcqs',
                {
                    video_url: video.videoUrl,
                    include_answers: true,
                    randomize: false,
                    limit: 5,
                    force: false
                },
                {
                    timeout: 360000 // 6 minute timeout (AI can take 2-5 minutes)
                }
            );

            // Parse response and create VideoQuestion documents
            if (!aiResponse.data || !Array.isArray(aiResponse.data.questions)) {
                throw new Error('AI API response missing questions array');
            }

            const questionsToCreate = aiResponse.data.questions.map(q => ({
                courseId: job.courseId,
                videoId: job.videoId,
                question: q.question,
                options: {
                    A: q.options?.A || '',
                    B: q.options?.B || '',
                    C: q.options?.C || '',
                    D: q.options?.D || ''
                },
                correctAnswer: q.correct_answer || 'A',
                source: 'AI',
                status: 'DRAFT',
                editable: true,
                aiMeta: {
                    chunk_num: q.chunk_num,
                    timestamp: q.timestamp,
                    timestamp_seconds: q.timestamp_seconds,
                    anchor_type: q.anchor_type,
                    batch_number: q.batch_number,
                    part_number: q.part_number
                }
            }));

            // Create all questions
            if (questionsToCreate.length > 0) {
                await VideoQuestion.insertMany(questionsToCreate);
                console.log(`[MCQWorker] Created ${questionsToCreate.length} MCQs for video ${job.videoId}`);
            }

            // Mark job as COMPLETED
            await MCQGenerationJob.findByIdAndUpdate(jobId, {
                status: 'COMPLETED',
                completedAt: new Date()
            });

            console.log(`[MCQWorker] Job ${jobId} completed successfully`);

        } catch (error) {
            console.error(`[MCQWorker] Job ${jobId} failed:`, error.message);

            const updatedJob = await MCQGenerationJob.findById(jobId);
            const currentAttempts = updatedJob.attempts || job.attempts;

            // Check if we should retry
            if (currentAttempts < this.maxRetries) {
                // Reset to PENDING for retry
                await MCQGenerationJob.findByIdAndUpdate(jobId, {
                    status: 'PENDING',
                    error: error.message
                });
                console.log(`[MCQWorker] Job ${jobId} will be retried (attempt ${currentAttempts}/${this.maxRetries})`);
            } else {
                // Max retries reached, mark as FAILED
                await MCQGenerationJob.findByIdAndUpdate(jobId, {
                    status: 'FAILED',
                    error: error.message,
                    completedAt: new Date()
                });
                console.error(`[MCQWorker] Job ${jobId} failed after ${currentAttempts} attempts`);
            }
        } finally {
            this.activeJobs--;
        }
    }

    /**
     * Get worker statistics
     * @returns {Object} Worker stats
     */
    getStats() {
        return {
            isRunning: this.isRunning,
            activeJobs: this.activeJobs,
            maxConcurrentJobs: this.maxConcurrentJobs,
            pollInterval: this.pollInterval
        };
    }
}

// Singleton instance
const mcqGenerationWorker = new MCQGenerationWorker();

module.exports = mcqGenerationWorker;


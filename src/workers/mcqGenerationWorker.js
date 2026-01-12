/**
 * Background Worker for MCQ Generation Jobs
 * 
 * Processes MCQGenerationJob records asynchronously.
 * Calls external AI API and saves VideoQuestion entries.
 */

const axios = require('axios');
const MCQGenerationJob = require('../models/ai/MCQGenerationJob');
const Video = require('../models/course/Video');
const VideoQuestion = require('../models/course/VideoQuestion');

// Constants
const AI_ENDPOINT = 'https://api.drishtifilmproductions.com/videos/mcqs';
const MAX_ATTEMPTS = 3;
const POLL_INTERVAL = 30000; // 30 seconds

let workerInterval = null;
let isProcessing = false;

/**
 * Process a single MCQ generation job
 */
async function processJob() {
    // Prevent concurrent processing
    if (isProcessing) {
        return;
    }

    isProcessing = true;

    try {
        // 1. Find ONE job where status = 'PENDING' and attempts < MAX_ATTEMPTS
        const job = await MCQGenerationJob.findOne({
            status: 'PENDING',
            attempts: { $lt: MAX_ATTEMPTS }
        }).sort({ createdAt: 1 }); // Process oldest first

        if (!job) {
            // No jobs to process
            return;
        }

        const jobId = job._id.toString();
        console.log(`[MCQWorker] Processing job ${jobId} for video ${job.videoId}`);

        // 2. Update job: status → 'PROCESSING', attempts += 1
        await MCQGenerationJob.findByIdAndUpdate(jobId, {
            status: 'PROCESSING',
            $inc: { attempts: 1 }
        });

        try {
            // 3. Fetch Video by videoId
            const video = await Video.findById(job.videoId);
            if (!video) {
                throw new Error(`Video ${job.videoId} not found`);
            }
            if (!video.videoUrl) {
                throw new Error(`Video ${job.videoId} missing videoUrl`);
            }

            // 4. Call AI API using axios POST
            const aiResponse = await axios.post(
                AI_ENDPOINT,
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

            // 5. Validate response.status === 'success'
            if (aiResponse.data.status !== 'success') {
                throw new Error(`AI API returned status: ${aiResponse.data.status || 'unknown'}`);
            }

            // 6. Save MCQs
            // First delete existing VideoQuestion for that videoId
            await VideoQuestion.deleteMany({
                videoId: job.videoId,
                source: 'AI'
            });

            // For each question, create VideoQuestion
            if (aiResponse.data.questions && Array.isArray(aiResponse.data.questions)) {
                const questionsToCreate = aiResponse.data.questions.map(q => ({
                    videoId: job.videoId,
                    courseId: job.courseId,
                    question: q.question || '',
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
                        timestamp: q.timestamp || null,
                        timestamp_seconds: q.timestampSeconds || q.timestamp_seconds || null,
                        chunk_num: q.chunkNum || q.chunk_num || null,
                        anchor_type: q.anchor_type || null,
                        batch_number: q.batch_number || null,
                        part_number: q.part_number || null
                    }
                }));

                if (questionsToCreate.length > 0) {
                    await VideoQuestion.insertMany(questionsToCreate);
                    console.log(`[MCQWorker] Created ${questionsToCreate.length} MCQs for video ${job.videoId}`);
                }
            } else {
                throw new Error('AI API response missing questions array');
            }

            // 7. Mark job COMPLETED
            await MCQGenerationJob.findByIdAndUpdate(jobId, {
                status: 'COMPLETED',
                completedAt: new Date()
            });

            console.log(`[MCQWorker] Job ${jobId} completed successfully`);

        } catch (error) {
            // 8. Error handling
            const errorMessage = error.message || 'Unknown error';
            console.error(`[MCQWorker] Job ${jobId} failed:`, errorMessage);

            const updatedJob = await MCQGenerationJob.findById(jobId);
            const currentAttempts = updatedJob.attempts;

            if (currentAttempts >= MAX_ATTEMPTS) {
                // Max attempts reached, mark as FAILED
                await MCQGenerationJob.findByIdAndUpdate(jobId, {
                    status: 'FAILED',
                    error: errorMessage,
                    completedAt: new Date()
                });
                console.error(`[MCQWorker] Job ${jobId} failed after ${currentAttempts} attempts`);
            } else {
                // Revert to PENDING for retry
                await MCQGenerationJob.findByIdAndUpdate(jobId, {
                    status: 'PENDING',
                    error: errorMessage
                });
                console.log(`[MCQWorker] Job ${jobId} will be retried (attempt ${currentAttempts}/${MAX_ATTEMPTS})`);
            }
        }

    } catch (error) {
        // Catch any unexpected errors in the worker loop
        console.error('[MCQWorker] Unexpected error in processJob:', error);
    } finally {
        isProcessing = false;
    }
}

/**
 * Start the MCQ generation worker
 */
function startMCQGenerationWorker() {
    if (workerInterval) {
        console.log('[MCQWorker] Worker is already running');
        return;
    }

    console.log('[MCQWorker] Starting MCQ generation worker...');
    console.log(`[MCQWorker] Polling interval: ${POLL_INTERVAL / 1000} seconds`);

    // Run worker every 30 seconds
    workerInterval = setInterval(() => {
        processJob().catch(error => {
            // Ensure errors don't crash the worker
            console.error('[MCQWorker] Error in worker tick:', error);
        });
    }, POLL_INTERVAL);

    // Process immediately on start
    processJob().catch(error => {
        console.error('[MCQWorker] Error in initial job processing:', error);
    });
}

/**
 * Stop the MCQ generation worker
 */
function stopMCQGenerationWorker() {
    if (workerInterval) {
        clearInterval(workerInterval);
        workerInterval = null;
        console.log('[MCQWorker] Worker stopped');
    }
}

module.exports = {
    startMCQGenerationWorker,
    stopMCQGenerationWorker
};


/**
 * In-memory video transcoding job queue. Full implementation.
 * Replaces legacy src/services/videoTranscodingQueue.js.
 */

const logger = require('../logger');
const EventEmitter = require('events');
const { transcodeVideo, isVideo, cleanupFile } = require('./videoTranscoder');
const VideoTranscodingJob = require('../../models/VideoTranscodingJob');
const Video = require('../../models/course/Video');
const MCQGenerationJob = require('../../models/course/MCQGenerationJob');
const StorageService = require('./storage');
const CourseEnrollment = require('../../models/course/CourseEnrollment');
const { emitNotification } = require('./notificationEmitter');

class VideoTranscodingQueue extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.processing = false;
    this.maxConcurrentJobs = 2;
    this.activeJobs = 0;
  }

  async addJob(jobData) {
    const { inputPath, userId, jobType, originalFilename, videoId, courseId, createdBy } = jobData;

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

    logger.info('[VideoQueue] Job added to queue', { jobId: job._id, queueLength: this.queue.length });

    if (!this.processing) {
      this.startProcessing();
    }

    return job._id.toString();
  }

  async startProcessing() {
    if (this.processing) return;

    this.processing = true;
    logger.info('[VideoQueue] Starting job processor');

    while (this.queue.length > 0 || this.activeJobs > 0) {
      if (this.activeJobs >= this.maxConcurrentJobs) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      const job = this.queue.shift();
      if (!job) {
        if (this.activeJobs > 0) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        break;
      }

      this.processJob(job).catch((error) => {
        logger.error('[VideoQueue] Error processing job', { jobId: job.jobId, error });
      });
    }

    this.processing = false;
    logger.info('[VideoQueue] Job processor stopped (queue empty)');
  }

  async processJob(job) {
    this.activeJobs++;
    const { jobId, inputPath, userId, jobType, originalFilename, videoId, courseId } = job;

    try {
      await VideoTranscodingJob.findByIdAndUpdate(jobId, {
        status: 'processing',
        startedAt: new Date(),
        progress: 10
      });

      logger.info('[VideoQueue] Processing job', { jobId, originalFilename });

      let lastProgressUpdate = Date.now();
      const progressInterval = setInterval(async () => {
        try {
          const currentJob = await VideoTranscodingJob.findById(jobId);
          if (currentJob && currentJob.status === 'processing') {
            let newProgress = currentJob.progress || 10;
            if (newProgress < 90) {
              newProgress = Math.min(90, newProgress + 5);
              await VideoTranscodingJob.findByIdAndUpdate(jobId, { progress: newProgress });
            }
          }
        } catch (err) {}
      }, 5000);

      const result = await transcodeVideo(inputPath);
      clearInterval(progressInterval);

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

      logger.info('[VideoQueue] Job completed successfully', { jobId });

      if (jobType === 'course' && videoId) {
        try {
          const s3Key = `videos/${courseId || 'course'}/${videoId}-${Date.now()}.mp4`;
          const uploadResult = await StorageService.uploadFromPath(result.outputPath, s3Key);

          await Video.updateOne(
            { _id: videoId },
            {
              status: 'READY',
              videoUrl: uploadResult.url,
              s3Key: uploadResult.key,
              duration: result.duration
            }
          );

          logger.info('[VideoQueue] Video updated to READY status', { videoId });

          try {
            const video = await Video.findById(videoId);
            if (video && video.courseId) {
              const enrollments = await CourseEnrollment.find({
                courseId: video.courseId,
                status: { $in: ['enrolled', 'in_progress', 'completed'] }
              })
                .select('userId')
                .lean();

              const notificationPromises = enrollments.map((enrollment) =>
                emitNotification({
                  recipientType: 'USER',
                  recipientId: enrollment.userId,
                  category: 'COURSE',
                  type: 'NEW_VIDEO_AVAILABLE',
                  title: 'New Video Available',
                  message: `A new video "${video.title}" is now available`,
                  channels: ['IN_APP', 'PUSH'],
                  entity: { type: 'VIDEO', id: videoId },
                  payload: {
                    videoId: videoId.toString(),
                    videoTitle: video.title,
                    courseId: video.courseId.toString()
                  }
                }).catch((err) => logger.error('[VideoQueue] Failed to notify user', { userId: enrollment.userId, err }))
              );
              Promise.all(notificationPromises).catch((err) =>
                logger.error('[VideoQueue] Error sending video ready notifications', err)
              );
            }
          } catch (notifError) {
            logger.error('[VideoQueue] Failed to emit video ready notifications', notifError);
          }

          try {
            const video = await Video.findById(videoId);
            if (video && video.videoUrl) {
              const existingJob = await MCQGenerationJob.findOne({
                videoId,
                status: { $in: ['PENDING', 'PROCESSING'] }
              });
              if (!existingJob) {
                await MCQGenerationJob.create({
                  videoId,
                  courseId: courseId || video.courseId,
                  status: 'PENDING',
                  provider: 'DRISHTI_AI'
                });
                logger.info('[VideoQueue] MCQ generation job queued', { videoId });
              }
            }
          } catch (jobError) {
            logger.error('[VideoQueue] Failed to create MCQ generation job', {
              videoId,
              message: jobError.message
            });
          }

          try {
            await cleanupFile(result.outputPath);
          } catch (cleanupError) {
            logger.warn('[VideoQueue] Failed to cleanup file', { path: result.outputPath, cleanupError });
          }
        } catch (videoUpdateError) {
          logger.error('[VideoQueue] Failed to update Video after transcoding', { videoId, videoUpdateError });
          try {
            await Video.updateOne({ _id: videoId }, { status: 'FAILED' });
          } catch (statusUpdateError) {
            logger.error('[VideoQueue] Failed to update Video status to FAILED', { videoId, statusUpdateError });
          }
        }
      }

      this.emit('job:completed', { jobId, result });
    } catch (error) {
      logger.error('[VideoQueue] Job failed', { jobId, error });

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

  async getJobStatus(jobId) {
    try {
      const job = await VideoTranscodingJob.findById(jobId);
      if (!job) return null;

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
      logger.error('[VideoQueue] Error getting job status', { jobId, error });
      return null;
    }
  }

  getStats() {
    return {
      queueLength: this.queue.length,
      activeJobs: this.activeJobs,
      maxConcurrentJobs: this.maxConcurrentJobs,
      isProcessing: this.processing
    };
  }
}

const videoTranscodingQueue = new VideoTranscodingQueue();
module.exports = videoTranscodingQueue;

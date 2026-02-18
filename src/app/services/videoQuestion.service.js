/**
 * University VideoQuestion domain: list, create, update, delete, regenerate, publish. Returns { statusCode, json }.
 */

const Video = require('../../models/course/Video');
const VideoQuestion = require('../../models/course/VideoQuestion');
const Course = require('../../models/course/Course');
const MCQGenerationJob = require('../../models/ai/MCQGenerationJob');
const CourseEnrollment = require('../../models/course/CourseEnrollment');
const { emitNotification } = require('../../core/infra/notificationEmitter');

async function getVideoQuestions(videoId, universityId) {
    try {
        const video = await Video.findById(videoId);
        if (!video) {
            return { statusCode: 404, json: { success: false, message: 'Video not found' } };
        }
        const course = await Course.findById(video.courseId);
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'Access denied. You do not own this course.' } };
        }
        const questions = await VideoQuestion.find({ videoId }).sort({ createdAt: 1 }).lean();
        return { statusCode: 200, json: { success: true, data: { questions } } };
    } catch (error) {
        console.error('Get video questions error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error fetching video questions', error: error.message } };
    }
}

async function updateVideoQuestion(questionId, universityId, body) {
    try {
        const { question, options, correctAnswer } = body;
        const videoQuestion = await VideoQuestion.findById(questionId);
        if (!videoQuestion) {
            return { statusCode: 404, json: { success: false, message: 'Question not found' } };
        }
        const video = await Video.findById(videoQuestion.videoId);
        if (!video) {
            return { statusCode: 404, json: { success: false, message: 'Video not found' } };
        }
        const course = await Course.findById(video.courseId);
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'Access denied. You do not own this course.' } };
        }
        if (correctAnswer !== undefined) {
            if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
                return { statusCode: 400, json: { success: false, message: 'correctAnswer must be one of: A, B, C, D' } };
            }
        }
        if (options !== undefined) {
            if (typeof options !== 'object' || options === null) {
                return { statusCode: 400, json: { success: false, message: 'options must be an object' } };
            }
            if (options.A === undefined || options.B === undefined || options.C === undefined || options.D === undefined) {
                return { statusCode: 400, json: { success: false, message: 'options must contain A, B, C, and D fields' } };
            }
        }
        if (question !== undefined) videoQuestion.question = question;
        if (options !== undefined) {
            videoQuestion.options = { A: options.A, B: options.B, C: options.C, D: options.D };
        }
        if (correctAnswer !== undefined) videoQuestion.correctAnswer = correctAnswer;
        await videoQuestion.save();
        return { statusCode: 200, json: { success: true, message: 'Question updated successfully', data: { question: videoQuestion } } };
    } catch (error) {
        console.error('Update video question error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error updating question', error: error.message } };
    }
}

async function deleteVideoQuestion(questionId, universityId) {
    try {
        const videoQuestion = await VideoQuestion.findById(questionId);
        if (!videoQuestion) {
            return { statusCode: 404, json: { success: false, message: 'Question not found' } };
        }
        const video = await Video.findById(videoQuestion.videoId);
        if (!video) {
            return { statusCode: 404, json: { success: false, message: 'Video not found' } };
        }
        const course = await Course.findById(video.courseId);
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'Access denied. You do not own this course.' } };
        }
        await VideoQuestion.deleteOne({ _id: questionId });
        return { statusCode: 200, json: { success: true, message: 'Question deleted successfully' } };
    } catch (error) {
        console.error('Delete video question error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error deleting question', error: error.message } };
    }
}

async function createManualVideoQuestion(videoId, universityId, body) {
    try {
        const { question, options, correctAnswer, explanation } = body;
        if (!question || !options || !correctAnswer) {
            return { statusCode: 400, json: { success: false, message: 'Missing required fields: question, options, and correctAnswer are required' } };
        }
        if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
            return { statusCode: 400, json: { success: false, message: 'correctAnswer must be one of: A, B, C, D' } };
        }
        if (typeof options !== 'object' || options === null) {
            return { statusCode: 400, json: { success: false, message: 'options must be an object' } };
        }
        if (!options.A || !options.B || !options.C || !options.D) {
            return { statusCode: 400, json: { success: false, message: 'options must contain A, B, C, and D fields' } };
        }
        const video = await Video.findById(videoId);
        if (!video) {
            return { statusCode: 404, json: { success: false, message: 'Video not found' } };
        }
        const course = await Course.findById(video.courseId);
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'Access denied. You do not own this course.' } };
        }
        const newQuestion = await VideoQuestion.create({
            videoId,
            courseId: video.courseId,
            question: question.trim(),
            options: { A: options.A, B: options.B, C: options.C, D: options.D },
            correctAnswer,
            source: 'MANUAL',
            status: 'DRAFT',
            editable: true
        });
        return { statusCode: 201, json: { success: true, message: 'Question added successfully', data: { question: newQuestion } } };
    } catch (error) {
        console.error('Create manual video question error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error creating question', error: error.message } };
    }
}

async function regenerateVideoQuestions(videoId, universityId) {
    try {
        const video = await Video.findById(videoId);
        if (!video) {
            return { statusCode: 404, json: { success: false, message: 'Video not found' } };
        }
        const course = await Course.findById(video.courseId);
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'Access denied. You do not own this course.' } };
        }
        await VideoQuestion.deleteMany({ videoId });
        const existingJob = await MCQGenerationJob.findOne({
            videoId,
            status: { $in: ['PENDING', 'PROCESSING'] }
        });
        if (existingJob) {
            await MCQGenerationJob.findByIdAndUpdate(existingJob._id, { status: 'PENDING', attempts: 0, error: null });
        } else {
            await MCQGenerationJob.create({
                videoId,
                courseId: video.courseId,
                status: 'PENDING',
                attempts: 0,
                provider: 'DRISHTI_AI'
            });
        }
        return { statusCode: 200, json: { success: true, message: 'MCQ regeneration started', data: { videoId, status: 'PENDING' } } };
    } catch (error) {
        console.error('Regenerate video questions error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error starting MCQ regeneration', error: error.message } };
    }
}

async function publishVideoQuestion(questionId, universityId) {
    try {
        const videoQuestion = await VideoQuestion.findById(questionId);
        if (!videoQuestion) {
            return { statusCode: 404, json: { success: false, message: 'Question not found' } };
        }
        const video = await Video.findById(videoQuestion.videoId);
        if (!video) {
            return { statusCode: 404, json: { success: false, message: 'Video not found' } };
        }
        const course = await Course.findById(video.courseId);
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'Access denied. You do not own this course.' } };
        }
        const publishedAt = new Date();
        const wasJustPublished = videoQuestion.status !== 'ACTIVE';
        if (wasJustPublished) {
            videoQuestion.status = 'ACTIVE';
            await videoQuestion.save();
        }
        if (wasJustPublished) {
            try {
                const enrollments = await CourseEnrollment.find({
                    courseId: course._id,
                    status: { $in: ['enrolled', 'in_progress', 'completed'] }
                }).select('userId').lean();
                const notificationPromises = enrollments.map(enrollment =>
                    emitNotification({
                        recipientType: 'USER',
                        recipientId: enrollment.userId,
                        category: 'COURSE',
                        type: 'VIDEO_QUIZ_PUBLISHED',
                        title: 'New Quiz Available',
                        message: `A new quiz is now available for "${video.title}"`,
                        channels: ['IN_APP', 'PUSH'],
                        entity: { type: 'VIDEO', id: video._id },
                        payload: {
                            videoId: video._id.toString(),
                            videoTitle: video.title,
                            courseId: course._id.toString(),
                            courseName: course.name
                        }
                    }).catch(err => console.error(`Failed to notify user ${enrollment.userId} about quiz:`, err))
                );
                Promise.all(notificationPromises).catch(err => console.error('Error sending quiz published notifications:', err));
            } catch (notifError) {
                console.error('Failed to emit quiz published notifications:', notifError);
            }
        }
        return {
            statusCode: 200,
            json: { success: true, message: 'Question published successfully', data: { questionId, status: videoQuestion.status, publishedAt } }
        };
    } catch (error) {
        console.error('Publish video question error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error publishing question', error: error.message } };
    }
}

module.exports = {
    getVideoQuestions,
    updateVideoQuestion,
    deleteVideoQuestion,
    createManualVideoQuestion,
    regenerateVideoQuestions,
    publishVideoQuestion
};

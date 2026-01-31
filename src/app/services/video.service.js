/**
 * Video and checkpoint domain: upload, CRUD, progress, product analytics, checkpoint questions. Returns { statusCode, json }.
 */

const Video = require('../../models/course/Video');
const Playlist = require('../../models/course/Playlist');
const Course = require('../../models/course/Course');
const VideoQuestion = require('../../models/course/VideoQuestion');
const Question = require('../../models/course/Question');
const UserVideoProgress = require('../../models/progress/UserVideoProgress');
const videoServiceS3 = require('../../core/infra/videoUpload');

async function uploadVideo(body, file, universityId) {
    try {
        const { playlistId, title, description, order } = body;
        if (!playlistId || !title) {
            return { statusCode: 400, json: { success: false, message: 'Playlist ID and title are required' } };
        }
        if (!file) {
            return { statusCode: 400, json: { success: false, message: 'Video file is required' } };
        }
        const playlist = await Playlist.findById(playlistId);
        if (!playlist) {
            return { statusCode: 404, json: { success: false, message: 'Playlist not found' } };
        }
        const course = await Course.findById(playlist.courseId);
        if (!course || course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to upload videos to this playlist' } };
        }
        const videoData = await videoServiceS3.uploadVideo(file, {
            playlistId,
            courseId: playlist.courseId,
            title,
            description: description || '',
            order: order || 0
        });
        return { statusCode: 201, json: { success: true, message: 'Video uploaded successfully', data: { video: videoData } } };
    } catch (error) {
        console.error('Upload video error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error uploading video', error: error.message } };
    }
}

async function getVideo(id, userId) {
    try {
        const video = await Video.findById(id)
            .populate('playlistId', 'name')
            .populate('courseId', 'name')
            .lean();
        if (!video) {
            return { statusCode: 404, json: { success: false, message: 'Video not found' } };
        }
        let progress = null;
        if (userId) {
            progress = await UserVideoProgress.findOne({ userId, videoId: id }).lean();
        }
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Video retrieved successfully',
                data: {
                    video,
                    progress: progress || { lastWatchedSecond: 0, completed: false }
                }
            }
        };
    } catch (error) {
        console.error('Get video error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error retrieving video', error: error.message } };
    }
}

async function getPlaylistVideos(playlistId, userId) {
    try {
        const videos = await Video.find({ playlistId }).sort({ order: 1, createdAt: 1 }).lean();
        let progressMap = {};
        if (userId) {
            const videoIds = videos.map(v => v._id);
            const progressList = await UserVideoProgress.find({ userId, videoId: { $in: videoIds } }).lean();
            progressList.forEach(p => {
                progressMap[p.videoId.toString()] = { lastWatchedSecond: p.lastWatchedSecond, completed: p.completed };
            });
        }
        const videosWithProgress = videos.map(video => ({
            ...video,
            progress: progressMap[video._id.toString()] || { lastWatchedSecond: 0, completed: false }
        }));
        return { statusCode: 200, json: { success: true, message: 'Videos retrieved successfully', data: { videos: videosWithProgress } } };
    } catch (error) {
        console.error('Get playlist videos error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error retrieving videos', error: error.message } };
    }
}

async function updateVideo(id, universityId, body) {
    try {
        const { title, description, order } = body;
        const video = await Video.findById(id);
        if (!video) {
            return { statusCode: 404, json: { success: false, message: 'Video not found' } };
        }
        const course = await Course.findById(video.courseId);
        if (!course || course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to update this video' } };
        }
        if (title !== undefined) video.title = title;
        if (description !== undefined) video.description = description;
        if (order !== undefined) video.order = order;
        await video.save();
        return { statusCode: 200, json: { success: true, message: 'Video updated successfully', data: { video } } };
    } catch (error) {
        console.error('Update video error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error updating video', error: error.message } };
    }
}

async function deleteVideo(id, universityId) {
    try {
        const video = await Video.findById(id);
        if (!video) {
            return { statusCode: 404, json: { success: false, message: 'Video not found' } };
        }
        const course = await Course.findById(video.courseId);
        if (!course || course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to delete this video' } };
        }
        const s3Key = video.s3Key || (video.media && video.media.s3Key);
        if (s3Key) {
            await videoServiceS3.deleteVideo(s3Key);
        }
        await Video.findByIdAndDelete(id);
        return { statusCode: 200, json: { success: true, message: 'Video deleted successfully' } };
    } catch (error) {
        console.error('Delete video error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error deleting video', error: error.message } };
    }
}

async function updateVideoThumbnail(id, universityId, file) {
    try {
        if (!file) {
            return { statusCode: 400, json: { success: false, message: 'Thumbnail file is required' } };
        }
        const video = await Video.findById(id);
        if (!video) {
            return { statusCode: 404, json: { success: false, message: 'Video not found' } };
        }
        const course = await Course.findById(video.courseId);
        if (!course || course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to update this video thumbnail' } };
        }
        const thumbnailUrl = await videoServiceS3.uploadThumbnail(file, video._id);
        video.thumbnail = thumbnailUrl;
        await video.save();
        return { statusCode: 200, json: { success: true, message: 'Thumbnail updated successfully', data: { thumbnail: thumbnailUrl } } };
    } catch (error) {
        console.error('Update thumbnail error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error updating thumbnail', error: error.message } };
    }
}

async function trackProductView(videoId, userId) {
    try {
        if (!userId) {
            return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
        }
        Video.findByIdAndUpdate(videoId, { $inc: { 'productAnalytics.views': 1 } }, { new: false }).catch(err => {
            console.error('Error tracking product view:', err);
        });
        return { statusCode: 200, json: { success: true, message: 'Product view tracked' } };
    } catch (error) {
        return { statusCode: 200, json: { success: true, message: 'Product view tracked' } };
    }
}

async function trackProductClick(videoId, userId) {
    try {
        if (!userId) {
            return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
        }
        Video.findByIdAndUpdate(videoId, { $inc: { 'productAnalytics.clicks': 1 } }, { new: false }).catch(err => {
            console.error('Error tracking product click:', err);
        });
        return { statusCode: 200, json: { success: true, message: 'Product click tracked' } };
    } catch (error) {
        return { statusCode: 200, json: { success: true, message: 'Product click tracked' } };
    }
}

async function getVideoQuestionsForLearner(videoId) {
    try {
        const video = await Video.findById(videoId);
        if (!video) {
            return { statusCode: 404, json: { success: false, message: 'Video not found' } };
        }
        const questions = await VideoQuestion.find({ videoId, status: 'ACTIVE' }).sort({ createdAt: 1 }).lean();
        const mappedQuestions = questions.map(q => ({
            _id: q._id,
            videoId: q.videoId,
            question: q.question,
            options: q.options,
            correct_answer: q.correctAnswer,
            timestamp_seconds: q.aiMeta?.timestamp_seconds || null,
            part_number: q.aiMeta?.part_number || null,
            source: q.source,
            createdAt: q.createdAt,
            updatedAt: q.updatedAt
        }));
        return { statusCode: 200, json: { success: true, message: 'Questions retrieved successfully', data: { questions: mappedQuestions } } };
    } catch (error) {
        console.error('Get video questions error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error retrieving questions', error: error.message } };
    }
}

// --- Checkpoint (Question model) ---

async function createCheckpointQuestion(videoId, universityId, body) {
    try {
        const { checkpointTime, question, options, correctAnswer } = body;
        if (!checkpointTime || !question || !options || !correctAnswer) {
            return { statusCode: 400, json: { success: false, message: 'checkpointTime, question, options, and correctAnswer are required' } };
        }
        if (!Array.isArray(options) || options.length < 2) {
            return { statusCode: 400, json: { success: false, message: 'At least 2 options are required' } };
        }
        if (!options.includes(correctAnswer)) {
            return { statusCode: 400, json: { success: false, message: 'correctAnswer must be one of the options' } };
        }
        const video = await Video.findById(videoId);
        if (!video) {
            return { statusCode: 404, json: { success: false, message: 'Video not found' } };
        }
        const course = await Course.findById(video.courseId);
        if (!course || course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to create questions for this video' } };
        }
        const questionDoc = await Question.create({ videoId, checkpointTime, question, options, correctAnswer });
        return { statusCode: 201, json: { success: true, message: 'Question created successfully', data: { question: questionDoc } } };
    } catch (error) {
        console.error('Create question error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error creating question', error: error.message } };
    }
}

async function getCheckpointQuestion(videoId, checkpointTime) {
    try {
        const question = await Question.findOne({ videoId, checkpointTime: parseInt(checkpointTime) }).lean();
        if (!question) {
            return { statusCode: 404, json: { success: false, message: 'Question not found at this checkpoint' } };
        }
        const { correctAnswer, ...questionWithoutAnswer } = question;
        return { statusCode: 200, json: { success: true, message: 'Question retrieved successfully', data: { question: questionWithoutAnswer } } };
    } catch (error) {
        console.error('Get question error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error retrieving question', error: error.message } };
    }
}

async function validateCheckpointAnswer(questionId, answer) {
    try {
        if (!answer) {
            return { statusCode: 400, json: { success: false, message: 'Answer is required' } };
        }
        const question = await Question.findById(questionId);
        if (!question) {
            return { statusCode: 404, json: { success: false, message: 'Question not found' } };
        }
        const isCorrect = question.correctAnswer === answer;
        return {
            statusCode: 200,
            json: {
                success: true,
                message: isCorrect ? 'Correct answer!' : 'Incorrect answer',
                data: { isCorrect, correctAnswer: isCorrect ? question.correctAnswer : undefined }
            }
        };
    } catch (error) {
        console.error('Validate answer error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error validating answer', error: error.message } };
    }
}

async function getQuestionsByVideo(videoId) {
    try {
        const questions = await Question.find({ videoId }).sort({ checkpointTime: 1 }).select('-correctAnswer').lean();
        return { statusCode: 200, json: { success: true, message: 'Questions retrieved successfully', data: { questions } } };
    } catch (error) {
        console.error('Get questions error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error retrieving questions', error: error.message } };
    }
}

async function updateCheckpointQuestion(id, universityId, body) {
    try {
        const { checkpointTime, question, options, correctAnswer } = body;
        const questionDoc = await Question.findById(id);
        if (!questionDoc) {
            return { statusCode: 404, json: { success: false, message: 'Question not found' } };
        }
        const video = await Video.findById(questionDoc.videoId);
        const course = await Course.findById(video.courseId);
        if (!course || course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to update this question' } };
        }
        if (checkpointTime !== undefined) questionDoc.checkpointTime = checkpointTime;
        if (question !== undefined) questionDoc.question = question;
        if (options !== undefined) {
            if (!Array.isArray(options) || options.length < 2) {
                return { statusCode: 400, json: { success: false, message: 'At least 2 options are required' } };
            }
            questionDoc.options = options;
        }
        if (correctAnswer !== undefined) {
            if (!questionDoc.options.includes(correctAnswer)) {
                return { statusCode: 400, json: { success: false, message: 'correctAnswer must be one of the options' } };
            }
            questionDoc.correctAnswer = correctAnswer;
        }
        await questionDoc.save();
        return { statusCode: 200, json: { success: true, message: 'Question updated successfully', data: { question: questionDoc } } };
    } catch (error) {
        console.error('Update question error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error updating question', error: error.message } };
    }
}

async function deleteCheckpointQuestion(id, universityId) {
    try {
        const question = await Question.findById(id);
        if (!question) {
            return { statusCode: 404, json: { success: false, message: 'Question not found' } };
        }
        const video = await Video.findById(question.videoId);
        const course = await Course.findById(video.courseId);
        if (!course || course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to delete this question' } };
        }
        await Question.findByIdAndDelete(id);
        return { statusCode: 200, json: { success: true, message: 'Question deleted successfully' } };
    } catch (error) {
        console.error('Delete question error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error deleting question', error: error.message } };
    }
}

module.exports = {
    uploadVideo,
    getVideo,
    getPlaylistVideos,
    updateVideo,
    deleteVideo,
    updateVideoThumbnail,
    trackProductView,
    trackProductClick,
    getVideoQuestionsForLearner,
    createCheckpointQuestion,
    getCheckpointQuestion,
    validateCheckpointAnswer,
    getQuestionsByVideo,
    updateCheckpointQuestion,
    deleteCheckpointQuestion
};

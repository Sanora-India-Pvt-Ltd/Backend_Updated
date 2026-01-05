const Question = require('../../models/course/Question');
const Video = require('../../models/course/Video');
const Course = require('../../models/course/Course');

/**
 * Create checkpoint question for video
 */
const createQuestion = async (req, res) => {
    try {
        const { videoId } = req.params;
        const { checkpointTime, question, options, correctAnswer } = req.body;
        const universityId = req.universityId; // From middleware

        // Validation
        if (!checkpointTime || !question || !options || !correctAnswer) {
            return res.status(400).json({
                success: false,
                message: 'checkpointTime, question, options, and correctAnswer are required'
            });
        }

        if (!Array.isArray(options) || options.length < 2) {
            return res.status(400).json({
                success: false,
                message: 'At least 2 options are required'
            });
        }

        if (!options.includes(correctAnswer)) {
            return res.status(400).json({
                success: false,
                message: 'correctAnswer must be one of the options'
            });
        }

        // Verify video ownership
        const video = await Video.findById(videoId);
        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'Video not found'
            });
        }

        const course = await Course.findById(video.courseId);
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to create questions for this video'
            });
        }

        const questionDoc = await Question.create({
            videoId,
            checkpointTime,
            question,
            options,
            correctAnswer
        });

        res.status(201).json({
            success: true,
            message: 'Question created successfully',
            data: { question: questionDoc }
        });
    } catch (error) {
        console.error('Create question error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating question',
            error: error.message
        });
    }
};

/**
 * Get question at checkpoint
 */
const getQuestion = async (req, res) => {
    try {
        const { videoId, checkpointTime } = req.params;

        const question = await Question.findOne({
            videoId,
            checkpointTime: parseInt(checkpointTime)
        }).lean();

        if (!question) {
            return res.status(404).json({
                success: false,
                message: 'Question not found at this checkpoint'
            });
        }

        // Don't send correct answer to client
        const { correctAnswer, ...questionWithoutAnswer } = question;

        res.status(200).json({
            success: true,
            message: 'Question retrieved successfully',
            data: { question: questionWithoutAnswer }
        });
    } catch (error) {
        console.error('Get question error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving question',
            error: error.message
        });
    }
};

/**
 * Validate answer (check answer, return result - no DB write if wrong)
 */
const validateAnswer = async (req, res) => {
    try {
        const { id } = req.params;
        const { answer } = req.body;

        if (!answer) {
            return res.status(400).json({
                success: false,
                message: 'Answer is required'
            });
        }

        const question = await Question.findById(id);

        if (!question) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        const isCorrect = question.correctAnswer === answer;

        res.status(200).json({
            success: true,
            message: isCorrect ? 'Correct answer!' : 'Incorrect answer',
            data: {
                isCorrect,
                correctAnswer: isCorrect ? question.correctAnswer : undefined // Only reveal if correct
            }
        });
    } catch (error) {
        console.error('Validate answer error:', error);
        res.status(500).json({
            success: false,
            message: 'Error validating answer',
            error: error.message
        });
    }
};

/**
 * Get all questions in video
 */
const getQuestionsByVideo = async (req, res) => {
    try {
        const { videoId } = req.params;

        const questions = await Question.find({ videoId })
            .sort({ checkpointTime: 1 })
            .select('-correctAnswer') // Don't send correct answers
            .lean();

        res.status(200).json({
            success: true,
            message: 'Questions retrieved successfully',
            data: { questions }
        });
    } catch (error) {
        console.error('Get questions error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving questions',
            error: error.message
        });
    }
};

/**
 * Update question (modify question/options)
 */
const updateQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        const { checkpointTime, question, options, correctAnswer } = req.body;
        const universityId = req.universityId; // From middleware

        const questionDoc = await Question.findById(id);

        if (!questionDoc) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        // Verify ownership
        const video = await Video.findById(questionDoc.videoId);
        const course = await Course.findById(video.courseId);
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update this question'
            });
        }

        // Update fields
        if (checkpointTime !== undefined) questionDoc.checkpointTime = checkpointTime;
        if (question !== undefined) questionDoc.question = question;
        if (options !== undefined) {
            if (!Array.isArray(options) || options.length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'At least 2 options are required'
                });
            }
            questionDoc.options = options;
        }
        if (correctAnswer !== undefined) {
            if (!questionDoc.options.includes(correctAnswer)) {
                return res.status(400).json({
                    success: false,
                    message: 'correctAnswer must be one of the options'
                });
            }
            questionDoc.correctAnswer = correctAnswer;
        }

        await questionDoc.save();

        res.status(200).json({
            success: true,
            message: 'Question updated successfully',
            data: { question: questionDoc }
        });
    } catch (error) {
        console.error('Update question error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating question',
            error: error.message
        });
    }
};

/**
 * Delete checkpoint
 */
const deleteQuestion = async (req, res) => {
    try {
        const { id } = req.params;
        const universityId = req.universityId; // From middleware

        const question = await Question.findById(id);

        if (!question) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        // Verify ownership
        const video = await Video.findById(question.videoId);
        const course = await Course.findById(video.courseId);
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete this question'
            });
        }

        await Question.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Question deleted successfully'
        });
    } catch (error) {
        console.error('Delete question error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting question',
            error: error.message
        });
    }
};

module.exports = {
    createQuestion,
    getQuestion,
    validateAnswer,
    getQuestionsByVideo,
    updateQuestion,
    deleteQuestion
};


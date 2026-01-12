const Video = require('../../models/course/Video');
const VideoQuestion = require('../../models/course/VideoQuestion');
const Course = require('../../models/course/Course');
const MCQGenerationJob = require('../../models/ai/MCQGenerationJob');

/**
 * List MCQs for a video (University only)
 * GET /api/university/videos/:videoId/questions
 */
const getVideoQuestions = async (req, res) => {
    try {
        const { videoId } = req.params;
        const universityId = req.universityId; // From requireUniversity middleware

        // 1. Extract videoId from params (already done above)

        // 2. Fetch Video by videoId
        const video = await Video.findById(videoId);
        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'Video not found'
            });
        }

        // 3. Verify ownership: Video.courseId → Course.universityId === req.universityId
        const course = await Course.findById(video.courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You do not own this course.'
            });
        }

        // 4. Fetch VideoQuestion records: filter by videoId, sort by createdAt ASC
        const questions = await VideoQuestion.find({ videoId })
            .sort({ createdAt: 1 })
            .lean();

        // 5. Return response
        return res.status(200).json({
            success: true,
            data: {
                questions
            }
        });

    } catch (error) {
        console.error('Get video questions error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error fetching video questions',
            error: error.message
        });
    }
};

/**
 * Update an existing VideoQuestion (University only)
 * PUT /api/university/questions/:questionId
 */
const updateVideoQuestion = async (req, res) => {
    try {
        const { questionId } = req.params;
        const universityId = req.universityId; // From requireUniversity middleware
        const { question, options, correctAnswer } = req.body;

        // 1. Extract questionId from params (already done above)

        // 2. Extract from body (optional fields) - already extracted above

        // 3. Fetch VideoQuestion by _id
        const videoQuestion = await VideoQuestion.findById(questionId);
        if (!videoQuestion) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        // 4. Fetch Video using videoId from question
        const video = await Video.findById(videoQuestion.videoId);
        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'Video not found'
            });
        }

        // 5. Fetch Course using video.courseId
        const course = await Course.findById(video.courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // 6. Ownership check: course.universityId === req.universityId
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You do not own this course.'
            });
        }

        // 7. Validate fields if provided
        if (correctAnswer !== undefined) {
            if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
                return res.status(400).json({
                    success: false,
                    message: 'correctAnswer must be one of: A, B, C, D'
                });
            }
        }

        if (options !== undefined) {
            if (typeof options !== 'object' || options === null) {
                return res.status(400).json({
                    success: false,
                    message: 'options must be an object'
                });
            }
            // Validate options structure
            if (options.A === undefined || options.B === undefined || 
                options.C === undefined || options.D === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'options must contain A, B, C, and D fields'
                });
            }
        }

        // 8. Update allowed fields only (do NOT allow changing videoId or courseId)
        if (question !== undefined) {
            videoQuestion.question = question;
        }
        if (options !== undefined) {
            videoQuestion.options = {
                A: options.A,
                B: options.B,
                C: options.C,
                D: options.D
            };
        }
        if (correctAnswer !== undefined) {
            videoQuestion.correctAnswer = correctAnswer;
        }

        // 9. Save document
        await videoQuestion.save();

        // Response
        return res.status(200).json({
            success: true,
            message: 'Question updated successfully',
            data: { question: videoQuestion }
        });

    } catch (error) {
        console.error('Update video question error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error updating question',
            error: error.message
        });
    }
};

/**
 * Delete a VideoQuestion (University only)
 * DELETE /api/university/questions/:questionId
 */
const deleteVideoQuestion = async (req, res) => {
    try {
        const { questionId } = req.params;
        const universityId = req.universityId; // From requireUniversity middleware

        // 1. Extract questionId from params (already done above)

        // 2. Find VideoQuestion by _id
        const videoQuestion = await VideoQuestion.findById(questionId);
        if (!videoQuestion) {
            return res.status(404).json({
                success: false,
                message: 'Question not found'
            });
        }

        // 3. Fetch Video using question.videoId
        const video = await Video.findById(videoQuestion.videoId);
        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'Video not found'
            });
        }

        // 4. Fetch Course using video.courseId
        const course = await Course.findById(video.courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // 5. Ownership check: course.universityId === req.universityId
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You do not own this course.'
            });
        }

        // 6. Delete VideoQuestion using deleteOne()
        await VideoQuestion.deleteOne({ _id: questionId });

        // Response
        return res.status(200).json({
            success: true,
            message: 'Question deleted successfully'
        });

    } catch (error) {
        console.error('Delete video question error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error deleting question',
            error: error.message
        });
    }
};

/**
 * Create a manual VideoQuestion (University only)
 * POST /api/university/videos/:videoId/questions
 */
const createManualVideoQuestion = async (req, res) => {
    try {
        const { videoId } = req.params;
        const universityId = req.universityId; // From requireUniversity middleware
        const { question, options, correctAnswer, explanation } = req.body;

        // 1. Extract videoId from params (already done above)

        // 2. Extract from body - already extracted above

        // 3. Validate required fields
        if (!question || !options || !correctAnswer) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: question, options, and correctAnswer are required'
            });
        }

        // 4. Validate correctAnswer ∈ ['A','B','C','D']
        if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) {
            return res.status(400).json({
                success: false,
                message: 'correctAnswer must be one of: A, B, C, D'
            });
        }

        // Validate options structure
        if (typeof options !== 'object' || options === null) {
            return res.status(400).json({
                success: false,
                message: 'options must be an object'
            });
        }

        if (!options.A || !options.B || !options.C || !options.D) {
            return res.status(400).json({
                success: false,
                message: 'options must contain A, B, C, and D fields'
            });
        }

        // 5. Fetch Video by videoId
        const video = await Video.findById(videoId);
        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'Video not found'
            });
        }

        // 6. Fetch Course using video.courseId
        const course = await Course.findById(video.courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // 7. Ownership check: course.universityId === req.universityId
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You do not own this course.'
            });
        }

        // 8. Create VideoQuestion with source = 'MANUAL'
        const newQuestion = await VideoQuestion.create({
            videoId: videoId,
            courseId: video.courseId,
            question: question.trim(),
            options: {
                A: options.A,
                B: options.B,
                C: options.C,
                D: options.D
            },
            correctAnswer: correctAnswer,
            source: 'MANUAL',
            status: 'DRAFT',
            editable: true
            // Note: explanation field not in schema, so not included
        });

        // Response
        return res.status(201).json({
            success: true,
            message: 'Question added successfully',
            data: { question: newQuestion }
        });

    } catch (error) {
        console.error('Create manual video question error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error creating question',
            error: error.message
        });
    }
};

/**
 * Regenerate MCQs for a video (University only)
 * POST /api/university/videos/:videoId/questions/regenerate
 */
const regenerateVideoQuestions = async (req, res) => {
    try {
        const { videoId } = req.params;
        const universityId = req.universityId; // From requireUniversity middleware

        // 1. Extract videoId from params (already done above)

        // 2. Fetch Video by videoId
        const video = await Video.findById(videoId);
        if (!video) {
            return res.status(404).json({
                success: false,
                message: 'Video not found'
            });
        }

        // 3. Fetch Course using video.courseId
        const course = await Course.findById(video.courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // 4. Ownership check: course.universityId === req.universityId
        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Access denied. You do not own this course.'
            });
        }

        // 5. Delete existing VideoQuestion records: filter by videoId
        await VideoQuestion.deleteMany({ videoId: videoId });
        console.log(`[RegenerateMCQ] Deleted existing questions for video ${videoId}`);

        // 6. Create MCQGenerationJob with status = 'PENDING'
        // Check if a job already exists for this video
        const existingJob = await MCQGenerationJob.findOne({
            videoId: videoId,
            status: { $in: ['PENDING', 'PROCESSING'] }
        });

        if (existingJob) {
            // Reset existing job to PENDING if it exists
            await MCQGenerationJob.findByIdAndUpdate(existingJob._id, {
                status: 'PENDING',
                attempts: 0,
                error: null
            });
            console.log(`[RegenerateMCQ] Reset existing job ${existingJob._id} to PENDING`);
        } else {
            // Create new job
            await MCQGenerationJob.create({
                videoId: videoId,
                courseId: video.courseId,
                status: 'PENDING',
                attempts: 0,
                provider: 'DRISHTI_AI'
            });
            console.log(`[RegenerateMCQ] Created new job for video ${videoId}`);
        }

        // 7. Return response
        return res.status(200).json({
            success: true,
            message: 'MCQ regeneration started',
            data: {
                videoId: videoId,
                status: 'PENDING'
            }
        });

    } catch (error) {
        console.error('Regenerate video questions error:', error);
        return res.status(500).json({
            success: false,
            message: 'Error starting MCQ regeneration',
            error: error.message
        });
    }
};

module.exports = {
    getVideoQuestions,
    updateVideoQuestion,
    deleteVideoQuestion,
    createManualVideoQuestion,
    regenerateVideoQuestions
};


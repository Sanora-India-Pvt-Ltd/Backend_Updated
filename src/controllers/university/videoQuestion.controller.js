const Video = require('../../models/course/Video');
const VideoQuestion = require('../../models/course/VideoQuestion');
const Course = require('../../models/course/Course');

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

module.exports = {
    getVideoQuestions
};


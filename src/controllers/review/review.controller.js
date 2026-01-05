const CourseReview = require('../../models/review/CourseReview');
const Course = require('../../models/course/Course');
const UserCourseProgress = require('../../models/progress/UserCourseProgress');

/**
 * User creates review for course
 */
const createReview = async (req, res) => {
    try {
        const { courseId, rating, comment } = req.body;
        const userId = req.userId; // From user auth middleware

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Validation
        if (!courseId || !rating) {
            return res.status(400).json({
                success: false,
                message: 'Course ID and rating are required'
            });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }

        // Verify course exists
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        // Check if user is enrolled
        const progress = await UserCourseProgress.findOne({ userId, courseId });
        if (!progress) {
            return res.status(403).json({
                success: false,
                message: 'You must be enrolled in the course to leave a review'
            });
        }

        // Check if review already exists
        const existingReview = await CourseReview.findOne({ userId, courseId });
        if (existingReview) {
            return res.status(400).json({
                success: false,
                message: 'You have already reviewed this course. Use update endpoint to modify your review.'
            });
        }

        // Create review
        const review = await CourseReview.create({
            courseId,
            userId,
            rating,
            comment: comment || ''
        });

        res.status(201).json({
            success: true,
            message: 'Review created successfully',
            data: { review }
        });
    } catch (error) {
        console.error('Create review error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating review',
            error: error.message
        });
    }
};

/**
 * Get all reviews for course (paginated)
 */
const getReviews = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { page = 1, limit = 10 } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const reviews = await CourseReview.find({ courseId })
            .populate('userId', 'profile.name.full profile.email profile.profileImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await CourseReview.countDocuments({ courseId });

        res.status(200).json({
            success: true,
            message: 'Reviews retrieved successfully',
            data: {
                reviews,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (error) {
        console.error('Get reviews error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving reviews',
            error: error.message
        });
    }
};

/**
 * User updates own review
 */
const updateReview = async (req, res) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;
        const userId = req.userId; // From user auth middleware

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const review = await CourseReview.findById(id);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        // Verify ownership
        if (review.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to update this review'
            });
        }

        // Update fields
        if (rating !== undefined) {
            if (rating < 1 || rating > 5) {
                return res.status(400).json({
                    success: false,
                    message: 'Rating must be between 1 and 5'
                });
            }
            review.rating = rating;
        }
        if (comment !== undefined) review.comment = comment;

        await review.save();

        res.status(200).json({
            success: true,
            message: 'Review updated successfully',
            data: { review }
        });
    } catch (error) {
        console.error('Update review error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating review',
            error: error.message
        });
    }
};

/**
 * User deletes own review
 */
const deleteReview = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.userId; // From user auth middleware

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const review = await CourseReview.findById(id);

        if (!review) {
            return res.status(404).json({
                success: false,
                message: 'Review not found'
            });
        }

        // Verify ownership
        if (review.userId.toString() !== userId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to delete this review'
            });
        }

        await CourseReview.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Review deleted successfully'
        });
    } catch (error) {
        console.error('Delete review error:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting review',
            error: error.message
        });
    }
};

/**
 * Get average rating for course
 */
const getAvgRating = async (req, res) => {
    try {
        const { courseId } = req.params;

        const reviews = await CourseReview.find({ courseId }).select('rating').lean();

        if (reviews.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No reviews found',
                data: {
                    avgRating: 0,
                    totalReviews: 0
                }
            });
        }

        const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
        const avgRating = totalRating / reviews.length;

        res.status(200).json({
            success: true,
            message: 'Average rating retrieved successfully',
            data: {
                avgRating: Math.round(avgRating * 100) / 100,
                totalReviews: reviews.length
            }
        });
    } catch (error) {
        console.error('Get avg rating error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving average rating',
            error: error.message
        });
    }
};

module.exports = {
    createReview,
    getReviews,
    updateReview,
    deleteReview,
    getAvgRating
};


const asyncHandler = require('../../core/utils/asyncHandler');
const reviewService = require('../../app/services/review.service');

/**
 * User creates review for course
 */
const createReview = asyncHandler(async (req, res) => {
    const { courseId, rating, comment } = req.body;
    const userId = req.userId;

    const review = await reviewService.createReview(userId, { courseId, rating, comment });

    res.status(201).json({
        success: true,
        message: 'Review created successfully',
        data: { review }
    });
});

/**
 * Get all reviews for course (paginated)
 */
const getReviews = asyncHandler(async (req, res) => {
    const { courseId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const { reviews, pagination } = await reviewService.getReviewsByCourseId(courseId, {
        page,
        limit
    });

    res.status(200).json({
        success: true,
        message: 'Reviews retrieved successfully',
        data: {
            reviews,
            pagination
        }
    });
});

/**
 * User updates own review
 */
const updateReview = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const userId = req.userId;

    const review = await reviewService.updateReviewById(id, userId, { rating, comment });

    res.status(200).json({
        success: true,
        message: 'Review updated successfully',
        data: { review }
    });
});

/**
 * User deletes own review
 */
const deleteReview = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const userId = req.userId;

    await reviewService.deleteReviewById(id, userId);

    res.status(200).json({
        success: true,
        message: 'Review deleted successfully'
    });
});

/**
 * Get average rating for course
 */
const getAvgRating = asyncHandler(async (req, res) => {
    const { courseId } = req.params;

    const data = await reviewService.getAverageRatingByCourseId(courseId);

    const message =
        data.totalReviews === 0 ? 'No reviews found' : 'Average rating retrieved successfully';

    res.status(200).json({
        success: true,
        message,
        data: {
            avgRating: data.avgRating,
            totalReviews: data.totalReviews
        }
    });
});

module.exports = {
    createReview,
    getReviews,
    updateReview,
    deleteReview,
    getAvgRating
};

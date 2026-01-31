const CourseReview = require('../../models/review/CourseReview');
const Course = require('../../models/course/Course');
const UserCourseProgress = require('../../models/progress/UserCourseProgress');
const AppError = require('../../core/errors/AppError');

/**
 * Create a review for a course (user must be enrolled, no duplicate review).
 * @param {string} userId - Authenticated user ID
 * @param {{ courseId: string, rating: number, comment?: string }} input
 * @returns {Promise<import('mongoose').Document>} Created review document
 */
async function createReview(userId, { courseId, rating, comment }) {
    if (!userId) {
        throw new AppError('Authentication required', 401);
    }

    if (!courseId || !rating) {
        throw new AppError('Course ID and rating are required', 400);
    }

    if (rating < 1 || rating > 5) {
        throw new AppError('Rating must be between 1 and 5', 400);
    }

    const course = await Course.findById(courseId);
    if (!course) {
        throw new AppError('Course not found', 404);
    }

    const progress = await UserCourseProgress.findOne({ userId, courseId });
    if (!progress) {
        throw new AppError('You must be enrolled in the course to leave a review', 403);
    }

    const existingReview = await CourseReview.findOne({ userId, courseId });
    if (existingReview) {
        throw new AppError(
            'You have already reviewed this course. Use update endpoint to modify your review.',
            400
        );
    }

    const review = await CourseReview.create({
        courseId,
        userId,
        rating,
        comment: comment || ''
    });

    return review;
}

/**
 * Get paginated reviews for a course.
 * @param {string} courseId
 * @param {{ page?: number, limit?: number }} options
 * @returns {Promise<{ reviews: object[], pagination: { page: number, limit: number, total: number, pages: number } }>}
 */
async function getReviewsByCourseId(courseId, { page = 1, limit = 10 } = {}) {
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const reviews = await CourseReview.find({ courseId })
        .populate('userId', 'profile.name.full profile.email profile.profileImage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

    const total = await CourseReview.countDocuments({ courseId });

    return {
        reviews,
        pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit))
        }
    };
}

/**
 * Update a review (ownership enforced).
 * @param {string} id - Review ID
 * @param {string} userId - Authenticated user ID
 * @param {{ rating?: number, comment?: string }} updates
 * @returns {Promise<import('mongoose').Document>} Updated review document
 */
async function updateReviewById(id, userId, { rating, comment }) {
    if (!userId) {
        throw new AppError('Authentication required', 401);
    }

    const review = await CourseReview.findById(id);
    if (!review) {
        throw new AppError('Review not found', 404);
    }

    if (review.userId.toString() !== userId.toString()) {
        throw new AppError('You do not have permission to update this review', 403);
    }

    if (rating !== undefined) {
        if (rating < 1 || rating > 5) {
            throw new AppError('Rating must be between 1 and 5', 400);
        }
        review.rating = rating;
    }
    if (comment !== undefined) review.comment = comment;

    await review.save();

    return review;
}

/**
 * Delete a review (ownership enforced).
 * @param {string} id - Review ID
 * @param {string} userId - Authenticated user ID
 */
async function deleteReviewById(id, userId) {
    if (!userId) {
        throw new AppError('Authentication required', 401);
    }

    const review = await CourseReview.findById(id);
    if (!review) {
        throw new AppError('Review not found', 404);
    }

    if (review.userId.toString() !== userId.toString()) {
        throw new AppError('You do not have permission to delete this review', 403);
    }

    await CourseReview.findByIdAndDelete(id);
}

/**
 * Get average rating and total review count for a course.
 * @param {string} courseId
 * @returns {Promise<{ avgRating: number, totalReviews: number }>}
 */
async function getAverageRatingByCourseId(courseId) {
    const reviews = await CourseReview.find({ courseId }).select('rating').lean();

    if (reviews.length === 0) {
        return { avgRating: 0, totalReviews: 0 };
    }

    const totalRating = reviews.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = totalRating / reviews.length;

    return {
        avgRating: Math.round(avgRating * 100) / 100,
        totalReviews: reviews.length
    };
}

module.exports = {
    createReview,
    getReviewsByCourseId,
    updateReviewById,
    deleteReviewById,
    getAverageRatingByCourseId
};

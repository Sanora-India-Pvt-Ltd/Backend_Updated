const express = require('express');
const router = express.Router();
const {
    createReview,
    getReviews,
    updateReview,
    deleteReview,
    getAvgRating
} = require('../../controllers/review/review.controller');
const { protect } = require('../../middleware/auth');

// Review Routes
router.post('/', protect, createReview);
router.get('/courses/:courseId/reviews', getReviews); // Public
router.put('/:id', protect, updateReview);
router.delete('/:id', protect, deleteReview);
router.get('/courses/:courseId/rating', getAvgRating); // Public

module.exports = router;


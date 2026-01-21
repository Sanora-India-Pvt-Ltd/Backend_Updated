const express = require('express');
const { protect } = require('../../middleware/auth');
const {
  upsertMyProductReview,
  getProductReviews,
  deleteMyProductReview
} = require('../../controllers/marketplace/productReviewController');

const router = express.Router({ mergeParams: true });

// Public: list product reviews (Amazon-like)
router.get('/', getProductReviews);

// Authenticated user: create/update their review (one per product)
router.post('/', protect, upsertMyProductReview);

// Authenticated user: delete their review
router.delete('/', protect, deleteMyProductReview);

module.exports = router;


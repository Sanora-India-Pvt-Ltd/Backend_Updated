const express = require('express');
const { flexibleAuth } = require('../../middleware/flexibleAuth.middleware');
const sellerGuard = require('../../middleware/sellerGuard');
const productReviewRoutes = require('./productReviewRoutes');
const {
    createProduct,
    listProducts,
    getProductById
} = require('../../controllers/marketplace/productController');

const router = express.Router();

// Product creation route: accepts both USER and UNIVERSITY tokens
// Middleware chain: flexibleAuth (handles both auth types) → sellerGuard (bypasses for universities) → createProduct
router.post('/', flexibleAuth, sellerGuard, createProduct);
router.get('/', listProducts);
router.get('/:id', getProductById);

// Product Reviews (rating + review + images)
router.use('/:productId/reviews', productReviewRoutes);

module.exports = router;


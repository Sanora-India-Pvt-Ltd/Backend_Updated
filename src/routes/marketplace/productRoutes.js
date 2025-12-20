const express = require('express');
const { protect } = require('../../middleware/auth');
const sellerGuard = require('../../middleware/sellerGuard');
const {
    createProduct,
    listProducts,
    getProductById
} = require('../../controllers/marketplace/productController');

const router = express.Router();

router.post('/', protect, sellerGuard, createProduct);
router.get('/', listProducts);
router.get('/:id', getProductById);

module.exports = router;


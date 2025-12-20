const express = require('express');
const { protect } = require('../../middleware/auth');
const {
    addToCart,
    updateCartItem,
    removeCartItem,
    getCart
} = require('../../controllers/marketplace/cartController');

const router = express.Router();

router.post('/add', protect, addToCart);
router.patch('/update', protect, updateCartItem);
router.delete('/remove/:productId', protect, removeCartItem);
router.get('/', protect, getCart);

module.exports = router;


const express = require('express');
const { protect } = require('../../middleware/auth');
const {
    applySeller,
    getSellerStatus
} = require('../../controllers/marketplace/sellerController');

const router = express.Router();

router.post('/apply', protect, applySeller);
router.get('/status', protect, getSellerStatus);

module.exports = router;


const express = require('express');
const { protect } = require('../../middleware/auth');
const {
    approveSeller,
    rejectSeller
} = require('../../controllers/marketplace/adminSellerController');

const router = express.Router();

router.post('/approve/:userId', protect, approveSeller);
router.post('/reject/:userId', protect, rejectSeller);

module.exports = router;


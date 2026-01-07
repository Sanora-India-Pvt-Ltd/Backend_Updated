const express = require('express');
const router = express.Router();
const { getWallet, getTransactions } = require('../../controllers/wallet/walletController');
const { protect } = require('../../middleware/auth');

/**
 * Wallet Routes (Read-Only)
 * 
 * ⚠️ IMPORTANT: These endpoints are READ-ONLY.
 * Tokens are EARN-ONLY. Redemption is disabled.
 */

// Get wallet balance
router.get('/', protect, getWallet);

// Get transaction history (paginated)
router.get('/transactions', protect, getTransactions);

module.exports = router;


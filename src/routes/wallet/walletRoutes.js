const express = require('express');
const router = express.Router();
const { getWallet, getTransactions } = require('../../controllers/wallet/walletController');
const { flexibleAuth } = require('../../middleware/flexibleAuth.middleware');
const { requireUser } = require('../../middleware/roleGuards');

/**
 * Wallet Routes (Read-Only)
 * 
 * ⚠️ IMPORTANT: These endpoints are READ-ONLY.
 * Tokens are EARN-ONLY. Redemption is disabled.
 */

// Get wallet balance (USER only)
router.get('/', flexibleAuth, requireUser, getWallet);

// Get transaction history (paginated, USER only)
router.get('/transactions', flexibleAuth, requireUser, getTransactions);

module.exports = router;


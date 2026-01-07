const mongoose = require('mongoose');

/**
 * Token Wallet Model
 * 
 * ⚠️ IMPORTANT: Tokens are EARN-ONLY.
 * Redemption is intentionally disabled until payment integration.
 * 
 * Tokens can only be:
 * - Earned through course completion (via TokenTransaction)
 * - Viewed/queried (read-only operations)
 * 
 * Redemption operations are blocked by feature flag.
 */
const tokenWalletSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    status: {
        type: String,
        enum: ['ACTIVE', 'LOCKED'],
        default: 'ACTIVE'
    }
}, {
    timestamps: true
});

// Indexes for performance
tokenWalletSchema.index({ userId: 1 });
tokenWalletSchema.index({ balance: -1 });

module.exports = mongoose.model('TokenWallet', tokenWalletSchema);


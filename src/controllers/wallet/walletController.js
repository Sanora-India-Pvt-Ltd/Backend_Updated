const TokenWallet = require('../../models/wallet/TokenWallet');
const TokenTransaction = require('../../models/wallet/TokenTransaction');

/**
 * Get wallet balance (read-only)
 * GET /api/wallet
 */
const getWallet = async (req, res) => {
    try {
        const userId = req.userId; // From protect middleware

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Get or create wallet (create with 0 balance if doesn't exist)
        let wallet = await TokenWallet.findOne({ userId }).lean();

        if (!wallet) {
            // Wallet doesn't exist yet - return default values
            wallet = {
                userId,
                balance: 0,
                status: 'ACTIVE',
                createdAt: new Date(),
                updatedAt: new Date()
            };
        }

        // Return wallet info with safety message
        res.status(200).json({
            success: true,
            message: 'Wallet retrieved successfully',
            data: {
                wallet: {
                    balance: wallet.balance || 0,
                    status: wallet.status || 'ACTIVE'
                },
                message: 'Tokens are not redeemable yet'
            }
        });
    } catch (error) {
        console.error('Get wallet error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving wallet',
            error: error.message
        });
    }
};

/**
 * Get transaction history (read-only, paginated)
 * GET /api/wallet/transactions
 */
const getTransactions = async (req, res) => {
    try {
        const userId = req.userId; // From protect middleware

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Validate pagination
        if (page < 1 || limit < 1 || limit > 100) {
            return res.status(400).json({
                success: false,
                message: 'Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100'
            });
        }

        // Get transactions (using indexed userId field)
        const [transactions, totalCount] = await Promise.all([
            TokenTransaction.find({ userId })
                .select('source sourceId amount status createdAt')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            TokenTransaction.countDocuments({ userId })
        ]);

        // Format transactions for frontend (hide internal IDs)
        const formattedTransactions = transactions.map(tx => ({
            source: tx.source,
            amount: tx.amount,
            status: tx.status,
            createdAt: tx.createdAt
        }));

        // Calculate pagination metadata
        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        res.status(200).json({
            success: true,
            message: 'Transactions retrieved successfully',
            data: {
                transactions: formattedTransactions,
                pagination: {
                    page,
                    limit,
                    totalCount,
                    totalPages,
                    hasNextPage,
                    hasPrevPage
                }
            }
        });
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving transactions',
            error: error.message
        });
    }
};

module.exports = {
    getWallet,
    getTransactions
};


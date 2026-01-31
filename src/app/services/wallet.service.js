/**
 * Wallet (token balance & transactions) business logic.
 * Used by walletController.
 */

const TokenWallet = require('../../models/wallet/TokenWallet');
const TokenTransaction = require('../../models/wallet/TokenTransaction');

async function getWallet(userId) {
  if (!userId) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }

  let wallet = await TokenWallet.findOne({ userId }).lean();
  if (!wallet) {
    wallet = {
      userId,
      balance: 0,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Wallet retrieved successfully',
      data: {
        wallet: {
          balance: wallet.balance || 0,
          status: wallet.status || 'ACTIVE'
        },
        message: 'Tokens are not redeemable yet'
      }
    }
  };
}

async function getTransactions(userId, query) {
  if (!userId) {
    return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
  }

  const page = parseInt(query?.page) || 1;
  const limit = parseInt(query?.limit) || 20;
  const skip = (page - 1) * limit;

  if (page < 1 || limit < 1 || limit > 100) {
    return {
      statusCode: 400,
      json: {
        success: false,
        message: 'Invalid pagination parameters. Page must be >= 1, limit must be between 1 and 100'
      }
    };
  }

  const [transactions, totalCount] = await Promise.all([
    TokenTransaction.find({ userId })
      .select('source sourceId amount status createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    TokenTransaction.countDocuments({ userId })
  ]);

  const formattedTransactions = transactions.map((tx) => ({
    source: tx.source,
    amount: tx.amount,
    status: tx.status,
    createdAt: tx.createdAt
  }));

  const totalPages = Math.ceil(totalCount / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    statusCode: 200,
    json: {
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
    }
  };
}

module.exports = {
  getWallet,
  getTransactions
};

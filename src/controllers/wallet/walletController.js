const walletService = require('../../app/services/wallet.service');

const getWallet = async (req, res) => {
  try {
    const result = await walletService.getWallet(req.userId);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving wallet',
      error: err.message
    });
  }
};

const getTransactions = async (req, res) => {
  try {
    const result = await walletService.getTransactions(req.userId, req.query);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving transactions',
      error: err.message
    });
  }
};

module.exports = {
  getWallet,
  getTransactions
};

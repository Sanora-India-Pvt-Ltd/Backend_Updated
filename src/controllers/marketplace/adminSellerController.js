const sellerService = require('../../app/services/marketplace/seller.service');

const approveSeller = async (req, res) => {
    const result = await sellerService.approveSeller(req.params.userId);
    return res.status(result.statusCode).json(result.json);
};

const rejectSeller = async (req, res) => {
    const result = await sellerService.rejectSeller(req.params.userId, req.body);
    return res.status(result.statusCode).json(result.json);
};

module.exports = {
    approveSeller,
    rejectSeller
};

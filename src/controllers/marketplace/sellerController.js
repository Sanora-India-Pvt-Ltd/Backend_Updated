const sellerService = require('../../app/services/marketplace/seller.service');

const applySeller = async (req, res) => {
    const result = await sellerService.applySeller(req.user._id, req.user, req.body);
    return res.status(result.statusCode).json(result.json);
};

const getSellerStatus = async (req, res) => {
    const result = await sellerService.getSellerStatus(req.user);
    return res.status(result.statusCode).json(result.json);
};

module.exports = {
    applySeller,
    getSellerStatus
};

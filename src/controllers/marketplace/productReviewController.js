const reviewProductService = require('../../app/services/marketplace/reviewProduct.service');

const upsertMyProductReview = async (req, res) => {
    const result = await reviewProductService.upsertMyProductReview(req.params.productId, req.user?._id, req.body);
    return res.status(result.statusCode).json(result.json);
};

const getProductReviews = async (req, res) => {
    const result = await reviewProductService.getProductReviews(req.params.productId, req.query);
    return res.status(result.statusCode).json(result.json);
};

const deleteMyProductReview = async (req, res) => {
    const result = await reviewProductService.deleteMyProductReview(req.params.productId, req.user?._id);
    return res.status(result.statusCode).json(result.json);
};

module.exports = {
    upsertMyProductReview,
    getProductReviews,
    deleteMyProductReview
};

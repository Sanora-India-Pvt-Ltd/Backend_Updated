const wishlistService = require('../../app/services/marketplace/wishlist.service');

const addToWishlist = async (req, res) => {
    const result = await wishlistService.addToWishlist(req.user._id, req.body);
    return res.status(result.statusCode).json(result.json);
};

const removeFromWishlist = async (req, res) => {
    const result = await wishlistService.removeFromWishlist(req.user._id, req.params.productId);
    return res.status(result.statusCode).json(result.json);
};

const getWishlist = async (req, res) => {
    const result = await wishlistService.getWishlist(req.user._id);
    return res.status(result.statusCode).json(result.json);
};

const checkWishlistStatus = async (req, res) => {
    const result = await wishlistService.checkWishlistStatus(req.user._id, req.params.productId);
    return res.status(result.statusCode).json(result.json);
};

module.exports = {
    addToWishlist,
    removeFromWishlist,
    getWishlist,
    checkWishlistStatus
};

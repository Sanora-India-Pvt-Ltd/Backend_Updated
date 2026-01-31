const cartService = require('../../app/services/marketplace/cart.service');

const addToCart = async (req, res) => {
    const result = await cartService.addToCart(req.user._id, req.body);
    return res.status(result.statusCode).json(result.json);
};

const updateCartItem = async (req, res) => {
    const result = await cartService.updateCartItem(req.user._id, req.body);
    return res.status(result.statusCode).json(result.json);
};

const removeCartItem = async (req, res) => {
    const result = await cartService.removeCartItem(req.user._id, req.params.productId);
    return res.status(result.statusCode).json(result.json);
};

const getCart = async (req, res) => {
    const result = await cartService.getCart(req.user._id);
    return res.status(result.statusCode).json(result.json);
};

module.exports = {
    addToCart,
    updateCartItem,
    removeCartItem,
    getCart
};

const productService = require('../../app/services/marketplace/product.service');

const createProduct = async (req, res) => {
    const result = await productService.createProduct(req.body, req.user, req.universityId);
    return res.status(result.statusCode).json(result.json);
};

const listProducts = async (req, res) => {
    const result = await productService.listProducts(req.query);
    return res.status(result.statusCode).json(result.json);
};

const getProductById = async (req, res) => {
    const result = await productService.getProductById(req.params.id);
    return res.status(result.statusCode).json(result.json);
};

module.exports = {
    createProduct,
    listProducts,
    getProductById
};

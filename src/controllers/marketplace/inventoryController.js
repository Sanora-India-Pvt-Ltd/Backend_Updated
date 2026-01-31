const inventoryService = require('../../app/services/marketplace/inventory.service');

const createOrUpdateInventory = async (req, res) => {
    const result = await inventoryService.createOrUpdateInventory(req.user._id, req.body);
    return res.status(result.statusCode).json(result.json);
};

const getInventoryByProduct = async (req, res) => {
    const result = await inventoryService.getInventoryByProduct(req.params.productId);
    return res.status(result.statusCode).json(result.json);
};

module.exports = {
    createOrUpdateInventory,
    getInventoryByProduct
};

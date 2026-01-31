/**
 * Inventory domain: create/update inventory, get by product. Returns { statusCode, json }.
 */

const Inventory = require('../../../models/marketplace/Inventory');
const Product = require('../../../models/marketplace/Product');
const mongoose = require('mongoose');

async function createOrUpdateInventory(sellerId, body) {
    try {
        const { productId, available } = body;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return { statusCode: 400, json: { success: false, message: 'Valid product ID is required' } };
        }
        if (available === undefined || available === null) {
            return { statusCode: 400, json: { success: false, message: 'Available quantity is required' } };
        }
        if (typeof available !== 'number' || available < 0) {
            return { statusCode: 400, json: { success: false, message: 'Available quantity must be a non-negative number' } };
        }

        const product = await Product.findById(productId);
        if (!product) {
            return { statusCode: 404, json: { success: false, message: 'Product not found' } };
        }
        if (product.sellerId.toString() !== sellerId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You can only manage inventory for your own products' } };
        }

        const inventory = await Inventory.findOneAndUpdate(
            { productId, sellerId },
            { available },
            { new: true, upsert: true }
        );

        return { statusCode: 200, json: { success: true, inventory } };
    } catch (error) {
        console.error('Create or update inventory error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to update inventory', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function getInventoryByProduct(productId) {
    try {
        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid product ID' } };
        }

        const inventory = await Inventory.findOne({ productId });

        if (!inventory) {
            return { statusCode: 200, json: { success: true, inventory: { available: 0, reserved: 0 } } };
        }

        return {
            statusCode: 200,
            json: {
                success: true,
                inventory: { available: inventory.available, reserved: inventory.reserved }
            }
        };
    } catch (error) {
        console.error('Get inventory by product error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve inventory', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

module.exports = {
    createOrUpdateInventory,
    getInventoryByProduct
};

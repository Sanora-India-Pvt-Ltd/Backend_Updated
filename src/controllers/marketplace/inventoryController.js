const Inventory = require('../../models/marketplace/Inventory');
const Product = require('../../models/marketplace/Product');
const mongoose = require('mongoose');

const createOrUpdateInventory = async (req, res) => {
    try {
        const sellerId = req.user._id;
        const { productId, available } = req.body;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: 'Valid product ID is required'
            });
        }

        if (available === undefined || available === null) {
            return res.status(400).json({
                success: false,
                message: 'Available quantity is required'
            });
        }

        if (typeof available !== 'number' || available < 0) {
            return res.status(400).json({
                success: false,
                message: 'Available quantity must be a non-negative number'
            });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        if (product.sellerId.toString() !== sellerId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You can only manage inventory for your own products'
            });
        }

        const inventory = await Inventory.findOneAndUpdate(
            { productId, sellerId },
            { available },
            { new: true, upsert: true }
        );

        return res.status(200).json({
            success: true,
            inventory
        });
    } catch (error) {
        console.error('Create or update inventory error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update inventory',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getInventoryByProduct = async (req, res) => {
    try {
        const { productId } = req.params;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID'
            });
        }

        const inventory = await Inventory.findOne({ productId });

        if (!inventory) {
            return res.status(200).json({
                success: true,
                inventory: {
                    available: 0,
                    reserved: 0
                }
            });
        }

        return res.status(200).json({
            success: true,
            inventory: {
                available: inventory.available,
                reserved: inventory.reserved
            }
        });
    } catch (error) {
        console.error('Get inventory by product error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve inventory',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    createOrUpdateInventory,
    getInventoryByProduct
};


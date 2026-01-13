const Cart = require('../../models/marketplace/Cart');
const Product = require('../../models/marketplace/Product');
const Inventory = require('../../models/marketplace/Inventory');
const mongoose = require('mongoose');

const addToCart = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId, quantity } = req.body;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: 'Valid product ID is required'
            });
        }

        if (!quantity || typeof quantity !== 'number' || quantity < 1) {
            return res.status(400).json({
                success: false,
                message: 'Quantity must be a positive number'
            });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        if (!product.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Product is not available'
            });
        }

        // Inventory availability check commented out - simplified flow
        // const inventory = await Inventory.findOne({ productId });
        // const available = inventory ? inventory.available : 0;

        // if (available < quantity) {
        //     return res.status(400).json({
        //         success: false,
        //         message: `Insufficient stock. Available: ${available}, Requested: ${quantity}`
        //     });
        // }

        let cart = await Cart.findOne({ userId });
        
        if (!cart) {
            cart = await Cart.create({
                userId,
                items: []
            });
        }

        const existingItemIndex = cart.items.findIndex(
            item => item.productId.toString() === productId.toString()
        );

        if (existingItemIndex !== -1) {
            const newQuantity = cart.items[existingItemIndex].quantity + quantity;
            // Inventory availability check commented out - simplified flow
            // if (available < newQuantity) {
            //     return res.status(400).json({
            //         success: false,
            //         message: `Insufficient stock. Available: ${available}, Total requested: ${newQuantity}`
            //     });
            // }
            cart.items[existingItemIndex].quantity = newQuantity;
        } else {
            cart.items.push({
                productId,
                sellerId: product.sellerId,
                quantity,
                priceSnapshot: product.price,
                addedAt: new Date()
            });
        }

        await cart.save();

        await cart.populate('items.productId', 'title images price');

        return res.status(200).json({
            success: true,
            cart
        });
    } catch (error) {
        console.error('Add to cart error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to add item to cart',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const updateCartItem = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId, quantity } = req.body;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: 'Valid product ID is required'
            });
        }

        if (!quantity || typeof quantity !== 'number' || quantity < 1) {
            return res.status(400).json({
                success: false,
                message: 'Quantity must be a positive number'
            });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        const itemIndex = cart.items.findIndex(
            item => item.productId.toString() === productId.toString()
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in cart'
            });
        }

        const inventory = await Inventory.findOne({ productId });
        const available = inventory ? inventory.available : 0;

        if (available < quantity) {
            return res.status(400).json({
                success: false,
                message: `Insufficient stock. Available: ${available}, Requested: ${quantity}`
            });
        }

        cart.items[itemIndex].quantity = quantity;
        await cart.save();

        await cart.populate('items.productId', 'title images price');

        return res.status(200).json({
            success: true,
            cart
        });
    } catch (error) {
        console.error('Update cart item error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update cart item',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const removeCartItem = async (req, res) => {
    try {
        const userId = req.user._id;
        const { productId } = req.params;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return res.status(400).json({
                success: false,
                message: 'Valid product ID is required'
            });
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        const itemIndex = cart.items.findIndex(
            item => item.productId.toString() === productId.toString()
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in cart'
            });
        }

        cart.items.splice(itemIndex, 1);
        await cart.save();

        await cart.populate('items.productId', 'title images price');

        return res.status(200).json({
            success: true,
            cart
        });
    } catch (error) {
        console.error('Remove cart item error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to remove cart item',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getCart = async (req, res) => {
    try {
        const userId = req.user._id;

        let cart = await Cart.findOne({ userId }).populate('items.productId', 'title images price');

        if (!cart) {
            return res.status(200).json({
                success: true,
                cart: {
                    userId,
                    items: [],
                    createdAt: new Date(),
                    updatedAt: new Date()
                }
            });
        }

        return res.status(200).json({
            success: true,
            cart
        });
    } catch (error) {
        console.error('Get cart error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve cart',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    addToCart,
    updateCartItem,
    removeCartItem,
    getCart
};


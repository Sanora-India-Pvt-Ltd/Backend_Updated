/**
 * Cart domain: add, update, remove items, get cart. Returns { statusCode, json }.
 */

const Cart = require('../../../models/marketplace/Cart');
const Product = require('../../../models/marketplace/Product');
const Inventory = require('../../../models/marketplace/Inventory');
const mongoose = require('mongoose');

async function addToCart(userId, body) {
    try {
        const { productId, quantity } = body;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return { statusCode: 400, json: { success: false, message: 'Valid product ID is required' } };
        }
        if (!quantity || typeof quantity !== 'number' || quantity < 1) {
            return { statusCode: 400, json: { success: false, message: 'Quantity must be a positive number' } };
        }

        const product = await Product.findById(productId);
        if (!product) {
            return { statusCode: 404, json: { success: false, message: 'Product not found' } };
        }
        if (!product.isActive) {
            return { statusCode: 400, json: { success: false, message: 'Product is not available' } };
        }

        let cart = await Cart.findOne({ userId });
        if (!cart) {
            cart = await Cart.create({ userId, items: [] });
        }

        const existingItemIndex = cart.items.findIndex(item => item.productId.toString() === productId.toString());

        if (existingItemIndex !== -1) {
            cart.items[existingItemIndex].quantity += quantity;
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

        return { statusCode: 200, json: { success: true, cart } };
    } catch (error) {
        console.error('Add to cart error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to add item to cart', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function updateCartItem(userId, body) {
    try {
        const { productId, quantity } = body;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return { statusCode: 400, json: { success: false, message: 'Valid product ID is required' } };
        }
        if (!quantity || typeof quantity !== 'number' || quantity < 1) {
            return { statusCode: 400, json: { success: false, message: 'Quantity must be a positive number' } };
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return { statusCode: 404, json: { success: false, message: 'Cart not found' } };
        }

        const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId.toString());
        if (itemIndex === -1) {
            return { statusCode: 404, json: { success: false, message: 'Item not found in cart' } };
        }

        const inventory = await Inventory.findOne({ productId });
        const available = inventory ? inventory.available : 0;
        if (available < quantity) {
            return { statusCode: 400, json: { success: false, message: `Insufficient stock. Available: ${available}, Requested: ${quantity}` } };
        }

        cart.items[itemIndex].quantity = quantity;
        await cart.save();
        await cart.populate('items.productId', 'title images price');

        return { statusCode: 200, json: { success: true, cart } };
    } catch (error) {
        console.error('Update cart item error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to update cart item', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function removeCartItem(userId, productId) {
    try {
        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return { statusCode: 400, json: { success: false, message: 'Valid product ID is required' } };
        }

        const cart = await Cart.findOne({ userId });
        if (!cart) {
            return { statusCode: 404, json: { success: false, message: 'Cart not found' } };
        }

        const itemIndex = cart.items.findIndex(item => item.productId.toString() === productId.toString());
        if (itemIndex === -1) {
            return { statusCode: 404, json: { success: false, message: 'Item not found in cart' } };
        }

        cart.items.splice(itemIndex, 1);
        await cart.save();
        await cart.populate('items.productId', 'title images price');

        return { statusCode: 200, json: { success: true, cart } };
    } catch (error) {
        console.error('Remove cart item error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to remove cart item', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function getCart(userId) {
    try {
        let cart = await Cart.findOne({ userId }).populate('items.productId', 'title images price');

        if (!cart) {
            return {
                statusCode: 200,
                json: {
                    success: true,
                    cart: { userId, items: [], createdAt: new Date(), updatedAt: new Date() }
                }
            };
        }

        return { statusCode: 200, json: { success: true, cart } };
    } catch (error) {
        console.error('Get cart error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve cart', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

module.exports = {
    addToCart,
    updateCartItem,
    removeCartItem,
    getCart
};

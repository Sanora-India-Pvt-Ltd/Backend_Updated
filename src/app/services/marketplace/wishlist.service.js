/**
 * Wishlist domain: add, remove, get wishlist, check status. Returns { statusCode, json }.
 */

const Wishlist = require('../../../models/marketplace/Wishlist');
const Product = require('../../../models/marketplace/Product');
const mongoose = require('mongoose');

async function addToWishlist(userId, body) {
    try {
        const { productId } = body;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return { statusCode: 400, json: { success: false, message: 'Valid product ID is required' } };
        }

        const product = await Product.findById(productId);
        if (!product) {
            return { statusCode: 404, json: { success: false, message: 'Product not found' } };
        }

        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = await Wishlist.create({ userId, items: [] });
        }

        const existingItemIndex = wishlist.items.findIndex(item => item.productId.toString() === productId.toString());
        if (existingItemIndex !== -1) {
            return { statusCode: 400, json: { success: false, message: 'Product already exists in wishlist' } };
        }

        wishlist.items.push({ productId, addedAt: new Date() });
        await wishlist.save();

        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Product added to wishlist successfully',
                data: { wishlist: { _id: wishlist._id, itemCount: wishlist.items.length } }
            }
        };
    } catch (error) {
        console.error('Add to wishlist error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error adding product to wishlist', error: error.message } };
    }
}

async function removeFromWishlist(userId, productId) {
    try {
        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return { statusCode: 400, json: { success: false, message: 'Valid product ID is required' } };
        }

        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return { statusCode: 404, json: { success: false, message: 'Wishlist not found' } };
        }

        const itemIndex = wishlist.items.findIndex(item => item.productId.toString() === productId.toString());
        if (itemIndex === -1) {
            return { statusCode: 404, json: { success: false, message: 'Product not found in wishlist' } };
        }

        wishlist.items.splice(itemIndex, 1);
        await wishlist.save();

        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Product removed from wishlist successfully',
                data: { wishlist: { _id: wishlist._id, itemCount: wishlist.items.length } }
            }
        };
    } catch (error) {
        console.error('Remove from wishlist error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error removing product from wishlist', error: error.message } };
    }
}

async function getWishlist(userId) {
    try {
        const wishlist = await Wishlist.findOne({ userId })
            .populate({
                path: 'items.productId',
                select: 'title description price images isActive sellerId',
                populate: { path: 'sellerId', select: 'profile.name.full profile.email' }
            });

        if (!wishlist) {
            return {
                statusCode: 200,
                json: {
                    success: true,
                    message: 'Wishlist is empty',
                    data: { wishlist: { items: [], itemCount: 0 } }
                }
            };
        }

        const validItems = wishlist.items.filter(item => item.productId && item.productId.isActive);
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Wishlist retrieved successfully',
                data: {
                    wishlist: {
                        _id: wishlist._id,
                        items: validItems.map(item => ({
                            productId: item.productId._id,
                            product: item.productId,
                            addedAt: item.addedAt
                        })),
                        itemCount: validItems.length
                    }
                }
            }
        };
    } catch (error) {
        console.error('Get wishlist error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error retrieving wishlist', error: error.message } };
    }
}

async function checkWishlistStatus(userId, productId) {
    try {
        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return { statusCode: 400, json: { success: false, message: 'Valid product ID is required' } };
        }

        const wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            return { statusCode: 200, json: { success: true, data: { isInWishlist: false } } };
        }

        const isInWishlist = wishlist.items.some(item => item.productId.toString() === productId.toString());
        return { statusCode: 200, json: { success: true, data: { isInWishlist } } };
    } catch (error) {
        console.error('Check wishlist status error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error checking wishlist status', error: error.message } };
    }
}

module.exports = {
    addToWishlist,
    removeFromWishlist,
    getWishlist,
    checkWishlistStatus
};

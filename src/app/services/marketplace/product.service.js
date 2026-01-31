/**
 * Product domain: create, list, get by ID. Returns { statusCode, json }.
 */

const Product = require('../../../models/marketplace/Product');
const mongoose = require('mongoose');

async function createProduct(body, user, universityId) {
    try {
        let createdById, createdByType, sellerId;
        if (user && user._id) {
            createdById = user._id;
            createdByType = 'USER';
            sellerId = user._id;
        } else if (universityId) {
            createdById = universityId;
            createdByType = 'UNIVERSITY';
            sellerId = universityId;
        } else {
            return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
        }

        const { title, description, price, images } = body;

        if (!title || !title.trim()) {
            return { statusCode: 400, json: { success: false, message: 'Product title is required' } };
        }
        if (title.trim().length > 200) {
            return { statusCode: 400, json: { success: false, message: 'Product title must be 200 characters or less' } };
        }
        if (price === undefined || price === null) {
            return { statusCode: 400, json: { success: false, message: 'Product price is required' } };
        }
        if (typeof price !== 'number' || price < 0) {
            return { statusCode: 400, json: { success: false, message: 'Product price must be a non-negative number' } };
        }
        if (description && description.length > 5000) {
            return { statusCode: 400, json: { success: false, message: 'Product description must be 5000 characters or less' } };
        }

        const product = await Product.create({
            sellerId,
            title: title.trim(),
            description: description ? description.trim() : undefined,
            price,
            images: images && Array.isArray(images) ? images : [],
            createdById,
            createdByType
        });

        return { statusCode: 201, json: { success: true, product } };
    } catch (error) {
        console.error('Create product error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to create product', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function listProducts(query) {
    try {
        const page = parseInt(query.page) || 1;
        const limit = Math.min(parseInt(query.limit) || 10, 50);
        const skip = (page - 1) * limit;

        const products = await Product.find({ isActive: true })
            .populate('sellerId', 'profile.name.full profile.profileImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return { statusCode: 200, json: { success: true, data: products, pagination: { page, limit } } };
    } catch (error) {
        console.error('List products error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve products', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function getProductById(id) {
    try {
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid product ID' } };
        }

        const product = await Product.findById(id).populate('sellerId', 'profile.name.full profile.profileImage');

        if (!product || !product.isActive) {
            return { statusCode: 404, json: { success: false, message: 'Product not found' } };
        }

        return { statusCode: 200, json: { success: true, product } };
    } catch (error) {
        console.error('Get product by ID error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve product', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

module.exports = {
    createProduct,
    listProducts,
    getProductById
};

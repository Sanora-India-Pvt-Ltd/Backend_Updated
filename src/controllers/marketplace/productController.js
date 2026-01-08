const Product = require('../../models/marketplace/Product');
const mongoose = require('mongoose');

const createProduct = async (req, res) => {
    try {
        // STEP 2: Detect creator type
        let createdById, createdByType, sellerId;

        if (req.user && req.user._id) {
            // Creator is USER
            createdById = req.user._id;
            createdByType = 'USER';
            sellerId = req.user._id; // Keep sellerId for backward compatibility
        } else if (req.universityId) {
            // Creator is UNIVERSITY
            createdById = req.universityId;
            createdByType = 'UNIVERSITY';
            sellerId = req.universityId; // Use universityId as sellerId
        } else {
            // No valid authentication
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const { title, description, price, images } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Product title is required'
            });
        }

        if (title.trim().length > 200) {
            return res.status(400).json({
                success: false,
                message: 'Product title must be 200 characters or less'
            });
        }

        if (price === undefined || price === null) {
            return res.status(400).json({
                success: false,
                message: 'Product price is required'
            });
        }

        if (typeof price !== 'number' || price < 0) {
            return res.status(400).json({
                success: false,
                message: 'Product price must be a non-negative number'
            });
        }

        if (description && description.length > 5000) {
            return res.status(400).json({
                success: false,
                message: 'Product description must be 5000 characters or less'
            });
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

        return res.status(201).json({
            success: true,
            product
        });
    } catch (error) {
        console.error('Create product error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create product',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const listProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const skip = (page - 1) * limit;

        const products = await Product.find({ isActive: true })
            .populate('sellerId', 'profile.name.full profile.profileImage')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        return res.status(200).json({
            success: true,
            data: products,
            pagination: {
                page,
                limit
            }
        });
    } catch (error) {
        console.error('List products error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve products',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getProductById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID'
            });
        }

        const product = await Product.findById(id)
            .populate('sellerId', 'profile.name.full profile.profileImage');

        if (!product || !product.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        return res.status(200).json({
            success: true,
            product
        });
    } catch (error) {
        console.error('Get product by ID error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve product',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    createProduct,
    listProducts,
    getProductById
};


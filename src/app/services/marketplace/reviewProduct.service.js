/**
 * Product review domain: upsert review, list reviews, delete review, recalc rating. Returns { statusCode, json }.
 */

const mongoose = require('mongoose');
const Product = require('../../../models/marketplace/Product');
const ProductReview = require('../../../models/marketplace/ProductReview');

async function recalcProductRating(productId) {
    const stats = await ProductReview.aggregate([
        { $match: { productId: new mongoose.Types.ObjectId(productId) } },
        {
            $group: {
                _id: '$productId',
                avgRating: { $avg: '$rating' },
                ratingCount: { $sum: 1 }
            }
        }
    ]);
    const agg = stats[0];
    const avgRating = agg?.avgRating ? Math.round(agg.avgRating * 10) / 10 : 0;
    const ratingCount = agg?.ratingCount || 0;
    await Product.findByIdAndUpdate(productId, { $set: { avgRating, ratingCount } }, { new: false });
}

async function upsertMyProductReview(productId, userId, body) {
    try {
        const { rating, reviewText, images } = body;

        if (!userId) {
            return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
        }
        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid product ID' } };
        }

        const product = await Product.findById(productId).select('_id isActive');
        if (!product || !product.isActive) {
            return { statusCode: 404, json: { success: false, message: 'Product not found' } };
        }

        const ratingNum = Number(rating);
        if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
            return { statusCode: 400, json: { success: false, message: 'Rating must be a number between 1 and 5' } };
        }

        const reviewTextSafe = typeof reviewText === 'string' ? reviewText.trim() : '';
        if (reviewTextSafe.length > 5000) {
            return { statusCode: 400, json: { success: false, message: 'Review must be 5000 characters or less' } };
        }

        let imageUrls = [];
        if (Array.isArray(images) && images.length > 0) {
            imageUrls = images
                .filter(url => typeof url === 'string' && url.trim().length > 0)
                .map(url => url.trim())
                .filter(url => {
                    try {
                        const urlObj = new URL(url);
                        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
                    } catch {
                        return false;
                    }
                })
                .slice(0, 10);
        }

        const review = await ProductReview.findOneAndUpdate(
            { productId, userId },
            { $set: { rating: ratingNum, reviewText: reviewTextSafe, images: imageUrls } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        ).populate('userId', 'profile.name.full profile.profileImage');

        await recalcProductRating(productId);

        return { statusCode: 201, json: { success: true, data: review } };
    } catch (error) {
        if (error?.code === 11000) {
            return { statusCode: 409, json: { success: false, message: 'You already reviewed this product' } };
        }
        console.error('Upsert product review error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to submit review' } };
    }
}

async function getProductReviews(productId, query) {
    try {
        const page = parseInt(query.page) || 1;
        const limit = Math.min(parseInt(query.limit) || 10, 50);
        const skip = (page - 1) * limit;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid product ID' } };
        }

        const product = await Product.findById(productId).select('_id isActive avgRating ratingCount');
        if (!product || !product.isActive) {
            return { statusCode: 404, json: { success: false, message: 'Product not found' } };
        }

        const [reviews, total] = await Promise.all([
            ProductReview.find({ productId })
                .populate('userId', 'profile.name.full profile.profileImage')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            ProductReview.countDocuments({ productId })
        ]);

        return {
            statusCode: 200,
            json: {
                success: true,
                product: { _id: product._id, avgRating: product.avgRating || 0, ratingCount: product.ratingCount || 0 },
                data: reviews,
                pagination: { page, limit, total }
            }
        };
    } catch (error) {
        console.error('Get product reviews error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to fetch reviews' } };
    }
}

async function deleteMyProductReview(productId, userId) {
    try {
        if (!userId) {
            return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
        }
        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid product ID' } };
        }

        const deleted = await ProductReview.findOneAndDelete({ productId, userId });
        if (!deleted) {
            return { statusCode: 404, json: { success: false, message: 'Review not found' } };
        }

        await recalcProductRating(productId);
        return { statusCode: 200, json: { success: true, message: 'Review deleted' } };
    } catch (error) {
        console.error('Delete product review error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to delete review' } };
    }
}

module.exports = {
    upsertMyProductReview,
    getProductReviews,
    deleteMyProductReview,
    recalcProductRating
};

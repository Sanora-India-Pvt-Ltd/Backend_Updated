const mongoose = require('mongoose');
const Product = require('../../models/marketplace/Product');
const ProductReview = require('../../models/marketplace/ProductReview');

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
  const avgRating = agg?.avgRating ? Math.round(agg.avgRating * 10) / 10 : 0; // 1 decimal
  const ratingCount = agg?.ratingCount || 0;

  await Product.findByIdAndUpdate(
    productId,
    { $set: { avgRating, ratingCount } },
    { new: false }
  );
}

const upsertMyProductReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user?._id;
    const { rating, reviewText, images } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    const product = await Product.findById(productId).select('_id isActive');
    if (!product || !product.isActive) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const ratingNum = Number(rating);
    if (!Number.isFinite(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be a number between 1 and 5' });
    }

    const reviewTextSafe = typeof reviewText === 'string' ? reviewText.trim() : '';
    if (reviewTextSafe.length > 5000) {
      return res.status(400).json({ success: false, message: 'Review must be 5000 characters or less' });
    }

    const imageIds =
      Array.isArray(images)
        ? images.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id))
        : [];

    const review = await ProductReview.findOneAndUpdate(
      { productId, userId },
      {
        $set: {
          rating: ratingNum,
          reviewText: reviewTextSafe,
          images: imageIds
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )
      .populate('userId', 'profile.name.full profile.profileImage')
      .populate('images', 'url format resource_type');

    await recalcProductRating(productId);

    return res.status(201).json({
      success: true,
      data: review
    });
  } catch (error) {
    // Handle unique index collisions gracefully
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'You already reviewed this product'
      });
    }
    console.error('Upsert product review error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit review'
    });
  }
};

const getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const skip = (page - 1) * limit;

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    const product = await Product.findById(productId).select('_id isActive avgRating ratingCount');
    if (!product || !product.isActive) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const [reviews, total] = await Promise.all([
      ProductReview.find({ productId })
        .populate('userId', 'profile.name.full profile.profileImage')
        .populate('images', 'url format resource_type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ProductReview.countDocuments({ productId })
    ]);

    return res.status(200).json({
      success: true,
      product: {
        _id: product._id,
        avgRating: product.avgRating || 0,
        ratingCount: product.ratingCount || 0
      },
      data: reviews,
      pagination: { page, limit, total }
    });
  } catch (error) {
    console.error('Get product reviews error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch reviews' });
  }
};

const deleteMyProductReview = async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: 'Invalid product ID' });
    }

    const deleted = await ProductReview.findOneAndDelete({ productId, userId });
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Review not found' });
    }

    await recalcProductRating(productId);

    return res.status(200).json({ success: true, message: 'Review deleted' });
  } catch (error) {
    console.error('Delete product review error:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete review' });
  }
};

module.exports = {
  upsertMyProductReview,
  getProductReviews,
  deleteMyProductReview
};


const mongoose = require('mongoose');

const productReviewSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5
    },
    reviewText: {
      type: String,
      default: '',
      maxlength: 5000
    },
    images: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Media'
      }
    ]
  },
  { timestamps: true }
);

// One review per user per product (Amazon-like)
productReviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
productReviewSchema.index({ productId: 1, createdAt: -1 });

module.exports =
  mongoose.models.ProductReview ||
  mongoose.model('ProductReview', productReviewSchema);


const mongoose = require('mongoose');

const productPurchaseAttributionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    videoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Video',
        required: true
    },
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    }
}, {
    timestamps: true
});

// Compound unique index to prevent duplicate attributions (idempotency)
productPurchaseAttributionSchema.index(
    { orderId: 1, productId: 1 },
    { unique: true }
);

// Additional indexes for performance
productPurchaseAttributionSchema.index({ userId: 1, createdAt: -1 });
productPurchaseAttributionSchema.index({ productId: 1 });
productPurchaseAttributionSchema.index({ videoId: 1 });
productPurchaseAttributionSchema.index({ courseId: 1 });

module.exports = mongoose.model('ProductPurchaseAttribution', productPurchaseAttributionSchema);


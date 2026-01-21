const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    sellerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        required: false,
        maxlength: 5000
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    images: [{
        type: String
    }],
    avgRating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    ratingCount: {
        type: Number,
        default: 0,
        min: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdById: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    createdByType: {
        type: String,
        enum: ['USER', 'UNIVERSITY'],
        required: true
    }
}, {
    timestamps: true
});

productSchema.index({ sellerId: 1 });
productSchema.index({ isActive: 1 });
productSchema.index({ createdById: 1, createdByType: 1 });

module.exports = mongoose.model('Product', productSchema);


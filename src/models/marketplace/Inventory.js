const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },
    sellerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    available: {
        type: Number,
        required: true,
        min: 0
    },
    reserved: {
        type: Number,
        default: 0,
        min: 0
    }
}, {
    timestamps: true
});

inventorySchema.index({ productId: 1, sellerId: 1 }, { unique: true });

module.exports = mongoose.model('Inventory', inventorySchema);


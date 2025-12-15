const mongoose = require('mongoose');

const institutionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        index: true // Index for faster search
    },
    normalizedName: {
        type: String,
        required: true,
        unique: true, // Unique constraint on normalized name to prevent case-insensitive duplicates
        lowercase: true,
        trim: true,
        index: true // Index for case-insensitive search
    },
    type: {
        type: String,
        required: true,
        enum: ['school', 'college', 'university', 'others'],
        default: 'school'
    },
    city: {
        type: String,
        default: ''
    },
    country: {
        type: String,
        default: ''
    },
    logo: {
        type: String,
        default: ''
    },
    verified: {
        type: Boolean,
        default: false // for admin verification
    },
    isCustom: {
        type: Boolean,
        default: true // All user-created institutions are custom entries
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null // Can be null for system institutions in the future
    }
}, {
    timestamps: true
});

// Compound index for efficient search
institutionSchema.index({ normalizedName: 'text' });

module.exports = mongoose.model('Institution', institutionSchema);


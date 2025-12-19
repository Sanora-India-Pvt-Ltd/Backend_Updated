const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
        // Index removed - covered by compound index { userId: 1, createdAt: -1 }
    },
    caption: {
        type: String,
        default: '',
        maxlength: 2200 // Instagram-style caption limit
    },
    media: [{
        url: {
            type: String,
            required: true
        },
        publicId: {
            type: String,
            required: true
        },
        type: {
            type: String,
            required: true,
            enum: ['image', 'video']
        },
        format: {
            type: String,
            required: false
        }
    }],
    // Array of arrays for likes - each sub-array represents a reaction type:
    // 0: happy, 1: sad, 2: angry, 3: hug, 4: wow, 5: like
    likes: {
        type: [[{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }]],
        default: [[], [], [], [], [], []]  // Initialize with 6 empty arrays
    },
    comments: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        text: {
            type: String,
            required: true,
            maxlength: 1000
        },
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
}, {
    timestamps: true
});

// Indexes for better query performance
postSchema.index({ userId: 1, createdAt: -1 }); // For user posts queries
postSchema.index({ createdAt: -1 }); // For all posts feed queries

// Virtual for comment count
postSchema.virtual('commentCount').get(function() {
    return this.comments ? this.comments.length : 0;
});

// Ensure virtuals are included in JSON
postSchema.set('toJSON', { virtuals: true });
postSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Post', postSchema);


const mongoose = require('mongoose');

const likeSchema = new mongoose.Schema({
    content: {
        type: String,
        required: true,
        enum: ['post', 'reel']
    },
    contentId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        index: true
    },
    // Array of arrays where each sub-array contains user IDs
    // [ [happy], [sad], [angry], [hug], [wow], [like] ]
    likes: {
        type: [[{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }]],
        default: [[], [], [], [], [], []]
    }
}, {
    timestamps: true
});

// Create a compound index for faster lookups
likeSchema.index({ content: 1, contentId: 1 }, { unique: true });

module.exports = mongoose.model('Like', likeSchema);

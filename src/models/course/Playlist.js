const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true
    },
    details: {
        name: {
            type: String,
            required: true,
            trim: true
        },
        description: {
            type: String,
            default: ''
        },
        thumbnail: {
            type: String,
            default: null
        }
    },
    order: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes for performance
playlistSchema.index({ courseId: 1, order: 1 });
playlistSchema.index({ courseId: 1 });

module.exports = mongoose.model('Playlist', playlistSchema);


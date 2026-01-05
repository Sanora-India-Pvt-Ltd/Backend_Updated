const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    videoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Video',
        required: true
    },
    checkpointTime: {
        type: Number, // in seconds
        required: true,
        min: 0
    },
    question: {
        type: String,
        required: true,
        trim: true
    },
    options: {
        type: [String],
        required: true,
        validate: {
            validator: function(v) {
                return v.length >= 2;
            },
            message: 'At least 2 options are required'
        }
    },
    correctAnswer: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes for performance
questionSchema.index({ videoId: 1, checkpointTime: 1 });
questionSchema.index({ videoId: 1 });

module.exports = mongoose.model('Question', questionSchema);


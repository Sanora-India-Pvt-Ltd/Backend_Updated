const mongoose = require('mongoose');

const videoQuestionSchema = new mongoose.Schema({
    // Relations
    courseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Course',
        required: true,
        index: true
    },
    videoId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Video',
        required: true,
        index: true
    },

    // Question Content
    question: {
        type: String,
        required: true,
        trim: true
    },
    options: {
        A: {
            type: String,
            required: true
        },
        B: {
            type: String,
            required: true
        },
        C: {
            type: String,
            required: true
        },
        D: {
            type: String,
            required: true
        }
    },
    correctAnswer: {
        type: String,
        enum: ['A', 'B', 'C', 'D'],
        required: true
    },

    // Source & Metadata
    source: {
        type: String,
        enum: ['AI', 'MANUAL'],
        default: 'AI'
    },
    aiMeta: {
        chunk_num: {
            type: Number
        },
        timestamp: {
            type: String
        },
        timestamp_seconds: {
            type: Number
        },
        anchor_type: {
            type: String
        },
        batch_number: {
            type: Number
        },
        part_number: {
            type: Number
        }
    },

    // Status & Control
    status: {
        type: String,
        enum: ['DRAFT', 'ACTIVE'],
        default: 'DRAFT',
        index: true
    },
    editable: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('VideoQuestion', videoQuestionSchema);


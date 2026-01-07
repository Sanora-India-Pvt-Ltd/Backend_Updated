const mongoose = require('mongoose');

// Embedded answer schema
const answerSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    selectedOption: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },
    isCorrect: {
        type: Boolean,
        required: true
    },
    answeredAt: {
        type: Date,
        default: Date.now
    }
}, {
    _id: true // Each answer gets its own unique _id
});

const conferenceQuestionSchema = new mongoose.Schema({
    conferenceId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conference',
        required: true
    },
    order: {
        type: Number,
        required: true,
        min: 1
    },
    isLive: {
        type: Boolean,
        default: false
    },
    questionText: {
        type: String,
        required: true,
        trim: true
    },
    options: [{
        key: {
            type: String,
            required: true,
            uppercase: true,
            trim: true
        },
        text: {
            type: String,
            required: true,
            trim: true
        }
    }],
    correctOption: {
        type: String,
        required: true,
        uppercase: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['IDLE', 'ACTIVE', 'CLOSED'],
        default: 'IDLE'
    },
    createdByRole: {
        type: String,
        enum: ['HOST', 'SPEAKER'],
        required: true
    },
    createdById: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'createdByModel'
    },
    createdByModel: {
        type: String,
        enum: ['User', 'Speaker'],
        required: true
    },
    answers: [answerSchema],
    results: {
        participants: {
            type: Number,
            default: 0
        },
        totalVotes: {
            type: Number,
            default: 0
        },
        counts: {
            type: Map,
            of: Number,
            default: {}
        },
        percentages: {
            type: Map,
            of: Number,
            default: {}
        },
        results: {
            type: Map,
            of: {
                count: Number,
                percentage: Number
            },
            default: {}
        },
        closedAt: {
            type: Date,
            default: null
        }
    }
}, {
    timestamps: true
});

// Indexes for better query performance
conferenceQuestionSchema.index({ conferenceId: 1, order: 1 }); // Ordered fetch
// Note: conferenceId + isLive index is defined below with additional options
conferenceQuestionSchema.index({ conferenceId: 1, status: 1 });
conferenceQuestionSchema.index({ 'answers.userId': 1 }); // For participant queries
conferenceQuestionSchema.index({ createdByRole: 1, createdById: 1 }); // For ownership queries

// Compound index to ensure only one live question per conference (enforced at application level)
conferenceQuestionSchema.index({ conferenceId: 1, isLive: 1 }, { 
    partialFilterExpression: { isLive: true },
    unique: true,
    sparse: true
});

module.exports = mongoose.model('ConferenceQuestion', conferenceQuestionSchema);

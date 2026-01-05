const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema({
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
    eventType: {
        type: String,
        required: true,
        enum: ['play', 'pause', 'seek', 'complete', 'replay_segment']
    },
    timestamp: {
        type: Number, // video timestamp in seconds
        default: 0
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes for analytics queries
analyticsEventSchema.index({ courseId: 1, createdAt: -1 });
analyticsEventSchema.index({ videoId: 1, createdAt: -1 });
analyticsEventSchema.index({ userId: 1, createdAt: -1 });
analyticsEventSchema.index({ eventType: 1, createdAt: -1 });
// TTL index to auto-delete old events (optional - keep last 90 days)
analyticsEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);


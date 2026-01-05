const mongoose = require('mongoose');

const userActivitySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    activity: {
        lastActiveAt: {
            type: Date,
            default: Date.now
        },
        updatedAt: {
            type: Date,
            default: Date.now
        }
    }
}, {
    timestamps: true
});

// Index for userId (unique)
userActivitySchema.index({ userId: 1 }, { unique: true });
userActivitySchema.index({ 'activity.lastActiveAt': 1 });

module.exports = mongoose.model('UserActivity', userActivitySchema);


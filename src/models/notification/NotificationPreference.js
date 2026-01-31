const mongoose = require('mongoose');
const { NOTIFICATION_CATEGORIES } = require('../../core/constants/notificationCategories');

/**
 * Notification Preference Model
 * 
 * Stores user/university preferences for notification delivery.
 * Preferences are per-category and control:
 * - Whether notifications are muted
 * - Which delivery channels are enabled (inApp, push)
 * 
 * Design:
 * - Optional: If no preference exists, notifications are enabled by default
 * - Per-category: Each category can have different preferences
 * - Role-aware: Supports both USER and UNIVERSITY
 * - Defaults: All channels enabled, not muted
 */

const notificationPreferenceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false,
        index: true
    },
    universityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'University',
        required: false,
        index: true
    },
    role: {
        type: String,
        enum: ['USER', 'UNIVERSITY'],
        required: true,
        index: true
    },
    category: {
        type: String,
        enum: NOTIFICATION_CATEGORIES,
        required: true
    },
    channels: {
        inApp: {
            type: Boolean,
            default: true
        },
        push: {
            type: Boolean,
            default: true
        }
    },
    muted: {
        type: Boolean,
        default: false,
        index: true
    }
}, {
    timestamps: true,
    // updatedAt is automatically managed by timestamps
});

// Compound unique index: one preference per user/university per category
notificationPreferenceSchema.index({ userId: 1, category: 1 }, { 
    unique: true, 
    sparse: true,
    partialFilterExpression: { userId: { $exists: true } }
});

notificationPreferenceSchema.index({ universityId: 1, category: 1 }, { 
    unique: true, 
    sparse: true,
    partialFilterExpression: { universityId: { $exists: true } }
});

// Compound index for efficient queries
notificationPreferenceSchema.index({ role: 1, category: 1 });

// Validation: At least one of userId or universityId must be present
notificationPreferenceSchema.pre('save', async function() {
    if (!this.userId && !this.universityId) {
        throw new Error('Either userId or universityId must be provided');
    }
    
    // Ensure role matches the ID type
    if (this.userId && this.role !== 'USER') {
        throw new Error('userId requires role to be USER');
    }
    if (this.universityId && this.role !== 'UNIVERSITY') {
        throw new Error('universityId requires role to be UNIVERSITY');
    }
    
    // Ensure exactly one ID is set
    if (this.userId && this.universityId) {
        throw new Error('Cannot set both userId and universityId');
    }
    
    // Validate category
    if (!NOTIFICATION_CATEGORIES.includes(this.category)) {
        throw new Error(`Invalid category. Must be one of: ${NOTIFICATION_CATEGORIES.join(', ')}`);
    }
});

module.exports =
  mongoose.models.NotificationPreference ||
  mongoose.model('NotificationPreference', notificationPreferenceSchema);

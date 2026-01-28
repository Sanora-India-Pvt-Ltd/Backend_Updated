const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: false
        // Index removed - covered by compound index { userId: 1, createdAt: -1 }
    },
    universityId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'University',
        required: false
    },
    url: {
        type: String,
        required: true
    },
    public_id: {
        type: String,
        required: true,
        unique: true
    },
    format: {
        type: String,
        required: true
    },
    resource_type: {
        type: String,
        required: true,
        enum: ['image', 'video', 'audio', 'raw', 'auto', 'file', 'application', 'text']
    },
    fileSize: {
        type: Number, // Size in bytes
        required: false
    },
    originalFilename: {
        type: String,
        required: false
    },
    folder: {
        type: String,
        default: 'user_uploads'
    },
    transcodingJobId: {
        type: String,
        default: null,
        index: true
    },
    isTranscoding: {
        type: Boolean,
        default: false
    },
    transcodingCompleted: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

// Index for querying by user and date
mediaSchema.index({ userId: 1, createdAt: -1 });
// Index for querying by university and date
mediaSchema.index({ universityId: 1, createdAt: -1 });

// Validation: Allow public uploads (no userId or universityId required)
// Files can be uploaded without user/university association for public access
// mediaSchema.pre('save', async function() {
//     if (!this.userId && !this.universityId) {
//         throw new Error('Either userId or universityId must be provided');
//     }
// });

module.exports =
  mongoose.models.Media ||
  mongoose.model('Media', mediaSchema);


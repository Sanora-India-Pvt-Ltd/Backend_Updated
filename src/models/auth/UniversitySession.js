'use strict';

const mongoose = require('mongoose');

const universitySessionSchema = new mongoose.Schema({
  universityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'University',
    required: true
  },
  token: {
    type: String,
    required: true,
    unique: true
  },
  refreshToken: {
    type: String,
    required: true
  },
  ipAddress: { type: String },
  deviceFingerprint: { type: String },
  userAgent: { type: String },
  isActive: {
    type: Boolean,
    default: true
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

universitySessionSchema.index({ universityId: 1 });
universitySessionSchema.index({ refreshToken: 1 }, { unique: true });
universitySessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('UniversitySession', universitySessionSchema);

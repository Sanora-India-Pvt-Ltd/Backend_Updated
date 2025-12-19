const mongoose = require('mongoose');

const userReportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  reason: {
    type: String,
    required: true,
    enum: [
      'under_18',
      'bullying_harassment_abuse',
      'suicide_self_harm',
      'violent_hateful_disturbing',
      'restricted_items',
      'adult_content',
      'scam_fraud_false_info',
      'fake_profile',
      'intellectual_property',
      'other'
    ]
  },
  description: {
    type: String,
    maxlength: 1000
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'action_taken', 'dismissed'],
    default: 'pending'
  },
  adminNotes: {
    type: String,
    maxlength: 1000
  }
}, { timestamps: true });

// Prevent duplicate reports
userReportSchema.index({ reporter: 1, reportedUser: 1 }, { unique: true });

module.exports = mongoose.model('UserReport', userReportSchema);

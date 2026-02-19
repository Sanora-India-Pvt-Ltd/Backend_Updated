'use strict';

const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctAnswer: { type: Number, required: true }
}, { _id: false });

const courseSummarySchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  wordCount: {
    type: Number,
    required: true
  },
  questions: [questionSchema]
}, {
  timestamps: true
});

courseSummarySchema.index({ courseId: 1 });

module.exports = mongoose.model('CourseSummary', courseSummarySchema);

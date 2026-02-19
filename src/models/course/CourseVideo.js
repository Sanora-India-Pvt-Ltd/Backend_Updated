'use strict';

const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctAnswer: { type: Number, required: true }
}, { _id: false });

const courseVideoSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  videoUrl: {
    type: String,
    required: true
  },
  questions: [questionSchema]
}, {
  timestamps: true
});

courseVideoSchema.index({ courseId: 1 });

module.exports = mongoose.model('CourseVideo', courseVideoSchema);

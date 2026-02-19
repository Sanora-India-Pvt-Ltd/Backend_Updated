'use strict';

const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctAnswer: { type: Number, required: true }
}, { _id: false });

const courseProductSchema = new mongoose.Schema({
  courseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  images: [{ type: String }],
  description: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  discount: {
    type: Number,
    default: 0
  },
  specifications: { type: String },
  deliveryLocations: [{ type: String }],
  questions: [questionSchema]
}, {
  timestamps: true
});

courseProductSchema.index({ courseId: 1 });

module.exports = mongoose.model('CourseProduct', courseProductSchema);

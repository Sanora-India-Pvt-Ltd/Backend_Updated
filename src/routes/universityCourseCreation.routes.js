'use strict';

const express = require('express');
const Joi = require('joi');

const validate = require('../app/validators/validate');
const { protectUniversity } = require('../middleware/universityAuth.middleware');
const { createCourse } = require('../controllers/universityCourseCreation.controller');
const { getUniversityCourse } = require('../controllers/universityCourseQuery.controller');

const router = express.Router();

const questionItemSchema = Joi.object({
  question: Joi.string().required(),
  options: Joi.array().items(Joi.string()).required(),
  correctAnswer: Joi.number().required()
});

const createCourseSchema = Joi.object({
  courseType: Joi.string().valid('subject_mastery', 'product_marketplace').required(),
  title: Joi.string().required(),
  description: Joi.string().required(),
  eligibilityCriteria: Joi.object({
    spendabilityBands: Joi.array().items(Joi.string()).required(),
    deliveryLocations: Joi.array().items(Joi.string()).required()
  }).required(),
  reward: Joi.object({
    type: Joi.string().optional(),
    amount: Joi.number().optional()
  }).optional(),
  video: Joi.object({
    videoUrl: Joi.string().required(),
    questions: Joi.array().items(questionItemSchema).required()
  }).required(),
  product: Joi.object({
    description: Joi.string().required(),
    price: Joi.number().required(),
    images: Joi.array().items(Joi.string()).optional(),
    discount: Joi.number().optional(),
    specifications: Joi.string().optional(),
    deliveryLocations: Joi.array().items(Joi.string()).optional(),
    questions: Joi.array().items(questionItemSchema).optional()
  }).required(),
  summary: Joi.object({
    content: Joi.string().required(),
    wordCount: Joi.number().required(),
    questions: Joi.array().items(questionItemSchema).optional()
  }).required()
});

router.post('/courses', protectUniversity, validate({ body: createCourseSchema }), createCourse);
router.get('/courses/:courseId', protectUniversity, getUniversityCourse);

console.log('✅ universityCourseCreation.routes.js loaded');

module.exports = router;

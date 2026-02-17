'use strict';

const express = require('express');
const Joi = require('joi');

const validate = require('../app/validators/validate');
const { authRateLimitMiddleware } = require('../middleware/rateLimiter');
const { signupUniversity } = require('../controllers/universityAuth.controller');

const router = express.Router();

const signupSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().required(),
  contact: Joi.object({
    phone: Joi.string().optional(),
    address: Joi.string().optional()
  }).optional(),
  universityCode: Joi.string().optional()
});

router.post('/signup', authRateLimitMiddleware, validate({ body: signupSchema }), signupUniversity);

module.exports = router;


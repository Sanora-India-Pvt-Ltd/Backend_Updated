const express = require('express');
const router = express.Router();
const { getCourseAnalytics } = require('../../controllers/course/course.controller');
const { protectUniversity } = require('../../middleware/universityAuth.middleware');

// University Course Analytics Routes
router.get('/courses/:courseId/analytics', protectUniversity, getCourseAnalytics);

module.exports = router;


const express = require('express');
const router = express.Router();
const {
    getCourseAnalytics,
    getMostRepeatedSegments,
    getIdleUsers,
    getUserEngagementMetrics
} = require('../../controllers/analytics/courseAnalytics.controller');
const { protectUniversity } = require('../../middleware/universityAuth.middleware');

// Analytics Routes
router.get('/courses/:courseId', protectUniversity, getCourseAnalytics);
router.get('/courses/:courseId/segments', protectUniversity, getMostRepeatedSegments);
router.get('/courses/:courseId/idle-users', protectUniversity, getIdleUsers);
router.get('/courses/:courseId/engagement', protectUniversity, getUserEngagementMetrics);

module.exports = router;


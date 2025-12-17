const express = require('express');
const { protect } = require('../middleware/auth');
const {
    createBugReport,
    getMyBugReports,
    getBugReportById
} = require('../controllers/bugReportController');

const router = express.Router();

// Create a new bug report
// POST /api/bug-reports
router.post('/', protect, createBugReport);

// Get bug reports for the authenticated user
// GET /api/bug-reports/me?page=1&limit=10&status=open&severity=high
router.get('/me', protect, getMyBugReports);

// Get a specific bug report by ID (only if user owns it)
// GET /api/bug-reports/:id
router.get('/:id', protect, getBugReportById);

// Debug: Log all registered routes
console.log('📋 Bug Report routes registered:');
console.log('  POST   /api/bug-reports (protected)');
console.log('  GET    /api/bug-reports/me (protected)');
console.log('  GET    /api/bug-reports/:id (protected)');

module.exports = router;


const express = require('express');
const { protect } = require('../middleware/auth');
const {
    searchInstitutions,
    createInstitution
} = require('../controllers/institutionController');

const router = express.Router();

// Search institutions - public endpoint (no auth required for search)
router.get('/search', searchInstitutions);

// Create institution - requires authentication
router.post('/', protect, createInstitution);

// Debug: Log all registered routes
console.log('📋 Institution routes registered:');
console.log('  GET  /api/institution/search');
console.log('  POST /api/institution (protected)');

module.exports = router;


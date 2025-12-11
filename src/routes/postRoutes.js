const express = require('express');
const { protect } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
    createPost,
    getAllPosts,
    getUserPosts,
    uploadPostMedia
} = require('../controllers/postController');

const router = express.Router();

// Upload media for posts (Option A: Upload first, then create post)
// POST /api/posts/upload-media
router.post('/upload-media', protect, upload.single('media'), uploadPostMedia);

// Create a new post (requires media URLs from upload-media endpoint)
// POST /api/posts/create
router.post('/create', protect, createPost);

// Get all posts (for feed) - pagination supported
// GET /api/posts/all?page=1&limit=10
router.get('/all', getAllPosts);

// Get posts by user ID - pagination supported
// GET /api/posts/user/:id?page=1&limit=10
router.get('/user/:id', getUserPosts);

// Debug: Log all registered routes
console.log('📋 Post routes registered:');
console.log('  POST   /api/posts/upload-media (protected)');
console.log('  POST   /api/posts/create (protected)');
console.log('  GET    /api/posts/all');
console.log('  GET    /api/posts/user/:id');

module.exports = router;


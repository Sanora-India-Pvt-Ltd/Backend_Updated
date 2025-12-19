const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { 
    toggleLikePost, 
    toggleLikeReel,
    getReactions
} = require('../controllers/likeController');

// Like/Unlike a post
// POST /api/likes/post/:id
router.post('/post/:id', protect, toggleLikePost);

// Like/Unlike a reel
// POST /api/likes/reel/:id
router.post('/reel/:id', protect, toggleLikeReel);

// Get reactions for a post/reel
// GET /api/likes/:content(post|reel)/:contentId
router.get('/:content(post|reel)/:contentId', getReactions);

module.exports = router;

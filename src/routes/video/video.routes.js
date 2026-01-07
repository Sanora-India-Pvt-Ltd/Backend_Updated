const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
    uploadVideo,
    getVideo,
    getPlaylistVideos,
    updateVideo,
    deleteVideo,
    updateVideoThumbnail,
    trackProductView,
    trackProductClick
} = require('../../controllers/video/video.controller');
const { protectUniversity } = require('../../middleware/universityAuth.middleware');
const { protect } = require('../../middleware/auth');

// Configure multer for memory storage (for S3 upload)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB limit
    }
});

// Video Routes
router.post('/', protectUniversity, upload.single('video'), uploadVideo);
router.get('/playlists/:playlistId/videos', protect, getPlaylistVideos);
router.get('/:id', protect, getVideo);
router.put('/:id', protectUniversity, updateVideo);
router.delete('/:id', protectUniversity, deleteVideo);
router.post('/:id/thumbnail', protectUniversity, upload.single('thumbnail'), updateVideoThumbnail);

// Product analytics routes (non-blocking)
router.post('/:videoId/product-view', protect, trackProductView);
router.post('/:videoId/product-click', protect, trackProductClick);

module.exports = router;


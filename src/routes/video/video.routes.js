const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
    uploadVideo,
    getVideo,
    getPlaylistVideos,
    updateVideo,
    deleteVideo,
    updateVideoThumbnail
} = require('../../controllers/video/video.controller');
const { protectUniversity } = require('../../middleware/universityAuth.middleware');
const { protect } = require('../../middleware/auth');
const { flexibleAuth } = require('../../middleware/flexibleAuth.middleware');

// Configure multer for video uploads (500MB limit)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB limit for videos
    }
});

// Configure multer for thumbnail uploads (40MB limit, images only)
const uploadThumbnail = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 40 * 1024 * 1024 // 40MB limit for thumbnails
    },
    fileFilter: (req, file, cb) => {
        // Only allow image files
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for thumbnails'), false);
        }
    }
});

// Video Routes
router.post('/', protectUniversity, upload.single('video'), uploadVideo);
router.get('/playlists/:playlistId/videos', flexibleAuth, getPlaylistVideos);
router.get('/:id', flexibleAuth, getVideo);
router.put('/:id', protectUniversity, updateVideo);
router.delete('/:id', protectUniversity, deleteVideo);
router.post('/:id/thumbnail', protectUniversity, (req, res, next) => {
    uploadThumbnail.single('thumbnail')(req, res, (err) => {
        if (err) {
            if (err.message === 'Only image files are allowed for thumbnails') {
                return res.status(400).json({
                    success: false,
                    message: err.message
                });
            }
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    message: 'File size too large. Maximum size is 40MB for thumbnails'
                });
            }
            return res.status(400).json({
                success: false,
                message: err.message || 'Error uploading thumbnail'
            });
        }
        next();
    });
}, updateVideoThumbnail);

module.exports = router;


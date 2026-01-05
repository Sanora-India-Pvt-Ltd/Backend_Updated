const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
    createPlaylist,
    getPlaylists,
    getPlaylistById,
    updatePlaylist,
    deletePlaylist,
    updatePlaylistThumbnail
} = require('../../controllers/course/playlist.controller');
const { protectUniversity } = require('../../middleware/universityAuth.middleware');
const { protect } = require('../../middleware/auth');
const { flexibleAuth } = require('../../middleware/flexibleAuth.middleware');

// Configure multer for memory storage (for S3 upload)
const upload = multer({
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

// Playlist Routes
router.post('/courses/:courseId/playlists', protectUniversity, createPlaylist);
router.get('/courses/:courseId/playlists', flexibleAuth, getPlaylists);
router.get('/playlists/:id', flexibleAuth, getPlaylistById);
router.put('/playlists/:id', protectUniversity, updatePlaylist);
router.delete('/playlists/:id', protectUniversity, deletePlaylist);
router.post('/playlists/:id/thumbnail', protectUniversity, (req, res, next) => {
    upload.single('thumbnail')(req, res, (err) => {
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
}, updatePlaylistThumbnail);

module.exports = router;


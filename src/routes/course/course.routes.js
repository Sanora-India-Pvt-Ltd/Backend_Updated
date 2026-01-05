const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
    createCourse,
    getCourses,
    getCourseById,
    updateCourse,
    deleteCourse,
    updateCourseThumbnail
} = require('../../controllers/course/course.controller');
const { protectUniversity } = require('../../middleware/universityAuth.middleware');
const { protect } = require('../../middleware/auth');

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

// Course Routes
router.post('/', protectUniversity, createCourse);
router.get('/', protectUniversity, getCourses);
router.get('/:id', protect, getCourseById); // Public or authenticated
router.put('/:id', protectUniversity, updateCourse);
router.delete('/:id', protectUniversity, deleteCourse);
router.post('/:id/thumbnail', protectUniversity, (req, res, next) => {
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
}, updateCourseThumbnail);

module.exports = router;


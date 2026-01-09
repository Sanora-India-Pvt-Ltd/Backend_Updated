const express = require('express');
const router = express.Router();
const multer = require('multer');
const {
    createCourse,
    getCourses,
    getCourseById,
    updateCourse,
    deleteCourse,
    updateCourseThumbnail,
    requestEnrollment,
    getCourseEnrollments,
    approveEnrollment,
    rejectEnrollment
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
// Test route to verify router is working (remove after debugging)
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Course routes are working!',
        path: req.path,
        method: req.method
    });
});

router.post('/', protectUniversity, createCourse);
router.get('/', getCourses); // Public - returns LIVE/FULL for users, all courses for universities
router.get('/:id', protect, getCourseById); // Public or authenticated
router.put('/:id', protectUniversity, updateCourse);
router.delete('/:id', protectUniversity, deleteCourse);

// Debug: Log registered routes
console.log('📋 Course routes registered:');
console.log('  GET    /api/courses (public - LIVE/FULL courses only)');
console.log('  POST   /api/courses (protected, university)');
console.log('  GET    /api/courses/:id (protected)');
console.log('  PUT    /api/courses/:id (protected, university)');
console.log('  DELETE /api/courses/:id (protected, university)');
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

// Enrollment routes
router.post('/:courseId/enroll-request', protect, requestEnrollment);
router.get('/:courseId/enrollments', protectUniversity, getCourseEnrollments);
router.post('/:courseId/enrollments/:enrollmentId/approve', protectUniversity, approveEnrollment);
router.post('/:courseId/enrollments/:enrollmentId/reject', protectUniversity, rejectEnrollment);

module.exports = router;


const express = require('express');
const { protect } = require('../middleware/auth');
const {
    updateProfile,
    sendOTPForPhoneUpdate,
    verifyOTPAndUpdatePhone,
    sendOTPForAlternatePhone,
    verifyOTPAndUpdateAlternatePhone,
    removeAlternatePhone,
    updateProfileMedia,
    updatePersonalInfo,
    updateLocationAndDetails,
    searchUsers,
    removeEducationEntry,
    removeWorkplaceEntry
} = require('../controllers/userController');
const { limitOTPRequests, limitVerifyRequests } = require('../middleware/rateLimiter');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Search users by name
router.get('/search', searchUsers);

// More specific routes first to avoid conflicts
// API 1: Update Bio, Cover Photo, Profile Image, and Cover Image
router.put('/profile/media', updateProfileMedia);

// API 2: Update firstName, lastName, Gender, Date of Birth, phone number, alternate phone number
router.put('/profile/personal-info', updatePersonalInfo);

// API 3: Update currentCity, workplace, pronouns, education, relationshipStatus, hometown
router.put('/profile/location-details', updateLocationAndDetails);

// Update profile (name, age, gender) - no verification needed (less specific, comes after)
router.put('/profile', updateProfile);

// Phone number update flow (requires OTP verification)
router.post('/phone/send-otp', limitOTPRequests, sendOTPForPhoneUpdate);
router.post('/phone/verify-otp', limitVerifyRequests, verifyOTPAndUpdatePhone);

// Alternate phone number flow (requires OTP verification)
router.post('/alternate-phone/send-otp', limitOTPRequests, sendOTPForAlternatePhone);
router.post('/alternate-phone/verify-otp', limitVerifyRequests, verifyOTPAndUpdateAlternatePhone);
router.delete('/alternate-phone', removeAlternatePhone);

// Remove education and workplace entries
router.delete('/education/:index', removeEducationEntry);
router.delete('/workplace/:index', removeWorkplaceEntry);

// Debug: Log all registered routes
console.log('📋 User routes registered:');
console.log('  GET    /api/user/search (protected)');
console.log('  PUT    /api/user/profile (protected)');
console.log('  POST   /api/user/phone/send-otp (protected)');
console.log('  POST   /api/user/phone/verify-otp (protected)');
console.log('  POST   /api/user/alternate-phone/send-otp (protected)');
console.log('  POST   /api/user/alternate-phone/verify-otp (protected)');
console.log('  DELETE /api/user/alternate-phone (protected)');
console.log('  PUT    /api/user/profile/media (protected)');
console.log('  PUT    /api/user/profile/personal-info (protected)');
console.log('  PUT    /api/user/profile/location-details (protected)');
console.log('  DELETE /api/user/education/:index (protected)');
console.log('  DELETE /api/user/workplace/:index (protected)');

module.exports = router;


const express = require('express');
const { protect } = require('../middleware/auth');
const {
    updateProfile,
    sendOTPForPhoneUpdate,
    verifyOTPAndUpdatePhone,
    sendOTPForAlternatePhone,
    verifyOTPAndUpdateAlternatePhone,
    removeAlternatePhone
} = require('../controllers/userController');
const { limitOTPRequests, limitVerifyRequests } = require('../middleware/rateLimiter');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Update profile (name, age, gender) - no verification needed
router.put('/profile', updateProfile);

// Phone number update flow (requires OTP verification)
router.post('/phone/send-otp', limitOTPRequests, sendOTPForPhoneUpdate);
router.post('/phone/verify-otp', limitVerifyRequests, verifyOTPAndUpdatePhone);

// Alternate phone number flow (requires OTP verification)
router.post('/alternate-phone/send-otp', limitOTPRequests, sendOTPForAlternatePhone);
router.post('/alternate-phone/verify-otp', limitVerifyRequests, verifyOTPAndUpdateAlternatePhone);
router.delete('/alternate-phone', removeAlternatePhone);

// Debug: Log all registered routes
console.log('📋 User routes registered:');
console.log('  PUT    /api/user/profile (protected)');
console.log('  POST   /api/user/phone/send-otp (protected)');
console.log('  POST   /api/user/phone/verify-otp (protected)');
console.log('  POST   /api/user/alternate-phone/send-otp (protected)');
console.log('  POST   /api/user/alternate-phone/verify-otp (protected)');
console.log('  DELETE /api/user/alternate-phone (protected)');

module.exports = router;


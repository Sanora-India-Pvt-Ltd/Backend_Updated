const express = require('express');
const { signup, login, sendOTPForPasswordReset, verifyOTPForPasswordReset, resetPassword, getProfile, updateProfile, refreshToken, logout } = require('../controllers/authController');
const { sendOTPForSignup, verifyOTPForSignup, sendPhoneOTPForSignup, verifyPhoneOTPForSignup } = require('../middleware/authController');
const { limitOTPRequests, limitVerifyRequests } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Unified signup and login
router.post('/signup', signup);
router.post('/login', login);

// OTP for signup (new users) - REQUIRED for signup
router.post('/send-otp-signup', /* limitOTPRequests, */ sendOTPForSignup);
router.post('/verify-otp-signup', limitVerifyRequests, verifyOTPForSignup);
router.post('/send-phone-otp-signup', limitOTPRequests, sendPhoneOTPForSignup);
router.post('/verify-phone-otp-signup', limitVerifyRequests, verifyPhoneOTPForSignup);

// Forgot Password flow - OTP verification for password reset
router.post('/forgot-password/send-otp', limitOTPRequests, sendOTPForPasswordReset);
router.post('/forgot-password/verify-otp', limitVerifyRequests, verifyOTPForPasswordReset);
router.post('/forgot-password/reset', resetPassword);

// Get current user profile (protected route)
router.get('/profile', protect, getProfile);

// Update current user profile (protected route)
router.put('/profile', protect, updateProfile);

// Refresh access token
router.post('/refresh-token', refreshToken);

// Logout (protected route - invalidates refresh token)
router.post('/logout', protect, logout);

// Debug: Log all registered routes
console.log('📋 Auth routes registered:');
console.log('  POST /api/auth/signup');
console.log('  POST /api/auth/login');
console.log('  POST /api/auth/send-otp-signup');
console.log('  POST /api/auth/verify-otp-signup');
console.log('  POST /api/auth/send-phone-otp-signup');
console.log('  POST /api/auth/verify-phone-otp-signup');
console.log('  POST /api/auth/forgot-password/send-otp');
console.log('  POST /api/auth/forgot-password/verify-otp');
console.log('  POST /api/auth/forgot-password/reset');
console.log('  GET  /api/auth/profile (protected)');
console.log('  PUT  /api/auth/profile (protected)');
console.log('  POST /api/auth/refresh-token');
console.log('  POST /api/auth/logout (protected)');

module.exports = router;
const express = require('express');
const router = express.Router();
const {
    sendOTPForRegistration,
    verifyOTPForRegistration,
    register,
    login,
    logout,
    refreshToken,
    resendVerificationOTP,
    verifyEmailWithOTP,
    verifyEmail
} = require('../../controllers/auth/universityAuth.controller');

// University Auth Routes
router.post('/send-otp', sendOTPForRegistration);
router.post('/verify-otp', verifyOTPForRegistration);
router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.post('/resend-verification-otp', resendVerificationOTP);
router.post('/verify-email-otp', verifyEmailWithOTP);
router.get('/verify-email/:token', verifyEmail);

module.exports = router;


const express = require('express');
const router = express.Router();
const {
    sendOTPForRegistration,
    verifyOTPForRegistration,
    logout,
    refreshToken,
    resendVerificationOTP,
    verifyEmailWithOTP,
    verifyEmail
} = require('../../controllers/auth/universityAuth.controller');

// University Auth Routes (legacy login/register removed; use POST /api/university/signup and POST /api/university/login)
router.post('/send-otp', sendOTPForRegistration);
router.post('/verify-otp', verifyOTPForRegistration);
router.post('/refresh', refreshToken);
router.post('/logout', logout);
router.post('/resend-verification-otp', resendVerificationOTP);
router.post('/verify-email-otp', verifyEmailWithOTP);
router.get('/verify-email/:token', verifyEmail);

module.exports = router;


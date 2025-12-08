const emailService = require('../../services/emailService');
const { createOTPRecord, validateOTP } = require('../../services/otpService');
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');


// Send OTP for Signup (doesn't require user to exist)
const sendOTPForSignup = async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }
        
        // Create OTP record for signup
        const { otpRecord, plainOTP } = await createOTPRecord(email, 'signup');
        
        // Check if email service is configured
        if (!emailService.transporter) {
            return res.status(503).json({
                success: false,
                message: 'Email service is not configured',
                hint: 'Please configure EMAIL_USER and EMAIL_PASSWORD in your .env file. For Gmail, use an App Password (not your regular password). See OTP_SETUP_GUIDE.md for instructions.'
            });
        }
        
        // Send email
        const emailSent = await emailService.sendOTPEmail(email, plainOTP);
        
        if (!emailSent) {
            // Provide helpful error message based on common issues
            const errorMessage = 'Failed to send OTP email';
            const hints = [];
            
            // Check if it's likely an authentication issue
            if (!process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
                hints.push('Email credentials (EMAIL_USER, EMAIL_PASSWORD) are not configured in .env');
            } else {
                hints.push('Check server logs for detailed error information');
                hints.push('For Gmail: Ensure you are using an App Password (not your regular password)');
                hints.push('Verify 2-Step Verification is enabled on your Google account');
                hints.push('Double-check EMAIL_USER matches your Gmail address exactly');
            }
            
            return res.status(503).json({
                success: false,
                message: errorMessage,
                hint: hints.join('. '),
                troubleshooting: process.env.NODE_ENV === 'development' ? {
                    emailConfigured: !!(process.env.EMAIL_USER && process.env.EMAIL_PASSWORD),
                    emailHost: process.env.EMAIL_HOST || 'smtp.gmail.com',
                    emailPort: process.env.EMAIL_PORT || '587'
                } : undefined
            });
        }
        
        res.status(200).json({
            success: true,
            message: 'OTP sent successfully to your email',
            data: {
                email,
                expiresAt: otpRecord.expiresAt
            }
        });
        
    } catch (error) {
        console.error('Send OTP for signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending OTP',
            error: error.message
        });
    }
};


// Verify OTP for Signup
const verifyOTPForSignup = async (req, res) => {
    try {
        const { email, otp } = req.body;
        
        // Validate OTP for signup
        const result = await validateOTP(email, 'signup', otp);
        
        if (!result.valid) {
            return res.status(400).json({
                success: false,
                message: result.message,
                remainingAttempts: result.remainingAttempts
            });
        }
        
        // Create verification token (short-lived, 20 minutes - allows time to fill form)
        const verificationToken = jwt.sign(
            { 
                email, 
                purpose: 'otp_verification',
                forSignup: true,
                verificationType: 'email'
            },
            process.env.JWT_SECRET,
            { expiresIn: '20m' }
        );
        
        res.status(200).json({
            success: true,
            message: 'Email OTP verified successfully. You can now complete signup.',
            data: {
                emailVerificationToken: verificationToken,
                email
            }
        });
        
    } catch (error) {
        console.error('Verify OTP for signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying OTP',
            error: error.message
        });
    }
};

// Send Phone OTP for Signup
const sendPhoneOTPForSignup = async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        // Normalize phone number
        let normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
        if (!normalizedPhone.startsWith('+')) {
            normalizedPhone = '+' + normalizedPhone;
        }

        // Check if phone number is already taken
        const existingUser = await User.findOne({ phoneNumber: normalizedPhone });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is already registered'
            });
        }

        // Check if Twilio is configured
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) {
            return res.status(500).json({
                success: false,
                message: 'Twilio is not configured for phone OTP'
            });
        }

        const twilio = require('twilio');
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const twilioServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

        // Create verification via Twilio Verify v2
        console.log('📱 Using Twilio Verify v2 API to send OTP for signup');
        const verification = await twilioClient.verify.v2.services(twilioServiceSid)
            .verifications
            .create({ to: normalizedPhone, channel: 'sms' });

        res.status(200).json({
            success: true,
            message: 'OTP sent successfully to your phone',
            data: {
                phone: normalizedPhone,
                sid: verification.sid,
                status: verification.status
            }
        });
        
    } catch (error) {
        console.error('Send phone OTP for signup error:', error);
        
        // Provide more helpful error messages
        let errorMessage = error.message || 'Failed to send OTP';
        if (error.message && error.message.includes('Invalid parameter `To`')) {
            errorMessage = 'Invalid phone number format. Please ensure the phone number is in E.164 format (e.g., +1234567890) with country code.';
        }
        
        res.status(500).json({
            success: false,
            message: errorMessage,
            hint: 'Phone number must be in E.164 format: +[country code][subscriber number]'
        });
    }
};

// Verify Phone OTP for Signup
const verifyPhoneOTPForSignup = async (req, res) => {
    try {
        const { phone, otp } = req.body;
        
        if (!phone || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and OTP code are required'
            });
        }

        // Normalize phone number
        let normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
        if (!normalizedPhone.startsWith('+')) {
            normalizedPhone = '+' + normalizedPhone;
        }

        // Check if phone number is already taken
        const existingUser = await User.findOne({ phoneNumber: normalizedPhone });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is already registered'
            });
        }

        // Check if Twilio is configured
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) {
            return res.status(500).json({
                success: false,
                message: 'Twilio is not configured'
            });
        }

        const twilio = require('twilio');
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const twilioServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

        // Verify with Twilio v2
        console.log('✅ Using Twilio Verify v2 API to verify OTP for signup');
        const check = await twilioClient.verify.v2.services(twilioServiceSid)
            .verificationChecks
            .create({ to: normalizedPhone, code: otp });

        if (check.status !== 'approved') {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP code'
            });
        }

        // Create phone verification token (short-lived, 20 minutes)
        const phoneVerificationToken = jwt.sign(
            {
                phone: normalizedPhone,
                purpose: 'otp_verification',
                forSignup: true,
                verificationType: 'phone'
            },
            process.env.JWT_SECRET,
            { expiresIn: '20m' }
        );

        res.status(200).json({
            success: true,
            message: 'Phone OTP verified successfully. You can now complete signup.',
            data: {
                phoneVerificationToken,
                phone: normalizedPhone
            }
        });
        
    } catch (error) {
        console.error('Verify phone OTP for signup error:', error);
        
        // Provide more helpful error messages
        let errorMessage = error.message || 'Failed to verify OTP';
        if (error.message && error.message.includes('Invalid parameter `To`')) {
            errorMessage = 'Invalid phone number format. Please ensure the phone number is in E.164 format (e.g., +1234567890) with country code.';
        }
        
        res.status(500).json({
            success: false,
            message: errorMessage,
            hint: 'Phone number must be in E.164 format: +[country code][subscriber number]'
        });
    }
};


module.exports = {
    sendOTPForSignup,
    verifyOTPForSignup,
    sendPhoneOTPForSignup,
    verifyPhoneOTPForSignup
};

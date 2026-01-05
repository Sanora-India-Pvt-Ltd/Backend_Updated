const University = require('../../models/auth/University');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const emailService = require('../../../services/emailService');
const { createOTPRecord, validateOTP } = require('../../../services/otpService');

/**
 * Send OTP for University Registration
 */
const sendOTPForRegistration = async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }
        
        // Normalize email: trim whitespace and convert to lowercase
        const normalizedEmail = email.trim().toLowerCase();
        
        // Validate normalized email is not empty
        if (!normalizedEmail || normalizedEmail.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Email cannot be empty'
            });
        }
        
        // Check if university already exists
        const existingUniversity = await University.findOne({ 'account.email': normalizedEmail });
        if (existingUniversity) {
            return res.status(400).json({
                success: false,
                message: 'University with this email already exists'
            });
        }
        
        // Create OTP record for university registration
        const { otpRecord, plainOTP } = await createOTPRecord(normalizedEmail, 'university_signup');
        
        // Check if email service is configured
        if (!emailService.transporter) {
            return res.status(503).json({
                success: false,
                message: 'Email service is not configured',
                hint: 'Please configure EMAIL_USER and EMAIL_PASSWORD in your .env file. For Gmail, use an App Password (not your regular password).'
            });
        }
        
        // Send email
        const emailSent = await emailService.sendOTPEmail(normalizedEmail, plainOTP);
        
        if (!emailSent) {
            return res.status(503).json({
                success: false,
                message: 'Failed to send OTP email',
                hint: 'Check email service configuration'
            });
        }
        
        res.status(200).json({
            success: true,
            message: 'OTP sent successfully to your email',
            data: {
                email: normalizedEmail,
                expiresAt: otpRecord.expiresAt
            }
        });
        
    } catch (error) {
        console.error('Send OTP for university registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending OTP',
            error: error.message
        });
    }
};

/**
 * Verify OTP for University Registration
 */
const verifyOTPForRegistration = async (req, res) => {
    try {
        const { email, otp } = req.body;
        
        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email and OTP are required'
            });
        }
        
        // Normalize email
        const normalizedEmail = email.trim().toLowerCase();
        
        // Validate OTP for university registration
        const result = await validateOTP(normalizedEmail, 'university_signup', otp);
        
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
                email: normalizedEmail, 
                purpose: 'otp_verification',
                forUniversitySignup: true,
                verificationType: 'email'
            },
            process.env.JWT_SECRET,
            { expiresIn: '20m' }
        );
        
        res.status(200).json({
            success: true,
            message: 'Email OTP verified successfully. You can now complete registration.',
            data: {
                emailVerificationToken: verificationToken,
                email: normalizedEmail
            }
        });
        
    } catch (error) {
        console.error('Verify OTP for university registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying OTP',
            error: error.message
        });
    }
};

/**
 * Register a new university (requires emailVerificationToken from OTP verification)
 */
const register = async (req, res) => {
    try {
        const { name, adminEmail, password, emailVerificationToken } = req.body;

        // Validation
        if (!name || !adminEmail || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, admin email, and password are required'
            });
        }

        if (!emailVerificationToken) {
            return res.status(400).json({
                success: false,
                message: 'Email verification is required. Please verify your email using /api/auth/university/send-otp and /api/auth/university/verify-otp'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Verify email verification token
        let emailDecoded;
        try {
            emailDecoded = jwt.verify(emailVerificationToken, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired email verification token. Please verify your email OTP again.'
            });
        }

        // Validate token purpose and email match
        if (emailDecoded.purpose !== 'otp_verification' || 
            emailDecoded.verificationType !== 'email' ||
            !emailDecoded.forUniversitySignup ||
            emailDecoded.email !== adminEmail.toLowerCase()) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email verification token. Email does not match or token is invalid.'
            });
        }

        // Check if university already exists
        const existingUniversity = await University.findOne({ 'account.email': adminEmail.toLowerCase() });
        if (existingUniversity) {
            return res.status(400).json({
                success: false,
                message: 'University with this email already exists'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create university (automatically verified since OTP was verified)
        const university = await University.create({
            account: {
                email: adminEmail.toLowerCase(),
                password: hashedPassword,
                status: {
                    isActive: true
                }
            },
            profile: {
                name: name
            },
            verification: {
                isVerified: true // Verified via OTP
            }
        });

        // Generate JWT token
        const token = jwt.sign(
            { id: university._id, email: university.account.email, type: 'university' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'University registered and verified successfully',
            data: {
                token,
                university: {
                    id: university._id,
                    name: university.profile.name,
                    adminEmail: university.account.email,
                    isVerified: true
                }
            }
        });
    } catch (error) {
        console.error('University registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Error registering university',
            error: error.message
        });
    }
};

/**
 * Login university
 */
const login = async (req, res) => {
    try {
        const { adminEmail, password } = req.body;

        if (!adminEmail || !password) {
            return res.status(400).json({
                success: false,
                message: 'Admin email and password are required'
            });
        }

        // Find university (support both old flat structure and new nested structure)
        const university = await University.findOne({
            $or: [
                { 'account.email': adminEmail.toLowerCase() },
                { adminEmail: adminEmail.toLowerCase() }
            ]
        });
        if (!university) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Get email and password (support both structures)
        const email = university.account?.email ?? university.adminEmail;
        const universityPassword = university.account?.password ?? university.password;

        // Check if active (support both structures)
        const isActive = university.account?.status?.isActive ?? university.isActive;
        if (!isActive) {
            return res.status(403).json({
                success: false,
                message: 'University account is inactive'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, universityPassword);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        // Get isVerified and name (support both structures)
        const isVerified = university.verification?.isVerified ?? university.isVerified;
        const universityName = university.profile?.name ?? university.name;

        // Generate JWT token
        const token = jwt.sign(
            { id: university._id, email: email, type: 'university' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                university: {
                    id: university._id,
                    name: universityName,
                    adminEmail: email,
                    isVerified: isVerified
                }
            }
        });
    } catch (error) {
        console.error('University login error:', error);
        res.status(500).json({
            success: false,
            message: 'Error logging in',
            error: error.message
        });
    }
};

/**
 * Logout (invalidate token in Redis)
 */
const logout = async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (token) {
            // Invalidate token in Redis
            const { getRedis } = require('../../config/redisConnection');
            const redis = getRedis();
            
            if (redis) {
                // Add token to blacklist (expire in 7 days - same as token expiry)
                await redis.setex(`blacklist:university:${token}`, 7 * 24 * 60 * 60, '1');
            }
        }

        res.status(200).json({
            success: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        console.error('University logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Error logging out',
            error: error.message
        });
    }
};

/**
 * Refresh token
 */
const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token is required'
            });
        }

        // Verify refresh token
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired refresh token'
            });
        }

        if (decoded.type !== 'university') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token type'
            });
        }

        // Find university
        const university = await University.findById(decoded.id);
        if (!university || !university.account.status.isActive) {
            return res.status(401).json({
                success: false,
                message: 'University not found or inactive'
            });
        }

        // Generate new access token
        const newToken = jwt.sign(
            { id: university._id, email: university.account.email, type: 'university' },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(200).json({
            success: true,
            message: 'Token refreshed successfully',
            data: {
                token: newToken
            }
        });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({
            success: false,
            message: 'Error refreshing token',
            error: error.message
        });
    }
};

/**
 * Resend verification OTP for existing university
 */
const resendVerificationOTP = async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }
        
        // Normalize email
        const normalizedEmail = email.trim().toLowerCase();
        
        // Find university
        const university = await University.findOne({ 'account.email': normalizedEmail });
        if (!university) {
            return res.status(404).json({
                success: false,
                message: 'University not found with this email'
            });
        }

        // Check if already verified
        if (university.verification?.isVerified) {
            return res.status(400).json({
                success: false,
                message: 'University email is already verified'
            });
        }
        
        // Create OTP record for verification
        const { otpRecord, plainOTP } = await createOTPRecord(normalizedEmail, 'university_verification');
        
        // Check if email service is configured
        if (!emailService.transporter) {
            return res.status(503).json({
                success: false,
                message: 'Email service is not configured',
                hint: 'Please configure EMAIL_USER and EMAIL_PASSWORD in your .env file.'
            });
        }
        
        // Send email
        const emailSent = await emailService.sendOTPEmail(normalizedEmail, plainOTP);
        
        if (!emailSent) {
            return res.status(503).json({
                success: false,
                message: 'Failed to send OTP email',
                hint: 'Check email service configuration'
            });
        }
        
        res.status(200).json({
            success: true,
            message: 'Verification OTP sent successfully to your email',
            data: {
                email: normalizedEmail,
                expiresAt: otpRecord.expiresAt
            }
        });
        
    } catch (error) {
        console.error('Resend verification OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending verification OTP',
            error: error.message
        });
    }
};

/**
 * Verify email using OTP (for existing unverified universities)
 */
const verifyEmailWithOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        
        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Email and OTP are required'
            });
        }
        
        // Normalize email
        const normalizedEmail = email.trim().toLowerCase();
        
        // Find university
        const university = await University.findOne({ 'account.email': normalizedEmail });
        if (!university) {
            return res.status(404).json({
                success: false,
                message: 'University not found'
            });
        }

        // Check if already verified
        if (university.verification?.isVerified) {
            return res.status(400).json({
                success: false,
                message: 'University email is already verified'
            });
        }
        
        // Validate OTP
        const result = await validateOTP(normalizedEmail, 'university_verification', otp);
        
        if (!result.valid) {
            return res.status(400).json({
                success: false,
                message: result.message,
                remainingAttempts: result.remainingAttempts
            });
        }
        
        // Verify university
        university.verification.isVerified = true;
        await university.save();
        
        res.status(200).json({
            success: true,
            message: 'Email verified successfully. You can now access all API endpoints.'
        });
        
    } catch (error) {
        console.error('Verify email with OTP error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying email',
            error: error.message
        });
    }
};

/**
 * Verify email (legacy endpoint using token)
 */
const verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Verification token is required'
            });
        }

        // Find university by verification token
        const university = await University.findOne({
            'verification.token': token,
            'verification.tokenExpires': { $gt: new Date() }
        });

        if (!university) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired verification token'
            });
        }

        // Update university
        university.verification.isVerified = true;
        university.verification.token = undefined;
        university.verification.tokenExpires = undefined;
        await university.save();

        res.status(200).json({
            success: true,
            message: 'Email verified successfully'
        });
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying email',
            error: error.message
        });
    }
};

module.exports = {
    sendOTPForRegistration,
    verifyOTPForRegistration,
    register,
    login,
    logout,
    refreshToken,
    resendVerificationOTP,
    verifyEmailWithOTP,
    verifyEmail
};


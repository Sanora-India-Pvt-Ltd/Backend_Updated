const User = require('../models/User');
const Company = require('../models/Company');
const Institution = require('../models/Institution');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { generateToken, generateAccessToken, generateRefreshToken } = require('../middleware/auth');

// Maximum number of devices a user can be logged in on simultaneously
const MAX_DEVICES = 5;

// Helper function to manage device limit - removes oldest device if limit is reached
const manageDeviceLimit = (user) => {
    // Support both old and new structure
    let refreshTokensArray = null;
    
    if (user.auth?.tokens?.refreshTokens && Array.isArray(user.auth.tokens.refreshTokens)) {
        // New nested structure
        refreshTokensArray = user.auth.tokens.refreshTokens;
    } else if (Array.isArray(user.refreshTokens)) {
        // Old flat structure - migrate to new structure
        if (!user.auth) user.auth = {};
        if (!user.auth.tokens) user.auth.tokens = {};
        // Migrate old refreshTokens to new structure
        user.auth.tokens.refreshTokens = user.refreshTokens.map(rt => ({
            token: rt.token || rt,
            expiresAt: rt.expiresAt || rt.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Default 1 year if missing
            device: rt.device || rt.deviceInfo || 'Unknown Device',
            createdAt: rt.createdAt || new Date()
        }));
        refreshTokensArray = user.auth.tokens.refreshTokens;
    } else {
        // Initialize new structure
        if (!user.auth) user.auth = {};
        if (!user.auth.tokens) user.auth.tokens = {};
        user.auth.tokens.refreshTokens = [];
        refreshTokensArray = user.auth.tokens.refreshTokens;
    }
    
    // If we've reached the limit, remove the oldest device (sorted by createdAt)
    if (refreshTokensArray.length >= MAX_DEVICES) {
        // Sort by createdAt (oldest first) and remove the first one
        refreshTokensArray.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        refreshTokensArray.shift(); // Remove the oldest device
    }
};

// User Signup (with OTP verification)
const signup = async (req, res) => {
    try {
        const { email, password, confirmPassword, firstName, lastName, phoneNumber, gender, name, verificationToken, otp } = req.body;

        // Validate input
        if (!email || !password || !firstName || !lastName || !phoneNumber || !gender) {
            return res.status(400).json({
                success: false,
                message: 'Email, password, first name, last name, phone number, and gender are required'
            });
        }

        // Normalize and validate email
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || normalizedEmail.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Email cannot be empty'
            });
        }

        // Basic email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Validate password length (minimum 6 characters)
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Validate password confirmation
        if (confirmPassword && password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Password and confirm password do not match'
            });
        }

        // Validate gender
        const validGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];
        if (!validGenders.includes(gender)) {
            return res.status(400).json({
                success: false,
                message: 'Gender must be one of: Male, Female, Other, Prefer not to say'
            });
        }

        // Check if user already exists (check both new and old structure for migration)
        const existingUser = await User.findOne({
            $or: [
                { 'profile.email': normalizedEmail },
                { email: normalizedEmail } // Old structure for backward compatibility
            ]
        });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }

        // Normalize phone number for verification
        let normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
        if (!normalizedPhone.startsWith('+')) {
            normalizedPhone = '+' + normalizedPhone;
        }
        console.log('Phone',phoneNumber);
        console.log('Normalized Phone',normalizedPhone);

        // Check if phone number is already taken
        const existingPhoneUser = await User.findOne({ 'profile.phoneNumbers.primary': normalizedPhone });
        if (existingPhoneUser) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is already registered'
            });
        }
        console.log('Existing Phone User',existingPhoneUser);

        // OTP verification is MANDATORY for signup - both email and phone
        const { emailVerificationToken, phoneVerificationToken } = req.body;
        
        if (!emailVerificationToken && !phoneVerificationToken) {
            return res.status(400).json({
                success: false,
                message: 'Both email and phone OTP verification are required for signup. Please verify your email using /api/auth/send-otp-signup and /api/auth/verify-otp-signup, and verify your phone using /api/auth/send-phone-otp-signup and /api/auth/verify-phone-otp-signup'
            });
        }

        // Verify email verification token
        if (!emailVerificationToken) {
            return res.status(400).json({
                success: false,
                message: 'Email verification is required. Please verify your email using /api/auth/send-otp-signup and /api/auth/verify-otp-signup'
            });
        }

        // Verify phone verification token
        if (!phoneVerificationToken) {
            return res.status(400).json({
                success: false,
                message: 'Phone verification is required. Please verify your phone using /api/auth/send-phone-otp-signup and /api/auth/verify-phone-otp-signup'
            });
        }

        const jwt = require('jsonwebtoken');
        
        // Verify email token
        let emailDecoded;
        try {
            emailDecoded = jwt.verify(emailVerificationToken, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired email verification token. Please verify your email OTP again.'
            });
        }
        
        // Validate email token
        if (emailDecoded.purpose !== 'otp_verification' || 
            emailDecoded.verificationType !== 'email' ||
            !emailDecoded.forSignup ||
            emailDecoded.email !== normalizedEmail) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email verification token. Email does not match or token is invalid.'
            });
        }

        // Verify phone token
        let phoneDecoded;
        try {
            phoneDecoded = jwt.verify(phoneVerificationToken, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired phone verification token. Please verify your phone OTP again.'
            });
        }
        
        // Validate phone token
        if (phoneDecoded.purpose !== 'otp_verification' || 
            phoneDecoded.verificationType !== 'phone' ||
            !phoneDecoded.forSignup ||
            phoneDecoded.phone !== normalizedPhone) {
            return res.status(401).json({
                success: false,
                message: 'Invalid phone verification token. Phone number does not match or token is invalid.'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user (use normalized phone number and email)
        const fullName = name || `${firstName} ${lastName}`.trim();
        const user = await User.create({
            profile: {
                name: {
                    first: firstName.trim(),
                    last: lastName.trim(),
                    full: fullName
                },
                email: normalizedEmail, // Use normalized email
                phoneNumbers: {
                    primary: normalizedPhone
                },
                gender
            },
            auth: {
                password: hashedPassword,
                tokens: {
                    refreshTokens: []
                }
            },
            account: {
                isActive: true,
                isVerified: false,
                lastLogin: new Date()
            },
            social: {
                friends: [],
                blockedUsers: []
            },
            location: {},
            professional: {
                education: [],
                workplace: []
            },
            content: {
                generalWeightage: 0,
                professionalWeightage: 0
            }
        });

        // Generate access token and refresh token
        const accessToken = generateAccessToken({ id: user._id, email: user.profile.email });
        const { token: refreshToken, expiryDate: refreshTokenExpiry } = generateRefreshToken();

        // Get device info from request (optional)
        const deviceInfo = req.headers['user-agent'] || req.body.deviceInfo || 'Unknown Device';

        // Manage device limit - remove oldest device if limit is reached
        manageDeviceLimit(user);

        // Add new refresh token to array (allows multiple devices, max 5)
        user.auth.tokens.refreshTokens.push({
            token: refreshToken,
            expiresAt: refreshTokenExpiry,
            device: deviceInfo.substring(0, 200), // Limit length
            createdAt: new Date()
        });

        // Keep backward compatibility - set single token fields
        user.auth.refreshToken = refreshToken;
        user.auth.refreshTokenExpiry = refreshTokenExpiry;

        // Use findByIdAndUpdate to avoid pre-hook issues during signup
        await User.findByIdAndUpdate(
            user._id,
            {
                $set: {
                    'auth.tokens.refreshTokens': user.auth.tokens.refreshTokens,
                    'auth.refreshToken': refreshToken,
                    'auth.refreshTokenExpiry': refreshTokenExpiry
                }
            }
        );

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                accessToken,
                refreshToken,
                token: accessToken, // For backward compatibility
                user: {
                    id: user._id,
                    email: user.profile.email,
                    firstName: user.profile.name.first,
                    lastName: user.profile.name.last,
                    phoneNumber: user.profile.phoneNumbers.primary,
                    gender: user.profile.gender,
                    name: user.profile.name.full
                }
            }
        });

    } catch (error) {
        // Handle duplicate key errors with more specific messages
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern || {})[0] || 'field';
            const errorMessage = error.message || '';
            
            // Check if this is the specific null email duplicate error
            if (field.includes('email') || errorMessage.includes('email_1') || errorMessage.includes('dup key: { email: null }')) {
                return res.status(400).json({
                    success: false,
                    message: 'Database configuration error: Old email index detected. This needs to be fixed by running the database migration script.',
                    error: 'Duplicate email index conflict',
                    hint: 'Run "node fix-email-index.js" to fix the database indexes. This will remove the old email index and ensure the correct profile.email index is in place.',
                    technicalDetails: error.message
                });
            }
            
            if (field.includes('email')) {
                return res.status(400).json({
                    success: false,
                    message: 'Email is already registered. If you continue to see this error, there may be an old database index that needs to be removed.',
                    error: 'Duplicate email',
                    hint: 'Run "node fix-email-index.js" to fix the database indexes.'
                });
            }
            return res.status(400).json({
                success: false,
                message: `Duplicate key error on ${field}`,
                error: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Error in user signup',
            error: error.message
        });
    }
};

// User Login
const login = async (req, res) => {
    try {
        const { email, phoneNumber, password } = req.body;

        // Validate input - must have either email or phoneNumber, and password
        if ((!email && !phoneNumber) || !password) {
            return res.status(400).json({
                success: false,
                message: 'Either email or phone number, and password are required'
            });
        }

        // Find user by email or phone number
        // Support both old flat structure and new nested structure for backward compatibility
        let user;
        if (email) {
            const normalizedEmail = email.toLowerCase();
            console.log('🔍 Searching for user with email:', normalizedEmail);
            // Use $or to check both structures simultaneously - more reliable
            user = await User.findOne({
                $or: [
                    { 'profile.email': normalizedEmail },
                    { email: normalizedEmail }
                ]
            });
            console.log('   Query result:', user ? `Found (ID: ${user._id})` : 'Not found');
        } else if (phoneNumber) {
            console.log('🔍 Searching for user with phone:', phoneNumber);
            // Use $or to check both structures simultaneously - more reliable
            user = await User.findOne({
                $or: [
                    { 'profile.phoneNumbers.primary': phoneNumber },
                    { phoneNumber: phoneNumber }
                ]
            });
            console.log('   Query result:', user ? `Found (ID: ${user._id})` : 'Not found');
        }

        if (!user) {
            console.log('❌ User not found');
            return res.status(400).json({
                success: false,
                message: 'Invalid email/phone number or password'
            });
        }

        // Convert to plain object for reliable password access, but keep original document for saving
        // This ensures all nested fields are accessible even if Mongoose hasn't fully hydrated them
        const userObj = user.toObject ? user.toObject() : user;
        
        // Access password from plain object - support both old and new structure
        let userPassword = null;
        
        // Try new nested structure first
        if (userObj.auth && userObj.auth.password) {
            userPassword = userObj.auth.password;
            console.log('✅ Using password from: auth.password (new structure)');
        } 
        // Try old flat structure
        else if (userObj.password) {
            userPassword = userObj.password;
            console.log('✅ Using password from: password (old structure)');
        }
        // Fallback: try accessing directly from document (in case toObject() didn't include it)
        else if (user.auth && user.auth.password) {
            userPassword = user.auth.password;
            console.log('✅ Using password from: user.auth.password (direct access)');
        } else if (user.password) {
            userPassword = user.password;
            console.log('✅ Using password from: user.password (direct access)');
        }
        
        if (!userPassword) {
            console.log('❌ No password field found in user document');
            console.log('   User ID:', user._id);
            console.log('   Has auth object:', !!userObj.auth);
            console.log('   Has auth.password (obj):', !!(userObj.auth && userObj.auth.password));
            console.log('   Has password (obj):', !!userObj.password);
            console.log('   Has auth.password (doc):', !!(user.auth && user.auth.password));
            console.log('   Has password (doc):', !!user.password);
            
            // Check if this is an OAuth user (should not have password)
            if ((userObj.auth && userObj.auth.isGoogleOAuth) || (user.auth && user.auth.isGoogleOAuth)) {
                return res.status(400).json({
                    success: false,
                    message: 'This account uses Google Sign-In. Please use Google authentication instead.'
                });
            }
            
            return res.status(400).json({
                success: false,
                message: 'Invalid email/phone number or password'
            });
        }
        
        console.log('🔐 Comparing password...');
        const isPasswordValid = await bcrypt.compare(password, userPassword);
        console.log('   Password valid:', isPasswordValid);
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email/phone number or password'
            });
        }

        // Get user email - support both old and new structure (use userObj for reading)
        const userEmail = userObj.profile?.email || userObj.email || user.profile?.email || user.email;
        
        // Generate access token and refresh token
        const accessToken = generateAccessToken({ id: (userObj._id || userObj.id).toString(), email: userEmail });
        const { token: refreshToken, expiryDate: refreshTokenExpiry } = generateRefreshToken();

        // Get device info from request (optional)
        const deviceInfo = req.headers['user-agent'] || req.body.deviceInfo || 'Unknown Device';

        // Ensure auth structure exists for old users
        if (!user.auth) user.auth = {};
        if (!user.auth.tokens) user.auth.tokens = {};
        
        // Migrate old refreshTokens array to new structure if it exists
        if (Array.isArray(user.refreshTokens) && user.refreshTokens.length > 0 && !user.auth.tokens.refreshTokens) {
            user.auth.tokens.refreshTokens = user.refreshTokens.map(rt => ({
                token: rt.token || rt,
                expiresAt: rt.expiresAt || rt.expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
                device: rt.device || rt.deviceInfo || 'Unknown Device',
                createdAt: rt.createdAt || new Date()
            }));
        } else if (!user.auth.tokens.refreshTokens) {
            user.auth.tokens.refreshTokens = [];
        }

        // Manage device limit - remove oldest device if limit is reached
        manageDeviceLimit(user);

        // Add new refresh token to array (allows multiple devices, max 5)
        user.auth.tokens.refreshTokens.push({
            token: refreshToken,
            expiresAt: refreshTokenExpiry,
            device: deviceInfo.substring(0, 200), // Limit length
            createdAt: new Date()
        });

        // Keep backward compatibility - set single token fields in both old and new structures
        user.auth.refreshToken = refreshToken;
        user.auth.refreshTokenExpiry = refreshTokenExpiry;
        // Also update old flat structure for backward compatibility
        user.refreshToken = refreshToken;
        user.refreshTokenExpiry = refreshTokenExpiry;

        // Update user with new tokens and last login using findByIdAndUpdate to avoid pre-hook issues
        await User.findByIdAndUpdate(
            user._id,
            {
                $set: {
                    'auth.tokens.refreshTokens': user.auth.tokens.refreshTokens,
                    'auth.refreshToken': refreshToken,
                    'auth.refreshTokenExpiry': refreshTokenExpiry,
                    'refreshToken': refreshToken,
                    'refreshTokenExpiry': refreshTokenExpiry,
                    'account.lastLogin': new Date()
                }
            },
            { new: true }
        );

        // Get user data - support both old and new structure
        const userData = {
            id: user._id,
            email: user.profile?.email || user.email,
            firstName: user.profile?.name?.first || user.firstName,
            lastName: user.profile?.name?.last || user.lastName,
            phoneNumber: user.profile?.phoneNumbers?.primary || user.phoneNumber,
            gender: user.profile?.gender || user.gender,
            name: user.profile?.name?.full || user.name || `${user.profile?.name?.first || user.firstName} ${user.profile?.name?.last || user.lastName}`.trim(),
            profileImage: user.profile?.profileImage || user.profileImage
        };

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                accessToken,
                refreshToken,
                token: accessToken, // For backward compatibility
                user: userData
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        // Only send response if headers haven't been sent
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'Error in user login',
                error: error.message
            });
        }
    }
};

// Forgot Password - Send OTP (accepts email or phone)
const sendOTPForPasswordReset = async (req, res) => {
    try {
        const { email, phone } = req.body;

        // Must provide either email or phone
        if (!email && !phone) {
            return res.status(400).json({
                success: false,
                message: 'Either email or phone number is required'
            });
        }

        // Find user by email or phone (check if user exists first)
        let user;
        if (email) {
            // Normalize email to lowercase
            const normalizedEmail = email.toLowerCase().trim();
            user = await User.findOne({ 'profile.email': normalizedEmail });
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found with this email address'
                });
            }
        } else if (phone) {
            // Normalize phone number for consistent lookup
            let normalizedPhone = phone.replace(/[\s\-\(\)]/g, '').trim();
            if (!normalizedPhone.startsWith('+')) {
                normalizedPhone = '+' + normalizedPhone;
            }
            
            // Try multiple variations to find the user
            const phoneVariations = [
                normalizedPhone,                    // +917300685040
                phone.trim(),                       // Original format
                normalizedPhone.replace('+', ''),   // Without +
                phone.replace(/[\s\-\(\)]/g, ''),  // Without spaces/dashes
            ];
            
            // Try each variation
            for (const phoneVar of phoneVariations) {
                user = await User.findOne({ 'profile.phoneNumbers.primary': phoneVar });
                if (user) {
                    console.log(`✅ Found user with phone variation: ${phoneVar}`);
                    break;
                }
            }
            
            // If still not found, try regex search (for partial matches in development)
            if (!user && process.env.NODE_ENV === 'development') {
                // Try to find users with similar phone numbers for debugging
                const phoneDigits = normalizedPhone.replace(/\D/g, '');
                if (phoneDigits.length >= 10) {
                    const last10Digits = phoneDigits.slice(-10);
                    const users = await User.find({
                        'profile.phoneNumbers.primary': { $regex: last10Digits }
                    }).limit(5);
                    
                    if (users.length > 0) {
                        console.log(`🔍 Found ${users.length} user(s) with similar phone numbers:`);
                        users.forEach(u => console.log(`   - ${u.profile?.phoneNumbers?.primary} (${u.profile?.email})`));
                    }
                }
            }
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found with this phone number',
                    hint: 'Please verify the phone number is correct, or try using your email address instead',
                    suggestion: 'You can use email instead: POST /api/auth/forgot-password/send-otp with {"email": "your@email.com"}'
                });
            }
        }

        // If email provided, send OTP via email
        if (email) {
            const { createOTPRecord } = require('../../services/otpService');
            const emailService = require('../../services/emailService');
            
            // Check if email service is configured
            if (!emailService.transporter) {
                return res.status(503).json({
                    success: false,
                    message: 'Email service is not configured',
                    hint: 'Please configure EMAIL_USER and EMAIL_PASSWORD in your .env file. For Gmail, use an App Password (not your regular password).'
                });
            }
            
            // Create OTP record (using 'password_reset' as userType)
            const { otpRecord, plainOTP } = await createOTPRecord(email.toLowerCase(), 'password_reset');
            
            // Send email
            const emailSent = await emailService.sendOTPEmail(email.toLowerCase(), plainOTP);
            
            if (!emailSent) {
                return res.status(503).json({
                    success: false,
                    message: 'Failed to send OTP email',
                    hint: 'Check server logs for details. For Gmail: Ensure you are using an App Password and 2-Step Verification is enabled.'
                });
            }

            return res.status(200).json({
                success: true,
                message: 'OTP sent successfully to your email',
                data: {
                    email: email.toLowerCase(),
                    expiresAt: otpRecord.expiresAt
                }
            });
        }

        // If phone provided, send OTP via Twilio (user already verified above)
        if (phone) {
            const twilio = require('twilio');
            
            // Check if Twilio is configured
            if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) {
                return res.status(500).json({
                    success: false,
                    message: 'Twilio is not configured for phone OTP'
                });
            }

            const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            const twilioServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

            // Normalize phone number (already normalized above, but ensure consistency)
            let normalizedPhone = phone.replace(/[\s\-\(\)]/g, '');
            if (!normalizedPhone.startsWith('+')) {
                normalizedPhone = '+' + normalizedPhone;
            }

            // Create verification via Twilio Verify v2 (only if user exists)
            console.log('📱 Using Twilio Verify v2 API to send OTP');
            const verification = await twilioClient.verify.v2.services(twilioServiceSid)
                .verifications
                .create({ to: normalizedPhone, channel: 'sms' });

            return res.status(200).json({
                success: true,
                message: 'OTP sent successfully to your phone',
                data: {
                    phone: normalizedPhone,
                    sid: verification.sid,
                    status: verification.status
                }
            });
        }

    } catch (error) {
        console.error('Send OTP for password reset error:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending OTP',
            error: error.message
        });
    }
};

// Forgot Password - Verify OTP
const verifyOTPForPasswordReset = async (req, res) => {
    try {
        const { email, phone, otp } = req.body;

        // Must provide either email or phone, and OTP
        if ((!email && !phone) || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Either email or phone number, and OTP code are required'
            });
        }

        let user;
        let verificationResult = { valid: false };

        // If email provided, verify using email OTP service
        if (email) {
            user = await User.findOne({ 'profile.email': email.toLowerCase() });
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found with this email'
                });
            }

            const { validateOTP } = require('../../services/otpService');
            verificationResult = await validateOTP(email.toLowerCase(), 'password_reset', otp);
        }

        // If phone provided, verify using Twilio
        if (phone) {
            // Normalize phone number for consistent lookup
            let normalizedPhoneForLookup = phone.replace(/[\s\-\(\)]/g, '').trim();
            if (!normalizedPhoneForLookup.startsWith('+')) {
                normalizedPhoneForLookup = '+' + normalizedPhoneForLookup;
            }
            
            // Try multiple variations to find the user
            const phoneVariations = [
                normalizedPhoneForLookup,
                phone.trim(),
                normalizedPhoneForLookup.replace('+', ''),
                phone.replace(/[\s\-\(\)]/g, ''),
            ];
            
            // Try each variation
            for (const phoneVar of phoneVariations) {
                user = await User.findOne({ 'profile.phoneNumbers.primary': phoneVar });
                if (user) {
                    break;
                }
            }
            
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found with this phone number',
                    hint: 'Please verify the phone number is correct, or try using your email address instead'
                });
            }

            const twilio = require('twilio');
            
            if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) {
                return res.status(500).json({
                    success: false,
                    message: 'Twilio is not configured'
                });
            }

            const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            const twilioServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

            // Use the normalized phone for Twilio (already normalized above)
            const normalizedPhone = normalizedPhoneForLookup;

            // Verify with Twilio v2
            console.log('✅ Using Twilio Verify v2 API to verify OTP');
            const check = await twilioClient.verify.v2.services(twilioServiceSid)
                .verificationChecks
                .create({ to: normalizedPhone, code: otp });

            verificationResult.valid = (check.status === 'approved');
            if (!verificationResult.valid) {
                verificationResult.message = 'Invalid or expired code';
            }
        }

        // Check verification result
        if (!verificationResult.valid) {
            return res.status(400).json({
                success: false,
                message: verificationResult.message || 'Invalid or expired OTP',
                remainingAttempts: verificationResult.remainingAttempts
            });
        }

        // Create verification token for password reset (valid for 15 minutes)
        const jwt = require('jsonwebtoken');
        const verificationToken = jwt.sign(
            {
                userId: user._id,
                email: user.profile.email,
                phoneNumber: user.profile.phoneNumbers.primary,
                purpose: 'password_reset'
            },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        res.status(200).json({
            success: true,
            message: 'OTP verified successfully. You can now reset your password.',
            data: {
                verificationToken,
                email: user.profile.email
            }
        });

    } catch (error) {
        console.error('Verify OTP for password reset error:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying OTP',
            error: error.message
        });
    }
};

// Forgot Password - Reset Password
const resetPassword = async (req, res) => {
    try {
        const { verificationToken, password, confirmPassword } = req.body;

        // Validate input
        if (!verificationToken || !password || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Verification token, password, and confirm password are required'
            });
        }

        // Validate password length
        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters long'
            });
        }

        // Validate password match
        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Password and confirm password do not match'
            });
        }

        // Verify the verification token
        const jwt = require('jsonwebtoken');
        let decoded;
        try {
            decoded = jwt.verify(verificationToken, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired verification token. Please request a new OTP.'
            });
        }

        // Check if token is for password reset
        if (decoded.purpose !== 'password_reset') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token purpose'
            });
        }

        // Find user
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update password
        if (!user.auth) user.auth = {};
        user.auth.password = hashedPassword;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password reset successfully. You can now login with your new password.'
        });

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Error resetting password',
            error: error.message
        });
    }
};

// Get Current User Profile
const getProfile = async (req, res) => {
    try {
        // User is already attached to req.user by the protect middleware
        const user = req.user;

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Populate company and institution data
        await user.populate('professional.workplace.company', 'name isCustom');
        await user.populate('professional.education.institution', 'name type city country logo verified isCustom');

        // Format workplace to include company name
        const formattedWorkplace = (user.professional?.workplace || []).map(work => ({
            company: work.company ? {
                id: work.company._id,
                name: work.company.name,
                isCustom: work.company.isCustom
            } : null,
            position: work.position,
            startDate: work.startDate,
            endDate: work.endDate,
            isCurrent: work.isCurrent
        }));

        // Format education to include institution details
        const formattedEducation = (user.professional?.education || []).map(edu => ({
            institution: edu.institution ? {
                id: edu.institution._id,
                name: edu.institution.name,
                type: edu.institution.type,
                city: edu.institution.city,
                country: edu.institution.country,
                logo: edu.institution.logo,
                verified: edu.institution.verified,
                isCustom: edu.institution.isCustom
            } : null,
            degree: edu.degree,
            field: edu.field,
            startYear: edu.startYear,
            endYear: edu.endYear
        }));

        // Get number of friends
        const numberOfFriends = user.social?.friends ? user.social.friends.length : 0;

        // IMPORTANT: Do NOT expose auth data in profile API
        res.status(200).json({
            success: true,
            message: 'User profile retrieved successfully',
            data: {
                user: {
                    id: user._id,
                    // Profile section
                    profile: {
                        name: {
                            first: user.profile?.name?.first,
                            last: user.profile?.name?.last,
                            full: user.profile?.name?.full
                        },
                        email: user.profile?.email,
                        phoneNumbers: {
                            primary: user.profile?.phoneNumbers?.primary,
                            alternate: user.profile?.phoneNumbers?.alternate
                        },
                        gender: user.profile?.gender,
                        pronouns: user.profile?.pronouns,
                        dob: user.profile?.dob,
                        bio: user.profile?.bio,
                        profileImage: user.profile?.profileImage,
                        coverPhoto: user.profile?.coverPhoto
                    },
                    // Location section
                    location: {
                        currentCity: user.location?.currentCity,
                        hometown: user.location?.hometown
                    },
                    // Social section
                    social: {
                        numberOfFriends: numberOfFriends,
                        relationshipStatus: user.social?.relationshipStatus
                    },
                    // Professional section
                    professional: {
                        workplace: formattedWorkplace,
                        education: formattedEducation
                    },
                    // Content section
                    content: {
                        generalWeightage: user.content?.generalWeightage || 0,
                        professionalWeightage: user.content?.professionalWeightage || 0
                    },
                    // Account metadata (no sensitive data)
                    account: {
                        createdAt: user.createdAt,
                        updatedAt: user.updatedAt,
                        isActive: user.account?.isActive,
                        isVerified: user.account?.isVerified,
                        lastLogin: user.account?.lastLogin
                    }
                }
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching user profile',
            error: error.message
        });
    }
};

// Refresh Access Token
const refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message: 'Refresh token is required'
            });
        }

        // Find user by refresh token (check all possible structures)
        // Support: auth.refreshToken, auth.tokens.refreshToken, auth.tokens.refreshTokens[], refreshToken (old), refreshTokens[] (old)
        let user = await User.findOne({ 'auth.refreshToken': refreshToken });
        
        // If not found, check auth.tokens.refreshToken (singular in tokens object)
        if (!user) {
            user = await User.findOne({ 'auth.tokens.refreshToken': refreshToken });
        }
        
        // If not found, check old flat structure
        if (!user) {
            user = await User.findOne({ refreshToken: refreshToken });
        }
        
        // If not found, check refreshTokens array (new structure)
        if (!user) {
            user = await User.findOne({ 'auth.tokens.refreshTokens.token': refreshToken });
        }
        
        // If not found, check old flat refreshTokens array
        if (!user) {
            // Try to find user by searching in old refreshTokens array
            const users = await User.find({ refreshTokens: { $exists: true } });
            user = users.find(u => {
                if (Array.isArray(u.refreshTokens)) {
                    return u.refreshTokens.some(rt => (rt.token || rt) === refreshToken);
                }
                return false;
            });
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        // Check if token exists - support all structures
        let tokenRecord = null;
        if (user.auth?.tokens?.refreshTokens && Array.isArray(user.auth.tokens.refreshTokens)) {
            // New nested structure - array
            tokenRecord = user.auth.tokens.refreshTokens.find(rt => rt.token === refreshToken);
        } else if (Array.isArray(user.refreshTokens)) {
            // Old flat structure - array
            tokenRecord = user.refreshTokens.find(rt => (rt.token || rt) === refreshToken);
        }

        // Check all possible single token fields
        const singleToken = user.auth?.refreshToken || 
                           user.auth?.tokens?.refreshToken || 
                           user.refreshToken;
        
        if (!tokenRecord && singleToken === refreshToken) {
            // Token found in single field - it's valid (no expiry check)
            // Note: We no longer check expiry date - tokens only expire on explicit logout
        } else if (tokenRecord) {
            // Token found in array - it's valid (no expiry check)
            // Tokens only expire when user explicitly logs out
        } else {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        // Generate new access token - support both old and new structure
        const userEmail = user.profile?.email || user.email;
        const accessToken = generateAccessToken({ id: user._id, email: userEmail });

        res.status(200).json({
            success: true,
            message: 'Access token refreshed successfully',
            data: {
                accessToken
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error refreshing token',
            error: error.message
        });
    }
};

// Logout (Invalidate Refresh Token)
const logout = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { refreshToken, deviceId } = req.body; // Optional: specific token or device ID to logout

        let loggedOutDevice = null;
        let remainingDevices = 0;

        // Ensure auth structure exists
        if (!user.auth) user.auth = {};
        if (!user.auth.tokens) user.auth.tokens = {};
        if (!user.auth.tokens.refreshTokens) user.auth.tokens.refreshTokens = [];

        if (refreshToken || deviceId) {
            // Remove specific refresh token from array
            if (user.auth.tokens.refreshTokens && Array.isArray(user.auth.tokens.refreshTokens)) {
                const beforeCount = user.auth.tokens.refreshTokens.length;
                
                // Find device info before removing
                if (refreshToken) {
                    const deviceToLogout = user.auth.tokens.refreshTokens.find(rt => rt.token === refreshToken);
                    if (deviceToLogout) {
                        loggedOutDevice = parseDeviceInfo(deviceToLogout.device);
                    }
                } else if (deviceId) {
                    // deviceId is 1-based index from getDevices response
                    const deviceIndex = parseInt(deviceId) - 1;
                    if (deviceIndex >= 0 && deviceIndex < user.auth.tokens.refreshTokens.length) {
                        // Sort tokens by createdAt to match getDevices order
                        const sortedTokens = [...user.auth.tokens.refreshTokens].sort((a, b) => 
                            new Date(b.createdAt) - new Date(a.createdAt)
                        );
                        const deviceToLogout = sortedTokens[deviceIndex];
                        if (deviceToLogout) {
                            loggedOutDevice = parseDeviceInfo(deviceToLogout.device);
                            // Remove the actual token from array
                            user.auth.tokens.refreshTokens = user.auth.tokens.refreshTokens.filter(
                                rt => rt.token !== deviceToLogout.token
                            );
                        }
                    }
                } else {
                    // Remove by refreshToken
                    user.auth.tokens.refreshTokens = user.auth.tokens.refreshTokens.filter(
                        rt => rt.token !== refreshToken
                    );
                }
                
                remainingDevices = user.auth.tokens.refreshTokens.length;
            }
            
            // Also clear single token if it matches
            if (user.auth.refreshToken === refreshToken) {
                if (!loggedOutDevice) {
                    loggedOutDevice = {
                        deviceName: 'Legacy Device',
                        deviceType: 'Unknown',
                        browser: 'Unknown',
                        os: 'Unknown'
                    };
                }
                user.auth.refreshToken = null;
                user.auth.refreshTokenExpiry = null;
            }
        } else {
            // If no specific token provided, clear all tokens (logout from all devices)
            const totalDevices = (user.auth.tokens.refreshTokens?.length || 0) + (user.auth.refreshToken ? 1 : 0);
            user.auth.refreshToken = null;
            user.auth.refreshTokenExpiry = null;
            user.auth.tokens.refreshTokens = [];
            remainingDevices = 0;
        }

        await user.save();

        const response = {
            success: true,
            message: refreshToken || deviceId 
                ? 'Logged out successfully from this device' 
                : 'Logged out successfully from all devices',
            data: {
                remainingDevices
            }
        };

        if (loggedOutDevice) {
            response.data.loggedOutDevice = loggedOutDevice;
        }

        res.status(200).json(response);

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error logging out',
            error: error.message
        });
    }
};

// Update User Profile
const updateProfile = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { firstName, lastName, phoneNumber, gender, dob, alternatePhoneNumber, profileImage, age, bio, currentCity, hometown, relationshipStatus, workplace, education } = req.body;

        // List of allowed fields to update (using nested structure)
        const allowedUpdates = {};
        
        // Ensure nested structures exist
        if (!user.profile) user.profile = {};
        if (!user.profile.name) user.profile.name = {};
        if (!user.profile.phoneNumbers) user.profile.phoneNumbers = {};
        if (!user.location) user.location = {};
        if (!user.social) user.social = {};
        if (!user.professional) user.professional = {};
        
        if (firstName !== undefined) {
            allowedUpdates['profile.name.first'] = firstName;
        }
        if (lastName !== undefined) {
            allowedUpdates['profile.name.last'] = lastName;
        }
        if (phoneNumber !== undefined) {
            // Normalize phone number
            let normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
            if (!normalizedPhone.startsWith('+')) {
                normalizedPhone = '+' + normalizedPhone;
            }
            
            // Check if phone number is already taken by another user
            const existingPhoneUser = await User.findOne({ 
                'profile.phoneNumbers.primary': normalizedPhone,
                _id: { $ne: user._id } // Exclude current user
            });
            
            if (existingPhoneUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Phone number is already registered to another account'
                });
            }
            
            allowedUpdates['profile.phoneNumbers.primary'] = normalizedPhone;
        }
        if (gender !== undefined) {
            // Validate gender
            const validGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];
            if (!validGenders.includes(gender)) {
                return res.status(400).json({
                    success: false,
                    message: 'Gender must be one of: Male, Female, Other, Prefer not to say'
                });
            }
            allowedUpdates['profile.gender'] = gender;
        }
        if (dob !== undefined) {
            allowedUpdates['profile.dob'] = dob;
        }
        if (alternatePhoneNumber !== undefined) {
            // Normalize alternate phone number
            let normalizedAltPhone = alternatePhoneNumber.replace(/[\s\-\(\)]/g, '');
            if (!normalizedAltPhone.startsWith('+')) {
                normalizedAltPhone = '+' + normalizedAltPhone;
            }
            allowedUpdates['profile.phoneNumbers.alternate'] = normalizedAltPhone;
        }
        if (profileImage !== undefined) {
            allowedUpdates['profile.profileImage'] = profileImage;
        }
        
        // Handle age field - convert to dob if provided
        if (age !== undefined) {
            if (typeof age !== 'number' || age < 0 || age > 150) {
                return res.status(400).json({
                    success: false,
                    message: 'Age must be a valid number between 0 and 150'
                });
            }
            // Calculate date of birth from age
            const today = new Date();
            const birthYear = today.getFullYear() - age;
            allowedUpdates['profile.dob'] = new Date(birthYear, today.getMonth(), today.getDate());
        }

        // Handle bio
        if (bio !== undefined) {
            allowedUpdates['profile.bio'] = bio.trim();
        }

        // Handle currentCity
        if (currentCity !== undefined) {
            allowedUpdates['location.currentCity'] = currentCity.trim();
        }

        // Handle hometown
        if (hometown !== undefined) {
            allowedUpdates['location.hometown'] = hometown.trim();
        }

        // Handle relationshipStatus (optional field)
        if (relationshipStatus !== undefined) {
            if (relationshipStatus === null || relationshipStatus === '') {
                // Allow explicitly setting to null/empty to clear the field
                allowedUpdates['social.relationshipStatus'] = null;
            } else {
                const validStatuses = ['Single', 'In a relationship', 'Engaged', 'Married', 'In a civil partnership', 'In a domestic partnership', 'In an open relationship', "It's complicated", 'Separated', 'Divorced', 'Widowed'];
                if (!validStatuses.includes(relationshipStatus)) {
                    return res.status(400).json({
                        success: false,
                        message: `Relationship status must be one of: ${validStatuses.join(', ')}`
                    });
                }
                allowedUpdates['social.relationshipStatus'] = relationshipStatus;
            }
        }

        // Handle workplace (array of work experiences)
        if (workplace !== undefined) {
            if (!Array.isArray(workplace)) {
                return res.status(400).json({
                    success: false,
                    message: 'Workplace must be an array'
                });
            }
            // Validate each workplace entry and ensure companies exist
            const processedWorkplace = [];
            for (const work of workplace) {
                if (!work.company || !work.position || !work.startDate) {
                    return res.status(400).json({
                        success: false,
                        message: 'Each workplace entry must have company, position, and startDate'
                    });
                }
                if (work.startDate && isNaN(new Date(work.startDate).getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid startDate format'
                    });
                }
                if (work.endDate && isNaN(new Date(work.endDate).getTime())) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid endDate format'
                    });
                }

                // Ensure company exists in Company collection
                // Handle both company name (string) and company ID (ObjectId)
                let company;
                
                if (mongoose.Types.ObjectId.isValid(work.company)) {
                    // If it's a valid ObjectId, find the company by ID
                    company = await Company.findById(work.company);
                    if (!company) {
                        return res.status(400).json({
                            success: false,
                            message: `Company with ID ${work.company} not found`
                        });
                    }
                } else {
                    // If it's a string (company name), find or create the company
                    const companyName = String(work.company).trim();
                    if (!companyName) {
                        return res.status(400).json({
                            success: false,
                            message: 'Company name cannot be empty'
                        });
                    }
                    const normalizedCompanyName = companyName.toLowerCase();
                    
                    company = await Company.findOne({
                        $or: [
                            { name: companyName },
                            { normalizedName: normalizedCompanyName }
                        ]
                    });

                    // If company doesn't exist, create it
                    if (!company) {
                        try {
                            company = await Company.create({
                                name: companyName,
                                normalizedName: normalizedCompanyName,
                                isCustom: true,
                                createdBy: user._id
                            });
                            console.log(`✅ Created new company: ${companyName}`);
                        } catch (error) {
                            // Handle race condition - company might have been created by another request
                            if (error.code === 11000) {
                                company = await Company.findOne({
                                    $or: [
                                        { name: companyName },
                                        { normalizedName: normalizedCompanyName }
                                    ]
                                });
                            } else {
                                throw error;
                            }
                        }
                    }
                }

                // Convert dates to Date objects
                const processedWork = {
                    company: company._id, // Store company ObjectID reference
                    position: work.position,
                    description: work.description ? work.description.trim() : '',
                    startDate: new Date(work.startDate),
                    endDate: work.endDate ? new Date(work.endDate) : null,
                    isCurrent: work.isCurrent || false
                };
                processedWorkplace.push(processedWork);
            }
            allowedUpdates['professional.workplace'] = processedWorkplace;
        }

        // Handle education (array of education entries)
        if (education !== undefined) {
            if (!Array.isArray(education)) {
                return res.status(400).json({
                    success: false,
                    message: 'Education must be an array'
                });
            }
            // Validate each education entry and ensure institutions exist (if provided)
            const processedEducation = [];
            for (const edu of education) {
                // Skip validation if institution or startYear are not provided (education is optional)
                if (!edu.institution || !edu.startYear) {
                    // Allow partial education entries - skip this entry if institution or startYear missing
                    continue;
                }
                
                if (isNaN(parseInt(edu.startYear)) || parseInt(edu.startYear) < 1900 || parseInt(edu.startYear) > new Date().getFullYear() + 10) {
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid startYear format (must be a valid year)'
                    });
                }
                if (edu.endYear && (isNaN(parseInt(edu.endYear)) || parseInt(edu.endYear) < 1900 || parseInt(edu.endYear) > new Date().getFullYear() + 10)) {
                            return res.status(400).json({
                                success: false,
                        message: 'Invalid endYear format (must be a valid year)'
                    });
                }

                // Handle institution - can be ObjectId (string) or institution name (string)
                let institution;
                if (mongoose.Types.ObjectId.isValid(edu.institution)) {
                    // It's an ObjectId - find by ID
                    institution = await Institution.findById(edu.institution);
                    if (!institution) {
                            return res.status(400).json({
                                success: false,
                            message: `Institution with ID ${edu.institution} not found`
                        });
                    }
                } else {
                    // It's a name - find or create institution
                    const institutionName = edu.institution.trim();
                    const normalizedInstitutionName = institutionName.toLowerCase();
                    
                    institution = await Institution.findOne({
                        $or: [
                            { name: institutionName },
                            { normalizedName: normalizedInstitutionName }
                        ]
                    });

                    // If institution doesn't exist, create it
                    if (!institution) {
                        try {
                            // Determine type from context or default to 'school'
                            const institutionType = edu.institutionType || 'school';
                            institution = await Institution.create({
                                name: institutionName,
                                normalizedName: normalizedInstitutionName,
                                type: ['school', 'college', 'university', 'others'].includes(institutionType) ? institutionType : 'school',
                                city: edu.city || '',
                                country: edu.country || '',
                                logo: edu.logo || '',
                                verified: false,
                                isCustom: true,
                                createdBy: user._id
                            });
                            console.log(`✅ Created new institution: ${institutionName}`);
                        } catch (error) {
                            // Handle race condition - institution might have been created by another request
                            if (error.code === 11000) {
                                institution = await Institution.findOne({
                                    $or: [
                                        { name: institutionName },
                                        { normalizedName: normalizedInstitutionName }
                                    ]
                                });
                            } else {
                                throw error;
                            }
                        }
                    }
                }

                // Validate startMonth if provided
                if (edu.startMonth !== undefined) {
                    const startMonth = parseInt(edu.startMonth);
                    if (isNaN(startMonth) || startMonth < 1 || startMonth > 12) {
                        return res.status(400).json({
                            success: false,
                            message: 'Invalid startMonth (must be between 1 and 12)'
                        });
                    }
                }

                // Validate endMonth if provided
                if (edu.endMonth !== undefined && edu.endMonth !== null) {
                    const endMonth = parseInt(edu.endMonth);
                    if (isNaN(endMonth) || endMonth < 1 || endMonth > 12) {
                        return res.status(400).json({
                            success: false,
                            message: 'Invalid endMonth (must be between 1 and 12)'
                        });
                    }
                }

                // Validate institutionType if provided
                if (edu.institutionType !== undefined) {
                    const validTypes = ['school', 'college', 'university', 'others'];
                    if (!validTypes.includes(edu.institutionType)) {
                        return res.status(400).json({
                            success: false,
                            message: `Institution type must be one of: ${validTypes.join(', ')}`
                        });
                    }
                }

                // Validate CGPA if provided
                if (edu.cgpa !== undefined && edu.cgpa !== null) {
                    const cgpa = parseFloat(edu.cgpa);
                    if (isNaN(cgpa) || cgpa < 0 || cgpa > 10) {
                        return res.status(400).json({
                            success: false,
                            message: 'Invalid CGPA (must be between 0 and 10)'
                        });
                    }
                }

                // Validate percentage if provided
                if (edu.percentage !== undefined && edu.percentage !== null) {
                    const percentage = parseFloat(edu.percentage);
                    if (isNaN(percentage) || percentage < 0 || percentage > 100) {
                        return res.status(400).json({
                            success: false,
                            message: 'Invalid percentage (must be between 0 and 100)'
                        });
                    }
                }

                // Process education entry
                const processedEdu = {
                    institution: institution._id, // Store institution ObjectID reference
                    description: edu.description ? edu.description.trim() : '',
                    degree: edu.degree || '',
                    field: edu.field || '',
                    institutionType: edu.institutionType || 'school',
                    startMonth: edu.startMonth ? parseInt(edu.startMonth) : undefined,
                    startYear: parseInt(edu.startYear),
                    endMonth: edu.endMonth ? parseInt(edu.endMonth) : null,
                    endYear: edu.endYear ? parseInt(edu.endYear) : null,
                    cgpa: edu.cgpa !== undefined && edu.cgpa !== null ? parseFloat(edu.cgpa) : null,
                    percentage: edu.percentage !== undefined && edu.percentage !== null ? parseFloat(edu.percentage) : null
                };
                processedEducation.push(processedEdu);
            }
            allowedUpdates['professional.education'] = processedEducation;
        }

        // Update name.full field if firstName or lastName changed
        if (firstName !== undefined || lastName !== undefined) {
            const updatedFirstName = firstName !== undefined ? firstName : (user.profile?.name?.first || '');
            const updatedLastName = lastName !== undefined ? lastName : (user.profile?.name?.last || '');
            allowedUpdates['profile.name.full'] = `${updatedFirstName} ${updatedLastName}`.trim();
        }

        // Check if there are any updates
        if (Object.keys(allowedUpdates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }

        // Update user using MongoDB $set for nested paths
        await User.findByIdAndUpdate(user._id, { $set: allowedUpdates }, { new: true, runValidators: true });
        
        // Reload user to get updated data
        const updatedUser = await User.findById(user._id);
        await updatedUser.populate('professional.workplace.company', 'name isCustom');
        await updatedUser.populate('professional.education.institution', 'name type city country logo verified isCustom');

        // Format workplace to include company name
        const formattedWorkplace = (updatedUser.professional?.workplace || []).map(work => ({
            company: work.company ? {
                id: work.company._id,
                name: work.company.name,
                isCustom: work.company.isCustom
            } : null,
            position: work.position,
            startDate: work.startDate,
            endDate: work.endDate,
            isCurrent: work.isCurrent
        }));

        // Format education to include institution details
        const formattedEducation = (updatedUser.professional?.education || []).map(edu => ({
            institution: edu.institution ? {
                id: edu.institution._id,
                name: edu.institution.name,
                type: edu.institution.type,
                city: edu.institution.city,
                country: edu.institution.country,
                logo: edu.institution.logo,
                verified: edu.institution.verified,
                isCustom: edu.institution.isCustom
            } : null,
            description: edu.description,
            degree: edu.degree,
            field: edu.field,
            institutionType: edu.institutionType,
            startMonth: edu.startMonth,
            startYear: edu.startYear,
            endMonth: edu.endMonth,
            endYear: edu.endYear,
            cgpa: edu.cgpa,
            percentage: edu.percentage
        }));

        // IMPORTANT: Do NOT expose auth data in profile API
        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                user: {
                    id: updatedUser._id,
                    // Profile section
                    profile: {
                        name: {
                            first: updatedUser.profile?.name?.first,
                            last: updatedUser.profile?.name?.last,
                            full: updatedUser.profile?.name?.full
                        },
                        email: updatedUser.profile?.email,
                        phoneNumbers: {
                            primary: updatedUser.profile?.phoneNumbers?.primary,
                            alternate: updatedUser.profile?.phoneNumbers?.alternate
                        },
                        gender: updatedUser.profile?.gender,
                        pronouns: updatedUser.profile?.pronouns,
                        dob: updatedUser.profile?.dob,
                        bio: updatedUser.profile?.bio,
                        profileImage: updatedUser.profile?.profileImage,
                        coverPhoto: updatedUser.profile?.coverPhoto
                    },
                    // Location section
                    location: {
                        currentCity: updatedUser.location?.currentCity,
                        hometown: updatedUser.location?.hometown
                    },
                    // Social section
                    social: {
                        relationshipStatus: updatedUser.social?.relationshipStatus
                    },
                    // Professional section
                    professional: {
                        workplace: formattedWorkplace,
                        education: formattedEducation
                    },
                    // Account metadata (no sensitive data)
                    account: {
                        createdAt: updatedUser.createdAt,
                        updatedAt: updatedUser.updatedAt
                    }
                }
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating profile',
            error: error.message
        });
    }
};

// Helper function to parse user agent and extract device info
const parseDeviceInfo = (userAgent) => {
    if (!userAgent || userAgent === 'Unknown Device') {
        return {
            deviceName: 'Unknown Device',
            deviceType: 'Unknown',
            browser: 'Unknown',
            os: 'Unknown',
            raw: userAgent || 'Unknown Device'
        };
    }

    const ua = userAgent.toLowerCase();
    
    // Detect device type
    let deviceType = 'Desktop';
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone') || ua.includes('ipad')) {
        deviceType = 'Mobile';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
        deviceType = 'Tablet';
    }

    // Detect browser
    let browser = 'Unknown';
    if (ua.includes('chrome') && !ua.includes('edg')) {
        browser = 'Chrome';
    } else if (ua.includes('firefox')) {
        browser = 'Firefox';
    } else if (ua.includes('safari') && !ua.includes('chrome')) {
        browser = 'Safari';
    } else if (ua.includes('edg')) {
        browser = 'Edge';
    } else if (ua.includes('opera') || ua.includes('opr')) {
        browser = 'Opera';
    }

    // Detect OS
    let os = 'Unknown';
    if (ua.includes('windows')) {
        os = 'Windows';
    } else if (ua.includes('mac os') || ua.includes('macos')) {
        os = 'macOS';
    } else if (ua.includes('linux')) {
        os = 'Linux';
    } else if (ua.includes('android')) {
        os = 'Android';
    } else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) {
        os = 'iOS';
    }

    // Create device name
    let deviceName = `${os} - ${browser}`;
    if (deviceType !== 'Desktop') {
        deviceName = `${deviceType} (${os}) - ${browser}`;
    }

    return {
        deviceName,
        deviceType,
        browser,
        os,
        raw: userAgent
    };
};

// Get all logged-in devices for the current user
const getDevices = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        
        // Get current refresh token from request (if available) to identify current device
        let currentRefreshToken = null;
        if (req.body.refreshToken) {
            currentRefreshToken = req.body.refreshToken;
        } else if (req.headers['x-refresh-token']) {
            currentRefreshToken = req.headers['x-refresh-token'];
        }

        // Get all refresh tokens (devices)
        const devices = [];
        
        // Check refreshTokens array
        if (user.auth?.tokens?.refreshTokens && Array.isArray(user.auth.tokens.refreshTokens)) {
            user.auth.tokens.refreshTokens.forEach((tokenRecord) => {
                const parsedInfo = parseDeviceInfo(tokenRecord.device);
                devices.push({
                    deviceInfo: parsedInfo,
                    loggedInAt: tokenRecord.createdAt || new Date(),
                    isCurrentDevice: currentRefreshToken ? tokenRecord.token === currentRefreshToken : false,
                    // Don't expose the actual token for security, but include a hash for identification
                    tokenId: tokenRecord.token ? tokenRecord.token.substring(0, 16) : null
                });
            });
        }
        
        // Also check single refreshToken field for backward compatibility
        if (user.auth?.refreshToken) {
            const tokenPreview = user.auth.refreshToken.substring(0, 16);
            const alreadyIncluded = devices.some(d => d.tokenId === tokenPreview);
            
            if (!alreadyIncluded) {
                devices.push({
                    deviceInfo: {
                        deviceName: 'Legacy Device',
                        deviceType: 'Unknown',
                        browser: 'Unknown',
                        os: 'Unknown',
                        raw: 'Legacy Device'
                    },
                    loggedInAt: user.auth.refreshTokenExpiry || new Date(),
                    isCurrentDevice: currentRefreshToken ? user.auth.refreshToken === currentRefreshToken : false,
                    tokenId: tokenPreview
                });
            }
        }

        // Sort by most recent first
        devices.sort((a, b) => new Date(b.loggedInAt) - new Date(a.loggedInAt));

        // Add sequential IDs after sorting
        const devicesWithIds = devices.map((device, index) => ({
            id: index + 1,
            ...device
        }));

        res.status(200).json({
            success: true,
            message: 'Devices retrieved successfully',
            data: {
                totalDevices: devicesWithIds.length,
                devices: devicesWithIds
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching devices',
            error: error.message
        });
    }
};

module.exports = {
    signup,
    login,
    sendOTPForPasswordReset,
    verifyOTPForPasswordReset,
    resetPassword,
    getProfile,
    updateProfile,
    refreshToken,
    logout,
    getDevices
};


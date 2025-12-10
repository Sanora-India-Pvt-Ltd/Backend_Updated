const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { generateToken, generateAccessToken, generateRefreshToken } = require('../middleware/auth');

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

        // Check if user already exists
        const existingUser = await User.findOne({ email });
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

        // Check if phone number is already taken
        const existingPhoneUser = await User.findOne({ phoneNumber: normalizedPhone });
        if (existingPhoneUser) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is already registered'
            });
        }

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
            emailDecoded.email !== email.toLowerCase()) {
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

        // Create user (use normalized phone number)
        const user = await User.create({
            email: email.toLowerCase(),
            password: hashedPassword,
            firstName,
            lastName,
            phoneNumber: normalizedPhone,
            gender,
            name: name || `${firstName} ${lastName}`.trim()
        });

        // Generate access token and refresh token
        const accessToken = generateAccessToken({ id: user._id, email: user.email });
        const { token: refreshToken, expiryDate: refreshTokenExpiry } = generateRefreshToken();

        // Get device info from request (optional)
        const deviceInfo = req.headers['user-agent'] || req.body.deviceInfo || 'Unknown Device';

        // Initialize refreshTokens array if it doesn't exist
        if (!user.refreshTokens) {
            user.refreshTokens = [];
        }

        // Add new refresh token to array (allows multiple devices)
        user.refreshTokens.push({
            token: refreshToken,
            expiryDate: refreshTokenExpiry,
            deviceInfo: deviceInfo.substring(0, 200), // Limit length
            createdAt: new Date()
        });

        // Note: We no longer clean up tokens automatically
        // Tokens only expire when user explicitly logs out
        // This allows users to stay logged in indefinitely

        // Keep backward compatibility - set single token fields
        user.refreshToken = refreshToken;
        user.refreshTokenExpiry = refreshTokenExpiry;

        await user.save();

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                accessToken,
                refreshToken,
                token: accessToken, // For backward compatibility
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    phoneNumber: user.phoneNumber,
                    gender: user.gender,
                    name: user.name
                }
            }
        });

    } catch (error) {
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
        let user;
        if (email) {
            user = await User.findOne({ email: email.toLowerCase() });
        } else if (phoneNumber) {
            user = await User.findOne({ phoneNumber });
        }

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email/phone number or password'
            });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email/phone number or password'
            });
        }

        // Generate access token and refresh token
        const accessToken = generateAccessToken({ id: user._id, email: user.email });
        const { token: refreshToken, expiryDate: refreshTokenExpiry } = generateRefreshToken();

        // Get device info from request (optional)
        const deviceInfo = req.headers['user-agent'] || req.body.deviceInfo || 'Unknown Device';

        // Initialize refreshTokens array if it doesn't exist
        if (!user.refreshTokens) {
            user.refreshTokens = [];
        }

        // Add new refresh token to array (allows multiple devices)
        user.refreshTokens.push({
            token: refreshToken,
            expiryDate: refreshTokenExpiry,
            deviceInfo: deviceInfo.substring(0, 200), // Limit length
            createdAt: new Date()
        });

        // Note: We no longer clean up tokens automatically
        // Tokens only expire when user explicitly logs out
        // This allows users to stay logged in indefinitely

        // Keep backward compatibility - set single token fields
        user.refreshToken = refreshToken;
        user.refreshTokenExpiry = refreshTokenExpiry;

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                accessToken,
                refreshToken,
                token: accessToken, // For backward compatibility
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    phoneNumber: user.phoneNumber,
                    gender: user.gender,
                    name: user.name,
                    profileImage: user.profileImage
                }
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error in user login',
            error: error.message
        });
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
            user = await User.findOne({ email: normalizedEmail });
            
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
                user = await User.findOne({ phoneNumber: phoneVar });
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
                        phoneNumber: { $regex: last10Digits }
                    }).limit(5);
                    
                    if (users.length > 0) {
                        console.log(`🔍 Found ${users.length} user(s) with similar phone numbers:`);
                        users.forEach(u => console.log(`   - ${u.phoneNumber} (${u.email})`));
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
            user = await User.findOne({ email: email.toLowerCase() });
            
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
                user = await User.findOne({ phoneNumber: phoneVar });
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
                email: user.email,
                phoneNumber: user.phoneNumber,
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
                email: user.email
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
        user.password = hashedPassword;
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

        res.status(200).json({
            success: true,
            message: 'User profile retrieved successfully',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    phoneNumber: user.phoneNumber,
                    alternatePhoneNumber: user.alternatePhoneNumber,
                    gender: user.gender,
                    name: user.name,
                    dob: user.dob,
                    profileImage: user.profileImage,
                    isGoogleOAuth: user.isGoogleOAuth,
                    googleId: user.googleId,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt
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

        // Find user by refresh token (check both old single token and new array)
        let user = await User.findOne({ refreshToken });
        
        // If not found in single token field, check refreshTokens array
        if (!user) {
            user = await User.findOne({ 'refreshTokens.token': refreshToken });
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        // Check if token exists in refreshTokens array
        let tokenRecord = null;
        if (user.refreshTokens && Array.isArray(user.refreshTokens)) {
            tokenRecord = user.refreshTokens.find(rt => rt.token === refreshToken);
        }

        // Fallback to single token field for backward compatibility
        if (!tokenRecord && user.refreshToken === refreshToken) {
            // Token found in single field - check if it's still valid
            // Note: We no longer check expiry date - tokens only expire on explicit logout
            // The expiryDate check is removed to allow indefinite login
        } else if (tokenRecord) {
            // Token found in array - it's valid (no expiry check)
            // Tokens only expire when user explicitly logs out
        } else {
            return res.status(401).json({
                success: false,
                message: 'Invalid refresh token'
            });
        }

        // Generate new access token
        const accessToken = generateAccessToken({ id: user._id, email: user.email });

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

        if (refreshToken || deviceId) {
            // Remove specific refresh token from array
            if (user.refreshTokens && Array.isArray(user.refreshTokens)) {
                const beforeCount = user.refreshTokens.length;
                
                // Find device info before removing
                if (refreshToken) {
                    const deviceToLogout = user.refreshTokens.find(rt => rt.token === refreshToken);
                    if (deviceToLogout) {
                        loggedOutDevice = parseDeviceInfo(deviceToLogout.deviceInfo);
                    }
                } else if (deviceId) {
                    // deviceId is 1-based index from getDevices response
                    const deviceIndex = parseInt(deviceId) - 1;
                    if (deviceIndex >= 0 && deviceIndex < user.refreshTokens.length) {
                        // Sort tokens by createdAt to match getDevices order
                        const sortedTokens = [...user.refreshTokens].sort((a, b) => 
                            new Date(b.createdAt) - new Date(a.createdAt)
                        );
                        const deviceToLogout = sortedTokens[deviceIndex];
                        if (deviceToLogout) {
                            loggedOutDevice = parseDeviceInfo(deviceToLogout.deviceInfo);
                            // Remove the actual token from array
                            user.refreshTokens = user.refreshTokens.filter(
                                rt => rt.token !== deviceToLogout.token
                            );
                        }
                    }
                } else {
                    // Remove by refreshToken
                    user.refreshTokens = user.refreshTokens.filter(
                        rt => rt.token !== refreshToken
                    );
                }
                
                remainingDevices = user.refreshTokens.length;
            }
            
            // Also clear single token if it matches
            if (user.refreshToken === refreshToken) {
                if (!loggedOutDevice) {
                    loggedOutDevice = {
                        deviceName: 'Legacy Device',
                        deviceType: 'Unknown',
                        browser: 'Unknown',
                        os: 'Unknown'
                    };
                }
                user.refreshToken = null;
                user.refreshTokenExpiry = null;
            }
        } else {
            // If no specific token provided, clear all tokens (logout from all devices)
            const totalDevices = (user.refreshTokens?.length || 0) + (user.refreshToken ? 1 : 0);
            user.refreshToken = null;
            user.refreshTokenExpiry = null;
            user.refreshTokens = [];
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
        const { firstName, lastName, phoneNumber, gender, dob, alternatePhoneNumber, profileImage, age } = req.body;

        // List of allowed fields to update
        const allowedUpdates = {};
        
        if (firstName !== undefined) allowedUpdates.firstName = firstName;
        if (lastName !== undefined) allowedUpdates.lastName = lastName;
        if (phoneNumber !== undefined) {
            // Normalize phone number
            let normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
            if (!normalizedPhone.startsWith('+')) {
                normalizedPhone = '+' + normalizedPhone;
            }
            
            // Check if phone number is already taken by another user
            const existingPhoneUser = await User.findOne({ 
                phoneNumber: normalizedPhone,
                _id: { $ne: user._id } // Exclude current user
            });
            
            if (existingPhoneUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Phone number is already registered to another account'
                });
            }
            
            allowedUpdates.phoneNumber = normalizedPhone;
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
            allowedUpdates.gender = gender;
        }
        if (dob !== undefined) {
            allowedUpdates.dob = dob;
        }
        if (alternatePhoneNumber !== undefined) {
            // Normalize alternate phone number
            let normalizedAltPhone = alternatePhoneNumber.replace(/[\s\-\(\)]/g, '');
            if (!normalizedAltPhone.startsWith('+')) {
                normalizedAltPhone = '+' + normalizedAltPhone;
            }
            allowedUpdates.alternatePhoneNumber = normalizedAltPhone;
        }
        if (profileImage !== undefined) {
            allowedUpdates.profileImage = profileImage;
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
            allowedUpdates.dob = new Date(birthYear, today.getMonth(), today.getDate());
        }

        // Update name field if firstName or lastName changed
        if (allowedUpdates.firstName || allowedUpdates.lastName) {
            const updatedFirstName = allowedUpdates.firstName || user.firstName;
            const updatedLastName = allowedUpdates.lastName || user.lastName;
            allowedUpdates.name = `${updatedFirstName} ${updatedLastName}`.trim();
        }

        // Check if there are any updates
        if (Object.keys(allowedUpdates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update'
            });
        }

        // Update user
        Object.assign(user, allowedUpdates);
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                user: {
                    id: user._id,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    phoneNumber: user.phoneNumber,
                    alternatePhoneNumber: user.alternatePhoneNumber,
                    gender: user.gender,
                    name: user.name,
                    dob: user.dob,
                    profileImage: user.profileImage,
                    isGoogleOAuth: user.isGoogleOAuth,
                    googleId: user.googleId,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt
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
        if (user.refreshTokens && Array.isArray(user.refreshTokens)) {
            user.refreshTokens.forEach((tokenRecord) => {
                const parsedInfo = parseDeviceInfo(tokenRecord.deviceInfo);
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
        if (user.refreshToken) {
            const tokenPreview = user.refreshToken.substring(0, 16);
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
                    loggedInAt: user.refreshTokenExpiry || new Date(),
                    isCurrentDevice: currentRefreshToken ? user.refreshToken === currentRefreshToken : false,
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


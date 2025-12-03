const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { generateToken } = require('../middleware/auth');

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
        const validGenders = ['Male', 'Female', 'Other'];
        if (!validGenders.includes(gender)) {
            return res.status(400).json({
                success: false,
                message: 'Gender must be one of: Male, Female, Other'
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

        // OTP verification is MANDATORY for signup
        if (!otp && !verificationToken) {
            return res.status(400).json({
                success: false,
                message: 'OTP verification is required for signup. Please verify your email first using /api/auth/send-otp-signup and /api/auth/verify-otp-signup'
            });
        }

        // Verify OTP if provided directly
        if (otp) {
            const { validateOTP } = require('../services/otpService');
            const result = await validateOTP(email, 'signup', otp);
            
            if (!result.valid) {
                return res.status(400).json({
                    success: false,
                    message: result.message,
                    remainingAttempts: result.remainingAttempts
                });
            }
        } else if (verificationToken) {
            // Verify the verification token from OTP verification endpoint
            const jwt = require('jsonwebtoken');
            let decoded;
            try {
                decoded = jwt.verify(verificationToken, process.env.JWT_SECRET);
            } catch (error) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid or expired verification token. Please verify OTP again using /api/auth/verify-otp-signup'
                });
            }
            
            // Validate token purpose and email match
            if (decoded.purpose !== 'otp_verification' || decoded.email !== email) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid verification token. Email does not match or token is invalid.'
                });
            }

            // Check if token is specifically for signup (optional check)
            if (!decoded.forSignup) {
                return res.status(401).json({
                    success: false,
                    message: 'This verification token is not valid for signup. Please use the signup OTP verification endpoint.'
                });
            }
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = await User.create({
            email,
            password: hashedPassword,
            firstName,
            lastName,
            phoneNumber,
            gender,
            name: name || `${firstName} ${lastName}`.trim()
        });

        // Generate JWT token
        const token = generateToken({ id: user._id, email: user.email });

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                token,
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
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check password
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Generate JWT token
        const token = generateToken({ id: user._id, email: user.email });

        res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                token,
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

module.exports = {
    signup,
    login
};


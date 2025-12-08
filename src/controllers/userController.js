const User = require('../models/User');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');

// Update user profile (name, dob, gender) - no verification needed
const updateProfile = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { firstName, lastName, name, dob, gender } = req.body;

        // Build update object with only provided fields
        const updateData = {};

        if (firstName !== undefined) {
            if (!firstName || firstName.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'First name cannot be empty'
                });
            }
            updateData.firstName = firstName.trim();
        }

        if (lastName !== undefined) {
            if (!lastName || lastName.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'Last name cannot be empty'
                });
            }
            updateData.lastName = lastName.trim();
        }

        if (name !== undefined) {
            updateData.name = name.trim() || '';
        } else if (firstName !== undefined || lastName !== undefined) {
            // Auto-update name if firstName or lastName changed
            const finalFirstName = updateData.firstName || user.firstName;
            const finalLastName = updateData.lastName || user.lastName;
            updateData.name = `${finalFirstName} ${finalLastName}`.trim();
        }

        if (dob !== undefined) {
            const dobDate = new Date(dob);
            if (isNaN(dobDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Date of birth must be a valid date (ISO 8601 format: YYYY-MM-DD)'
                });
            }
            // Check if date is not in the future
            if (dobDate > new Date()) {
                return res.status(400).json({
                    success: false,
                    message: 'Date of birth cannot be in the future'
                });
            }
            // Check if date is reasonable (not more than 150 years ago)
            const minDate = new Date();
            minDate.setFullYear(minDate.getFullYear() - 150);
            if (dobDate < minDate) {
                return res.status(400).json({
                    success: false,
                    message: 'Date of birth is too far in the past (maximum 150 years)'
                });
            }
            updateData.dob = dobDate;
        }

        if (gender !== undefined) {
            const validGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];
            if (!validGenders.includes(gender)) {
                return res.status(400).json({
                    success: false,
                    message: 'Gender must be one of: Male, Female, Other, Prefer not to say'
                });
            }
            updateData.gender = gender;
        }

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields provided to update'
            });
        }

        // Update user
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password -refreshToken');

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                user: {
                    id: updatedUser._id,
                    email: updatedUser.email,
                    firstName: updatedUser.firstName,
                    lastName: updatedUser.lastName,
                    name: updatedUser.name,
                    dob: updatedUser.dob,
                    phoneNumber: updatedUser.phoneNumber,
                    alternatePhoneNumber: updatedUser.alternatePhoneNumber,
                    gender: updatedUser.gender,
                    profileImage: updatedUser.profileImage,
                    createdAt: updatedUser.createdAt,
                    updatedAt: updatedUser.updatedAt
                }
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile',
            error: error.message
        });
    }
};

// Send OTP for phone number update
const sendOTPForPhoneUpdate = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { phoneNumber } = req.body;

        if (!phoneNumber) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        // Normalize phone number
        let normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
        if (!normalizedPhone.startsWith('+')) {
            normalizedPhone = '+' + normalizedPhone;
        }

        // Check if phone number is already taken by another user
        const existingUser = await User.findOne({ 
            phoneNumber: normalizedPhone,
            _id: { $ne: user._id } // Exclude current user
        });
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is already registered by another user'
            });
        }

        // Check if it's the same as current phone number
        if (user.phoneNumber === normalizedPhone) {
            return res.status(400).json({
                success: false,
                message: 'This is already your current phone number'
            });
        }

        // Check if Twilio is configured
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) {
            return res.status(500).json({
                success: false,
                message: 'Twilio is not configured for phone OTP'
            });
        }

        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const twilioServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

        // Create verification via Twilio Verify v2
        console.log('📱 Using Twilio Verify v2 API to send OTP for phone update');
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
        console.error('Send OTP for phone update error:', error);

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

// Verify OTP and update phone number
const verifyOTPAndUpdatePhone = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { phoneNumber, otp } = req.body;

        if (!phoneNumber || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Phone number and OTP code are required'
            });
        }

        // Normalize phone number
        let normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
        if (!normalizedPhone.startsWith('+')) {
            normalizedPhone = '+' + normalizedPhone;
        }

        // Check if phone number is already taken by another user
        const existingUser = await User.findOne({ 
            phoneNumber: normalizedPhone,
            _id: { $ne: user._id }
        });
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is already registered by another user'
            });
        }

        // Check if Twilio is configured
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) {
            return res.status(500).json({
                success: false,
                message: 'Twilio is not configured'
            });
        }

        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const twilioServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

        // Verify with Twilio v2
        console.log('✅ Using Twilio Verify v2 API to verify OTP for phone update');
        const check = await twilioClient.verify.v2.services(twilioServiceSid)
            .verificationChecks
            .create({ to: normalizedPhone, code: otp });

        if (check.status !== 'approved') {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP code'
            });
        }

        // Update phone number
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { phoneNumber: normalizedPhone },
            { new: true, runValidators: true }
        ).select('-password -refreshToken');

        res.status(200).json({
            success: true,
            message: 'Phone number updated successfully',
            data: {
                user: {
                    id: updatedUser._id,
                    email: updatedUser.email,
                    firstName: updatedUser.firstName,
                    lastName: updatedUser.lastName,
                    name: updatedUser.name,
                    dob: updatedUser.dob,
                    phoneNumber: updatedUser.phoneNumber,
                    alternatePhoneNumber: updatedUser.alternatePhoneNumber,
                    gender: updatedUser.gender,
                    profileImage: updatedUser.profileImage,
                    createdAt: updatedUser.createdAt,
                    updatedAt: updatedUser.updatedAt
                }
            }
        });

    } catch (error) {
        console.error('Verify OTP and update phone error:', error);

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

// Send OTP for alternate phone number update
const sendOTPForAlternatePhone = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { alternatePhoneNumber } = req.body;

        if (!alternatePhoneNumber) {
            return res.status(400).json({
                success: false,
                message: 'Alternate phone number is required'
            });
        }

        // Normalize phone number
        let normalizedPhone = alternatePhoneNumber.replace(/[\s\-\(\)]/g, '');
        if (!normalizedPhone.startsWith('+')) {
            normalizedPhone = '+' + normalizedPhone;
        }

        // Check if alternate phone number is already taken by another user
        const existingUser = await User.findOne({ 
            $or: [
                { phoneNumber: normalizedPhone, _id: { $ne: user._id } },
                { alternatePhoneNumber: normalizedPhone, _id: { $ne: user._id } }
            ]
        });
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'This phone number is already registered by another user'
            });
        }

        // Check if it's the same as current phone number
        if (user.phoneNumber === normalizedPhone) {
            return res.status(400).json({
                success: false,
                message: 'Alternate phone number cannot be the same as your primary phone number'
            });
        }

        // Check if it's the same as current alternate phone number
        if (user.alternatePhoneNumber === normalizedPhone) {
            return res.status(400).json({
                success: false,
                message: 'This is already your current alternate phone number'
            });
        }

        // Check if Twilio is configured
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) {
            return res.status(500).json({
                success: false,
                message: 'Twilio is not configured for phone OTP'
            });
        }

        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const twilioServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

        // Create verification via Twilio Verify v2
        console.log('📱 Using Twilio Verify v2 API to send OTP for alternate phone update');
        const verification = await twilioClient.verify.v2.services(twilioServiceSid)
            .verifications
            .create({ to: normalizedPhone, channel: 'sms' });

        res.status(200).json({
            success: true,
            message: 'OTP sent successfully to your alternate phone',
            data: {
                alternatePhone: normalizedPhone,
                sid: verification.sid,
                status: verification.status
            }
        });

    } catch (error) {
        console.error('Send OTP for alternate phone error:', error);

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

// Verify OTP and update/add alternate phone number
const verifyOTPAndUpdateAlternatePhone = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { alternatePhoneNumber, otp } = req.body;

        if (!alternatePhoneNumber || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Alternate phone number and OTP code are required'
            });
        }

        // Normalize phone number
        let normalizedPhone = alternatePhoneNumber.replace(/[\s\-\(\)]/g, '');
        if (!normalizedPhone.startsWith('+')) {
            normalizedPhone = '+' + normalizedPhone;
        }

        // Check if alternate phone number is already taken by another user
        const existingUser = await User.findOne({ 
            $or: [
                { phoneNumber: normalizedPhone, _id: { $ne: user._id } },
                { alternatePhoneNumber: normalizedPhone, _id: { $ne: user._id } }
            ]
        });
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'This phone number is already registered by another user'
            });
        }

        // Check if it's the same as current phone number
        if (user.phoneNumber === normalizedPhone) {
            return res.status(400).json({
                success: false,
                message: 'Alternate phone number cannot be the same as your primary phone number'
            });
        }

        // Check if Twilio is configured
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) {
            return res.status(500).json({
                success: false,
                message: 'Twilio is not configured'
            });
        }

        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const twilioServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

        // Verify with Twilio v2
        console.log('✅ Using Twilio Verify v2 API to verify OTP for alternate phone update');
        const check = await twilioClient.verify.v2.services(twilioServiceSid)
            .verificationChecks
            .create({ to: normalizedPhone, code: otp });

        if (check.status !== 'approved') {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired OTP code'
            });
        }

        // Update alternate phone number
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { alternatePhoneNumber: normalizedPhone },
            { new: true, runValidators: true }
        ).select('-password -refreshToken');

        res.status(200).json({
            success: true,
            message: 'Alternate phone number updated successfully',
            data: {
                user: {
                    id: updatedUser._id,
                    email: updatedUser.email,
                    firstName: updatedUser.firstName,
                    lastName: updatedUser.lastName,
                    name: updatedUser.name,
                    dob: updatedUser.dob,
                    phoneNumber: updatedUser.phoneNumber,
                    alternatePhoneNumber: updatedUser.alternatePhoneNumber,
                    gender: updatedUser.gender,
                    profileImage: updatedUser.profileImage,
                    createdAt: updatedUser.createdAt,
                    updatedAt: updatedUser.updatedAt
                }
            }
        });

    } catch (error) {
        console.error('Verify OTP and update alternate phone error:', error);

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

// Remove alternate phone number
const removeAlternatePhone = async (req, res) => {
    try {
        const user = req.user; // From protect middleware

        // Remove alternate phone number
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { alternatePhoneNumber: undefined },
            { new: true, runValidators: true }
        ).select('-password -refreshToken');

        res.status(200).json({
            success: true,
            message: 'Alternate phone number removed successfully',
            data: {
                user: {
                    id: updatedUser._id,
                    email: updatedUser.email,
                    firstName: updatedUser.firstName,
                    lastName: updatedUser.lastName,
                    name: updatedUser.name,
                    dob: updatedUser.dob,
                    phoneNumber: updatedUser.phoneNumber,
                    alternatePhoneNumber: updatedUser.alternatePhoneNumber,
                    gender: updatedUser.gender,
                    profileImage: updatedUser.profileImage,
                    createdAt: updatedUser.createdAt,
                    updatedAt: updatedUser.updatedAt
                }
            }
        });

    } catch (error) {
        console.error('Remove alternate phone error:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing alternate phone number',
            error: error.message
        });
    }
};

module.exports = {
    updateProfile,
    sendOTPForPhoneUpdate,
    verifyOTPAndUpdatePhone,
    sendOTPForAlternatePhone,
    verifyOTPAndUpdateAlternatePhone,
    removeAlternatePhone
};


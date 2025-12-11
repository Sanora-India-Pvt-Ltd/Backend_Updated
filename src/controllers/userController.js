const User = require('../models/User');
const Media = require('../models/Media');
const Company = require('../models/Company');
const Institution = require('../models/Institution');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const cloudinary = require('../config/cloudinary');

// Update user profile (name, dob, gender) - no verification needed
const updateProfile = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { firstName, lastName, name, dob, gender, bio, currentCity, hometown, relationshipStatus, workplace, education, coverPhoto } = req.body;

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

        // Handle bio
        if (bio !== undefined) {
            updateData.bio = bio.trim();
        }

        // Handle currentCity
        if (currentCity !== undefined) {
            updateData.currentCity = currentCity.trim();
        }

        // Handle hometown
        if (hometown !== undefined) {
            updateData.hometown = hometown.trim();
        }

        // Handle coverPhoto (optional field - accepts URL string)
        if (coverPhoto !== undefined) {
            if (coverPhoto === null || coverPhoto === '') {
                // Allow explicitly setting to null/empty to clear the field
                updateData.coverPhoto = '';
            } else {
                // Validate that it's a valid URL format
                try {
                    new URL(coverPhoto);
                    updateData.coverPhoto = coverPhoto.trim();
                } catch (urlError) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cover photo must be a valid URL'
                    });
                }
            }
        }

        // Handle relationshipStatus (optional field)
        if (relationshipStatus !== undefined) {
            if (relationshipStatus === null || relationshipStatus === '') {
                // Allow explicitly setting to null/empty to clear the field
                updateData.relationshipStatus = null;
            } else {
                const validStatuses = ['Single', 'In a relationship', 'Engaged', 'Married', 'In a civil partnership', 'In a domestic partnership', 'In an open relationship', "It's complicated", 'Separated', 'Divorced', 'Widowed'];
                if (!validStatuses.includes(relationshipStatus)) {
                    return res.status(400).json({
                        success: false,
                        message: `Relationship status must be one of: ${validStatuses.join(', ')}`
                    });
                }
                updateData.relationshipStatus = relationshipStatus;
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
                const companyName = work.company.trim();
                const normalizedCompanyName = companyName.toLowerCase();
                
                let company = await Company.findOne({
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

                // Convert dates to Date objects
                const processedWork = {
                    company: company._id, // Store company ObjectID reference
                    position: work.position,
                    startDate: new Date(work.startDate),
                    endDate: work.endDate ? new Date(work.endDate) : null,
                    isCurrent: work.isCurrent || false
                };
                processedWorkplace.push(processedWork);
            }
            updateData.workplace = processedWorkplace;
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
                                type: ['school', 'college', 'university'].includes(institutionType) ? institutionType : 'school',
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

                // Process education entry
                const processedEdu = {
                    institution: institution._id, // Store institution ObjectID reference
                    degree: edu.degree || '',
                    field: edu.field || '',
                    startYear: parseInt(edu.startYear),
                    endYear: edu.endYear ? parseInt(edu.endYear) : null
                };
                processedEducation.push(processedEdu);
            }
            updateData.education = processedEducation;
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
        )
        .populate('workplace.company', 'name isCustom')
        .populate('education.institution', 'name type city country logo verified isCustom')
        .select('-password -refreshToken');

        // Format workplace to include company name
        const formattedWorkplace = updatedUser.workplace.map(work => ({
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
        const formattedEducation = (updatedUser.education || []).map(edu => ({
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
                    coverPhoto: updatedUser.coverPhoto,
                    bio: updatedUser.bio,
                    currentCity: updatedUser.currentCity,
                    hometown: updatedUser.hometown,
                    relationshipStatus: updatedUser.relationshipStatus,
                    workplace: formattedWorkplace,
                    education: formattedEducation,
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

// Upload media to Cloudinary - ensures it's only associated with the authenticated user
const uploadMedia = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded"
            });
        }

        const user = req.user; // From protect middleware - ensures only authenticated user can upload

        // User-specific folder path to ensure files are organized per user
        const userFolder = `user_uploads/${user._id}`;

        // Upload to Cloudinary in user-specific folder
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: userFolder,
            upload_preset: process.env.UPLOAD_PRESET,
            resource_type: "auto", // auto = images + videos
            quality: "100"
        });

        // Save upload record to database - associated with this specific user
        const mediaRecord = await Media.create({
            userId: user._id, // Ensures it's only associated with this user
            url: result.secure_url,
            public_id: result.public_id,
            format: result.format,
            resource_type: result.resource_type,
            fileSize: result.bytes || req.file.size,
            originalFilename: req.file.originalname,
            folder: result.folder || userFolder
        });

        return res.status(200).json({
            success: true,
            message: "Uploaded successfully",
            data: {
                id: mediaRecord._id,
                url: result.secure_url,
                public_id: result.public_id,
                format: result.format,
                type: result.resource_type,
                fileSize: result.bytes || req.file.size,
                uploadedBy: {
                    userId: user._id,
                    email: user.email,
                    name: user.name
                },
                uploadedAt: mediaRecord.createdAt
            }
        });

    } catch (err) {
        console.error('Cloudinary upload error:', err);
        return res.status(500).json({
            success: false,
            message: "Cloudinary upload failed",
            error: err.message
        });
    }
};

// Upload profile image - ensures it's only associated with the authenticated user
const uploadProfileImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded"
            });
        }

        const user = req.user; // From protect middleware - ensures only authenticated user can upload

        // Validate that it's an image
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedMimeTypes.includes(req.file.mimetype)) {
            return res.status(400).json({
                success: false,
                message: "Only image files are allowed for profile pictures (JPEG, PNG, GIF, WebP)"
            });
        }

        // User-specific folder path
        const userFolder = `user_uploads/${user._id}/profile`;

        // Delete old profile image from Cloudinary if it exists
        if (user.profileImage) {
            try {
                // Extract public_id from the old profile image URL
                const oldPublicId = user.profileImage.split('/').slice(-2).join('/').split('.')[0];
                // Try to delete the old image
                await cloudinary.uploader.destroy(oldPublicId, { invalidate: true });
                
                // Also delete from Media collection
                await Media.findOneAndDelete({ 
                    userId: user._id, 
                    url: user.profileImage 
                });
            } catch (deleteError) {
                // Log but don't fail if old image deletion fails
                console.warn('Failed to delete old profile image:', deleteError.message);
            }
        }

        // Upload new profile image to user-specific folder
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: userFolder,
            upload_preset: process.env.UPLOAD_PRESET,
            resource_type: "image",
            transformation: [
                { width: 400, height: 400, crop: "fill", gravity: "face" }, // Optimize for profile images
                { quality: "100" }
            ]
        });

        // Update user's profileImage field
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { profileImage: result.secure_url },
            { new: true, runValidators: true }
        ).select('-password -refreshToken');

        // Save upload record to database - associated with this specific user
        const mediaRecord = await Media.create({
            userId: user._id, // Ensures it's only associated with this user
            url: result.secure_url,
            public_id: result.public_id,
            format: result.format,
            resource_type: result.resource_type,
            fileSize: result.bytes || req.file.size,
            originalFilename: req.file.originalname,
            folder: userFolder
        });

        return res.status(200).json({
            success: true,
            message: "Profile image uploaded successfully",
            data: {
                id: mediaRecord._id,
                url: result.secure_url,
                public_id: result.public_id,
                format: result.format,
                fileSize: result.bytes || req.file.size,
                user: {
                    id: updatedUser._id,
                    email: updatedUser.email,
                    name: updatedUser.name,
                    profileImage: updatedUser.profileImage
                },
                uploadedAt: mediaRecord.createdAt
            }
        });

    } catch (err) {
        console.error('Profile image upload error:', err);
        return res.status(500).json({
            success: false,
            message: "Profile image upload failed",
            error: err.message
        });
    }
};

// Upload cover photo - ensures it's only associated with the authenticated user
const uploadCoverPhoto = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded"
            });
        }

        const user = req.user; // From protect middleware - ensures only authenticated user can upload

        // Validate that it's an image
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedMimeTypes.includes(req.file.mimetype)) {
            return res.status(400).json({
                success: false,
                message: "Only image files are allowed for cover photos (JPEG, PNG, GIF, WebP)"
            });
        }

        // User-specific folder path
        const userFolder = `user_uploads/${user._id}/cover`;

        // Delete old cover photo from Cloudinary if it exists
        if (user.coverPhoto) {
            try {
                // Extract public_id from the old cover photo URL
                const oldPublicId = user.coverPhoto.split('/').slice(-2).join('/').split('.')[0];
                // Try to delete the old image
                await cloudinary.uploader.destroy(oldPublicId, { invalidate: true });
                
                // Also delete from Media collection
                await Media.findOneAndDelete({ 
                    userId: user._id, 
                    url: user.coverPhoto 
                });
            } catch (deleteError) {
                // Log but don't fail if old image deletion fails
                console.warn('Failed to delete old cover photo:', deleteError.message);
            }
        }

        // Upload new cover photo to user-specific folder
        const result = await cloudinary.uploader.upload(req.file.path, {
            folder: userFolder,
            upload_preset: process.env.UPLOAD_PRESET,
            resource_type: "image",
            transformation: [
                { width: 1200, height: 400, crop: "fill", gravity: "auto" }, // Optimize for cover photos (wider aspect ratio)
                { quality: "100" }
            ]
        });

        // Update user's coverPhoto field
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { coverPhoto: result.secure_url },
            { new: true, runValidators: true }
        ).select('-password -refreshToken');

        // Save upload record to database - associated with this specific user
        const mediaRecord = await Media.create({
            userId: user._id, // Ensures it's only associated with this user
            url: result.secure_url,
            public_id: result.public_id,
            format: result.format,
            resource_type: result.resource_type,
            fileSize: result.bytes || req.file.size,
            originalFilename: req.file.originalname,
            folder: userFolder
        });

        return res.status(200).json({
            success: true,
            message: "Cover photo uploaded successfully",
            data: {
                id: mediaRecord._id,
                url: result.secure_url,
                public_id: result.public_id,
                format: result.format,
                fileSize: result.bytes || req.file.size,
                user: {
                    id: updatedUser._id,
                    email: updatedUser.email,
                    name: updatedUser.name,
                    coverPhoto: updatedUser.coverPhoto
                },
                uploadedAt: mediaRecord.createdAt
            }
        });

    } catch (err) {
        console.error('Cover photo upload error:', err);
        return res.status(500).json({
            success: false,
            message: "Cover photo upload failed",
            error: err.message
        });
    }
};

// Get user's media - ensures users can only see their own uploads
const getUserMedia = async (req, res) => {
    try {
        const user = req.user; // From protect middleware

        // Query only media belonging to this specific user
        const media = await Media.find({ userId: user._id })
            .sort({ createdAt: -1 })
            .select('-__v');

        return res.status(200).json({
            success: true,
            message: "Media retrieved successfully",
            data: {
                count: media.length,
                media: media.map(item => ({
                    id: item._id,
                    url: item.url,
                    public_id: item.public_id,
                    format: item.format,
                    type: item.resource_type,
                    fileSize: item.fileSize,
                    originalFilename: item.originalFilename,
                    folder: item.folder,
                    uploadedAt: item.createdAt
                }))
            }
        });

    } catch (err) {
        console.error('Get user media error:', err);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve media",
            error: err.message
        });
    }
};

// Delete user's media - ensures users can only delete their own uploads
const deleteUserMedia = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { mediaId } = req.params;

        if (!mediaId) {
            return res.status(400).json({
                success: false,
                message: "Media ID is required"
            });
        }

        // Find media that belongs to this specific user
        const media = await Media.findOne({ 
            _id: mediaId, 
            userId: user._id // Ensure it belongs to the authenticated user
        });

        if (!media) {
            return res.status(404).json({
                success: false,
                message: "Media not found or you don't have permission to delete it"
            });
        }

        // Delete from Cloudinary
        try {
            await cloudinary.uploader.destroy(media.public_id, { invalidate: true });
        } catch (cloudinaryError) {
            console.warn('Failed to delete from Cloudinary:', cloudinaryError.message);
            // Continue with database deletion even if Cloudinary deletion fails
        }

        // Delete from database
        await Media.findByIdAndDelete(mediaId);

        // If this was the user's profile image, clear it from user record
        if (user.profileImage === media.url) {
            await User.findByIdAndUpdate(user._id, { profileImage: '' });
        }

        // If this was the user's cover photo, clear it from user record
        if (user.coverPhoto === media.url) {
            await User.findByIdAndUpdate(user._id, { coverPhoto: '' });
        }

        return res.status(200).json({
            success: true,
            message: "Media deleted successfully"
        });

    } catch (err) {
        console.error('Delete user media error:', err);
        return res.status(500).json({
            success: false,
            message: "Failed to delete media",
            error: err.message
        });
    }
};

module.exports = {
    updateProfile,
    sendOTPForPhoneUpdate,
    verifyOTPAndUpdatePhone,
    sendOTPForAlternatePhone,
    verifyOTPAndUpdateAlternatePhone,
    removeAlternatePhone,
    uploadMedia,
    uploadProfileImage,
    uploadCoverPhoto,
    getUserMedia,
    deleteUserMedia
};


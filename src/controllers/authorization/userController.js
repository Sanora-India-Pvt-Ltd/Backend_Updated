const User = require('../../models/authorization/User');
const Media = require('../../models/Media');
const Company = require('../../models/authorization/Company');
const Institution = require('../../models/authorization/Institution');
const { formatEducation, formatWorkplace, formatUserProfile } = require('../../utils/formatters');
const NodeCache = require('node-cache');

// Initialize caches with 1-hour TTL (time-to-live)
const companyCache = new NodeCache({ stdTTL: 3600 });
const institutionCache = new NodeCache({ stdTTL: 3600 });

/**
 * Get or create companies in bulk to minimize database queries
 * @param {string[]} companyNames - Array of company names to look up or create
 * @param {string} userId - ID of the user creating the companies
 * @returns {Promise<Map>} Map of normalized company names to company documents
 */
async function getOrCreateCompanies(companyNames, userId) {
    const uniqueNames = [...new Set(companyNames.map(name => name.toLowerCase().trim()))];
    const existingCompanies = await Company.find({
        normalizedName: { $in: uniqueNames }
    }).lean();

    const existingMap = new Map();
    existingCompanies.forEach(company => {
        existingMap.set(company.normalizedName, company);
        // Update cache with found companies
        companyCache.set(company.normalizedName, company);
    });

    const toCreate = [];
    const result = new Map();

    // Check cache and existing companies
    for (const name of uniqueNames) {
        const normalized = name.toLowerCase();
        const cached = companyCache.get(normalized);
        
        if (cached) {
            result.set(normalized, cached);
        } else if (existingMap.has(normalized)) {
            const company = existingMap.get(normalized);
            companyCache.set(normalized, company);
            result.set(normalized, company);
        } else {
            toCreate.push({
                name: name.charAt(0).toUpperCase() + name.slice(1),
                normalizedName: normalized,
                isCustom: true,
                createdBy: userId
            });
        }
    }

    // Bulk create any missing companies
    if (toCreate.length > 0) {
        try {
            const created = await Company.insertMany(toCreate, { ordered: false });
            created.forEach(company => {
                const normalized = company.normalizedName;
                companyCache.set(normalized, company);
                result.set(normalized, company);
            });
        } catch (error) {
            // Handle potential race condition where company was created by another request
            if (error.code === 11000) {
                const existing = await Company.find({
                    normalizedName: { $in: toCreate.map(c => c.normalizedName) }
                }).lean();
                
                existing.forEach(company => {
                    const normalized = company.normalizedName;
                    companyCache.set(normalized, company);
                    result.set(normalized, company);
                });
            } else {
                throw error;
            }
        }
    }

    return result;
}

/**
 * Get or create institutions in bulk to minimize database queries
 * @param {Array<{name: string, type?: string, city?: string, country?: string}>} institutionData - Array of institution data objects
 * @param {string} userId - ID of the user creating the institutions
 * @returns {Promise<Map>} Map of normalized institution names to institution documents
 */
async function getOrCreateInstitutions(institutionData, userId) {
    const uniqueInstitutions = [];
    const nameToData = new Map();
    
    // Deduplicate and normalize institution data
    institutionData.forEach(data => {
        const normalized = data.name.toLowerCase().trim();
        if (!nameToData.has(normalized)) {
            nameToData.set(normalized, data);
            uniqueInstitutions.push(normalized);
        }
    });

    // Find existing institutions
    const existingInstitutions = await Institution.find({
        normalizedName: { $in: uniqueInstitutions }
    }).lean();

    const existingMap = new Map();
    existingInstitutions.forEach(inst => {
        existingMap.set(inst.normalizedName, inst);
        // Update cache with found institutions
        institutionCache.set(inst.normalizedName, inst);
    });

    const toCreate = [];
    const result = new Map();

    // Check cache and existing institutions
    for (const normalized of uniqueInstitutions) {
        const cached = institutionCache.get(normalized);
        
        if (cached) {
            result.set(normalized, cached);
        } else if (existingMap.has(normalized)) {
            const inst = existingMap.get(normalized);
            institutionCache.set(normalized, inst);
            result.set(normalized, inst);
        } else {
            const data = nameToData.get(normalized);
            toCreate.push({
                name: data.name.charAt(0).toUpperCase() + data.name.slice(1),
                normalizedName: normalized,
                type: ['school', 'college', 'university', 'others'].includes(data.type) ? data.type : 'school',
                city: data.city || '',
                country: data.country || '',
                logo: data.logo || '',
                verified: false,
                isCustom: true,
                createdBy: userId
            });
        }
    }

    // Bulk create any missing institutions
    if (toCreate.length > 0) {
        try {
            const created = await Institution.insertMany(toCreate, { ordered: false });
            created.forEach(inst => {
                const normalized = inst.normalizedName;
                institutionCache.set(normalized, inst);
                result.set(normalized, inst);
            });
        } catch (error) {
            // Handle potential race condition where institution was created by another request
            if (error.code === 11000) {
                const existing = await Institution.find({
                    normalizedName: { $in: toCreate.map(i => i.normalizedName) }
                }).lean();
                
                existing.forEach(inst => {
                    const normalized = inst.normalizedName;
                    institutionCache.set(normalized, inst);
                    result.set(normalized, inst);
                });
            } else {
                throw error;
            }
        }
    }

    return result;
}
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const twilio = require('twilio');
const StorageService = require('../../services/storage.service');
const { isVideo } = require('../../services/videoTranscoder');

// Helper function to check if two users are friends
const areFriends = async (userId1, userId2) => {
    try {
        const user1 = await User.findById(userId1).select('social.friends');
        if (!user1) return false;
        
        // Check friend structure
        const friendsList = user1.social?.friends || [];
        return friendsList.some(friendId => 
            friendId.toString() === userId2.toString()
        );
    } catch (error) {
        console.error('Error checking friendship:', error);
        return false;
    }
};

// Helper function to get all blocked user IDs
const getBlockedUserIds = async (userId) => {
    try {
        const user = await User.findById(userId).select('social.blockedUsers');
        if (!user) return [];
        
        // Get blocked users from social.blockedUsers
        const blockedUsers = user.social?.blockedUsers || [];
        return blockedUsers.map(id => id.toString());
    } catch (error) {
        console.error('Error getting blocked users:', error);
        return [];
    }
};

// Helper function to check if a user is blocked
const isUserBlocked = async (blockerId, blockedId) => {
    try {
        const blockedUserIds = await getBlockedUserIds(blockerId);
        return blockedUserIds.includes(blockedId.toString());
    } catch (error) {
        console.error('Error checking if user is blocked:', error);
        return false;
    }
};

// Helper function to get limited profile data for non-friends viewing private profiles
const getLimitedProfileData = (user) => {
    return {
        id: user._id,
        firstName: user.profile?.name?.first,
        lastName: user.profile?.name?.last,
        name: user.profile?.name?.full,
        profileImage: user.profile?.profileImage || '',
        // Exclude: bio, currentCity, hometown, and other detailed info
    };
};

// Helper function to get full profile data (for friends or public profiles)
const getFullProfileData = (user) => {
    return {
        id: user._id,
        firstName: user.profile?.name?.first,
        lastName: user.profile?.name?.last,
        name: user.profile?.name?.full,
        profileImage: user.profile?.profileImage,
        bio: user.profile?.bio,
        currentCity: user.location?.currentCity,
        hometown: user.location?.hometown
    };
};

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
            updateData['profile.name.first'] = firstName.trim();
        }

        if (lastName !== undefined) {
            if (!lastName || lastName.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'Last name cannot be empty'
                });
            }
            updateData['profile.name.last'] = lastName.trim();
        }

        if (name !== undefined) {
            updateData['profile.name.full'] = name.trim() || '';
        } else if (firstName !== undefined || lastName !== undefined) {
            // Auto-update name if firstName or lastName changed
            const finalFirstName = updateData['profile.name.first'] || user.profile?.name?.first;
            const finalLastName = updateData['profile.name.last'] || user.profile?.name?.last;
            updateData['profile.name.full'] = `${finalFirstName} ${finalLastName}`.trim();
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
            updateData['profile.dob'] = dobDate;
        }

        if (gender !== undefined) {
            const validGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];
            if (!validGenders.includes(gender)) {
                return res.status(400).json({
                    success: false,
                    message: 'Gender must be one of: Male, Female, Other, Prefer not to say'
                });
            }
            updateData['profile.gender'] = gender;
        }

        // Handle bio
        if (bio !== undefined) {
            const trimmedBio = bio.trim();
            updateData['profile.bio'] = trimmedBio;
        }

        // Handle currentCity
        if (currentCity !== undefined) {
            updateData['location.currentCity'] = currentCity.trim();
        }

        // Handle hometown
        if (hometown !== undefined) {
            updateData['location.hometown'] = hometown.trim();
        }

        // Handle coverPhoto (optional field - accepts URL string)
        if (coverPhoto !== undefined) {
            if (coverPhoto === null || coverPhoto === '') {
                // Allow explicitly setting to null/empty to clear the field
                updateData['profile.coverPhoto'] = '';
            } else {
                // Validate that it's a valid URL format
                try {
                    new URL(coverPhoto);
                    const trimmedCoverPhoto = coverPhoto.trim();
                    updateData['profile.coverPhoto'] = trimmedCoverPhoto;
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
                updateData['social.relationshipStatus'] = null;
            } else {
                const validStatuses = ['Single', 'In a relationship', 'Engaged', 'Married', 'In a civil partnership', 'In a domestic partnership', 'In an open relationship', "It's complicated", 'Separated', 'Divorced', 'Widowed'];
                if (!validStatuses.includes(relationshipStatus)) {
                    return res.status(400).json({
                        success: false,
                        message: `Relationship status must be one of: ${validStatuses.join(', ')}`
                    });
                }
                updateData['social.relationshipStatus'] = relationshipStatus;
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
            updateData['professional.workplace'] = processedWorkplace;
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
                // Validate required fields for education entry
                if (!edu.institution || !edu.startYear) {
                    return res.status(400).json({
                        success: false,
                        message: 'Institution and startYear are required for each education entry'
                    });
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
            updateData['professional.education'] = processedEducation;
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
        ).lean()
        .populate('professional.workplace.company', 'name isCustom')
        .populate('professional.education.institution', 'name type city country logo verified isCustom')
        .select('-auth');

        // Format workplace and education using helper functions
        const formattedWorkplace = formatWorkplace(updatedUser.professional?.workplace);
        const formattedEducation = formatEducation(updatedUser.professional?.education);

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                user: {
                    id: updatedUser._id,
                    email: updatedUser.profile?.email,
                    firstName: updatedUser.profile?.name?.first,
                    lastName: updatedUser.profile?.name?.last,
                    name: updatedUser.profile?.name?.full,
                    dob: updatedUser.profile?.dob,
                    // @deprecated - use profile.phoneNumbers.primary instead
                    phoneNumber: updatedUser.profile?.phoneNumbers?.primary,
                    // @deprecated - use profile.phoneNumbers.alternate instead
                    alternatePhoneNumber: updatedUser.profile?.phoneNumbers?.alternate,
                    gender: updatedUser.profile?.gender,
                    profileImage: updatedUser.profile?.profileImage,
                    coverPhoto: updatedUser.profile?.coverPhoto,
                    bio: updatedUser.profile?.bio,
                    currentCity: updatedUser.location?.currentCity,
                    hometown: updatedUser.location?.hometown,
                    relationshipStatus: updatedUser.social?.relationshipStatus,
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
            'profile.phoneNumbers.primary': normalizedPhone,
            _id: { $ne: user._id } // Exclude current user
        });
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is already registered by another user'
            });
        }

        // Check if it's the same as current phone number
        if (user.profile?.phoneNumbers?.primary === normalizedPhone) {
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

        // Check if phone number is already taken by another user in either primary or alternate numbers
        const existingUser = await User.findOne({
            $or: [
                { 'profile.phoneNumbers.primary': normalizedPhone },
                { 'profile.phoneNumbers.alternate': normalizedPhone }
            ],
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
            { 'profile.phoneNumbers.primary': normalizedPhone },
            { new: true, runValidators: true }
        ).lean().select('-auth');

        res.status(200).json({
            success: true,
            message: 'Phone number updated successfully',
            data: {
                user: {
                    id: updatedUser._id,
                    email: updatedUser.profile?.email,
                    firstName: updatedUser.profile?.name?.first,
                    lastName: updatedUser.profile?.name?.last,
                    name: updatedUser.profile?.name?.full,
                    dob: updatedUser.profile?.dob,
                    // @deprecated - use profile.phoneNumbers.primary instead
                    phoneNumber: updatedUser.profile?.phoneNumbers?.primary,
                    // @deprecated - use profile.phoneNumbers.alternate instead
                    alternatePhoneNumber: updatedUser.profile?.phoneNumbers?.alternate,
                    gender: updatedUser.profile?.gender,
                    profileImage: updatedUser.profile?.profileImage,
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
                { 'profile.phoneNumbers.primary': normalizedPhone, _id: { $ne: user._id } },
                { 'profile.phoneNumbers.alternate': normalizedPhone, _id: { $ne: user._id } }
            ]
        });
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'This phone number is already registered by another user'
            });
        }

        // Check if it's the same as current phone number
        if (user.profile?.phoneNumbers?.primary === normalizedPhone) {
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
                { 'profile.phoneNumbers.primary': normalizedPhone, _id: { $ne: user._id } },
                { 'profile.phoneNumbers.alternate': normalizedPhone, _id: { $ne: user._id } }
            ]
        });
        
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'This phone number is already registered by another user'
            });
        }

        // Check if it's the same as current phone number
        if (user.profile?.phoneNumbers?.primary === normalizedPhone) {
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

        // Update alternate phone number using $set to ensure proper update
        console.log(`📱 Updating alternate phone number for user ${user._id} to: ${normalizedPhone}`);
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { $set: { alternatePhoneNumber: normalizedPhone } },
            { new: true, runValidators: true }
        ).lean().select('-auth');

        // Verify the update was successful
        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Double-check by querying the database directly to ensure the update persisted
        const verifyUser = await User.findById(user._id).select('alternatePhoneNumber');
        console.log(`✅ Alternate phone number updated. Response value: ${updatedUser.alternatePhoneNumber}, Database value: ${verifyUser?.alternatePhoneNumber}`);
        
        if (verifyUser?.alternatePhoneNumber !== normalizedPhone) {
            console.error(`❌ WARNING: Alternate phone number update may not have persisted! Expected: ${normalizedPhone}, Got: ${verifyUser?.alternatePhoneNumber}`);
            // Use the verified database value
            updatedUser.alternatePhoneNumber = verifyUser.alternatePhoneNumber;
        }

        // Reload the full user document to ensure we have the latest data
        const finalUser = await User.findById(user._id).select('-auth');

        res.status(200).json({
            success: true,
            message: 'Alternate phone number updated successfully',
            data: {
                user: {
                    id: finalUser._id,
                    email: finalUser.profile?.email,
                    firstName: finalUser.profile?.name?.first,
                    lastName: finalUser.profile?.name?.last,
                    name: finalUser.profile?.name?.full,
                    dob: finalUser.profile?.dob,
                    phoneNumber: finalUser.profile?.phoneNumbers?.primary,
                    alternatePhoneNumber: finalUser.profile?.phoneNumbers?.alternate,
                    gender: finalUser.profile?.gender,
                    profileImage: finalUser.profile?.profileImage,
                    createdAt: finalUser.createdAt,
                    updatedAt: finalUser.updatedAt
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

        // Remove alternate phone number using $unset to properly remove the field
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { $unset: { 'profile.phoneNumbers.alternate': '' } },
            { new: true, runValidators: true }
        ).lean().select('-auth');

        res.status(200).json({
            success: true,
            message: 'Alternate phone number removed successfully',
            data: {
                user: {
                    id: updatedUser._id,
                    email: updatedUser.profile?.email,
                    firstName: updatedUser.profile?.name?.first,
                    lastName: updatedUser.profile?.name?.last,
                    name: updatedUser.profile?.name?.full,
                    dob: updatedUser.profile?.dob,
                    // @deprecated - use profile.phoneNumbers.primary instead
                    phoneNumber: updatedUser.profile?.phoneNumbers?.primary,
                    // @deprecated - use profile.phoneNumbers.alternate instead
                    alternatePhoneNumber: updatedUser.profile?.phoneNumbers?.alternate,
                    gender: updatedUser.profile?.gender,
                    profileImage: updatedUser.profile?.profileImage,
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

// Upload media to S3 - ensures it's only associated with the authenticated user
const uploadMedia = async (req, res) => {
    try {
        // Validate files exist
        if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No files uploaded"
            });
        }

        // Get user or university from flexibleAuth (supports both USER and UNIVERSITY tokens)
        // Note: This endpoint is now public, so user/university are optional
        const user = req.user;
        const university = req.university;
        const userId = req.userId;
        const universityId = req.universityId;

        const uploadedFiles = [];

        // Process each file - accept all file types
        for (const file of req.files) {
            // Check if uploaded file is a video or audio (for type classification)
            const isVideoFile = isVideo(file.mimetype);
            const isAudioFile = file.mimetype.startsWith('audio/');
            const isImageFile = file.mimetype.startsWith('image/');

        // Handle file upload based on storage type
        // diskUpload provides file.path, multer-s3 provides file.location and file.key
        let uploadResult;
            if (file.path) {
            // File was saved to disk (diskStorage) - upload to S3
                uploadResult = await StorageService.uploadFromPath(file.path);
            } else if (file.location && file.key) {
            // File was already uploaded via multer-s3
                uploadResult = await StorageService.uploadFromRequest(file);
        } else {
                console.warn('Invalid file object:', file);
                continue; // Skip invalid files
        }

        // Determine media type from mimetype - support all file types
        let mediaType;
        if (isVideoFile) {
            mediaType = 'video';
        } else if (isAudioFile) {
            mediaType = 'audio';
        } else if (isImageFile) {
            mediaType = 'image';
        } else {
            // Handle other file types (PPT, Excel, CSV, PDF, etc.)
            // Map mimetype to valid enum values
            const mimetypeParts = file.mimetype.split('/');
            const primaryType = mimetypeParts[0];
            
            // Map common mimetypes to valid enum values
            if (primaryType === 'application' || primaryType === 'text') {
                mediaType = primaryType; // 'application' or 'text' are now in enum
            } else {
                mediaType = 'file'; // Fallback to 'file' for any other type
            }
        }
            const format = file.mimetype.split('/')[1] || 'unknown';

        // Save upload record to database - associated with user or university (if authenticated)
        const mediaData = {
            url: uploadResult.url,
            public_id: uploadResult.key, // Store S3 key in public_id field for backward compatibility
            format: format,
            resource_type: mediaType,
            fileSize: file.size,
            originalFilename: file.originalname,
            folder: user ? 'user_uploads' : (university ? 'university_uploads' : 'public_uploads'),
            provider: uploadResult.provider
        };
        
        // Set userId or universityId based on token type (if authenticated)
        if (user && userId) {
            mediaData.userId = userId;
        } else if (university && universityId) {
            mediaData.universityId = universityId;
        }
        // If neither user nor university, media is uploaded without association (public upload)
        
        const mediaRecord = await Media.create(mediaData);

            uploadedFiles.push({
                url: uploadResult.url,
                key: uploadResult.key,
                mimetype: file.mimetype,
                id: mediaRecord._id,
                format: format,
                type: mediaType,
                fileSize: file.size
            });
        }

        // If no files were processed
        if (uploadedFiles.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No files were uploaded or processed successfully."
            });
        }

        return res.status(200).json({
            success: true,
            message: "Media uploaded successfully",
            data: {
                files: uploadedFiles
            }
        });

    } catch (err) {
        console.error('S3 upload error:', err);

        return res.status(500).json({
            success: false,
            message: "Upload failed",
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

        // Delete old profile image from S3 if it exists
        if (user.profile?.profileImage) {
            try {
                // Find the media record to get the S3 key
                const oldMedia = await Media.findOne({ 
                    userId: user._id, 
                    url: user.profile.profileImage 
                });
                if (oldMedia && oldMedia.public_id) {
                    // public_id contains the S3 key
                    await StorageService.delete(oldMedia.public_id);
                }
                // Delete from Media collection
                await Media.findOneAndDelete({ 
                    userId: user._id, 
                    url: user.profile.profileImage 
                });
            } catch (deleteError) {
                // Log but don't fail if old image deletion fails
                console.warn('Failed to delete old profile image:', deleteError.message);
            }
        }

        // Handle file upload based on storage type
        // diskUpload provides file.path, multer-s3 provides file.location and file.key
        let uploadResult;
        if (req.file.path) {
            // File was saved to disk (diskStorage) - upload to S3
            uploadResult = await StorageService.uploadFromPath(req.file.path);
        } else if (req.file.location && req.file.key) {
            // File was already uploaded via multer-s3
            uploadResult = await StorageService.uploadFromRequest(req.file);
        } else {
            throw new Error('Invalid file object: missing path (diskStorage) or location/key (multer-s3)');
        }

        // Update user's profileImage field
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { 'profile.profileImage': uploadResult.url },
            { new: true, runValidators: true }
        ).lean().select('-auth');

        const format = req.file.mimetype.split('/')[1] || 'unknown';

        // Save upload record to database - associated with this specific user
        const mediaRecord = await Media.create({
            userId: user._id, // Ensures it's only associated with this user
            url: uploadResult.url,
            public_id: uploadResult.key, // Store S3 key in public_id field for backward compatibility
            format: format,
            resource_type: 'image',
            fileSize: req.file.size,
            originalFilename: req.file.originalname,
            folder: 'user_uploads',
            provider: uploadResult.provider
        });

        return res.status(200).json({
            success: true,
            message: "Profile image uploaded successfully",
            data: {
                id: mediaRecord._id,
                url: uploadResult.url,
                public_id: uploadResult.key, // Use key as public_id
                format: format,
                fileSize: req.file.size,
                user: {
                    id: updatedUser._id,
                    email: updatedUser.profile?.email,
                    name: updatedUser.profile?.name?.full,
                    profileImage: updatedUser.profile?.profileImage
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

        // Delete old cover photo from S3 if it exists
        if (user.profile?.coverPhoto) {
            try {
                // Find the media record to get the S3 key
                const oldMedia = await Media.findOne({ 
                    userId: user._id, 
                    url: user.profile.coverPhoto 
                });
                if (oldMedia && oldMedia.public_id) {
                    // public_id contains the S3 key
                    await StorageService.delete(oldMedia.public_id);
                }
                // Delete from Media collection
                await Media.findOneAndDelete({ 
                    userId: user._id, 
                    url: user.profile.coverPhoto 
                });
            } catch (deleteError) {
                // Log but don't fail if old image deletion fails
                console.warn('Failed to delete old cover photo:', deleteError.message);
            }
        }

        // Handle file upload based on storage type
        // diskUpload provides file.path, multer-s3 provides file.location and file.key
        let uploadResult;
        if (req.file.path) {
            // File was saved to disk (diskStorage) - upload to S3
            uploadResult = await StorageService.uploadFromPath(req.file.path);
        } else if (req.file.location && req.file.key) {
            // File was already uploaded via multer-s3
            uploadResult = await StorageService.uploadFromRequest(req.file);
        } else {
            throw new Error('Invalid file object: missing path (diskStorage) or location/key (multer-s3)');
        }

        // Update user's coverPhoto field
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { 'profile.coverPhoto': uploadResult.url },
            { new: true, runValidators: true }
        ).lean().select('-auth');

        const format = req.file.mimetype.split('/')[1] || 'unknown';

        // Save upload record to database - associated with this specific user
        const mediaRecord = await Media.create({
            userId: user._id, // Ensures it's only associated with this user
            url: uploadResult.url,
            public_id: uploadResult.key, // Store S3 key in public_id field for backward compatibility
            format: format,
            resource_type: 'image',
            fileSize: req.file.size,
            originalFilename: req.file.originalname,
            folder: 'user_uploads',
            provider: uploadResult.provider
        });

        return res.status(200).json({
            success: true,
            message: "Cover photo uploaded successfully",
            data: {
                id: mediaRecord._id,
                url: uploadResult.url,
                public_id: uploadResult.key, // Use key as public_id
                format: format,
                fileSize: req.file.size,
                user: {
                    id: updatedUser._id,
                    email: updatedUser.profile?.email,
                    name: updatedUser.profile?.name?.full,
                    coverPhoto: updatedUser.profile?.coverPhoto
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

// Remove profile image
const removeProfileImage = async (req, res) => {
    try {
        const user = req.user; // From protect middleware

        // Check if user has a profile image
        if (!user.profile?.profileImage) {
            return res.status(404).json({
                success: false,
                message: "No profile image found to remove"
            });
        }

        const profileImageUrl = user.profile.profileImage;

        // Find the media record to get the S3 key
        const media = await Media.findOne({ 
            userId: user._id, 
            url: profileImageUrl 
        });

        // Delete from S3 if media record exists
        if (media && media.public_id) {
            try {
                await StorageService.delete(media.public_id);
            } catch (deleteError) {
                console.warn('Failed to delete profile image from S3:', deleteError.message);
                // Continue with database deletion even if S3 deletion fails
            }
        }

        // Delete from Media collection if it exists
        if (media) {
            await Media.findByIdAndDelete(media._id);
        }

        // Clear profile image from user record
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { 'profile.profileImage': '' },
            { new: true, runValidators: true }
        ).lean().select('-auth');

        return res.status(200).json({
            success: true,
            message: "Profile image removed successfully",
            data: {
                user: {
                    id: updatedUser._id,
                    email: updatedUser.profile?.email,
                    name: updatedUser.profile?.name?.full,
                    profileImage: updatedUser.profile?.profileImage
                }
            }
        });

    } catch (err) {
        console.error('Remove profile image error:', err);
        return res.status(500).json({
            success: false,
            message: "Failed to remove profile image",
            error: err.message
        });
    }
};

// Remove cover photo
const removeCoverPhoto = async (req, res) => {
    try {
        const user = req.user; // From protect middleware

        // Check if user has a cover photo
        if (!user.profile?.coverPhoto) {
            return res.status(404).json({
                success: false,
                message: "No cover photo found to remove"
            });
        }

        const coverPhotoUrl = user.profile.coverPhoto;

        // Find the media record to get the S3 key
        const media = await Media.findOne({ 
            userId: user._id, 
            url: coverPhotoUrl 
        });

        // Delete from S3 if media record exists
        if (media && media.public_id) {
            try {
                await StorageService.delete(media.public_id);
            } catch (deleteError) {
                console.warn('Failed to delete cover photo from S3:', deleteError.message);
                // Continue with database deletion even if S3 deletion fails
            }
        }

        // Delete from Media collection if it exists
        if (media) {
            await Media.findByIdAndDelete(media._id);
        }

        // Clear cover photo from user record
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { 'profile.coverPhoto': '' },
            { new: true, runValidators: true }
        ).lean().select('-auth');

        return res.status(200).json({
            success: true,
            message: "Cover photo removed successfully",
            data: {
                user: {
                    id: updatedUser._id,
                    email: updatedUser.profile?.email,
                    name: updatedUser.profile?.name?.full,
                    coverPhoto: updatedUser.profile?.coverPhoto
                }
            }
        });

    } catch (err) {
        console.error('Remove cover photo error:', err);
        return res.status(500).json({
            success: false,
            message: "Failed to remove cover photo",
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

// Get user's images only - ensures users can only see their own uploads
const getUserImages = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Query only images belonging to this specific user
        const images = await Media.find({ 
            userId: user._id,
            resource_type: 'image' // Filter only images
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('-__v');

        // Get total count for pagination
        const totalImages = await Media.countDocuments({ 
            userId: user._id,
            resource_type: 'image' 
        });

        return res.status(200).json({
            success: true,
            message: "Images retrieved successfully",
            data: {
                count: images.length,
                totalImages: totalImages,
                images: images.map(item => ({
                    id: item._id,
                    url: item.url,
                    public_id: item.public_id,
                    format: item.format,
                    type: item.resource_type,
                    fileSize: item.fileSize,
                    originalFilename: item.originalFilename,
                    folder: item.folder,
                    uploadedAt: item.createdAt
                })),
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalImages / limit),
                    totalImages: totalImages,
                    hasNextPage: page < Math.ceil(totalImages / limit),
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (err) {
        console.error('Get user images error:', err);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve images",
            error: err.message
        });
    }
};

// Get user's images by user ID - public endpoint (anyone can view)
const getUserImagesPublic = async (req, res) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        // Validate user ID
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID'
            });
        }

        // Check if user exists
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Query only images belonging to this specific user
        const images = await Media.find({ 
            userId: id,
            resource_type: 'image' // Filter only images
        })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('-__v');

        // Get total count for pagination
        const totalImages = await Media.countDocuments({ 
            userId: id,
            resource_type: 'image' 
        });

        return res.status(200).json({
            success: true,
            message: "User images retrieved successfully",
            data: {
                user: {
                    id: user._id.toString(),
                    name: user.profile?.name?.full,
                    email: user.profile?.email,
                    profileImage: user.profile?.profileImage
                },
                count: images.length,
                totalImages: totalImages,
                images: images.map(item => ({
                    id: item._id,
                    url: item.url,
                    public_id: item.public_id,
                    format: item.format,
                    type: item.resource_type,
                    fileSize: item.fileSize,
                    originalFilename: item.originalFilename,
                    folder: item.folder,
                    uploadedAt: item.createdAt
                })),
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalImages / limit),
                    totalImages: totalImages,
                    hasNextPage: page < Math.ceil(totalImages / limit),
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (err) {
        console.error('Get user images public error:', err);
        return res.status(500).json({
            success: false,
            message: "Failed to retrieve user images",
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

        // Reject reserved route names that cannot be used as media IDs
        if (mediaId === 'profile-image' || mediaId === 'cover-photo') {
            return res.status(400).json({
                success: false,
                message: `"${mediaId}" is a reserved route name. Use DELETE /api/media/${mediaId} to remove your ${mediaId === 'profile-image' ? 'profile image' : 'cover photo'}.`
            });
        }

        // Validate that mediaId is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(mediaId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid media ID format. Media ID must be a valid ObjectId."
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

        // Delete from S3
        try {
            // public_id contains the S3 key
            await StorageService.delete(media.public_id);
        } catch (deleteError) {
            console.warn('Failed to delete from S3:', deleteError.message);
            // Continue with database deletion even if S3 deletion fails
        }

        // Delete from database
        await Media.findByIdAndDelete(mediaId);

        // If this was the user's profile image, clear it from user record
        const currentProfileImage = user.profile?.profileImage;
        if (currentProfileImage === media.url) {
            await User.findByIdAndUpdate(user._id, { 
                'profile.profileImage': ''
            }).lean();
        }

        // If this was the user's cover photo, clear it from user record
        const currentCoverPhoto = user.profile?.coverPhoto;
        if (currentCoverPhoto === media.url) {
await User.findByIdAndUpdate(user._id, { 
                'profile.coverPhoto': ''
            }).lean();
        }

        return res.status(200).json({
            success: true,
            message: "Media deleted successfully"
        });

    } catch (err) {
        console.error('Delete user media error:', err);
        
        // Handle CastError specifically for invalid ObjectId
        if (err.name === 'CastError' && err.path === '_id') {
            const invalidValue = err.value;
            // Check if it's a reserved route name
            if (invalidValue === 'profile-image' || invalidValue === 'cover-photo') {
                return res.status(400).json({
                    success: false,
                    message: `"${invalidValue}" is a reserved route name. Use DELETE /api/media/${invalidValue} to remove your ${invalidValue === 'profile-image' ? 'profile image' : 'cover photo'}.`
                });
            }
            return res.status(400).json({
                success: false,
                message: `Invalid media ID format: "${invalidValue}". Media ID must be a valid ObjectId.`
            });
        }
        
        return res.status(500).json({
            success: false,
            message: "Failed to delete media",
            error: err.message
        });
    }
};

// API 1: Update Bio, Cover Photo, Profile Image, and Cover Image
const updateProfileMedia = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { bio, coverPhoto, profileImage } = req.body;

        // Build update object with only provided fields
        const updateData = {};

        // Handle bio - update nested profile.bio field
        if (bio !== undefined) {
            updateData['profile.bio'] = bio.trim();
        }

        // Handle coverPhoto (can be URL string) - update nested profile.coverPhoto field
        if (coverPhoto !== undefined) {
            if (coverPhoto === null || coverPhoto === '') {
                updateData['profile.coverPhoto'] = '';
            } else {
                // Validate that it's a valid URL format
                try {
                    new URL(coverPhoto);
                    const trimmedCoverPhoto = coverPhoto.trim();
                    updateData['profile.coverPhoto'] = trimmedCoverPhoto;
                } catch (urlError) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cover photo must be a valid URL'
                    });
                }
            }
        }

        // Handle coverImage (alias for coverPhoto)
        // if (coverImage !== undefined) {
        //     if (coverImage === null || coverImage === '') {
        //         updateData['profile.coverPhoto'] = '';
        //         updateData.coverPhoto = '';
        //     } else {
        //         // Validate that it's a valid URL format
        //         try {
        //             new URL(coverImage);
        //             const trimmedCoverImage = coverImage.trim();
        //             updateData['profile.coverPhoto'] = trimmedCoverImage;
        //             updateData.coverPhoto = trimmedCoverImage;
        //         } catch (urlError) {
        //             return res.status(400).json({
        //                 success: false,
        //                 message: 'Cover image must be a valid URL'
        //             });
        //         }
        //     }
        // }

        // Handle profileImage (can be URL string) - update nested profile.profileImage field
        // Only update profileImage if it's explicitly provided in the request
        // IMPORTANT: Do NOT automatically set profileImage from coverPhoto
        // If profileImage is empty and coverPhoto is being updated, profileImage should remain unchanged
        if (profileImage !== undefined) {
            // Prevent automatic assignment: if profileImage is being set to coverPhoto value
            // and the user's current profileImage is empty, skip the update
            const currentProfileImage = user.profile?.profileImage || '';
            if (coverPhoto !== undefined && 
                profileImage === coverPhoto && 
                (!currentProfileImage || currentProfileImage === '')) {
                // Skip updating profileImage - this prevents automatic assignment from coverPhoto
                // Only update coverPhoto, leave profileImage unchanged
            } else if (profileImage === null || profileImage === '') {
                updateData['profile.profileImage'] = '';
            } else {
                // Validate that it's a valid URL format
                try {
                    new URL(profileImage);
                    const trimmedProfileImage = profileImage.trim();
                    updateData['profile.profileImage'] = trimmedProfileImage;
                } catch (urlError) {
                    return res.status(400).json({
                        success: false,
                        message: 'Profile image must be a valid URL'
                    });
                }
            }
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
        ).lean().select('-auth');

        res.status(200).json({
            success: true,
            message: 'Profile media updated successfully',
            data: {
                user: {
                    id: updatedUser._id,
                    bio: updatedUser.profile?.bio,
                    coverPhoto: updatedUser.profile?.coverPhoto,
                    profileImage: updatedUser.profile?.profileImage,
                    updatedAt: updatedUser.updatedAt
                }
            }
        });

    } catch (error) {
        console.error('Update profile media error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile media',
            error: error.message
        });
    }
};

// API 2: Update firstName, lastName, Gender, Date of Birth, phone number, alternate phone number
const updatePersonalInfo = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { firstName, lastName, gender, dob, phoneNumber, alternatePhoneNumber } = req.body;

        // Build update object with only provided fields
        const updateData = {};

        if (firstName !== undefined) {
            if (!firstName || firstName.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'First name cannot be empty'
                });
            }
            updateData['profile.name.first'] = firstName.trim();
        }

        if (lastName !== undefined) {
            if (!lastName || lastName.trim() === '') {
                return res.status(400).json({
                    success: false,
                    message: 'Last name cannot be empty'
                });
            }
            updateData['profile.name.last'] = lastName.trim();
        }

        // Auto-update name if firstName or lastName changed
        if (firstName !== undefined || lastName !== undefined) {
            const finalFirstName = updateData['profile.name.first'] || user.profile?.name?.first;
            const finalLastName = updateData['profile.name.last'] || user.profile?.name?.last;
            updateData['profile.name.full'] = `${finalFirstName} ${finalLastName}`.trim();
        }

        if (gender !== undefined) {
            const validGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];
            if (!validGenders.includes(gender)) {
                return res.status(400).json({
                    success: false,
                    message: 'Gender must be one of: Male, Female, Other, Prefer not to say'
                });
            }
            updateData['profile.gender'] = gender;
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
            updateData['profile.dob'] = dobDate;
        }

        // Build unset object for fields that need to be cleared
        const unsetData = {};

        // Handle phone number (if provided, just update - OTP verification should be done separately if needed)
        if (phoneNumber !== undefined) {
            if (phoneNumber === null || phoneNumber === '') {
                // Allow clearing phone number - use $unset to properly remove it
                unsetData['profile.phoneNumbers.primary'] = '';
            } else {
                // Normalize phone number
                let normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
                if (!normalizedPhone.startsWith('+')) {
                    normalizedPhone = '+' + normalizedPhone;
                }
                
                // Check if phone number is already taken by another user
                const existingUser = await User.findOne({ 
                    'profile.phoneNumbers.primary': normalizedPhone,
                    _id: { $ne: user._id }
                });
                
                if (existingUser) {
                    return res.status(400).json({
                        success: false,
                        message: 'Phone number is already registered by another user'
                    });
                }
                
                updateData['profile.phoneNumbers.primary'] = normalizedPhone;
            }
        }

        // Handle alternate phone number
        if (alternatePhoneNumber !== undefined) {
            if (alternatePhoneNumber === null || alternatePhoneNumber === '') {
                // Allow clearing alternate phone number - use $unset to properly remove it
                unsetData['profile.phoneNumbers.alternate'] = '';
            } else {
                // Normalize phone number
                let normalizedPhone = alternatePhoneNumber.replace(/[\s\-\(\)]/g, '');
                if (!normalizedPhone.startsWith('+')) {
                    normalizedPhone = '+' + normalizedPhone;
                }
                
                // Check if it's the same as primary phone number
                const finalPhoneNumber = updateData['profile.phoneNumbers.primary'] || user.profile?.phoneNumbers?.primary;
                if (finalPhoneNumber === normalizedPhone) {
                    return res.status(400).json({
                        success: false,
                        message: 'Alternate phone number cannot be the same as your primary phone number'
                    });
                }
                
                // Check if phone number is already taken by another user
                const existingUser = await User.findOne({ 
                    $or: [
                        { 'profile.phoneNumbers.primary': normalizedPhone, _id: { $ne: user._id } },
                        { 'profile.phoneNumbers.alternate': normalizedPhone, _id: { $ne: user._id } }
                    ]
                });
                
                if (existingUser) {
                    return res.status(400).json({
                        success: false,
                        message: 'This phone number is already registered by another user'
                    });
                }
                
                updateData['profile.phoneNumbers.alternate'] = normalizedPhone;
            }
        }

        // Check if there's anything to update
        if (Object.keys(updateData).length === 0 && Object.keys(unsetData).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields provided to update'
            });
        }

        // Build the update query with both $set and $unset if needed
        const updateQuery = {};
        if (Object.keys(updateData).length > 0) {
            updateQuery.$set = updateData;
        }
        if (Object.keys(unsetData).length > 0) {
            updateQuery.$unset = unsetData;
        }

        // Update user
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            updateQuery,
            { new: true, runValidators: true }
        ).lean().select('-auth');

        res.status(200).json({
            success: true,
            message: 'Personal information updated successfully',
            data: {
                user: {
                    id: updatedUser._id,
                    firstName: updatedUser.profile?.name?.first,
                    lastName: updatedUser.profile?.name?.last,
                    name: updatedUser.profile?.name?.full,
                    gender: updatedUser.profile?.gender,
                    dob: updatedUser.profile?.dob,
                    phoneNumber: updatedUser.profile?.phoneNumbers?.primary,
                    alternatePhoneNumber: updatedUser.profile?.phoneNumbers?.alternate,
                    updatedAt: updatedUser.updatedAt
                }
            }
        });

    } catch (error) {
        console.error('Update personal info error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating personal information',
            error: error.message
        });
    }
};

// API 3: Update currentCity, workplace, pronouns, education, relationshipStatus, hometown
const updateLocationAndDetails = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { currentCity, workplace, pronouns, education, relationshipStatus, hometown } = req.body;

        // Build update object with only provided fields
        const updateData = {};

        // Handle currentCity
        if (currentCity !== undefined) {
            updateData['location.currentCity'] = currentCity.trim();
        }

        // Handle hometown
        if (hometown !== undefined) {
            updateData['location.hometown'] = hometown.trim();
        }

        // Handle pronouns
        if (pronouns !== undefined) {
            updateData['profile.pronouns'] = pronouns.trim();
        }

        // Handle relationshipStatus
        if (relationshipStatus !== undefined) {
            if (relationshipStatus === null || relationshipStatus === '') {
                updateData['social.relationshipStatus'] = null;
            } else {
                const validStatuses = ['Single', 'In a relationship', 'Engaged', 'Married', 'In a civil partnership', 'In a domestic partnership', 'In an open relationship', "It's complicated", 'Separated', 'Divorced', 'Widowed'];
                if (!validStatuses.includes(relationshipStatus)) {
                    return res.status(400).json({
                        success: false,
                        message: `Relationship status must be one of: ${validStatuses.join(', ')}`
                    });
                }
                updateData['social.relationshipStatus'] = relationshipStatus;
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
            updateData['professional.workplace'] = processedWorkplace;
        }

        // Handle education (array of education entries)
        if (education !== undefined) {
            if (!Array.isArray(education)) {
                return res.status(400).json({
                    success: false,
                    message: 'Education must be an array'
                });
            }

            // Validate all education entries first and collect institution data
            const validEducations = [];
            const institutionData = [];

            for (const edu of education) {
                // Validate required fields for education entry
                if (!edu.institution || !edu.startYear) {
                    return res.status(400).json({
                        success: false,
                        message: 'Institution and startYear are required for each education entry'
                    });
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

                // Collect institution data for batch processing
                if (typeof edu.institution === 'string' && !mongoose.Types.ObjectId.isValid(edu.institution)) {
                    institutionData.push({
                        name: edu.institution,
                        type: edu.institutionType || 'school',
                        city: edu.city,
                        country: edu.country,
                        logo: edu.logo
                    });
                }
                validEducations.push(edu);
            }

            // Batch process institutions
            let institutionsMap;
            try {
                institutionsMap = institutionData.length > 0
                    ? await getOrCreateInstitutions(institutionData, user._id)
                    : new Map();
            } catch (error) {
                console.error('Error processing institutions:', error);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to process institution information',
                    error: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }

            // Process education entries with cached/created institutions
            const processedEducation = [];
            for (const edu of validEducations) {
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
                    // Look up institution from our batch-loaded map
                    const normalizedName = String(edu.institution).toLowerCase().trim();
                    institution = institutionsMap.get(normalizedName);
                    
                    if (!institution) {
                        console.error(`Failed to find institution in batch: ${edu.institution}`);
                        return res.status(400).json({
                            success: false,
                            message: `Failed to process institution: ${edu.institution}`
                        });
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
            updateData['professional.education'] = processedEducation;
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
        ).lean()
        .populate('professional.workplace.company', 'name isCustom')
        .populate('professional.education.institution', 'name type city country logo verified isCustom')
        .select('-auth');

        // Format workplace and education using helper functions
        const formattedWorkplace = formatWorkplace(updatedUser.professional?.workplace);
        const formattedEducation = formatEducation(updatedUser.professional?.education);

        res.status(200).json({
            success: true,
            message: 'Location and details updated successfully',
            data: {
                user: {
                    id: updatedUser._id,
                    currentCity: updatedUser.location?.currentCity,
                    hometown: updatedUser.location?.hometown,
                    pronouns: updatedUser.profile?.pronouns,
                    relationshipStatus: updatedUser.social?.relationshipStatus,
                    workplace: formattedWorkplace,
                    education: formattedEducation,
                    updatedAt: updatedUser.updatedAt
                }
            }
        });

    } catch (error) {
        console.error('Update location and details error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating location and details',
            error: error.message
        });
    }
};

// Search users by name
const searchUsers = async (req, res) => {
    try {
        const { query } = req.query;
        const user = req.user; // From protect middleware
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        if (!query || query.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Search query is required'
            });
        }

        const searchTerm = query.trim();

        // Get current user's blocked users
        const blockedUserIds = await getBlockedUserIds(user._id);

        // Get users who have blocked the current user
        const usersWhoBlockedMe = await User.find({
            'social.blockedUsers': user._id
        }).select('_id').lean();
        const blockedByUserIds = usersWhoBlockedMe.map(u => u._id);

        // Combine all users to exclude (current user + users I blocked + users who blocked me)
        const excludedUserIds = [
            user._id,
            ...blockedUserIds,
            ...blockedByUserIds
        ];

        // Search for users that match the query (case-insensitive)
        // Returns ALL users except: current user, users I blocked, and users who blocked me
        // Search across firstName, lastName, and full name fields
        const searchQuery = {
            _id: { $nin: excludedUserIds }, // Exclude current user, blocked users, and users who blocked me
            $or: [
                { 'profile.name.first': { $regex: searchTerm, $options: 'i' } },
                { 'profile.name.last': { $regex: searchTerm, $options: 'i' } },
                { 'profile.name.full': { $regex: searchTerm, $options: 'i' } }
            ]
        };

        // Get total count for pagination
        const totalUsers = await User.countDocuments(searchQuery);

        // Search for users that match the query
        const users = await User.find(searchQuery)
            .select('-auth -profile.email') // Exclude sensitive data
            .sort({ 'profile.name.full': 1 }) // Sort alphabetically
            .skip(skip)
            .limit(limit);

        // If no matches found
        if (users.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No users found',
                data: {
                    users: [],
                    pagination: {
                        currentPage: page,
                        totalPages: 0,
                        totalUsers: 0,
                        hasNextPage: false,
                        hasPrevPage: false
                    }
                }
            });
        }

        // Preload current user's friends list once and convert to Set for O(1) lookups
        const currentUserWithFriends = await User.findById(user._id).select('social.friends');
        const currentUserFriends = currentUserWithFriends?.social?.friends || [];
        const currentUserFriendsSet = new Set(currentUserFriends.map(id => id.toString()));

        // Process users with privacy checks
        const formattedUsers = users.map(searchedUser => {
            const userId = searchedUser._id.toString();
            const isProfilePrivate = searchedUser.profile?.visibility === 'private';
            const isFriend = currentUserFriendsSet.has(userId);
            
            // If profile is private and viewer is not a friend, return limited data
            if (isProfilePrivate && !isFriend) {
                return getLimitedProfileData(searchedUser);
            }
            
            // Otherwise return full data (public profile or friend viewing private profile)
            return getFullProfileData(searchedUser);
        });

        return res.status(200).json({
            success: true,
            message: `Found ${users.length} user/users`,
            data: {
                users: formattedUsers,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalUsers / limit),
                    totalUsers: totalUsers,
                    hasNextPage: page < Math.ceil(totalUsers / limit),
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({
            success: false,
            message: 'Error searching users',
            error: error.message
        });
    }
};

// Remove education entry by ID or index
const removeEducationEntry = async (req, res) => {
    try {
        const { educationId } = req.params;
        
        // First, get a fresh copy of the user
        const user = await User.findById(req.user._id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if education array exists
        if (!user.professional?.education || !Array.isArray(user.professional.education)) {
            return res.status(400).json({
                success: false,
                message: 'No education entries found'
            });
        }

        let educationToRemove;
        let educationIdToRemove;

        // First try to find by ID if it's a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(educationId)) {
            educationToRemove = user.professional.education.find(edu => edu._id.toString() === educationId);
            if (educationToRemove) {
                educationIdToRemove = educationToRemove._id;
            }
        }
        
        // If not found by ID, try to use as index (for backward compatibility)
        if (!educationToRemove) {
            const entryIndex = parseInt(educationId);
            if (isNaN(entryIndex) || entryIndex < 0 || entryIndex >= user.professional.education.length) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid education entry ID or index.'
                });
            }
            educationToRemove = user.professional.education[entryIndex];
            educationIdToRemove = educationToRemove._id;
        }

        // Remove the education entry by ID
        await User.findByIdAndUpdate(
            user._id,
            { $pull: { 'professional.education': { _id: educationIdToRemove } } },
            { new: true, runValidators: true }
        ).lean();

        // Get updated user with populated fields
        const updatedUser = await User.findById(user._id)
            .populate('professional.education.institution', 'name type city country logo verified isCustom')
            .select('-auth');

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

        res.status(200).json({
            success: true,
            message: 'Education entry removed successfully',
            data: {
                removedEntry: {
                    description: educationToRemove.description,
                    degree: educationToRemove.degree,
                    field: educationToRemove.field,
                    institutionType: educationToRemove.institutionType,
                    startYear: educationToRemove.startYear,
                    endYear: educationToRemove.endYear
                },
                education: formattedEducation,
                remainingCount: formattedEducation.length
            }
        });

    } catch (error) {
        console.error('Remove education entry error:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing education entry',
            error: error.message
        });
    }
};

// Remove workplace entry by index
const removeWorkplaceEntry = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { index } = req.params;
        const entryIndex = parseInt(index);

        if (isNaN(entryIndex) || entryIndex < 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid workplace entry index. Index must be a non-negative number.'
            });
        }

        // Check if professional.workplace array exists and has the entry
        if (!user.professional?.workplace || !Array.isArray(user.professional.workplace)) {
            return res.status(400).json({
                success: false,
                message: 'No workplace entries found'
            });
        }

        if (entryIndex >= user.professional.workplace.length) {
            return res.status(404).json({
                success: false,
                message: `Workplace entry at index ${entryIndex} not found. You have ${user.professional.workplace.length} workplace entries.`
            });
        }

        // Get the workplace entry to be removed (for response)
        const workplaceToRemove = user.professional.workplace[entryIndex];
        const workplaceId = workplaceToRemove._id;
        
        // Remove the workplace entry using $pull with the entry's _id
        await User.findByIdAndUpdate(
            user._id,
            { $pull: { 'professional.workplace': { _id: workplaceId } } },
            { new: true, runValidators: true }
        ).lean();

        // Fallback: if _id doesn't exist (shouldn't happen with Mongoose)
        if (!workplaceId) {
            const updatedWorkplace = user.professional.workplace.filter((_, idx) => idx !== entryIndex);
            await User.findByIdAndUpdate(
                user._id,
                { $set: { 'professional.workplace': updatedWorkplace } },
                { new: true, runValidators: true }
            ).lean();
        }

        // Get updated user with populated fields
        const updatedUser = await User.findById(user._id)
            .populate('professional.workplace.company', 'name isCustom')
            .select('-auth');

        // Format workplace to include company name
        const formattedWorkplace = (updatedUser.professional?.workplace || []).map(work => ({
            company: work.company ? {
                id: work.company._id,
                name: work.company.name,
                isCustom: work.company.isCustom
            } : null,
            position: work.position,
            description: work.description,
            startDate: work.startDate,
            endDate: work.endDate,
            isCurrent: work.isCurrent
        }));

        res.status(200).json({
            success: true,
            message: 'Workplace entry removed successfully',
            data: {
                removedEntry: {
                    position: workplaceToRemove.position,
                    description: workplaceToRemove.description,
                    startDate: workplaceToRemove.startDate,
                    endDate: workplaceToRemove.endDate,
                    isCurrent: workplaceToRemove.isCurrent
                },
                workplace: formattedWorkplace,
                remainingCount: formattedWorkplace.length
            }
        });

    } catch (error) {
        console.error('Remove workplace entry error:', error);
        res.status(500).json({
            success: false,
            message: 'Error removing workplace entry',
            error: error.message
        });
    }
};

// Block a user
const blockUser = async (req, res) => {
    try {
        const userId = req.user._id;
        const { blockedUserId } = req.params;

        // Validate blockedUserId
        if (!mongoose.Types.ObjectId.isValid(blockedUserId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID'
            });
        }

        // Check if trying to block themselves
        if (userId.toString() === blockedUserId) {
            return res.status(400).json({
                success: false,
                message: 'You cannot block yourself'
            });
        }

        // Check if user to block exists
        const userToBlock = await User.findById(blockedUserId);
        if (!userToBlock) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get current user
        const currentUser = await User.findById(userId);
        if (!currentUser) {
            return res.status(404).json({
                success: false,
                message: 'Current user not found'
            });
        }

        // Check if already blocked
        const isAlreadyBlocked = await isUserBlocked(userId, blockedUserId);
        if (isAlreadyBlocked) {
            return res.status(400).json({
                success: false,
                message: 'User is already blocked'
            });
        }

        // Add to blocked users list
        // MongoDB will automatically create the parent path if it doesn't exist
        await User.findByIdAndUpdate(userId, {
            $addToSet: { 
                'social.blockedUsers': blockedUserId
            }
        });

        // Remove from friends list if they are friends (both directions)
        await User.findByIdAndUpdate(userId, {
            $pull: { 'social.friends': blockedUserId }
        }).lean();
        await User.findByIdAndUpdate(blockedUserId, {
            $pull: { 'social.friends': userId }
        }).lean();

        // Cancel any pending friend requests between them
        const FriendRequest = require('../models/social/FriendRequest');
        await FriendRequest.deleteMany({
            $or: [
                { sender: userId, receiver: blockedUserId },
                { sender: blockedUserId, receiver: userId }
            ]
        });

        // Get updated user with blocked user details
        const updatedUser = await User.findById(userId)
            .populate('social.blockedUsers', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email')
            .select('social.blockedUsers');

        res.status(200).json({
            success: true,
            message: 'User blocked successfully',
            data: {
                blockedUser: {
                    _id: userToBlock._id,
                    firstName: userToBlock.profile?.name?.first,
                    lastName: userToBlock.profile?.name?.last,
                    name: userToBlock.profile?.name?.full,
                    profileImage: userToBlock.profile?.profileImage,
                    email: userToBlock.profile?.email
                },
                blockedUsers: updatedUser.social?.blockedUsers || []
            }
        });
    } catch (error) {
        console.error('Block user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to block user',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Unblock a user
const unblockUser = async (req, res) => {
    try {
        const userId = req.user._id;
        const { blockedUserId } = req.params;

        // Validate blockedUserId
        if (!mongoose.Types.ObjectId.isValid(blockedUserId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID'
            });
        }

        // Check if user to unblock exists
        const userToUnblock = await User.findById(blockedUserId);
        if (!userToUnblock) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Get current user
        const currentUser = await User.findById(userId);
        if (!currentUser) {
            return res.status(404).json({
                success: false,
                message: 'Current user not found'
            });
        }

        // Check if user is blocked
        const isBlocked = await isUserBlocked(userId, blockedUserId);
        if (!isBlocked) {
            return res.status(400).json({
                success: false,
                message: 'User is not blocked'
            });
        }

        // Remove from blocked users list
        await User.findByIdAndUpdate(userId, {
            $pull: { 
                'social.blockedUsers': blockedUserId
            }
        });

        // Get updated user with blocked users
        const updatedUser = await User.findById(userId)
            .populate('social.blockedUsers', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email')
            .select('social.blockedUsers');

        res.status(200).json({
            success: true,
            message: 'User unblocked successfully',
            data: {
                unblockedUser: {
                    _id: userToUnblock._id,
                    firstName: userToUnblock.profile?.name?.first,
                    lastName: userToUnblock.profile?.name?.last,
                    name: userToUnblock.profile?.name?.full,
                    profileImage: userToUnblock.profile?.profileImage,
                    email: userToUnblock.profile?.email
                },
                blockedUsers: updatedUser.social?.blockedUsers || []
            }
        });
    } catch (error) {
        console.error('Unblock user error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to unblock user',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// List all blocked users
const listBlockedUsers = async (req, res) => {
    try {
        const userId = req.user._id;

        // Get user with populated blocked users
        const user = await User.findById(userId)
            .populate('social.blockedUsers', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email profile.bio location.currentCity location.hometown')
            .select('social.blockedUsers');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const blockedUsers = user.social?.blockedUsers || [];

        res.status(200).json({
            success: true,
            message: 'Blocked users retrieved successfully',
            data: {
                blockedUsers: blockedUsers,
                count: blockedUsers.length
            }
        });
    } catch (error) {
        console.error('List blocked users error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve blocked users',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get user profile by ID
const getUserProfileById = async (req, res) => {
    try {
        const { userId } = req.params;
        const currentUser = req.user; // The authenticated user making the request

        // Find the target user
        const user = await User.findById(userId)
            .select('-auth -__v')
            .populate('professional.workplace.company', 'name isCustom')
            .populate('professional.education.institution', 'name type city country logo verified isCustom');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if the current user is blocked by the target user
        const isBlocked = await isUserBlocked(user._id, currentUser._id);
        if (isBlocked) {
            return res.status(403).json({
                success: false,
                message: 'You are blocked from viewing this profile'
            });
        }

        // Check if the target user's profile is private
        const isPrivate = user.profile?.visibility === 'private';
        const isFriend = await areFriends(currentUser._id, user._id);

        // If profile is private and users are not friends, return limited profile
        if (isPrivate && !isFriend && !currentUser.isAdmin) {
            return res.status(200).json({
                success: true,
                message: 'User profile retrieved (limited)',
                data: {
                    user: getLimitedProfileData(user),
                    isPrivate: true
                }
            });
        }

        // Format the response data
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

        const numberOfFriends = user.social?.friends ? user.social.friends.length : 0;

        // Return full profile data
        res.status(200).json({
            success: true,
            message: 'User profile retrieved successfully',
            data: {
                user: {
                    id: user._id,
                    profile: {
                        name: {
                            first: user.profile?.name?.first,
                            last: user.profile?.name?.last,
                            full: user.profile?.name?.full
                        },
                        email: isFriend || currentUser._id.equals(user._id) ? user.profile?.email : undefined,
                        phoneNumbers: isFriend || currentUser._id.equals(user._id) ? {
                            primary: user.profile?.phoneNumbers?.primary,
                            alternate: user.profile?.phoneNumbers?.alternate
                        } : undefined,
                        gender: user.profile?.gender,
                        pronouns: user.profile?.pronouns,
                        dob: user.profile?.dob,
                        bio: user.profile?.bio,
                        profileImage: user.profile?.profileImage,
                        coverPhoto: user.profile?.coverPhoto,
                        visibility: user.profile?.visibility || 'public'
                    },
                    location: {
                        currentCity: user.location?.currentCity,
                        hometown: user.location?.hometown
                    },
                    social: {
                        numberOfFriends,
                        relationshipStatus: user.social?.relationshipStatus
                    },
                    professional: {
                        workplace: formattedWorkplace,
                        education: formattedEducation
                    },
                    account: {
                        createdAt: user.createdAt,
                        updatedAt: user.updatedAt,
                        isActive: user.account?.isActive,
                        isVerified: user.account?.isVerified
                    }
                }
            }
        });

    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user profile',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Update profile visibility (public/private)
const updateProfileVisibility = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { visibility } = req.body;

        // Validate visibility value
        if (visibility === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Visibility field is required'
            });
        }

        if (!['public', 'private'].includes(visibility)) {
            return res.status(400).json({
                success: false,
                message: 'Visibility must be either "public" or "private"'
            });
        }

        // Update profile visibility
        const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { 'profile.visibility': visibility },
            { new: true, runValidators: true }
        ).lean().select('-auth');

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            message: `Profile visibility updated to ${visibility}`,
            data: {
                user: {
                    id: updatedUser._id,
                    profileVisibility: updatedUser.profile?.visibility || 'public'
                }
            }
        });

    } catch (error) {
        console.error('Update profile visibility error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile visibility',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    removeProfileImage,
    removeCoverPhoto,
    getUserMedia,
    getUserImages,
    getUserImagesPublic,
    deleteUserMedia,
    updateProfileMedia,
    updatePersonalInfo,
    updateLocationAndDetails,
    searchUsers,
    removeEducationEntry,
    removeWorkplaceEntry,
    blockUser,
    unblockUser,
    listBlockedUsers,
    updateProfileVisibility,
    getUserProfileById
};


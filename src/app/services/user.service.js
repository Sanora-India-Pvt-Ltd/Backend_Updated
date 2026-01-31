/**
 * User profile, media, phone, block/list, and search business logic.
 * Extracted from userController. Returns { statusCode, json } or throws { statusCode, json }.
 */

const mongoose = require('mongoose');
const User = require('../../models/authorization/User');
const Media = require('../../models/Media');
const Company = require('../../models/authorization/Company');
const Institution = require('../../models/authorization/Institution');
const FriendRequest = require('../../models/social/FriendRequest');
const { formatEducation, formatWorkplace } = require('../../utils/formatters');
const NodeCache = require('node-cache');
const twilio = require('twilio');
const { transcodeVideo, isVideo, cleanupFile } = require('../../core/infra/videoTranscoder');
const cache = require('../../core/infra/cache');

let cloudinary;
try {
    cloudinary = require('../../config/cloudinary');
} catch (e) {
    cloudinary = null;
}

const companyCache = new NodeCache({ stdTTL: 3600 });
const institutionCache = new NodeCache({ stdTTL: 3600 });

function httpError(statusCode, json) {
    const err = new Error(json.message || 'Error');
    err.statusCode = statusCode;
    err.json = json;
    throw err;
}

async function getOrCreateCompanies(companyNames, userId) {
    const uniqueNames = [...new Set(companyNames.map(name => name.toLowerCase().trim()))];
    const existingCompanies = await Company.find({ normalizedName: { $in: uniqueNames } }).lean();
    const existingMap = new Map();
    existingCompanies.forEach(company => {
        existingMap.set(company.normalizedName, company);
        companyCache.set(company.normalizedName, company);
    });
    const toCreate = [];
    const result = new Map();
    for (const name of uniqueNames) {
        const normalized = name.toLowerCase();
        const cached = companyCache.get(normalized);
        if (cached) result.set(normalized, cached);
        else if (existingMap.has(normalized)) {
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
    if (toCreate.length > 0) {
        try {
            const created = await Company.insertMany(toCreate, { ordered: false });
            created.forEach(company => {
                companyCache.set(company.normalizedName, company);
                result.set(company.normalizedName, company);
            });
        } catch (error) {
            if (error.code === 11000) {
                const existing = await Company.find({ normalizedName: { $in: toCreate.map(c => c.normalizedName) } }).lean();
                existing.forEach(company => {
                    companyCache.set(company.normalizedName, company);
                    result.set(company.normalizedName, company);
                });
            } else throw error;
        }
    }
    return result;
}

async function getOrCreateInstitutions(institutionData, userId) {
    const uniqueInstitutions = [];
    const nameToData = new Map();
    institutionData.forEach(data => {
        const normalized = data.name.toLowerCase().trim();
        if (!nameToData.has(normalized)) {
            nameToData.set(normalized, data);
            uniqueInstitutions.push(normalized);
        }
    });
    const existingInstitutions = await Institution.find({ normalizedName: { $in: uniqueInstitutions } }).lean();
    const existingMap = new Map();
    existingInstitutions.forEach(inst => {
        existingMap.set(inst.normalizedName, inst);
        institutionCache.set(inst.normalizedName, inst);
    });
    const toCreate = [];
    const result = new Map();
    for (const normalized of uniqueInstitutions) {
        const cached = institutionCache.get(normalized);
        if (cached) result.set(normalized, cached);
        else if (existingMap.has(normalized)) {
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
    if (toCreate.length > 0) {
        try {
            const created = await Institution.insertMany(toCreate, { ordered: false });
            created.forEach(inst => {
                institutionCache.set(inst.normalizedName, inst);
                result.set(inst.normalizedName, inst);
            });
        } catch (error) {
            if (error.code === 11000) {
                const existing = await Institution.find({ normalizedName: { $in: toCreate.map(i => i.normalizedName) } }).lean();
                existing.forEach(inst => {
                    institutionCache.set(inst.normalizedName, inst);
                    result.set(inst.normalizedName, inst);
                });
            } else throw error;
        }
    }
    return result;
}

async function areFriends(userId1, userId2) {
    try {
        const user1 = await User.findById(userId1).select('social.friends').lean();
        if (!user1) return false;
        const friendsList = user1.social?.friends || [];
        return friendsList.some(friendId => friendId.toString() === userId2.toString());
    } catch (error) {
        console.error('Error checking friendship:', error);
        return false;
    }
}

async function getBlockedUserIds(userId) {
    try {
        const user = await User.findById(userId).select('social.blockedUsers').lean();
        if (!user) return [];
        const blockedUsers = user.social?.blockedUsers || [];
        return blockedUsers.map(id => id.toString());
    } catch (error) {
        console.error('Error getting blocked users:', error);
        return [];
    }
}

async function isUserBlocked(blockerId, blockedId) {
    try {
        const blockedUserIds = await getBlockedUserIds(blockerId);
        return blockedUserIds.includes(blockedId.toString());
    } catch (error) {
        console.error('Error checking if user is blocked:', error);
        return false;
    }
}

function getLimitedProfileData(user) {
    return {
        id: user._id,
        firstName: user.profile?.name?.first,
        lastName: user.profile?.name?.last,
        name: user.profile?.name?.full,
        profileImage: user.profile?.profileImage || ''
    };
}

function getFullProfileData(user) {
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
}

async function updateProfile(user, body) {
    try {
        const { firstName, lastName, name, dob, gender, bio, currentCity, hometown, relationshipStatus, workplace, education, coverPhoto } = body;
        const updateData = {};

        if (firstName !== undefined) {
            if (!firstName || firstName.trim() === '') httpError(400, { success: false, message: 'First name cannot be empty' });
            updateData['profile.name.first'] = firstName.trim();
        }
        if (lastName !== undefined) {
            if (!lastName || lastName.trim() === '') httpError(400, { success: false, message: 'Last name cannot be empty' });
            updateData['profile.name.last'] = lastName.trim();
        }
        if (name !== undefined) {
            updateData['profile.name.full'] = name.trim() || '';
        } else if (firstName !== undefined || lastName !== undefined) {
            const finalFirstName = updateData['profile.name.first'] || user.profile?.name?.first;
            const finalLastName = updateData['profile.name.last'] || user.profile?.name?.last;
            updateData['profile.name.full'] = `${finalFirstName} ${finalLastName}`.trim();
        }
        if (dob !== undefined) {
            const dobDate = new Date(dob);
            if (isNaN(dobDate.getTime())) httpError(400, { success: false, message: 'Date of birth must be a valid date (ISO 8601 format: YYYY-MM-DD)' });
            if (dobDate > new Date()) httpError(400, { success: false, message: 'Date of birth cannot be in the future' });
            const minDate = new Date();
            minDate.setFullYear(minDate.getFullYear() - 150);
            if (dobDate < minDate) httpError(400, { success: false, message: 'Date of birth is too far in the past (maximum 150 years)' });
            updateData['profile.dob'] = dobDate;
        }
        if (gender !== undefined) {
            const validGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];
            if (!validGenders.includes(gender)) httpError(400, { success: false, message: 'Gender must be one of: Male, Female, Other, Prefer not to say' });
            updateData['profile.gender'] = gender;
        }
        if (bio !== undefined) updateData['profile.bio'] = bio.trim();
        if (currentCity !== undefined) updateData['location.currentCity'] = currentCity.trim();
        if (hometown !== undefined) updateData['location.hometown'] = hometown.trim();
        if (coverPhoto !== undefined) {
            if (coverPhoto === null || coverPhoto === '') updateData['profile.coverPhoto'] = '';
            else {
                try {
                    new URL(coverPhoto);
                    updateData['profile.coverPhoto'] = coverPhoto.trim();
                } catch (urlError) {
                    httpError(400, { success: false, message: 'Cover photo must be a valid URL' });
                }
            }
        }
        if (relationshipStatus !== undefined) {
            if (relationshipStatus === null || relationshipStatus === '') updateData['social.relationshipStatus'] = null;
            else {
                const validStatuses = ['Single', 'In a relationship', 'Engaged', 'Married', 'In a civil partnership', 'In a domestic partnership', 'In an open relationship', "It's complicated", 'Separated', 'Divorced', 'Widowed'];
                if (!validStatuses.includes(relationshipStatus)) httpError(400, { success: false, message: `Relationship status must be one of: ${validStatuses.join(', ')}` });
                updateData['social.relationshipStatus'] = relationshipStatus;
            }
        }

        if (workplace !== undefined) {
            if (!Array.isArray(workplace)) httpError(400, { success: false, message: 'Workplace must be an array' });
            const processedWorkplace = [];
            for (const work of workplace) {
                if (!work.company || !work.position || !work.startDate) httpError(400, { success: false, message: 'Each workplace entry must have company, position, and startDate' });
                if (work.startDate && isNaN(new Date(work.startDate).getTime())) httpError(400, { success: false, message: 'Invalid startDate format' });
                if (work.endDate && isNaN(new Date(work.endDate).getTime())) httpError(400, { success: false, message: 'Invalid endDate format' });
                let company;
                if (mongoose.Types.ObjectId.isValid(work.company)) {
                    company = await Company.findById(work.company);
                    if (!company) httpError(400, { success: false, message: `Company with ID ${work.company} not found` });
                } else {
                    const companyName = String(work.company).trim();
                    if (!companyName) httpError(400, { success: false, message: 'Company name cannot be empty' });
                    const normalizedCompanyName = companyName.toLowerCase();
                    company = await Company.findOne({ $or: [{ name: companyName }, { normalizedName: normalizedCompanyName }] });
                    if (!company) {
                        try {
                            company = await Company.create({ name: companyName, normalizedName: normalizedCompanyName, isCustom: true, createdBy: user._id });
                            console.log(`✅ Created new company: ${companyName}`);
                        } catch (err) {
                            if (err.code === 11000) company = await Company.findOne({ $or: [{ name: companyName }, { normalizedName: normalizedCompanyName }] });
                            else throw err;
                        }
                    }
                }
                processedWorkplace.push({
                    company: company._id,
                    position: work.position,
                    description: work.description ? work.description.trim() : '',
                    startDate: new Date(work.startDate),
                    endDate: work.endDate ? new Date(work.endDate) : null,
                    isCurrent: work.isCurrent || false
                });
            }
            updateData['professional.workplace'] = processedWorkplace;
        }

        if (education !== undefined) {
            if (!Array.isArray(education)) httpError(400, { success: false, message: 'Education must be an array' });
            const processedEducation = [];
            for (const edu of education) {
                if (!edu.institution || !edu.startYear) httpError(400, { success: false, message: 'Institution and startYear are required for each education entry' });
                if (isNaN(parseInt(edu.startYear)) || parseInt(edu.startYear) < 1900 || parseInt(edu.startYear) > new Date().getFullYear() + 10) httpError(400, { success: false, message: 'Invalid startYear format (must be a valid year)' });
                if (edu.endYear && (isNaN(parseInt(edu.endYear)) || parseInt(edu.endYear) < 1900 || parseInt(edu.endYear) > new Date().getFullYear() + 10)) httpError(400, { success: false, message: 'Invalid endYear format (must be a valid year)' });
                let institution;
                if (mongoose.Types.ObjectId.isValid(edu.institution)) {
                    institution = await Institution.findById(edu.institution);
                    if (!institution) httpError(400, { success: false, message: `Institution with ID ${edu.institution} not found` });
                } else {
                    const institutionName = edu.institution.trim();
                    const normalizedInstitutionName = institutionName.toLowerCase();
                    institution = await Institution.findOne({ $or: [{ name: institutionName }, { normalizedName: normalizedInstitutionName }] });
                    if (!institution) {
                        try {
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
                        } catch (err) {
                            if (err.code === 11000) institution = await Institution.findOne({ $or: [{ name: institutionName }, { normalizedName: normalizedInstitutionName }] });
                            else throw err;
                        }
                    }
                }
                if (edu.startMonth !== undefined) {
                    const startMonth = parseInt(edu.startMonth);
                    if (isNaN(startMonth) || startMonth < 1 || startMonth > 12) httpError(400, { success: false, message: 'Invalid startMonth (must be between 1 and 12)' });
                }
                if (edu.endMonth !== undefined && edu.endMonth !== null) {
                    const endMonth = parseInt(edu.endMonth);
                    if (isNaN(endMonth) || endMonth < 1 || endMonth > 12) httpError(400, { success: false, message: 'Invalid endMonth (must be between 1 and 12)' });
                }
                if (edu.institutionType !== undefined) {
                    const validTypes = ['school', 'college', 'university', 'others'];
                    if (!validTypes.includes(edu.institutionType)) httpError(400, { success: false, message: `Institution type must be one of: ${validTypes.join(', ')}` });
                }
                if (edu.cgpa !== undefined && edu.cgpa !== null) {
                    const cgpa = parseFloat(edu.cgpa);
                    if (isNaN(cgpa) || cgpa < 0 || cgpa > 10) httpError(400, { success: false, message: 'Invalid CGPA (must be between 0 and 10)' });
                }
                if (edu.percentage !== undefined && edu.percentage !== null) {
                    const percentage = parseFloat(edu.percentage);
                    if (isNaN(percentage) || percentage < 0 || percentage > 100) httpError(400, { success: false, message: 'Invalid percentage (must be between 0 and 100)' });
                }
                processedEducation.push({
                    institution: institution._id,
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
                });
            }
            updateData['professional.education'] = processedEducation;
        }

        if (Object.keys(updateData).length === 0) httpError(400, { success: false, message: 'No fields provided to update' });

        const updatedUser = await User.findByIdAndUpdate(user._id, updateData, { new: true, runValidators: true })
            .lean()
            .populate('professional.workplace.company', 'name isCustom')
            .populate('professional.education.institution', 'name type city country logo verified isCustom')
            .select('-auth');

        const formattedWorkplace = formatWorkplace(updatedUser.professional?.workplace);
        const formattedEducation = formatEducation(updatedUser.professional?.education);

        return {
            statusCode: 200,
            json: {
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
                        phoneNumber: updatedUser.profile?.phoneNumbers?.primary,
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
            }
        };
    } catch (error) {
        if (error.statusCode && error.json) throw error;
        console.error('Update profile error:', error);
        throw { statusCode: 500, json: { success: false, message: 'Error updating profile', error: error.message } };
    }
}

async function sendOTPForPhoneUpdate(user, body) {
    const { phoneNumber } = body;
    if (!phoneNumber) return { statusCode: 400, json: { success: false, message: 'Phone number is required' } };
    let normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
    const existingUser = await User.findOne({ 'profile.phoneNumbers.primary': normalizedPhone, _id: { $ne: user._id } }).lean();
    if (existingUser) return { statusCode: 400, json: { success: false, message: 'Phone number is already registered by another user' } };
    if (user.profile?.phoneNumbers?.primary === normalizedPhone) return { statusCode: 400, json: { success: false, message: 'This is already your current phone number' } };
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) return { statusCode: 500, json: { success: false, message: 'Twilio is not configured for phone OTP' } };
    try {
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const twilioServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
        console.log('📱 Using Twilio Verify v2 API to send OTP for phone update');
        const verification = await twilioClient.verify.v2.services(twilioServiceSid).verifications.create({ to: normalizedPhone, channel: 'sms' });
        return { statusCode: 200, json: { success: true, message: 'OTP sent successfully to your phone', data: { phone: normalizedPhone, sid: verification.sid, status: verification.status } } };
    } catch (error) {
        console.error('Send OTP for phone update error:', error);
        const errorMessage = error.message && error.message.includes('Invalid parameter `To`') ? 'Invalid phone number format. Please ensure the phone number is in E.164 format (e.g., +1234567890) with country code.' : error.message || 'Failed to send OTP';
        return { statusCode: 500, json: { success: false, message: errorMessage, hint: 'Phone number must be in E.164 format: +[country code][subscriber number]' } };
    }
}

async function verifyOTPAndUpdatePhone(user, body) {
    const { phoneNumber, otp } = body;
    if (!phoneNumber || !otp) return { statusCode: 400, json: { success: false, message: 'Phone number and OTP code are required' } };
    let normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
    const existingUser = await User.findOne({ $or: [{ 'profile.phoneNumbers.primary': normalizedPhone }, { 'profile.phoneNumbers.alternate': normalizedPhone }], _id: { $ne: user._id } }).lean();
    if (existingUser) return { statusCode: 400, json: { success: false, message: 'Phone number is already registered by another user' } };
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) return { statusCode: 500, json: { success: false, message: 'Twilio is not configured' } };
    try {
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const twilioServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
        console.log('✅ Using Twilio Verify v2 API to verify OTP for phone update');
        const check = await twilioClient.verify.v2.services(twilioServiceSid).verificationChecks.create({ to: normalizedPhone, code: otp });
        if (check.status !== 'approved') return { statusCode: 400, json: { success: false, message: 'Invalid or expired OTP code' } };
        const updatedUser = await User.findByIdAndUpdate(user._id, { 'profile.phoneNumbers.primary': normalizedPhone }, { new: true, runValidators: true }).lean().select('-auth');
        return {
            statusCode: 200,
            json: {
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
                        phoneNumber: updatedUser.profile?.phoneNumbers?.primary,
                        alternatePhoneNumber: updatedUser.profile?.phoneNumbers?.alternate,
                        gender: updatedUser.profile?.gender,
                        profileImage: updatedUser.profile?.profileImage,
                        createdAt: updatedUser.createdAt,
                        updatedAt: updatedUser.updatedAt
                    }
                }
            }
        };
    } catch (error) {
        console.error('Verify OTP and update phone error:', error);
        const errorMessage = error.message && error.message.includes('Invalid parameter `To`') ? 'Invalid phone number format. Please ensure the phone number is in E.164 format (e.g., +1234567890) with country code.' : error.message || 'Failed to verify OTP';
        return { statusCode: 500, json: { success: false, message: errorMessage, hint: 'Phone number must be in E.164 format: +[country code][subscriber number]' } };
    }
}

async function sendOTPForAlternatePhone(user, body) {
    const { alternatePhoneNumber } = body;
    if (!alternatePhoneNumber) return { statusCode: 400, json: { success: false, message: 'Alternate phone number is required' } };
    let normalizedPhone = alternatePhoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
    const existingUser = await User.findOne({ $or: [{ 'profile.phoneNumbers.primary': normalizedPhone, _id: { $ne: user._id } }, { 'profile.phoneNumbers.alternate': normalizedPhone, _id: { $ne: user._id } }] }).lean();
    if (existingUser) return { statusCode: 400, json: { success: false, message: 'This phone number is already registered by another user' } };
    if (user.profile?.phoneNumbers?.primary === normalizedPhone) return { statusCode: 400, json: { success: false, message: 'Alternate phone number cannot be the same as your primary phone number' } };
    if (user.alternatePhoneNumber === normalizedPhone) return { statusCode: 400, json: { success: false, message: 'This is already your current alternate phone number' } };
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) return { statusCode: 500, json: { success: false, message: 'Twilio is not configured for phone OTP' } };
    try {
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const twilioServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
        console.log('📱 Using Twilio Verify v2 API to send OTP for alternate phone update');
        const verification = await twilioClient.verify.v2.services(twilioServiceSid).verifications.create({ to: normalizedPhone, channel: 'sms' });
        return { statusCode: 200, json: { success: true, message: 'OTP sent successfully to your alternate phone', data: { alternatePhone: normalizedPhone, sid: verification.sid, status: verification.status } } };
    } catch (error) {
        console.error('Send OTP for alternate phone error:', error);
        const errorMessage = error.message && error.message.includes('Invalid parameter `To`') ? 'Invalid phone number format. Please ensure the phone number is in E.164 format (e.g., +1234567890) with country code.' : error.message || 'Failed to send OTP';
        return { statusCode: 500, json: { success: false, message: errorMessage, hint: 'Phone number must be in E.164 format: +[country code][subscriber number]' } };
    }
}

async function verifyOTPAndUpdateAlternatePhone(user, body) {
    const { alternatePhoneNumber, otp } = body;
    if (!alternatePhoneNumber || !otp) return { statusCode: 400, json: { success: false, message: 'Alternate phone number and OTP code are required' } };
    let normalizedPhone = alternatePhoneNumber.replace(/[\s\-\(\)]/g, '');
    if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
    const existingUser = await User.findOne({ $or: [{ 'profile.phoneNumbers.primary': normalizedPhone, _id: { $ne: user._id } }, { 'profile.phoneNumbers.alternate': normalizedPhone, _id: { $ne: user._id } }] }).lean();
    if (existingUser) return { statusCode: 400, json: { success: false, message: 'This phone number is already registered by another user' } };
    if (user.profile?.phoneNumbers?.primary === normalizedPhone) return { statusCode: 400, json: { success: false, message: 'Alternate phone number cannot be the same as your primary phone number' } };
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) return { statusCode: 500, json: { success: false, message: 'Twilio is not configured' } };
    try {
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const twilioServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
        console.log('✅ Using Twilio Verify v2 API to verify OTP for alternate phone update');
        const check = await twilioClient.verify.v2.services(twilioServiceSid).verificationChecks.create({ to: normalizedPhone, code: otp });
        if (check.status !== 'approved') return { statusCode: 400, json: { success: false, message: 'Invalid or expired OTP code' } };
        const updatedUser = await User.findByIdAndUpdate(user._id, { $set: { alternatePhoneNumber: normalizedPhone } }, { new: true, runValidators: true }).lean().select('-auth');
        if (!updatedUser) return { statusCode: 404, json: { success: false, message: 'User not found' } };
        const verifyUser = await User.findById(user._id).select('alternatePhoneNumber').lean();
        console.log(`✅ Alternate phone number updated. Response value: ${updatedUser.alternatePhoneNumber}, Database value: ${verifyUser?.alternatePhoneNumber}`);
        if (verifyUser?.alternatePhoneNumber !== normalizedPhone) {
            console.error(`❌ WARNING: Alternate phone number update may not have persisted! Expected: ${normalizedPhone}, Got: ${verifyUser?.alternatePhoneNumber}`);
            updatedUser.alternatePhoneNumber = verifyUser.alternatePhoneNumber;
        }
        const finalUser = await User.findById(user._id).select('-auth').lean();
        return {
            statusCode: 200,
            json: {
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
            }
        };
    } catch (error) {
        console.error('Verify OTP and update alternate phone error:', error);
        const errorMessage = error.message && error.message.includes('Invalid parameter `To`') ? 'Invalid phone number format. Please ensure the phone number is in E.164 format (e.g., +1234567890) with country code.' : error.message || 'Failed to verify OTP';
        return { statusCode: 500, json: { success: false, message: errorMessage, hint: 'Phone number must be in E.164 format: +[country code][subscriber number]' } };
    }
}

async function removeAlternatePhone(user) {
    try {
        const updatedUser = await User.findByIdAndUpdate(user._id, { $unset: { 'profile.phoneNumbers.alternate': '' } }, { new: true, runValidators: true }).lean().select('-auth');
        return {
            statusCode: 200,
            json: {
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
                        phoneNumber: updatedUser.profile?.phoneNumbers?.primary,
                        alternatePhoneNumber: updatedUser.profile?.phoneNumbers?.alternate,
                        gender: updatedUser.profile?.gender,
                        profileImage: updatedUser.profile?.profileImage,
                        createdAt: updatedUser.createdAt,
                        updatedAt: updatedUser.updatedAt
                    }
                }
            }
        };
    } catch (error) {
        console.error('Remove alternate phone error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error removing alternate phone number', error: error.message } };
    }
}

async function uploadMedia(user, file) {
    if (!file) return { statusCode: 400, json: { success: false, message: 'No file uploaded' } };
    if (!cloudinary) return { statusCode: 500, json: { success: false, message: 'Cloudinary upload failed', error: 'Cloudinary not configured' } };
    let transcodedPath = null;
    const originalPath = file.path;
    try {
        const userFolder = `user_uploads/${user._id}`;
        const isVideoFile = isVideo(file.mimetype);
        let fileToUpload = originalPath;
        if (isVideoFile) {
            try {
                console.log('Transcoding video for media upload...');
                const transcoded = await transcodeVideo(originalPath);
                transcodedPath = transcoded.outputPath;
                fileToUpload = transcodedPath;
                console.log('Video transcoded successfully:', transcodedPath);
            } catch (transcodeError) {
                console.error('Video transcoding failed:', transcodeError);
                console.warn('Uploading original video without transcoding');
            }
        }
        const result = await cloudinary.uploader.upload(fileToUpload, { folder: userFolder, upload_preset: process.env.UPLOAD_PRESET, resource_type: 'auto', quality: '100' });
        const mediaRecord = await Media.create({
            userId: user._id,
            url: result.secure_url,
            public_id: result.public_id,
            format: result.format,
            resource_type: result.resource_type,
            fileSize: result.bytes || file.size,
            originalFilename: file.originalname,
            folder: result.folder || userFolder
        });
        if (transcodedPath) await cleanupFile(transcodedPath);
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Uploaded successfully',
                data: {
                    id: mediaRecord._id,
                    url: result.secure_url,
                    public_id: result.public_id,
                    format: result.format,
                    type: result.resource_type,
                    fileSize: result.bytes || file.size,
                    uploadedBy: { userId: user._id, email: user.profile?.email, name: user.profile?.name?.full },
                    uploadedAt: mediaRecord.createdAt
                }
            }
        };
    } catch (err) {
        if (transcodedPath) await cleanupFile(transcodedPath).catch(() => {});
        console.error('Cloudinary upload error:', err);
        return { statusCode: 500, json: { success: false, message: 'Cloudinary upload failed', error: err.message } };
    }
}

async function uploadProfileImage(user, file) {
    if (!file) return { statusCode: 400, json: { success: false, message: 'No file uploaded' } };
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) return { statusCode: 400, json: { success: false, message: 'Only image files are allowed for profile pictures (JPEG, PNG, GIF, WebP)' } };
    if (!cloudinary) return { statusCode: 500, json: { success: false, message: 'Profile image upload failed', error: 'Cloudinary not configured' } };
    try {
        const userFolder = `user_uploads/${user._id}/profile`;
        if (user.profile?.profileImage) {
            try {
                const oldPublicId = user.profile.profileImage.split('/').slice(-2).join('/').split('.')[0];
                await cloudinary.uploader.destroy(oldPublicId, { invalidate: true });
                await Media.findOneAndDelete({ userId: user._id, url: user.profile.profileImage });
            } catch (deleteError) {
                console.warn('Failed to delete old profile image:', deleteError.message);
            }
        }
        const result = await cloudinary.uploader.upload(file.path, {
            folder: userFolder,
            upload_preset: process.env.UPLOAD_PRESET,
            resource_type: 'image',
            transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }, { quality: '100' }]
        });
        const updatedUser = await User.findByIdAndUpdate(user._id, { 'profile.profileImage': result.secure_url }, { new: true, runValidators: true }).lean().select('-auth');
        const mediaRecord = await Media.create({
            userId: user._id,
            url: result.secure_url,
            public_id: result.public_id,
            format: result.format,
            resource_type: result.resource_type,
            fileSize: result.bytes || file.size,
            originalFilename: file.originalname,
            folder: userFolder
        });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Profile image uploaded successfully',
                data: {
                    id: mediaRecord._id,
                    url: result.secure_url,
                    public_id: result.public_id,
                    format: result.format,
                    fileSize: result.bytes || file.size,
                    user: { id: updatedUser._id, email: updatedUser.profile?.email, name: updatedUser.profile?.name?.full, profileImage: updatedUser.profile?.profileImage },
                    uploadedAt: mediaRecord.createdAt
                }
            }
        };
    } catch (err) {
        console.error('Profile image upload error:', err);
        return { statusCode: 500, json: { success: false, message: 'Profile image upload failed', error: err.message } };
    }
}

async function uploadCoverPhoto(user, file) {
    if (!file) return { statusCode: 400, json: { success: false, message: 'No file uploaded' } };
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) return { statusCode: 400, json: { success: false, message: 'Only image files are allowed for cover photos (JPEG, PNG, GIF, WebP)' } };
    if (!cloudinary) return { statusCode: 500, json: { success: false, message: 'Cover photo upload failed', error: 'Cloudinary not configured' } };
    try {
        const userFolder = `user_uploads/${user._id}/cover`;
        if (user.profile?.coverPhoto) {
            try {
                const oldPublicId = user.profile.coverPhoto.split('/').slice(-2).join('/').split('.')[0];
                await cloudinary.uploader.destroy(oldPublicId, { invalidate: true });
                await Media.findOneAndDelete({ userId: user._id, url: user.profile.coverPhoto });
            } catch (deleteError) {
                console.warn('Failed to delete old cover photo:', deleteError.message);
            }
        }
        const result = await cloudinary.uploader.upload(file.path, {
            folder: userFolder,
            upload_preset: process.env.UPLOAD_PRESET,
            resource_type: 'image',
            transformation: [{ width: 1200, height: 400, crop: 'fill', gravity: 'auto' }, { quality: '100' }]
        });
        const updatedUser = await User.findByIdAndUpdate(user._id, { 'profile.coverPhoto': result.secure_url }, { new: true, runValidators: true }).lean().select('-auth');
        const mediaRecord = await Media.create({
            userId: user._id,
            url: result.secure_url,
            public_id: result.public_id,
            format: result.format,
            resource_type: result.resource_type,
            fileSize: result.bytes || file.size,
            originalFilename: file.originalname,
            folder: userFolder
        });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Cover photo uploaded successfully',
                data: {
                    id: mediaRecord._id,
                    url: result.secure_url,
                    public_id: result.public_id,
                    format: result.format,
                    fileSize: result.bytes || file.size,
                    user: { id: updatedUser._id, email: updatedUser.profile?.email, name: updatedUser.profile?.name?.full, coverPhoto: updatedUser.profile?.coverPhoto },
                    uploadedAt: mediaRecord.createdAt
                }
            }
        };
    } catch (err) {
        console.error('Cover photo upload error:', err);
        return { statusCode: 500, json: { success: false, message: 'Cover photo upload failed', error: err.message } };
    }
}

async function getUserMedia(user) {
    try {
        const media = await Media.find({ userId: user._id }).sort({ createdAt: -1 }).select('-__v').lean();
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Media retrieved successfully',
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
            }
        };
    } catch (err) {
        console.error('Get user media error:', err);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve media', error: err.message } };
    }
}

async function getUserImages(user, query) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const skip = (page - 1) * limit;
    try {
        const images = await Media.find({ userId: user._id, resource_type: 'image' }).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-__v').lean();
        const totalImages = await Media.countDocuments({ userId: user._id, resource_type: 'image' });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Images retrieved successfully',
                data: {
                    count: images.length,
                    totalImages,
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
                    pagination: { currentPage: page, totalPages: Math.ceil(totalImages / limit), totalImages, hasNextPage: page < Math.ceil(totalImages / limit), hasPrevPage: page > 1 }
                }
            }
        };
    } catch (err) {
        console.error('Get user images error:', err);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve images', error: err.message } };
    }
}

async function getUserImagesPublic(userId, query) {
    const { id } = userId;
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const skip = (page - 1) * limit;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return { statusCode: 400, json: { success: false, message: 'Invalid user ID' } };
    try {
        const user = await User.findById(id).select('profile.name.full profile.email profile.profileImage').lean();
        if (!user) return { statusCode: 404, json: { success: false, message: 'User not found' } };
        const images = await Media.find({ userId: id, resource_type: 'image' }).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-__v').lean();
        const totalImages = await Media.countDocuments({ userId: id, resource_type: 'image' });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'User images retrieved successfully',
                data: {
                    user: { id: user._id.toString(), name: user.profile?.name?.full, email: user.profile?.email, profileImage: user.profile?.profileImage },
                    count: images.length,
                    totalImages,
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
                    pagination: { currentPage: page, totalPages: Math.ceil(totalImages / limit), totalImages, hasNextPage: page < Math.ceil(totalImages / limit), hasPrevPage: page > 1 }
                }
            }
        };
    } catch (err) {
        console.error('Get user images public error:', err);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve user images', error: err.message } };
    }
}

async function getUserImagesPublicById(id, query) {
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 20;
    const skip = (page - 1) * limit;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) return { statusCode: 400, json: { success: false, message: 'Invalid user ID' } };
    try {
        const user = await User.findById(id).select('profile.name.full profile.email profile.profileImage').lean();
        if (!user) return { statusCode: 404, json: { success: false, message: 'User not found' } };
        const images = await Media.find({ userId: id, resource_type: 'image' }).sort({ createdAt: -1 }).skip(skip).limit(limit).select('-__v').lean();
        const totalImages = await Media.countDocuments({ userId: id, resource_type: 'image' });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'User images retrieved successfully',
                data: {
                    user: { id: user._id.toString(), name: user.profile?.name?.full, email: user.profile?.email, profileImage: user.profile?.profileImage },
                    count: images.length,
                    totalImages,
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
                    pagination: { currentPage: page, totalPages: Math.ceil(totalImages / limit), totalImages, hasNextPage: page < Math.ceil(totalImages / limit), hasPrevPage: page > 1 }
                }
            }
        };
    } catch (err) {
        console.error('Get user images public error:', err);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve user images', error: err.message } };
    }
}

async function deleteUserMedia(user, mediaId) {
    if (!mediaId) return { statusCode: 400, json: { success: false, message: 'Media ID is required' } };
    const media = await Media.findOne({ _id: mediaId, userId: user._id });
    if (!media) return { statusCode: 404, json: { success: false, message: "Media not found or you don't have permission to delete it" } };
    try {
        if (cloudinary) {
            try {
                await cloudinary.uploader.destroy(media.public_id, { invalidate: true });
            } catch (cloudinaryError) {
                console.warn('Failed to delete from Cloudinary:', cloudinaryError.message);
            }
        }
        await Media.findByIdAndDelete(mediaId);
        if (user.profile?.profileImage === media.url) await User.findByIdAndUpdate(user._id, { 'profile.profileImage': '' }).lean();
        if (user.profile?.coverPhoto === media.url) await User.findByIdAndUpdate(user._id, { 'profile.coverPhoto': '' }).lean();
        return { statusCode: 200, json: { success: true, message: 'Media deleted successfully' } };
    } catch (err) {
        console.error('Delete user media error:', err);
        return { statusCode: 500, json: { success: false, message: 'Failed to delete media', error: err.message } };
    }
}

async function updatePersonalInfo(user, body) {
    try {
        const { firstName, lastName, gender, dob, phoneNumber, alternatePhoneNumber } = body;
        const updateData = {};
        if (firstName !== undefined) {
            if (!firstName || firstName.trim() === '') httpError(400, { success: false, message: 'First name cannot be empty' });
            updateData['profile.name.first'] = firstName.trim();
        }
        if (lastName !== undefined) {
            if (!lastName || lastName.trim() === '') httpError(400, { success: false, message: 'Last name cannot be empty' });
            updateData['profile.name.last'] = lastName.trim();
        }
        if (firstName !== undefined || lastName !== undefined) {
            const finalFirstName = updateData['profile.name.first'] || user.profile?.name?.first;
            const finalLastName = updateData['profile.name.last'] || user.profile?.name?.last;
            updateData['profile.name.full'] = `${finalFirstName} ${finalLastName}`.trim();
        }
        if (gender !== undefined) {
            const validGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];
            if (!validGenders.includes(gender)) httpError(400, { success: false, message: 'Gender must be one of: Male, Female, Other, Prefer not to say' });
            updateData['profile.gender'] = gender;
        }
        if (dob !== undefined) {
            const dobDate = new Date(dob);
            if (isNaN(dobDate.getTime())) httpError(400, { success: false, message: 'Date of birth must be a valid date (ISO 8601 format: YYYY-MM-DD)' });
            if (dobDate > new Date()) httpError(400, { success: false, message: 'Date of birth cannot be in the future' });
            const minDate = new Date();
            minDate.setFullYear(minDate.getFullYear() - 150);
            if (dobDate < minDate) httpError(400, { success: false, message: 'Date of birth is too far in the past (maximum 150 years)' });
            updateData['profile.dob'] = dobDate;
        }
        const unsetData = {};
        if (phoneNumber !== undefined) {
            if (phoneNumber === null || phoneNumber === '') {
                unsetData['profile.phoneNumbers.primary'] = '';
            } else {
                let normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
                if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
                const existingUser = await User.findOne({ 'profile.phoneNumbers.primary': normalizedPhone, _id: { $ne: user._id } }).lean();
                if (existingUser) httpError(400, { success: false, message: 'Phone number is already registered by another user' });
                updateData['profile.phoneNumbers.primary'] = normalizedPhone;
            }
        }
        if (alternatePhoneNumber !== undefined) {
            if (alternatePhoneNumber === null || alternatePhoneNumber === '') {
                unsetData['profile.phoneNumbers.alternate'] = '';
            } else {
                let normalizedPhone = alternatePhoneNumber.replace(/[\s\-\(\)]/g, '');
                if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
                const finalPhoneNumber = updateData['profile.phoneNumbers.primary'] || user.profile?.phoneNumbers?.primary;
                if (finalPhoneNumber === normalizedPhone) httpError(400, { success: false, message: 'Alternate phone number cannot be the same as your primary phone number' });
                const existingUser = await User.findOne({
                    $or: [
                        { 'profile.phoneNumbers.primary': normalizedPhone, _id: { $ne: user._id } },
                        { 'profile.phoneNumbers.alternate': normalizedPhone, _id: { $ne: user._id } }
                    ]
                }).lean();
                if (existingUser) httpError(400, { success: false, message: 'This phone number is already registered by another user' });
                updateData['profile.phoneNumbers.alternate'] = normalizedPhone;
            }
        }
        if (Object.keys(updateData).length === 0 && Object.keys(unsetData).length === 0) httpError(400, { success: false, message: 'No fields provided to update' });
        const updateQuery = {};
        if (Object.keys(updateData).length > 0) updateQuery.$set = updateData;
        if (Object.keys(unsetData).length > 0) updateQuery.$unset = unsetData;
        const updatedUser = await User.findByIdAndUpdate(user._id, updateQuery, { new: true, runValidators: true }).lean().select('-auth');
        try {
            const client = cache.getClient();
            if (client) {
                const keys = await client.keys(`user_profile:*:${user._id}`);
                if (keys.length) await client.del(...keys);
            }
        } catch (e) { /* fail-safe */ }
        return {
            statusCode: 200,
            json: {
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
            }
        };
    } catch (error) {
        if (error.statusCode && error.json) throw error;
        console.error('Update personal info error:', error);
        throw { statusCode: 500, json: { success: false, message: 'Error updating personal information', error: error.message } };
    }
}

async function updateLocationAndDetails(user, body) {
    try {
        const { currentCity, workplace, pronouns, education, relationshipStatus, hometown } = body;
        const updateData = {};
        if (currentCity !== undefined) updateData['location.currentCity'] = currentCity.trim();
        if (hometown !== undefined) updateData['location.hometown'] = hometown.trim();
        if (pronouns !== undefined) updateData['profile.pronouns'] = pronouns.trim();
        if (relationshipStatus !== undefined) {
            if (relationshipStatus === null || relationshipStatus === '') updateData['social.relationshipStatus'] = null;
            else {
                const validStatuses = ['Single', 'In a relationship', 'Engaged', 'Married', 'In a civil partnership', 'In a domestic partnership', 'In an open relationship', "It's complicated", 'Separated', 'Divorced', 'Widowed'];
                if (!validStatuses.includes(relationshipStatus)) httpError(400, { success: false, message: `Relationship status must be one of: ${validStatuses.join(', ')}` });
                updateData['social.relationshipStatus'] = relationshipStatus;
            }
        }
        if (workplace !== undefined) {
            if (!Array.isArray(workplace)) httpError(400, { success: false, message: 'Workplace must be an array' });
            const processedWorkplace = [];
            for (const work of workplace) {
                if (!work.company || !work.position || !work.startDate) httpError(400, { success: false, message: 'Each workplace entry must have company, position, and startDate' });
                if (work.startDate && isNaN(new Date(work.startDate).getTime())) httpError(400, { success: false, message: 'Invalid startDate format' });
                if (work.endDate && isNaN(new Date(work.endDate).getTime())) httpError(400, { success: false, message: 'Invalid endDate format' });
                let company;
                if (mongoose.Types.ObjectId.isValid(work.company)) {
                    company = await Company.findById(work.company);
                    if (!company) httpError(400, { success: false, message: `Company with ID ${work.company} not found` });
                } else {
                    const companyName = String(work.company).trim();
                    if (!companyName) httpError(400, { success: false, message: 'Company name cannot be empty' });
                    const normalizedCompanyName = companyName.toLowerCase();
                    company = await Company.findOne({ $or: [{ name: companyName }, { normalizedName: normalizedCompanyName }] });
                    if (!company) {
                        try {
                            company = await Company.create({ name: companyName, normalizedName: normalizedCompanyName, isCustom: true, createdBy: user._id });
                            console.log(`✅ Created new company: ${companyName}`);
                        } catch (error) {
                            if (error.code === 11000) company = await Company.findOne({ $or: [{ name: companyName }, { normalizedName: normalizedCompanyName }] });
                            else throw error;
                        }
                    }
                }
                processedWorkplace.push({
                    company: company._id,
                    position: work.position,
                    description: work.description ? work.description.trim() : '',
                    startDate: new Date(work.startDate),
                    endDate: work.endDate ? new Date(work.endDate) : null,
                    isCurrent: work.isCurrent || false
                });
            }
            updateData['professional.workplace'] = processedWorkplace;
        }
        if (education !== undefined) {
            if (!Array.isArray(education)) httpError(400, { success: false, message: 'Education must be an array' });
            const validEducations = [];
            const institutionData = [];
            for (const edu of education) {
                if (!edu.institution || !edu.startYear) httpError(400, { success: false, message: 'Institution and startYear are required for each education entry' });
                if (isNaN(parseInt(edu.startYear)) || parseInt(edu.startYear) < 1900 || parseInt(edu.startYear) > new Date().getFullYear() + 10) httpError(400, { success: false, message: 'Invalid startYear format (must be a valid year)' });
                if (edu.endYear && (isNaN(parseInt(edu.endYear)) || parseInt(edu.endYear) < 1900 || parseInt(edu.endYear) > new Date().getFullYear() + 10)) httpError(400, { success: false, message: 'Invalid endYear format (must be a valid year)' });
                if (edu.startMonth !== undefined) {
                    const startMonth = parseInt(edu.startMonth);
                    if (isNaN(startMonth) || startMonth < 1 || startMonth > 12) httpError(400, { success: false, message: 'Invalid startMonth (must be between 1 and 12)' });
                }
                if (edu.endMonth !== undefined && edu.endMonth !== null) {
                    const endMonth = parseInt(edu.endMonth);
                    if (isNaN(endMonth) || endMonth < 1 || endMonth > 12) httpError(400, { success: false, message: 'Invalid endMonth (must be between 1 and 12)' });
                }
                if (edu.institutionType !== undefined) {
                    const validTypes = ['school', 'college', 'university', 'others'];
                    if (!validTypes.includes(edu.institutionType)) httpError(400, { success: false, message: `Institution type must be one of: ${validTypes.join(', ')}` });
                }
                if (edu.cgpa !== undefined && edu.cgpa !== null) {
                    const cgpa = parseFloat(edu.cgpa);
                    if (isNaN(cgpa) || cgpa < 0 || cgpa > 10) httpError(400, { success: false, message: 'Invalid CGPA (must be between 0 and 10)' });
                }
                if (edu.percentage !== undefined && edu.percentage !== null) {
                    const percentage = parseFloat(edu.percentage);
                    if (isNaN(percentage) || percentage < 0 || percentage > 100) httpError(400, { success: false, message: 'Invalid percentage (must be between 0 and 100)' });
                }
                if (typeof edu.institution === 'string' && !mongoose.Types.ObjectId.isValid(edu.institution)) {
                    institutionData.push({ name: edu.institution, type: edu.institutionType || 'school', city: edu.city, country: edu.country, logo: edu.logo });
                }
                validEducations.push(edu);
            }
            let institutionsMap;
            try {
                institutionsMap = institutionData.length > 0 ? await getOrCreateInstitutions(institutionData, user._id) : new Map();
            } catch (error) {
                console.error('Error processing institutions:', error);
                throw { statusCode: 500, json: { success: false, message: 'Failed to process institution information', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
            }
            const processedEducation = [];
            for (const edu of validEducations) {
                let institution;
                if (mongoose.Types.ObjectId.isValid(edu.institution)) {
                    institution = await Institution.findById(edu.institution);
                    if (!institution) httpError(400, { success: false, message: `Institution with ID ${edu.institution} not found` });
                } else {
                    const normalizedName = String(edu.institution).toLowerCase().trim();
                    institution = institutionsMap.get(normalizedName);
                    if (!institution) httpError(400, { success: false, message: `Failed to process institution: ${edu.institution}` });
                }
                processedEducation.push({
                    institution: institution._id,
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
                });
            }
            updateData['professional.education'] = processedEducation;
        }
        if (Object.keys(updateData).length === 0) httpError(400, { success: false, message: 'No fields provided to update' });
        const updatedUser = await User.findByIdAndUpdate(user._id, updateData, { new: true, runValidators: true })
            .lean()
            .populate('professional.workplace.company', 'name isCustom')
            .populate('professional.education.institution', 'name type city country logo verified isCustom')
            .select('-auth');
        const formattedWorkplace = formatWorkplace(updatedUser.professional?.workplace);
        const formattedEducation = formatEducation(updatedUser.professional?.education);
        try {
            const client = cache.getClient();
            if (client) {
                const keys = await client.keys(`user_profile:*:${user._id}`);
                if (keys.length) await client.del(...keys);
            }
        } catch (e) { /* fail-safe */ }
        return {
            statusCode: 200,
            json: {
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
            }
        };
    } catch (error) {
        if (error.statusCode && error.json) throw error;
        console.error('Update location and details error:', error);
        throw { statusCode: 500, json: { success: false, message: 'Error updating location and details', error: error.message } };
    }
}

async function searchUsers(user, queryParams) {
    try {
        const { query, page = 1, limit = 20 } = queryParams;
        if (!query || query.trim() === '') return { statusCode: 400, json: { success: false, message: 'Search query is required' } };
        const searchTerm = query.trim();
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 20;
        const skip = (pageNum - 1) * limitNum;
        const blockedUserIds = await getBlockedUserIds(user._id);
        const usersWhoBlockedMe = await User.find({ 'social.blockedUsers': user._id }).select('_id').lean();
        const blockedByUserIds = usersWhoBlockedMe.map(u => u._id);
        const excludedUserIds = [user._id, ...blockedUserIds, ...blockedByUserIds];
        const searchQuery = {
            _id: { $nin: excludedUserIds },
            $or: [
                { 'profile.name.first': { $regex: searchTerm, $options: 'i' } },
                { 'profile.name.last': { $regex: searchTerm, $options: 'i' } },
                { 'profile.name.full': { $regex: searchTerm, $options: 'i' } }
            ]
        };
        const totalUsers = await User.countDocuments(searchQuery);
        const users = await User.find(searchQuery)
            .select('-auth -profile.email')
            .sort({ 'profile.name.full': 1 })
            .skip(skip)
            .limit(limitNum)
            .lean();
        if (users.length === 0) {
            return {
                statusCode: 200,
                json: {
                    success: true,
                    message: 'No users found',
                    data: {
                        users: [],
                        pagination: { currentPage: pageNum, totalPages: 0, totalUsers: 0, hasNextPage: false, hasPrevPage: false }
                    }
                }
            };
        }
        const currentUserWithFriends = await User.findById(user._id).select('social.friends').lean();
        const currentUserFriendsSet = new Set((currentUserWithFriends?.social?.friends || []).map(id => id.toString()));
        const formattedUsers = users.map(searchedUser => {
            const userIdStr = searchedUser._id.toString();
            const isProfilePrivate = searchedUser.profile?.visibility === 'private';
            const isFriend = currentUserFriendsSet.has(userIdStr);
            if (isProfilePrivate && !isFriend) return getLimitedProfileData(searchedUser);
            return getFullProfileData(searchedUser);
        });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: `Found ${users.length} user/users`,
                data: {
                    users: formattedUsers,
                    pagination: {
                        currentPage: pageNum,
                        totalPages: Math.ceil(totalUsers / limitNum),
                        totalUsers,
                        hasNextPage: pageNum < Math.ceil(totalUsers / limitNum),
                        hasPrevPage: pageNum > 1
                    }
                }
            }
        };
    } catch (error) {
        if (error.statusCode && error.json) throw error;
        console.error('Search users error:', error);
        throw { statusCode: 500, json: { success: false, message: 'Error searching users', error: error.message } };
    }
}

async function updateProfileMedia(user, body) {
    const { bio, coverPhoto, profileImage } = body;
    const updateData = {};
    if (bio !== undefined) updateData['profile.bio'] = bio.trim();
    if (coverPhoto !== undefined) {
        if (coverPhoto === null || coverPhoto === '') updateData['profile.coverPhoto'] = '';
        else {
            try {
                new URL(coverPhoto);
                updateData['profile.coverPhoto'] = coverPhoto.trim();
            } catch (urlError) {
                return { statusCode: 400, json: { success: false, message: 'Cover photo must be a valid URL' } };
            }
        }
    }
    if (profileImage !== undefined) {
        const currentProfileImage = user.profile?.profileImage || '';
        if (coverPhoto !== undefined && profileImage === coverPhoto && (!currentProfileImage || currentProfileImage === '')) {
            // skip profileImage update
        } else if (profileImage === null || profileImage === '') updateData['profile.profileImage'] = '';
        else {
            try {
                new URL(profileImage);
                updateData['profile.profileImage'] = profileImage.trim();
            } catch (urlError) {
                return { statusCode: 400, json: { success: false, message: 'Profile image must be a valid URL' } };
            }
        }
    }
    if (Object.keys(updateData).length === 0) return { statusCode: 400, json: { success: false, message: 'No fields provided to update' } };
    try {
        const updatedUser = await User.findByIdAndUpdate(user._id, updateData, { new: true, runValidators: true }).lean().select('-auth');
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Profile media updated successfully',
                data: { user: { id: updatedUser._id, bio: updatedUser.profile?.bio, coverPhoto: updatedUser.profile?.coverPhoto, profileImage: updatedUser.profile?.profileImage, updatedAt: updatedUser.updatedAt } }
            }
        };
    } catch (error) {
        console.error('Update profile media error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error updating profile media', error: error.message } };
    }
}

async function removeEducationEntry(user, educationId) {
    try {
        const freshUser = await User.findById(user._id).lean();
        if (!freshUser) return { statusCode: 404, json: { success: false, message: 'User not found' } };
        if (!freshUser.professional?.education || !Array.isArray(freshUser.professional.education)) {
            return { statusCode: 400, json: { success: false, message: 'No education entries found' } };
        }
        let educationToRemove;
        let educationIdToRemove;
        if (mongoose.Types.ObjectId.isValid(educationId)) {
            educationToRemove = freshUser.professional.education.find(edu => edu._id.toString() === educationId);
            if (educationToRemove) educationIdToRemove = educationToRemove._id;
        }
        if (!educationToRemove) {
            const entryIndex = parseInt(educationId);
            if (isNaN(entryIndex) || entryIndex < 0 || entryIndex >= freshUser.professional.education.length) {
                return { statusCode: 400, json: { success: false, message: 'Invalid education entry ID or index.' } };
            }
            educationToRemove = freshUser.professional.education[entryIndex];
            educationIdToRemove = educationToRemove._id;
        }
        await User.findByIdAndUpdate(
            freshUser._id,
            { $pull: { 'professional.education': { _id: educationIdToRemove } } },
            { new: true, runValidators: true }
        ).lean();
        const updatedUser = await User.findById(freshUser._id)
            .populate('professional.education.institution', 'name type city country logo verified isCustom')
            .select('-auth')
            .lean();
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
        return {
            statusCode: 200,
            json: {
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
            }
        };
    } catch (error) {
        if (error.statusCode && error.json) throw error;
        console.error('Remove education entry error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error removing education entry', error: error.message } };
    }
}

async function removeWorkplaceEntry(user, indexParam) {
    try {
        const entryIndex = parseInt(indexParam);
        if (isNaN(entryIndex) || entryIndex < 0) {
            return { statusCode: 400, json: { success: false, message: 'Invalid workplace entry index. Index must be a non-negative number.' } };
        }
        if (!user.professional?.workplace || !Array.isArray(user.professional.workplace)) {
            return { statusCode: 400, json: { success: false, message: 'No workplace entries found' } };
        }
        if (entryIndex >= user.professional.workplace.length) {
            return { statusCode: 404, json: { success: false, message: `Workplace entry at index ${entryIndex} not found. You have ${user.professional.workplace.length} workplace entries.` } };
        }
        const workplaceToRemove = user.professional.workplace[entryIndex];
        const workplaceId = workplaceToRemove._id;
        await User.findByIdAndUpdate(
            user._id,
            { $pull: { 'professional.workplace': { _id: workplaceId } } },
            { new: true, runValidators: true }
        ).lean();
        if (!workplaceId) {
            const updatedWorkplace = user.professional.workplace.filter((_, idx) => idx !== entryIndex);
            await User.findByIdAndUpdate(user._id, { $set: { 'professional.workplace': updatedWorkplace } }, { new: true, runValidators: true }).lean();
        }
        const updatedUser = await User.findById(user._id)
            .populate('professional.workplace.company', 'name isCustom')
            .select('-auth')
            .lean();
        const formattedWorkplace = (updatedUser.professional?.workplace || []).map(work => ({
            company: work.company ? { id: work.company._id, name: work.company.name, isCustom: work.company.isCustom } : null,
            position: work.position,
            description: work.description,
            startDate: work.startDate,
            endDate: work.endDate,
            isCurrent: work.isCurrent
        }));
        return {
            statusCode: 200,
            json: {
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
            }
        };
    } catch (error) {
        if (error.statusCode && error.json) throw error;
        console.error('Remove workplace entry error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error removing workplace entry', error: error.message } };
    }
}

async function blockUser(currentUserId, blockedUserId) {
    try {
        if (!mongoose.Types.ObjectId.isValid(blockedUserId)) return { statusCode: 400, json: { success: false, message: 'Invalid user ID' } };
        if (currentUserId.toString() === blockedUserId) return { statusCode: 400, json: { success: false, message: 'You cannot block yourself' } };
        const userToBlock = await User.findById(blockedUserId).lean();
        if (!userToBlock) return { statusCode: 404, json: { success: false, message: 'User not found' } };
        const currentUser = await User.findById(currentUserId).lean();
        if (!currentUser) return { statusCode: 404, json: { success: false, message: 'Current user not found' } };
        const isAlreadyBlocked = await isUserBlocked(currentUserId, blockedUserId);
        if (isAlreadyBlocked) return { statusCode: 400, json: { success: false, message: 'User is already blocked' } };
        await User.findByIdAndUpdate(currentUserId, { $addToSet: { 'social.blockedUsers': blockedUserId } });
        await User.findByIdAndUpdate(currentUserId, { $pull: { 'social.friends': blockedUserId } }).lean();
        await User.findByIdAndUpdate(blockedUserId, { $pull: { 'social.friends': currentUserId } }).lean();
        await FriendRequest.deleteMany({
            $or: [
                { sender: currentUserId, receiver: blockedUserId },
                { sender: blockedUserId, receiver: currentUserId }
            ]
        });
        const updatedUser = await User.findById(currentUserId)
            .populate('social.blockedUsers', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email')
            .select('social.blockedUsers');
        try {
            const client = cache.getClient();
            if (client) {
                let keys = await client.keys(`user_profile:*:${currentUserId}`);
                if (keys.length) await client.del(...keys);
                keys = await client.keys(`user_profile:*:${blockedUserId}`);
                if (keys.length) await client.del(...keys);
            }
        } catch (e) { /* fail-safe */ }
        return {
            statusCode: 200,
            json: {
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
            }
        };
    } catch (error) {
        if (error.statusCode && error.json) throw error;
        console.error('Block user error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to block user', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function unblockUser(currentUserId, blockedUserId) {
    try {
        if (!mongoose.Types.ObjectId.isValid(blockedUserId)) return { statusCode: 400, json: { success: false, message: 'Invalid user ID' } };
        const userToUnblock = await User.findById(blockedUserId).lean();
        if (!userToUnblock) return { statusCode: 404, json: { success: false, message: 'User not found' } };
        const currentUser = await User.findById(currentUserId).lean();
        if (!currentUser) return { statusCode: 404, json: { success: false, message: 'Current user not found' } };
        const isBlocked = await isUserBlocked(currentUserId, blockedUserId);
        if (!isBlocked) return { statusCode: 400, json: { success: false, message: 'User is not blocked' } };
        await User.findByIdAndUpdate(currentUserId, { $pull: { 'social.blockedUsers': blockedUserId } });
        const updatedUser = await User.findById(currentUserId)
            .populate('social.blockedUsers', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email')
            .select('social.blockedUsers');
        try {
            const client = cache.getClient();
            if (client) {
                let keys = await client.keys(`user_profile:*:${currentUserId}`);
                if (keys.length) await client.del(...keys);
                keys = await client.keys(`user_profile:*:${blockedUserId}`);
                if (keys.length) await client.del(...keys);
            }
        } catch (e) { /* fail-safe */ }
        return {
            statusCode: 200,
            json: {
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
            }
        };
    } catch (error) {
        if (error.statusCode && error.json) throw error;
        console.error('Unblock user error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to unblock user', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function listBlockedUsers(userId) {
    try {
        const user = await User.findById(userId)
            .populate('social.blockedUsers', 'profile.name.first profile.name.last profile.name.full profile.profileImage profile.email profile.bio location.currentCity location.hometown')
            .select('social.blockedUsers')
            .lean();
        if (!user) return { statusCode: 404, json: { success: false, message: 'User not found' } };
        const blockedUsers = user.social?.blockedUsers || [];
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Blocked users retrieved successfully',
                data: { blockedUsers, count: blockedUsers.length }
            }
        };
    } catch (error) {
        if (error.statusCode && error.json) throw error;
        console.error('List blocked users error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve blocked users', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function getUserProfileById(currentUser, userId) {
    const cacheKey = `user_profile:${currentUser._id}:${userId}`;
    const client = cache.getClient();
    if (client) {
        try {
            const cached = await client.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch (e) { /* fall through to DB */ }
    }
    try {
        const user = await User.findById(userId)
            .select('-auth -__v')
            .populate('professional.workplace.company', 'name isCustom')
            .populate('professional.education.institution', 'name type city country logo verified isCustom')
            .lean();
        if (!user) return { statusCode: 404, json: { success: false, message: 'User not found' } };
        const isBlocked = await isUserBlocked(user._id, currentUser._id);
        if (isBlocked) return { statusCode: 403, json: { success: false, message: 'You are blocked from viewing this profile' } };
        const isPrivate = user.profile?.visibility === 'private';
        const isFriend = await areFriends(currentUser._id, user._id);
        if (isPrivate && !isFriend && !currentUser.isAdmin) {
            const result = {
                statusCode: 200,
                json: {
                    success: true,
                    message: 'User profile retrieved (limited)',
                    data: { user: getLimitedProfileData(user), isPrivate: true }
                }
            };
            if (client) {
                try {
                    await client.set(cacheKey, JSON.stringify(result), 'EX', 120);
                } catch (e) { /* ignore */ }
            }
            return result;
        }
        const formattedWorkplace = (user.professional?.workplace || []).map(work => ({
            company: work.company ? { id: work.company._id, name: work.company.name, isCustom: work.company.isCustom } : null,
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
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'User profile retrieved successfully',
                data: {
                    user: {
                        id: user._id,
                        profile: {
                            name: { first: user.profile?.name?.first, last: user.profile?.name?.last, full: user.profile?.name?.full },
                            email: isFriend || currentUser._id.equals(user._id) ? user.profile?.email : undefined,
                            phoneNumbers: isFriend || currentUser._id.equals(user._id) ? { primary: user.profile?.phoneNumbers?.primary, alternate: user.profile?.phoneNumbers?.alternate } : undefined,
                            gender: user.profile?.gender,
                            pronouns: user.profile?.pronouns,
                            dob: user.profile?.dob,
                            bio: user.profile?.bio,
                            profileImage: user.profile?.profileImage,
                            coverPhoto: user.profile?.coverPhoto,
                            visibility: user.profile?.visibility || 'public'
                        },
                        location: { currentCity: user.location?.currentCity, hometown: user.location?.hometown },
                        social: { numberOfFriends, relationshipStatus: user.social?.relationshipStatus },
                        professional: { workplace: formattedWorkplace, education: formattedEducation },
                        account: { createdAt: user.createdAt, updatedAt: user.updatedAt, isActive: user.account?.isActive, isVerified: user.account?.isVerified }
                    }
                }
            }
        };
        if (client) {
            try {
                await client.set(cacheKey, JSON.stringify(result), 'EX', 120);
            } catch (e) { /* ignore */ }
        }
        return result;
    } catch (error) {
        if (error.statusCode && error.json) throw error;
        console.error('Error fetching user profile:', error);
        return { statusCode: 500, json: { success: false, message: 'Error fetching user profile', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function updateProfileVisibility(user, body) {
    try {
        const { visibility } = body;
        if (visibility === undefined) return { statusCode: 400, json: { success: false, message: 'Visibility field is required' } };
        if (!['public', 'private'].includes(visibility)) return { statusCode: 400, json: { success: false, message: 'Visibility must be either "public" or "private"' } };
        const updatedUser = await User.findByIdAndUpdate(user._id, { 'profile.visibility': visibility }, { new: true, runValidators: true }).lean().select('-auth');
        if (!updatedUser) return { statusCode: 404, json: { success: false, message: 'User not found' } };
        try {
            const client = cache.getClient();
            if (client) {
                const keys = await client.keys(`user_profile:*:${user._id}`);
                if (keys.length) await client.del(...keys);
            }
        } catch (e) { /* fail-safe */ }
        return {
            statusCode: 200,
            json: {
                success: true,
                message: `Profile visibility updated to ${visibility}`,
                data: { user: { id: updatedUser._id, profileVisibility: updatedUser.profile?.visibility || 'public' } }
            }
        };
    } catch (error) {
        if (error.statusCode && error.json) throw error;
        console.error('Update profile visibility error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to update profile visibility', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

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
    getUserImages,
    getUserImagesPublic,
    getUserImagesPublicById,
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
    getUserProfileById,
    updateProfileVisibility,
    getOrCreateCompanies,
    getOrCreateInstitutions,
    areFriends,
    getBlockedUserIds,
    isUserBlocked,
    getLimitedProfileData,
    getFullProfileData
};

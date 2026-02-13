/**
 * User profile service: profile updates, OTP/phone, search, education/workplace, visibility.
 * Returns { statusCode, json } for each method. No res usage.
 */

const User = require('../../models/authorization/User');
const Company = require('../../models/authorization/Company');
const Institution = require('../../models/authorization/Institution');
const mongoose = require('mongoose');
const twilio = require('twilio');
const NodeCache = require('node-cache');
const { formatEducation, formatWorkplace } = require('../../utils/formatters');
const { getBlockedUserIds, isUserBlocked, areFriends } = require('./user.relationship.service');

const companyCache = new NodeCache({ stdTTL: 3600 });
const institutionCache = new NodeCache({ stdTTL: 3600 });

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
                const n = company.normalizedName;
                companyCache.set(n, company);
                result.set(n, company);
            });
        } catch (error) {
            if (error.code === 11000) {
                const existing = await Company.find({ normalizedName: { $in: toCreate.map(c => c.normalizedName) } }).lean();
                existing.forEach(company => {
                    const n = company.normalizedName;
                    companyCache.set(n, company);
                    result.set(n, company);
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
                const n = inst.normalizedName;
                institutionCache.set(n, inst);
                result.set(n, inst);
            });
        } catch (error) {
            if (error.code === 11000) {
                const existing = await Institution.find({ normalizedName: { $in: toCreate.map(i => i.normalizedName) } }).lean();
                existing.forEach(inst => {
                    const n = inst.normalizedName;
                    institutionCache.set(n, inst);
                    result.set(n, inst);
                });
            } else throw error;
        }
    }
    return result;
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
            if (!firstName || firstName.trim() === '') return { statusCode: 400, json: { success: false, message: 'First name cannot be empty' } };
            updateData['profile.name.first'] = firstName.trim();
        }
        if (lastName !== undefined) {
            if (!lastName || lastName.trim() === '') return { statusCode: 400, json: { success: false, message: 'Last name cannot be empty' } };
            updateData['profile.name.last'] = lastName.trim();
        }
        if (name !== undefined) updateData['profile.name.full'] = name.trim() || '';
        else if (firstName !== undefined || lastName !== undefined) {
            const finalFirstName = updateData['profile.name.first'] || user.profile?.name?.first;
            const finalLastName = updateData['profile.name.last'] || user.profile?.name?.last;
            updateData['profile.name.full'] = `${finalFirstName} ${finalLastName}`.trim();
        }
        if (dob !== undefined) {
            const dobDate = new Date(dob);
            if (isNaN(dobDate.getTime())) return { statusCode: 400, json: { success: false, message: 'Date of birth must be a valid date (ISO 8601 format: YYYY-MM-DD)' } };
            if (dobDate > new Date()) return { statusCode: 400, json: { success: false, message: 'Date of birth cannot be in the future' } };
            const minDate = new Date(); minDate.setFullYear(minDate.getFullYear() - 150);
            if (dobDate < minDate) return { statusCode: 400, json: { success: false, message: 'Date of birth is too far in the past (maximum 150 years)' } };
            updateData['profile.dob'] = dobDate;
        }
        if (gender !== undefined) {
            const validGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];
            if (!validGenders.includes(gender)) return { statusCode: 400, json: { success: false, message: 'Gender must be one of: Male, Female, Other, Prefer not to say' } };
            updateData['profile.gender'] = gender;
        }
        if (bio !== undefined) updateData['profile.bio'] = bio.trim();
        if (currentCity !== undefined) updateData['location.currentCity'] = currentCity.trim();
        if (hometown !== undefined) updateData['location.hometown'] = hometown.trim();
        if (coverPhoto !== undefined) {
            if (coverPhoto === null || coverPhoto === '') updateData['profile.coverPhoto'] = '';
            else {
                try { new URL(coverPhoto); updateData['profile.coverPhoto'] = coverPhoto.trim(); }
                catch { return { statusCode: 400, json: { success: false, message: 'Cover photo must be a valid URL' } }; }
            }
        }
        if (relationshipStatus !== undefined) {
            if (relationshipStatus === null || relationshipStatus === '') updateData['social.relationshipStatus'] = null;
            else {
                const validStatuses = ['Single', 'In a relationship', 'Engaged', 'Married', 'In a civil partnership', 'In a domestic partnership', 'In an open relationship', "It's complicated", 'Separated', 'Divorced', 'Widowed'];
                if (!validStatuses.includes(relationshipStatus)) return { statusCode: 400, json: { success: false, message: `Relationship status must be one of: ${validStatuses.join(', ')}` } };
                updateData['social.relationshipStatus'] = relationshipStatus;
            }
        }
        if (workplace !== undefined) {
            if (!Array.isArray(workplace)) return { statusCode: 400, json: { success: false, message: 'Workplace must be an array' } };
            const processedWorkplace = [];
            for (const work of workplace) {
                if (!work.company || !work.position || !work.startDate) return { statusCode: 400, json: { success: false, message: 'Each workplace entry must have company, position, and startDate' } };
                if (work.startDate && isNaN(new Date(work.startDate).getTime())) return { statusCode: 400, json: { success: false, message: 'Invalid startDate format' } };
                if (work.endDate && isNaN(new Date(work.endDate).getTime())) return { statusCode: 400, json: { success: false, message: 'Invalid endDate format' } };
                let company;
                if (mongoose.Types.ObjectId.isValid(work.company)) {
                    company = await Company.findById(work.company);
                    if (!company) return { statusCode: 400, json: { success: false, message: `Company with ID ${work.company} not found` } };
                } else {
                    const companyName = String(work.company).trim();
                    if (!companyName) return { statusCode: 400, json: { success: false, message: 'Company name cannot be empty' } };
                    const normalizedCompanyName = companyName.toLowerCase();
                    company = await Company.findOne({ $or: [{ name: companyName }, { normalizedName: normalizedCompanyName }] });
                    if (!company) {
                        try {
                            company = await Company.create({ name: companyName, normalizedName: normalizedCompanyName, isCustom: true, createdBy: user._id });
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
            if (!Array.isArray(education)) return { statusCode: 400, json: { success: false, message: 'Education must be an array' } };
            const processedEducation = [];
            for (const edu of education) {
                if (!edu.institution || !edu.startYear) return { statusCode: 400, json: { success: false, message: 'Institution and startYear are required for each education entry' } };
                if (isNaN(parseInt(edu.startYear)) || parseInt(edu.startYear) < 1900 || parseInt(edu.startYear) > new Date().getFullYear() + 10) return { statusCode: 400, json: { success: false, message: 'Invalid startYear format (must be a valid year)' } };
                if (edu.endYear && (isNaN(parseInt(edu.endYear)) || parseInt(edu.endYear) < 1900 || parseInt(edu.endYear) > new Date().getFullYear() + 10)) return { statusCode: 400, json: { success: false, message: 'Invalid endYear format (must be a valid year)' } };
                let institution;
                if (mongoose.Types.ObjectId.isValid(edu.institution)) {
                    institution = await Institution.findById(edu.institution);
                    if (!institution) return { statusCode: 400, json: { success: false, message: `Institution with ID ${edu.institution} not found` } };
                } else {
                    const institutionName = edu.institution.trim();
                    const normalizedInstitutionName = institutionName.toLowerCase();
                    institution = await Institution.findOne({ $or: [{ name: institutionName }, { normalizedName: normalizedInstitutionName }] });
                    if (!institution) {
                        try {
                            institution = await Institution.create({
                                name: institutionName,
                                normalizedName: normalizedInstitutionName,
                                type: ['school', 'college', 'university', 'others'].includes(edu.institutionType || '') ? edu.institutionType : 'school',
                                city: edu.city || '',
                                country: edu.country || '',
                                logo: edu.logo || '',
                                verified: false,
                                isCustom: true,
                                createdBy: user._id
                            });
                        } catch (err) {
                            if (err.code === 11000) institution = await Institution.findOne({ $or: [{ name: institutionName }, { normalizedName: normalizedInstitutionName }] });
                            else throw err;
                        }
                    }
                }
                if (edu.startMonth !== undefined) { const startMonth = parseInt(edu.startMonth); if (isNaN(startMonth) || startMonth < 1 || startMonth > 12) return { statusCode: 400, json: { success: false, message: 'Invalid startMonth (must be between 1 and 12)' } }; }
                if (edu.endMonth !== undefined && edu.endMonth !== null) { const endMonth = parseInt(edu.endMonth); if (isNaN(endMonth) || endMonth < 1 || endMonth > 12) return { statusCode: 400, json: { success: false, message: 'Invalid endMonth (must be between 1 and 12)' } }; }
                if (edu.institutionType !== undefined) { const validTypes = ['school', 'college', 'university', 'others']; if (!validTypes.includes(edu.institutionType)) return { statusCode: 400, json: { success: false, message: `Institution type must be one of: ${validTypes.join(', ')}` } }; }
                if (edu.cgpa !== undefined && edu.cgpa !== null) { const cgpa = parseFloat(edu.cgpa); if (isNaN(cgpa) || cgpa < 0 || cgpa > 10) return { statusCode: 400, json: { success: false, message: 'Invalid CGPA (must be between 0 and 10)' } }; }
                if (edu.percentage !== undefined && edu.percentage !== null) { const percentage = parseFloat(edu.percentage); if (isNaN(percentage) || percentage < 0 || percentage > 100) return { statusCode: 400, json: { success: false, message: 'Invalid percentage (must be between 0 and 100)' } }; }
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
        if (Object.keys(updateData).length === 0) return { statusCode: 400, json: { success: false, message: 'No fields provided to update' } };
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
        console.error('Update profile error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error updating profile', error: error.message } };
    }
}

async function sendOTPForPhoneUpdate(user, body) {
    try {
        const { phoneNumber } = body;
        if (!phoneNumber) return { statusCode: 400, json: { success: false, message: 'Phone number is required' } };
        let normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
        if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
        const existingUser = await User.findOne({ 'profile.phoneNumbers.primary': normalizedPhone, _id: { $ne: user._id } });
        if (existingUser) return { statusCode: 400, json: { success: false, message: 'Phone number is already registered by another user' } };
        if (user.profile?.phoneNumbers?.primary === normalizedPhone) return { statusCode: 400, json: { success: false, message: 'This is already your current phone number' } };
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) return { statusCode: 500, json: { success: false, message: 'Twilio is not configured for phone OTP' } };
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const verification = await twilioClient.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID).verifications.create({ to: normalizedPhone, channel: 'sms' });
        return { statusCode: 200, json: { success: true, message: 'OTP sent successfully to your phone', data: { phone: normalizedPhone, sid: verification.sid, status: verification.status } } };
    } catch (error) {
        console.error('Send OTP for phone update error:', error);
        let errorMessage = error.message || 'Failed to send OTP';
        if (error.message && error.message.includes('Invalid parameter `To`')) errorMessage = 'Invalid phone number format. Please ensure the phone number is in E.164 format (e.g., +1234567890) with country code.';
        return { statusCode: 500, json: { success: false, message: errorMessage, hint: 'Phone number must be in E.164 format: +[country code][subscriber number]' } };
    }
}

async function verifyOTPAndUpdatePhone(user, body) {
    try {
        const { phoneNumber, otp } = body;
        if (!phoneNumber || !otp) return { statusCode: 400, json: { success: false, message: 'Phone number and OTP code are required' } };
        let normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
        if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
        const existingUser = await User.findOne({ $or: [{ 'profile.phoneNumbers.primary': normalizedPhone }, { 'profile.phoneNumbers.alternate': normalizedPhone }], _id: { $ne: user._id } });
        if (existingUser) return { statusCode: 400, json: { success: false, message: 'Phone number is already registered by another user' } };
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) return { statusCode: 500, json: { success: false, message: 'Twilio is not configured' } };
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const check = await twilioClient.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID).verificationChecks.create({ to: normalizedPhone, code: otp });
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
        let errorMessage = error.message || 'Failed to verify OTP';
        if (error.message && error.message.includes('Invalid parameter `To`')) errorMessage = 'Invalid phone number format. Please ensure the phone number is in E.164 format (e.g., +1234567890) with country code.';
        return { statusCode: 500, json: { success: false, message: errorMessage, hint: 'Phone number must be in E.164 format: +[country code][subscriber number]' } };
    }
}

async function sendOTPForAlternatePhone(user, body) {
    try {
        const { alternatePhoneNumber } = body;
        if (!alternatePhoneNumber) return { statusCode: 400, json: { success: false, message: 'Alternate phone number is required' } };
        let normalizedPhone = alternatePhoneNumber.replace(/[\s\-\(\)]/g, '');
        if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
        const existingUser = await User.findOne({ $or: [{ 'profile.phoneNumbers.primary': normalizedPhone, _id: { $ne: user._id } }, { 'profile.phoneNumbers.alternate': normalizedPhone, _id: { $ne: user._id } }] });
        if (existingUser) return { statusCode: 400, json: { success: false, message: 'This phone number is already registered by another user' } };
        if (user.profile?.phoneNumbers?.primary === normalizedPhone) return { statusCode: 400, json: { success: false, message: 'Alternate phone number cannot be the same as your primary phone number' } };
        if (user.profile?.phoneNumbers?.alternate === normalizedPhone) return { statusCode: 400, json: { success: false, message: 'This is already your current alternate phone number' } };
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) return { statusCode: 500, json: { success: false, message: 'Twilio is not configured for phone OTP' } };
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const verification = await twilioClient.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID).verifications.create({ to: normalizedPhone, channel: 'sms' });
        return { statusCode: 200, json: { success: true, message: 'OTP sent successfully to your alternate phone', data: { alternatePhone: normalizedPhone, sid: verification.sid, status: verification.status } } };
    } catch (error) {
        console.error('Send OTP for alternate phone error:', error);
        let errorMessage = error.message || 'Failed to send OTP';
        if (error.message && error.message.includes('Invalid parameter `To`')) errorMessage = 'Invalid phone number format. Please ensure the phone number is in E.164 format (e.g., +1234567890) with country code.';
        return { statusCode: 500, json: { success: false, message: errorMessage, hint: 'Phone number must be in E.164 format: +[country code][subscriber number]' } };
    }
}

async function verifyOTPAndUpdateAlternatePhone(user, body) {
    try {
        const { alternatePhoneNumber, otp } = body;
        if (!alternatePhoneNumber || !otp) return { statusCode: 400, json: { success: false, message: 'Alternate phone number and OTP code are required' } };
        let normalizedPhone = alternatePhoneNumber.replace(/[\s\-\(\)]/g, '');
        if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
        const existingUser = await User.findOne({ $or: [{ 'profile.phoneNumbers.primary': normalizedPhone, _id: { $ne: user._id } }, { 'profile.phoneNumbers.alternate': normalizedPhone, _id: { $ne: user._id } }] });
        if (existingUser) return { statusCode: 400, json: { success: false, message: 'This phone number is already registered by another user' } };
        if (user.profile?.phoneNumbers?.primary === normalizedPhone) return { statusCode: 400, json: { success: false, message: 'Alternate phone number cannot be the same as your primary phone number' } };
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) return { statusCode: 500, json: { success: false, message: 'Twilio is not configured' } };
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const check = await twilioClient.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID).verificationChecks.create({ to: normalizedPhone, code: otp });
        if (check.status !== 'approved') return { statusCode: 400, json: { success: false, message: 'Invalid or expired OTP code' } };
        const updatedUser = await User.findByIdAndUpdate(user._id, { $set: { 'profile.phoneNumbers.alternate': normalizedPhone } }, { new: true, runValidators: true }).lean().select('-auth');
        if (!updatedUser) return { statusCode: 404, json: { success: false, message: 'User not found' } };
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
        let errorMessage = error.message || 'Failed to verify OTP';
        if (error.message && error.message.includes('Invalid parameter `To`')) errorMessage = 'Invalid phone number format. Please ensure the phone number is in E.164 format (e.g., +1234567890) with country code.';
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

async function updatePersonalInfo(user, body) {
    try {
        const { firstName, lastName, gender, dob, phoneNumber, alternatePhoneNumber } = body;
        const updateData = {};
        const unsetData = {};
        if (firstName !== undefined) {
            if (!firstName || firstName.trim() === '') return { statusCode: 400, json: { success: false, message: 'First name cannot be empty' } };
            updateData['profile.name.first'] = firstName.trim();
        }
        if (lastName !== undefined) {
            if (!lastName || lastName.trim() === '') return { statusCode: 400, json: { success: false, message: 'Last name cannot be empty' } };
            updateData['profile.name.last'] = lastName.trim();
        }
        if (firstName !== undefined || lastName !== undefined) {
            const finalFirstName = updateData['profile.name.first'] || user.profile?.name?.first;
            const finalLastName = updateData['profile.name.last'] || user.profile?.name?.last;
            updateData['profile.name.full'] = `${finalFirstName} ${finalLastName}`.trim();
        }
        if (gender !== undefined) {
            const validGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];
            if (!validGenders.includes(gender)) return { statusCode: 400, json: { success: false, message: 'Gender must be one of: Male, Female, Other, Prefer not to say' } };
            updateData['profile.gender'] = gender;
        }
        if (dob !== undefined) {
            const dobDate = new Date(dob);
            if (isNaN(dobDate.getTime())) return { statusCode: 400, json: { success: false, message: 'Date of birth must be a valid date (ISO 8601 format: YYYY-MM-DD)' } };
            if (dobDate > new Date()) return { statusCode: 400, json: { success: false, message: 'Date of birth cannot be in the future' } };
            const minDate = new Date(); minDate.setFullYear(minDate.getFullYear() - 150);
            if (dobDate < minDate) return { statusCode: 400, json: { success: false, message: 'Date of birth is too far in the past (maximum 150 years)' } };
            updateData['profile.dob'] = dobDate;
        }
        if (phoneNumber !== undefined) {
            if (phoneNumber === null || phoneNumber === '') unsetData['profile.phoneNumbers.primary'] = '';
            else {
                let normalizedPhone = phoneNumber.replace(/[\s\-\(\)]/g, '');
                if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
                const existingUser = await User.findOne({ 'profile.phoneNumbers.primary': normalizedPhone, _id: { $ne: user._id } });
                if (existingUser) return { statusCode: 400, json: { success: false, message: 'Phone number is already registered by another user' } };
                updateData['profile.phoneNumbers.primary'] = normalizedPhone;
            }
        }
        if (alternatePhoneNumber !== undefined) {
            if (alternatePhoneNumber === null || alternatePhoneNumber === '') unsetData['profile.phoneNumbers.alternate'] = '';
            else {
                let normalizedPhone = alternatePhoneNumber.replace(/[\s\-\(\)]/g, '');
                if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
                const finalPhoneNumber = updateData['profile.phoneNumbers.primary'] || user.profile?.phoneNumbers?.primary;
                if (finalPhoneNumber === normalizedPhone) return { statusCode: 400, json: { success: false, message: 'Alternate phone number cannot be the same as your primary phone number' } };
                const existingUser = await User.findOne({ $or: [{ 'profile.phoneNumbers.primary': normalizedPhone, _id: { $ne: user._id } }, { 'profile.phoneNumbers.alternate': normalizedPhone, _id: { $ne: user._id } }] });
                if (existingUser) return { statusCode: 400, json: { success: false, message: 'This phone number is already registered by another user' } };
                updateData['profile.phoneNumbers.alternate'] = normalizedPhone;
            }
        }
        if (Object.keys(updateData).length === 0 && Object.keys(unsetData).length === 0) return { statusCode: 400, json: { success: false, message: 'No fields provided to update' } };
        const updateQuery = {};
        if (Object.keys(updateData).length > 0) updateQuery.$set = updateData;
        if (Object.keys(unsetData).length > 0) updateQuery.$unset = unsetData;
        const updatedUser = await User.findByIdAndUpdate(user._id, updateQuery, { new: true, runValidators: true }).lean().select('-auth');
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
        console.error('Update personal info error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error updating personal information', error: error.message } };
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
                if (!validStatuses.includes(relationshipStatus)) return { statusCode: 400, json: { success: false, message: `Relationship status must be one of: ${validStatuses.join(', ')}` } };
                updateData['social.relationshipStatus'] = relationshipStatus;
            }
        }
        if (workplace !== undefined) {
            if (!Array.isArray(workplace)) return { statusCode: 400, json: { success: false, message: 'Workplace must be an array' } };
            const processedWorkplace = [];
            for (const work of workplace) {
                if (!work.company || !work.position || !work.startDate) return { statusCode: 400, json: { success: false, message: 'Each workplace entry must have company, position, and startDate' } };
                if (work.startDate && isNaN(new Date(work.startDate).getTime())) return { statusCode: 400, json: { success: false, message: 'Invalid startDate format' } };
                if (work.endDate && isNaN(new Date(work.endDate).getTime())) return { statusCode: 400, json: { success: false, message: 'Invalid endDate format' } };
                let company;
                if (mongoose.Types.ObjectId.isValid(work.company)) {
                    company = await Company.findById(work.company);
                    if (!company) return { statusCode: 400, json: { success: false, message: `Company with ID ${work.company} not found` } };
                } else {
                    const companyName = String(work.company).trim();
                    if (!companyName) return { statusCode: 400, json: { success: false, message: 'Company name cannot be empty' } };
                    const normalizedCompanyName = companyName.toLowerCase();
                    company = await Company.findOne({ $or: [{ name: companyName }, { normalizedName: normalizedCompanyName }] });
                    if (!company) {
                        try {
                            company = await Company.create({ name: companyName, normalizedName: normalizedCompanyName, isCustom: true, createdBy: user._id });
                        } catch (err) {
                            if (err.code === 11000) company = await Company.findOne({ $or: [{ name: companyName }, { normalizedName: normalizedCompanyName }] });
                            else throw err;
                        }
                    }
                }
                processedWorkplace.push({ company: company._id, position: work.position, description: work.description ? work.description.trim() : '', startDate: new Date(work.startDate), endDate: work.endDate ? new Date(work.endDate) : null, isCurrent: work.isCurrent || false });
            }
            updateData['professional.workplace'] = processedWorkplace;
        }
        if (education !== undefined) {
            if (!Array.isArray(education)) return { statusCode: 400, json: { success: false, message: 'Education must be an array' } };
            const validEducations = [];
            const institutionData = [];
            for (const edu of education) {
                if (!edu.institution || !edu.startYear) return { statusCode: 400, json: { success: false, message: 'Institution and startYear are required for each education entry' } };
                if (isNaN(parseInt(edu.startYear)) || parseInt(edu.startYear) < 1900 || parseInt(edu.startYear) > new Date().getFullYear() + 10) return { statusCode: 400, json: { success: false, message: 'Invalid startYear format (must be a valid year)' } };
                if (edu.endYear && (isNaN(parseInt(edu.endYear)) || parseInt(edu.endYear) < 1900 || parseInt(edu.endYear) > new Date().getFullYear() + 10)) return { statusCode: 400, json: { success: false, message: 'Invalid endYear format (must be a valid year)' } };
                if (edu.startMonth !== undefined) { const startMonth = parseInt(edu.startMonth); if (isNaN(startMonth) || startMonth < 1 || startMonth > 12) return { statusCode: 400, json: { success: false, message: 'Invalid startMonth (must be between 1 and 12)' } }; }
                if (edu.endMonth !== undefined && edu.endMonth !== null) { const endMonth = parseInt(edu.endMonth); if (isNaN(endMonth) || endMonth < 1 || endMonth > 12) return { statusCode: 400, json: { success: false, message: 'Invalid endMonth (must be between 1 and 12)' } }; }
                if (edu.institutionType !== undefined) { const validTypes = ['school', 'college', 'university', 'others']; if (!validTypes.includes(edu.institutionType)) return { statusCode: 400, json: { success: false, message: `Institution type must be one of: ${validTypes.join(', ')}` } }; }
                if (edu.cgpa !== undefined && edu.cgpa !== null) { const cgpa = parseFloat(edu.cgpa); if (isNaN(cgpa) || cgpa < 0 || cgpa > 10) return { statusCode: 400, json: { success: false, message: 'Invalid CGPA (must be between 0 and 10)' } }; }
                if (edu.percentage !== undefined && edu.percentage !== null) { const percentage = parseFloat(edu.percentage); if (isNaN(percentage) || percentage < 0 || percentage > 100) return { statusCode: 400, json: { success: false, message: 'Invalid percentage (must be between 0 and 100)' } }; }
                if (typeof edu.institution === 'string' && !mongoose.Types.ObjectId.isValid(edu.institution)) institutionData.push({ name: edu.institution, type: edu.institutionType || 'school', city: edu.city, country: edu.country, logo: edu.logo });
                validEducations.push(edu);
            }
            let institutionsMap;
            try {
                institutionsMap = institutionData.length > 0 ? await getOrCreateInstitutions(institutionData, user._id) : new Map();
            } catch (err) {
                return { statusCode: 500, json: { success: false, message: 'Failed to process institution information', error: process.env.NODE_ENV === 'development' ? err.message : undefined } };
            }
            const processedEducation = [];
            for (const edu of validEducations) {
                let institution;
                if (mongoose.Types.ObjectId.isValid(edu.institution)) {
                    institution = await Institution.findById(edu.institution);
                    if (!institution) return { statusCode: 400, json: { success: false, message: `Institution with ID ${edu.institution} not found` } };
                } else {
                    const normalizedName = String(edu.institution).toLowerCase().trim();
                    institution = institutionsMap.get(normalizedName);
                    if (!institution) return { statusCode: 400, json: { success: false, message: `Failed to process institution: ${edu.institution}` } };
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
        if (Object.keys(updateData).length === 0) return { statusCode: 400, json: { success: false, message: 'No fields provided to update' } };
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
        console.error('Update location and details error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error updating location and details', error: error.message } };
    }
}

async function updateProfileVisibility(user, body) {
    try {
        const { visibility } = body;
        if (visibility === undefined) return { statusCode: 400, json: { success: false, message: 'Visibility field is required' } };
        if (!['public', 'private'].includes(visibility)) return { statusCode: 400, json: { success: false, message: 'Visibility must be either "public" or "private"' } };
        const updatedUser = await User.findByIdAndUpdate(user._id, { 'profile.visibility': visibility }, { new: true, runValidators: true }).lean().select('-auth');
        if (!updatedUser) return { statusCode: 404, json: { success: false, message: 'User not found' } };
        return {
            statusCode: 200,
            json: {
                success: true,
                message: `Profile visibility updated to ${visibility}`,
                data: { user: { id: updatedUser._id, profileVisibility: updatedUser.profile?.visibility || 'public' } }
            }
        };
    } catch (error) {
        console.error('Update profile visibility error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to update profile visibility', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function searchUsers(currentUser, queryParams) {
    try {
        const { query } = queryParams;
        const page = parseInt(queryParams.page) || 1;
        const limit = parseInt(queryParams.limit) || 20;
        const skip = (page - 1) * limit;
        if (!query || query.trim() === '') return { statusCode: 400, json: { success: false, message: 'Search query is required' } };
        const searchTerm = query.trim();
        const blockedUserIds = await getBlockedUserIds(currentUser._id);
        const usersWhoBlockedMe = await User.find({ 'social.blockedUsers': currentUser._id }).select('_id').lean();
        const blockedByUserIds = usersWhoBlockedMe.map(u => u._id);
        const excludedUserIds = [currentUser._id, ...blockedUserIds, ...blockedByUserIds];
        const searchQuery = {
            _id: { $nin: excludedUserIds },
            $or: [
                { 'profile.name.first': { $regex: searchTerm, $options: 'i' } },
                { 'profile.name.last': { $regex: searchTerm, $options: 'i' } },
                { 'profile.name.full': { $regex: searchTerm, $options: 'i' } }
            ]
        };
        const totalUsers = await User.countDocuments(searchQuery);
        const users = await User.find(searchQuery).select('-auth -profile.email').sort({ 'profile.name.full': 1 }).skip(skip).limit(limit).lean();
        if (users.length === 0) {
            return {
                statusCode: 200,
                json: {
                    success: true,
                    message: 'No users found',
                    data: { users: [], pagination: { currentPage: page, totalPages: 0, totalUsers: 0, hasNextPage: false, hasPrevPage: false } }
                }
            };
        }
        const currentUserWithFriends = await User.findById(currentUser._id).select('social.friends').lean();
        const currentUserFriendsSet = new Set((currentUserWithFriends?.social?.friends || []).map(id => id.toString()));
        const formattedUsers = users.map(searchedUser => {
            const userId = searchedUser._id.toString();
            const isProfilePrivate = searchedUser.profile?.visibility === 'private';
            const isFriend = currentUserFriendsSet.has(userId);
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
                        currentPage: page,
                        totalPages: Math.ceil(totalUsers / limit),
                        totalUsers,
                        hasNextPage: page < Math.ceil(totalUsers / limit),
                        hasPrevPage: page > 1
                    }
                }
            }
        };
    } catch (error) {
        console.error('Search users error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error searching users', error: error.message } };
    }
}

async function removeEducationEntry(userId, educationId) {
    try {
        const user = await User.findById(userId);
        if (!user) return { statusCode: 404, json: { success: false, message: 'User not found' } };
        if (!user.professional?.education || !Array.isArray(user.professional.education)) return { statusCode: 400, json: { success: false, message: 'No education entries found' } };
        let educationToRemove;
        let educationIdToRemove;
        if (mongoose.Types.ObjectId.isValid(educationId)) {
            educationToRemove = user.professional.education.find(edu => edu._id.toString() === educationId);
            if (educationToRemove) educationIdToRemove = educationToRemove._id;
        }
        if (!educationToRemove) {
            const entryIndex = parseInt(educationId);
            if (isNaN(entryIndex) || entryIndex < 0 || entryIndex >= user.professional.education.length) return { statusCode: 400, json: { success: false, message: 'Invalid education entry ID or index.' } };
            educationToRemove = user.professional.education[entryIndex];
            educationIdToRemove = educationToRemove._id;
        }
        await User.findByIdAndUpdate(user._id, { $pull: { 'professional.education': { _id: educationIdToRemove } } }, { new: true, runValidators: true });
        const updatedUser = await User.findById(user._id).populate('professional.education.institution', 'name type city country logo verified isCustom').select('-auth').lean();
        const formattedEducation = (updatedUser.professional?.education || []).map(edu => ({
            institution: edu.institution ? { id: edu.institution._id, name: edu.institution.name, type: edu.institution.type, city: edu.institution.city, country: edu.institution.country, logo: edu.institution.logo, verified: edu.institution.verified, isCustom: edu.institution.isCustom } : null,
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
                    removedEntry: { description: educationToRemove.description, degree: educationToRemove.degree, field: educationToRemove.field, institutionType: educationToRemove.institutionType, startYear: educationToRemove.startYear, endYear: educationToRemove.endYear },
                    education: formattedEducation,
                    remainingCount: formattedEducation.length
                }
            }
        };
    } catch (error) {
        console.error('Remove education entry error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error removing education entry', error: error.message } };
    }
}

async function removeWorkplaceEntry(user, indexParam) {
    try {
        const entryIndex = parseInt(indexParam);
        if (isNaN(entryIndex) || entryIndex < 0) return { statusCode: 400, json: { success: false, message: 'Invalid workplace entry index. Index must be a non-negative number.' } };
        if (!user.professional?.workplace || !Array.isArray(user.professional.workplace)) return { statusCode: 400, json: { success: false, message: 'No workplace entries found' } };
        if (entryIndex >= user.professional.workplace.length) return { statusCode: 404, json: { success: false, message: `Workplace entry at index ${entryIndex} not found. You have ${user.professional.workplace.length} workplace entries.` } };
        const workplaceToRemove = user.professional.workplace[entryIndex];
        const workplaceId = workplaceToRemove._id;
        await User.findByIdAndUpdate(user._id, { $pull: { 'professional.workplace': { _id: workplaceId } } }, { new: true, runValidators: true });
        if (!workplaceId) {
            const updatedWorkplace = user.professional.workplace.filter((_, idx) => idx !== entryIndex);
            await User.findByIdAndUpdate(user._id, { $set: { 'professional.workplace': updatedWorkplace } }, { new: true, runValidators: true });
        }
        const updatedUser = await User.findById(user._id).populate('professional.workplace.company', 'name isCustom').select('-auth').lean();
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
                    removedEntry: { position: workplaceToRemove.position, description: workplaceToRemove.description, startDate: workplaceToRemove.startDate, endDate: workplaceToRemove.endDate, isCurrent: workplaceToRemove.isCurrent },
                    workplace: formattedWorkplace,
                    remainingCount: formattedWorkplace.length
                }
            }
        };
    } catch (error) {
        console.error('Remove workplace entry error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error removing workplace entry', error: error.message } };
    }
}

async function getUserProfileById(currentUser, targetUserId) {
    try {
        const user = await User.findById(targetUserId)
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
            return {
                statusCode: 200,
                json: { success: true, message: 'User profile retrieved (limited)', data: { user: getLimitedProfileData(user), isPrivate: true } }
            };
        }
        const formattedWorkplace = (user.professional?.workplace || []).map(work => ({
            company: work.company ? { id: work.company._id, name: work.company.name, isCustom: work.company.isCustom } : null,
            position: work.position,
            startDate: work.startDate,
            endDate: work.endDate,
            isCurrent: work.isCurrent
        }));
        const formattedEducation = (user.professional?.education || []).map(edu => ({
            institution: edu.institution ? { id: edu.institution._id, name: edu.institution.name, type: edu.institution.type, city: edu.institution.city, country: edu.institution.country, logo: edu.institution.logo, verified: edu.institution.verified, isCustom: edu.institution.isCustom } : null,
            degree: edu.degree,
            field: edu.field,
            startYear: edu.startYear,
            endYear: edu.endYear
        }));
        const numberOfFriends = user.social?.friends ? user.social.friends.length : 0;
        const isOwner = currentUser._id.toString() === user._id.toString();
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
                            email: isFriend || isOwner ? user.profile?.email : undefined,
                            phoneNumbers: isFriend || isOwner ? { primary: user.profile?.phoneNumbers?.primary, alternate: user.profile?.phoneNumbers?.alternate } : undefined,
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
    } catch (error) {
        console.error('Error fetching user profile:', error);
        return { statusCode: 500, json: { success: false, message: 'Error fetching user profile', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

module.exports = {
    updateProfile,
    updatePersonalInfo,
    updateLocationAndDetails,
    updateProfileVisibility,
    getUserProfileById,
    searchUsers,
    removeEducationEntry,
    removeWorkplaceEntry,
    sendOTPForPhoneUpdate,
    verifyOTPAndUpdatePhone,
    sendOTPForAlternatePhone,
    verifyOTPAndUpdateAlternatePhone,
    removeAlternatePhone
};

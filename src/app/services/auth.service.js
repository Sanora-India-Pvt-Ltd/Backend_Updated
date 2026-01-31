const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../../models/authorization/User');
const Company = require('../../models/authorization/Company');
const Institution = require('../../models/authorization/Institution');
const AppError = require('../../core/errors/AppError');
const tokenService = require('./token.service');
const deviceService = require('./device.service');
const { createOTPRecord, validateOTP } = require('../../core/infra/otp');
const emailService = require('../../core/infra/email');

const VALID_GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const VALID_RELATIONSHIP_STATUSES = [
    'Single', 'In a relationship', 'Engaged', 'Married', 'In a civil partnership',
    'In a domestic partnership', 'In an open relationship', "It's complicated",
    'Separated', 'Divorced', 'Widowed'
];
const VALID_INSTITUTION_TYPES = ['school', 'college', 'university', 'others'];

function normalizePhone(phone) {
    let normalized = String(phone).replace(/[\s\-\(\)]/g, '').trim();
    if (normalized && !normalized.startsWith('+')) normalized = '+' + normalized;
    return normalized;
}

function normalizeEmail(email) {
    return String(email).trim().toLowerCase();
}

/**
 * Signup: validate input, verify email/phone OTP tokens, create user (with optional company/institution), add refresh token.
 * Returns { user, accessToken, refreshToken } for the created user.
 * Throws AppError for validation/verification errors. Lets Mongo duplicate key (11000) propagate for controller to handle.
 */
async function signup(payload, deviceInfo) {
    const {
        email,
        password,
        confirmPassword,
        firstName,
        lastName,
        phoneNumber,
        gender,
        name,
        emailVerificationToken,
        phoneVerificationToken,
        company: companyPayload,
        institution: institutionPayload
    } = payload;

    if (!email || !password || !firstName || !lastName || !phoneNumber || !gender) {
        throw new AppError(
            'Email, password, first name, last name, phone number, and gender are required',
            400
        );
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
        throw new AppError('Email cannot be empty', 400);
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
        throw new AppError('Invalid email format', 400);
    }
    if (password.length < 6) {
        throw new AppError('Password must be at least 6 characters long', 400);
    }
    if (confirmPassword != null && password !== confirmPassword) {
        throw new AppError('Password and confirm password do not match', 400);
    }
    if (!VALID_GENDERS.includes(gender)) {
        throw new AppError(
            'Gender must be one of: Male, Female, Other, Prefer not to say',
            400
        );
    }

    const existingUser = await User.findOne({ 'profile.email': normalizedEmail });
    if (existingUser) {
        throw new AppError('User already exists with this email', 400);
    }

    const normalizedPhone = normalizePhone(phoneNumber);
    const existingPhoneUser = await User.findOne({
        'profile.phoneNumbers.primary': normalizedPhone
    });
    if (existingPhoneUser) {
        throw new AppError('Phone number is already registered', 400);
    }

    if (!emailVerificationToken && !phoneVerificationToken) {
        throw new AppError(
            'Both email and phone OTP verification are required for signup. Please verify your email using /api/auth/send-otp-signup and /api/auth/verify-otp-signup, and verify your phone using /api/auth/send-phone-otp-signup and /api/auth/verify-phone-otp-signup',
            400
        );
    }
    if (!emailVerificationToken) {
        throw new AppError(
            'Email verification is required. Please verify your email using /api/auth/send-otp-signup and /api/auth/verify-otp-signup',
            400
        );
    }
    if (!phoneVerificationToken) {
        throw new AppError(
            'Phone verification is required. Please verify your phone using /api/auth/send-phone-otp-signup and /api/auth/verify-phone-otp-signup',
            400
        );
    }

    tokenService.verifyEmailVerificationToken(emailVerificationToken, normalizedEmail);
    tokenService.verifyPhoneVerificationToken(phoneVerificationToken, normalizedPhone);

    const hashedPassword = await bcrypt.hash(password, 10);
    const fullName = name ? String(name).trim() : `${firstName.trim()} ${lastName.trim()}`.trim();

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const user = await User.create(
            [
                {
                    profile: {
                        name: {
                            first: firstName.trim(),
                            last: lastName.trim(),
                            full: fullName
                        },
                        email: normalizedEmail,
                        phoneNumbers: { primary: normalizedPhone },
                        gender
                    },
                    auth: {
                        password: hashedPassword,
                        tokens: { refreshTokens: [] }
                    },
                    account: {
                        isActive: true,
                        isVerified: false,
                        lastLogin: new Date()
                    },
                    social: { friends: [], blockedUsers: [] },
                    location: {},
                    professional: { education: [], workplace: [] },
                    content: { generalWeightage: 0, professionalWeightage: 0 }
                }
            ],
            { session }
        ).then((users) => users[0]);

        const accessToken = tokenService.generateAccessToken({
            id: user._id,
            email: user.profile.email
        });
        const { token: refreshToken, expiryDate: refreshTokenExpiry } =
            tokenService.generateRefreshToken();

        const deviceStr = (deviceInfo || 'Unknown Device').substring(0, 200);
        await deviceService.addRefreshTokenToUser(
            user,
            refreshToken,
            refreshTokenExpiry,
            deviceStr
        );

        if (companyPayload) {
            const company = new Company({
                name: companyPayload.name || 'Unnamed Company',
                normalizedName: (companyPayload.name || '').toLowerCase().trim(),
                isCustom: true,
                createdBy: user._id
            });
            await company.save({ session });
        }
        if (institutionPayload) {
            const institution = new Institution({
                name: institutionPayload.name || 'Unnamed Institution',
                normalizedName: (institutionPayload.name || '').toLowerCase().trim(),
                type: institutionPayload.type || 'school',
                isCustom: true,
                createdBy: user._id
            });
            await institution.save({ session });
        }

        await session.commitTransaction();

        return {
            user: {
                id: user._id,
                email: user.profile.email,
                firstName: user.profile.name.first,
                lastName: user.profile.name.last,
                phoneNumber: user.profile.phoneNumbers.primary,
                gender: user.profile.gender,
                name: user.profile.name.full
            },
            accessToken,
            refreshToken
        };
    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

/**
 * Login by email or phone + password. Returns { user, accessToken, refreshToken }.
 */
async function login(payload, deviceInfo) {
    const { email, phoneNumber, password } = payload;

    if ((!email && !phoneNumber) || !password) {
        throw new AppError(
            'Either email or phone number, and password are required',
            400
        );
    }

    let user;
    if (email) {
        const normalizedEmail = normalizeEmail(email);
        user = await User.findOne({ 'profile.email': normalizedEmail });
    } else {
        user = await User.findOne({ 'profile.phoneNumbers.primary': phoneNumber });
    }

    if (!user) {
        throw new AppError('Invalid email/phone number or password', 400);
    }

    const userPassword = user.auth?.password;
    if (!userPassword) {
        if (user.auth?.isGoogleOAuth) {
            throw new AppError(
                'This account uses Google Sign-In. Please use Google authentication instead.',
                400
            );
        }
        throw new AppError('Invalid email/phone number or password', 400);
    }

    const isPasswordValid = await bcrypt.compare(password, userPassword);
    if (!isPasswordValid) {
        throw new AppError('Invalid email/phone number or password', 400);
    }

    const userEmail = user.profile?.email || user.profile.email;
    const accessToken = tokenService.generateAccessToken({
        id: (user._id || user.id).toString(),
        email: userEmail
    });
    const { token: refreshToken, expiryDate: refreshTokenExpiry } =
        tokenService.generateRefreshToken();

    if (!user.auth) user.auth = {};
    if (!user.auth.tokens) user.auth.tokens = {};
    if (!Array.isArray(user.auth.tokens.refreshTokens)) {
        user.auth.tokens.refreshTokens = [];
    }

    const deviceStr = (deviceInfo || 'Unknown Device').substring(0, 200);
    await deviceService.addRefreshTokenToUser(
        user,
        refreshToken,
        refreshTokenExpiry,
        deviceStr,
        { extraSet: { 'account.lastLogin': new Date() } }
    );

    const userData = {
        id: user._id,
        email: user.profile?.email || user.profile.email,
        firstName: user.profile?.name?.first || user.profile.name.first,
        lastName: user.profile?.name?.last || user.profile.name.last,
        phoneNumber: user.profile?.phoneNumbers?.primary || user.profile.phoneNumbers.primary,
        gender: user.profile?.gender || user.profile.gender,
        name:
            user.profile?.name?.full ||
            user.profile.name.full ||
            `${user.profile?.name?.first || user.profile.name.first} ${user.profile?.name?.last || user.profile.name.last}`.trim(),
        profileImage: user.profile?.profileImage || user.profile.profileImage
    };

    return { user: userData, accessToken, refreshToken };
}

/**
 * Send OTP for password reset (email or phone). Returns payload for success response.
 */
async function sendOTPForPasswordReset(payload) {
    const { email, phone } = payload;

    if (!email && !phone) {
        throw new AppError('Either email or phone number is required', 400);
    }

    let user;
    if (email) {
        const normalizedEmail = normalizeEmail(email);
        user = await User.findOne({ 'profile.email': normalizedEmail });
        if (!user) {
            throw new AppError('User not found with this email address', 404);
        }
    } else {
        let normalizedPhone = normalizePhone(phone);
        const phoneVariations = [
            normalizedPhone,
            phone.trim(),
            normalizedPhone.replace('+', ''),
            phone.replace(/[\s\-\(\)]/g, '')
        ];
        for (const phoneVar of phoneVariations) {
            user = await User.findOne({ 'profile.phoneNumbers.primary': phoneVar });
            if (user) break;
        }
        if (process.env.NODE_ENV === 'development' && !user) {
            const phoneDigits = normalizedPhone.replace(/\D/g, '');
            if (phoneDigits.length >= 10) {
                const last10 = phoneDigits.slice(-10);
                const users = await User.find({
                    'profile.phoneNumbers.primary': { $regex: last10 }
                }).limit(5);
                if (users.length > 0) {
                    // debug logging only
                }
            }
        }
        if (!user) {
            const err = new AppError(
                'User not found with this phone number',
                404
            );
            err.hint = 'Please verify the phone number is correct, or try using your email address instead';
            err.suggestion =
                'You can use email instead: POST /api/auth/forgot-password/send-otp with {"email": "your@email.com"}';
            throw err;
        }
    }

    if (email) {
        if (!emailService.transporter) {
            const err = new AppError('Email service is not configured', 503);
            err.hint =
                'Please configure EMAIL_USER and EMAIL_PASSWORD in your .env file. For Gmail, use an App Password (not your regular password).';
            throw err;
        }
        const { otpRecord, plainOTP } = await createOTPRecord(
            email.toLowerCase(),
            'password_reset'
        );
        const emailSent = await emailService.sendOTPEmail(email.toLowerCase(), plainOTP);
        if (!emailSent) {
            const err = new AppError('Failed to send OTP email', 503);
            err.hint =
                'Check server logs for details. For Gmail: Ensure you are using an App Password and 2-Step Verification is enabled.';
            throw err;
        }
        return {
            email: email.toLowerCase(),
            expiresAt: otpRecord.expiresAt
        };
    }

    // Phone: Twilio
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_VERIFY_SERVICE_SID) {
        throw new AppError('Twilio is not configured for phone OTP', 500);
    }
    const twilio = require('twilio');
    const twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
    );
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    let normalizedPhone = normalizePhone(phone);
    const verification = await twilioClient.verify.v2
        .services(serviceSid)
        .verifications.create({ to: normalizedPhone, channel: 'sms' });
    return {
        phone: normalizedPhone,
        sid: verification.sid,
        status: verification.status
    };
}

/**
 * Verify OTP for password reset. Returns { verificationToken, email }.
 */
async function verifyOTPForPasswordReset(payload) {
    const { email, phone, otp } = payload;

    if ((!email && !phone) || !otp) {
        throw new AppError(
            'Either email or phone number, and OTP code are required',
            400
        );
    }

    let user;
    let verificationResult = { valid: false };

    if (email) {
        user = await User.findOne({ 'profile.email': email.toLowerCase() });
        if (!user) {
            throw new AppError('User not found with this email', 404);
        }
        verificationResult = await validateOTP(email.toLowerCase(), 'password_reset', otp);
    }

    if (phone) {
        const normalizedPhoneForLookup = normalizePhone(phone);
        const phoneVariations = [
            normalizedPhoneForLookup,
            phone.trim(),
            normalizedPhoneForLookup.replace('+', ''),
            phone.replace(/[\s\-\(\)]/g, '')
        ];
        for (const phoneVar of phoneVariations) {
            user = await User.findOne({ 'profile.phoneNumbers.primary': phoneVar });
            if (user) break;
        }
        if (!user) {
            throw new AppError('User not found with this phone number', 404);
        }
        if (
            !process.env.TWILIO_ACCOUNT_SID ||
            !process.env.TWILIO_AUTH_TOKEN ||
            !process.env.TWILIO_VERIFY_SERVICE_SID
        ) {
            throw new AppError('Twilio is not configured', 500);
        }
        const twilio = require('twilio');
        const twilioClient = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );
        const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
        const check = await twilioClient.verify.v2
            .services(serviceSid)
            .verificationChecks.create({ to: normalizedPhoneForLookup, code: otp });
        verificationResult.valid = check.status === 'approved';
        if (!verificationResult.valid) {
            verificationResult.message = 'Invalid or expired code';
        }
    }

    if (!verificationResult.valid) {
        const err = new AppError(
            verificationResult.message || 'Invalid or expired OTP',
            400
        );
        if (verificationResult.remainingAttempts != null) {
            err.remainingAttempts = verificationResult.remainingAttempts;
        }
        throw err;
    }

    const verificationToken = tokenService.createPasswordResetToken(
        user._id,
        user.profile.email,
        user.profile.phoneNumbers?.primary
    );
    return { verificationToken, email: user.profile.email };
}

/**
 * Reset password using verification token. Throws on invalid token or user not found.
 */
async function resetPassword(payload) {
    const { verificationToken, password, confirmPassword } = payload;

    if (!verificationToken || !password || !confirmPassword) {
        throw new AppError(
            'Verification token, password, and confirm password are required',
            400
        );
    }
    if (password.length < 6) {
        throw new AppError('Password must be at least 6 characters long', 400);
    }
    if (password !== confirmPassword) {
        throw new AppError('Password and confirm password do not match', 400);
    }

    const decoded = tokenService.verifyPasswordResetToken(verificationToken);
    const user = await User.findById(decoded.userId);
    if (!user) {
        throw new AppError('User not found', 404);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate(
        user._id,
        { $set: { 'auth.password': hashedPassword } },
        { new: true, runValidators: true }
    ).lean();
}

/**
 * Get profile payload for the given user (from protect). Populates workplace.company and education.institution.
 */
async function getProfile(user) {
    if (!user) {
        throw new AppError('User not found', 404);
    }

    const populated = await User.findById(user._id)
        .populate('professional.workplace.company', 'name isCustom')
        .populate(
            'professional.education.institution',
            'name type city country logo verified isCustom'
        )
        .lean();

    const formattedWorkplace = (populated.professional?.workplace || []).map((work) => ({
        company: work.company
            ? {
                id: work.company._id,
                name: work.company.name,
                isCustom: work.company.isCustom
            }
            : null,
        position: work.position,
        startDate: work.startDate,
        endDate: work.endDate,
        isCurrent: work.isCurrent
    }));

    const formattedEducation = (populated.professional?.education || []).map((edu) => ({
        institution: edu.institution
            ? {
                id: edu.institution._id,
                name: edu.institution.name,
                type: edu.institution.type,
                city: edu.institution.city,
                country: edu.institution.country,
                logo: edu.institution.logo,
                verified: edu.institution.verified,
                isCustom: edu.institution.isCustom
            }
            : null,
        degree: edu.degree,
        field: edu.field,
        startYear: edu.startYear,
        endYear: edu.endYear
    }));

    const numberOfFriends = populated.social?.friends?.length ?? 0;

    return {
        user: {
            id: populated._id,
            profile: {
                name: {
                    first: populated.profile?.name?.first,
                    last: populated.profile?.name?.last,
                    full: populated.profile?.name?.full
                },
                email: populated.profile?.email,
                phoneNumbers: {
                    primary: populated.profile?.phoneNumbers?.primary,
                    alternate: populated.profile?.phoneNumbers?.alternate
                },
                gender: populated.profile?.gender,
                pronouns: populated.profile?.pronouns,
                dob: populated.profile?.dob,
                bio: populated.profile?.bio,
                profileImage: populated.profile?.profileImage,
                coverPhoto: populated.profile?.coverPhoto,
                visibility: populated.profile?.visibility || 'public'
            },
            location: {
                currentCity: populated.location?.currentCity,
                hometown: populated.location?.hometown
            },
            social: {
                numberOfFriends,
                relationshipStatus: populated.social?.relationshipStatus
            },
            professional: {
                workplace: formattedWorkplace,
                education: formattedEducation
            },
            content: {
                generalWeightage: populated.content?.generalWeightage ?? 0,
                professionalWeightage: populated.content?.professionalWeightage ?? 0
            },
            account: {
                createdAt: populated.createdAt,
                updatedAt: populated.updatedAt,
                isActive: populated.account?.isActive,
                isVerified: populated.account?.isVerified,
                lastLogin: populated.account?.lastLogin
            }
        }
    };
}

/**
 * Update profile. Returns formatted user object for response.
 */
async function updateProfile(user, body) {
    const {
        firstName,
        lastName,
        phoneNumber,
        gender,
        dob,
        alternatePhoneNumber,
        profileImage,
        age,
        bio,
        currentCity,
        hometown,
        relationshipStatus,
        workplace,
        education
    } = body;

    const allowedUpdates = {};
    if (!user.profile) user.profile = {};
    if (!user.profile.name) user.profile.name = {};
    if (!user.profile.phoneNumbers) user.profile.phoneNumbers = {};
    if (!user.location) user.location = {};
    if (!user.social) user.social = {};
    if (!user.professional) user.professional = {};

    if (firstName !== undefined) allowedUpdates['profile.name.first'] = firstName;
    if (lastName !== undefined) allowedUpdates['profile.name.last'] = lastName;

    if (phoneNumber !== undefined) {
        const normalizedPhone = normalizePhone(phoneNumber);
        const existingPhoneUser = await User.findOne({
            'profile.phoneNumbers.primary': normalizedPhone,
            _id: { $ne: user._id }
        });
        if (existingPhoneUser) {
            throw new AppError(
                'Phone number is already registered to another account',
                400
            );
        }
        allowedUpdates['profile.phoneNumbers.primary'] = normalizedPhone;
    }

    if (gender !== undefined) {
        if (!VALID_GENDERS.includes(gender)) {
            throw new AppError(
                'Gender must be one of: Male, Female, Other, Prefer not to say',
                400
            );
        }
        allowedUpdates['profile.gender'] = gender;
    }
    if (dob !== undefined) allowedUpdates['profile.dob'] = dob;
    if (alternatePhoneNumber !== undefined) {
        allowedUpdates['profile.phoneNumbers.alternate'] = normalizePhone(alternatePhoneNumber);
    }
    if (profileImage !== undefined) {
        allowedUpdates['profile.profileImage'] = String(profileImage).trim();
    }
    if (age !== undefined) {
        if (typeof age !== 'number' || age < 0 || age > 150) {
            throw new AppError('Age must be a valid number between 0 and 150', 400);
        }
        const today = new Date();
        const birthYear = today.getFullYear() - age;
        allowedUpdates['profile.dob'] = new Date(birthYear, today.getMonth(), today.getDate());
    }
    if (bio !== undefined) allowedUpdates['profile.bio'] = String(bio).trim();
    if (currentCity !== undefined) allowedUpdates['location.currentCity'] = String(currentCity).trim();
    if (hometown !== undefined) allowedUpdates['location.hometown'] = String(hometown).trim();

    if (relationshipStatus !== undefined) {
        if (relationshipStatus === null || relationshipStatus === '') {
            allowedUpdates['social.relationshipStatus'] = null;
        } else {
            if (!VALID_RELATIONSHIP_STATUSES.includes(relationshipStatus)) {
                throw new AppError(
                    `Relationship status must be one of: ${VALID_RELATIONSHIP_STATUSES.join(', ')}`,
                    400
                );
            }
            allowedUpdates['social.relationshipStatus'] = relationshipStatus;
        }
    }

    if (workplace !== undefined) {
        if (!Array.isArray(workplace)) {
            throw new AppError('Workplace must be an array', 400);
        }
        const processedWorkplace = [];
        for (const work of workplace) {
            if (!work.company || !work.position || !work.startDate) {
                throw new AppError(
                    'Each workplace entry must have company, position, and startDate',
                    400
                );
            }
            if (isNaN(new Date(work.startDate).getTime())) {
                throw new AppError('Invalid startDate format', 400);
            }
            if (work.endDate != null && isNaN(new Date(work.endDate).getTime())) {
                throw new AppError('Invalid endDate format', 400);
            }
            let company;
            if (mongoose.Types.ObjectId.isValid(work.company)) {
                company = await Company.findById(work.company);
                if (!company) {
                    throw new AppError(`Company with ID ${work.company} not found`, 400);
                }
            } else {
                const companyName = String(work.company).trim();
                if (!companyName) {
                    throw new AppError('Company name cannot be empty', 400);
                }
                const normalizedCompanyName = companyName.toLowerCase();
                company = await Company.findOne({
                    $or: [{ name: companyName }, { normalizedName: normalizedCompanyName }]
                });
                if (!company) {
                    try {
                        company = await Company.create({
                            name: companyName,
                            normalizedName: normalizedCompanyName,
                            isCustom: true,
                            createdBy: user._id
                        });
                    } catch (err) {
                        if (err.code === 11000) {
                            company = await Company.findOne({
                                $or: [{ name: companyName }, { normalizedName: normalizedCompanyName }]
                            });
                        } else throw err;
                    }
                }
            }
            processedWorkplace.push({
                company: company._id,
                position: work.position,
                description: work.description ? String(work.description).trim() : '',
                startDate: new Date(work.startDate),
                endDate: work.endDate ? new Date(work.endDate) : null,
                isCurrent: work.isCurrent === true
            });
        }
        allowedUpdates['professional.workplace'] = processedWorkplace;
    }

    if (education !== undefined) {
        if (!Array.isArray(education)) {
            throw new AppError('Education must be an array', 400);
        }
        const processedEducation = [];
        for (const edu of education) {
            if (!edu.institution || !edu.startYear) {
                throw new AppError(
                    'Institution and startYear are required for each education entry',
                    400
                );
            }
            const startYear = parseInt(edu.startYear, 10);
            const currentYear = new Date().getFullYear() + 10;
            if (isNaN(startYear) || startYear < 1900 || startYear > currentYear) {
                throw new AppError('Invalid startYear format (must be a valid year)', 400);
            }
            if (edu.endYear != null) {
                const endYear = parseInt(edu.endYear, 10);
                if (isNaN(endYear) || endYear < 1900 || endYear > currentYear) {
                    throw new AppError('Invalid endYear format (must be a valid year)', 400);
                }
            }
            let institution;
            if (mongoose.Types.ObjectId.isValid(edu.institution)) {
                institution = await Institution.findById(edu.institution);
                if (!institution) {
                    throw new AppError(
                        `Institution with ID ${edu.institution} not found`,
                        400
                    );
                }
            } else {
                const institutionName = String(edu.institution).trim();
                const normalizedInstitutionName = institutionName.toLowerCase();
                institution = await Institution.findOne({
                    $or: [
                        { name: institutionName },
                        { normalizedName: normalizedInstitutionName }
                    ]
                });
                if (!institution) {
                    try {
                        const institutionType = ['school', 'college', 'university', 'others'].includes(
                            edu.institutionType
                        )
                            ? edu.institutionType
                            : 'school';
                        institution = await Institution.create({
                            name: institutionName,
                            normalizedName: normalizedInstitutionName,
                            type: institutionType,
                            city: edu.city || '',
                            country: edu.country || '',
                            logo: edu.logo || '',
                            verified: false,
                            isCustom: true,
                            createdBy: user._id
                        });
                    } catch (err) {
                        if (err.code === 11000) {
                            institution = await Institution.findOne({
                                $or: [
                                    { name: institutionName },
                                    { normalizedName: normalizedInstitutionName }
                                ]
                            });
                        } else throw err;
                    }
                }
            }
            if (edu.startMonth !== undefined) {
                const startMonth = parseInt(edu.startMonth, 10);
                if (isNaN(startMonth) || startMonth < 1 || startMonth > 12) {
                    throw new AppError('Invalid startMonth (must be between 1 and 12)', 400);
                }
            }
            if (edu.endMonth !== undefined && edu.endMonth !== null) {
                const endMonth = parseInt(edu.endMonth, 10);
                if (isNaN(endMonth) || endMonth < 1 || endMonth > 12) {
                    throw new AppError('Invalid endMonth (must be between 1 and 12)', 400);
                }
            }
            if (edu.institutionType !== undefined && !VALID_INSTITUTION_TYPES.includes(edu.institutionType)) {
                throw new AppError(
                    `Institution type must be one of: ${VALID_INSTITUTION_TYPES.join(', ')}`,
                    400
                );
            }
            if (edu.cgpa !== undefined && edu.cgpa !== null) {
                const cgpa = parseFloat(edu.cgpa);
                if (isNaN(cgpa) || cgpa < 0 || cgpa > 10) {
                    throw new AppError('Invalid CGPA (must be between 0 and 10)', 400);
                }
            }
            if (edu.percentage !== undefined && edu.percentage !== null) {
                const percentage = parseFloat(edu.percentage);
                if (isNaN(percentage) || percentage < 0 || percentage > 100) {
                    throw new AppError('Invalid percentage (must be between 0 and 100)', 400);
                }
            }
            processedEducation.push({
                institution: institution._id,
                description: edu.description ? String(edu.description).trim() : '',
                degree: edu.degree || '',
                field: edu.field || '',
                institutionType: edu.institutionType || 'school',
                startMonth: edu.startMonth ? parseInt(edu.startMonth, 10) : undefined,
                startYear: parseInt(edu.startYear, 10),
                endMonth: edu.endMonth != null ? parseInt(edu.endMonth, 10) : null,
                endYear: edu.endYear != null ? parseInt(edu.endYear, 10) : null,
                cgpa:
                    edu.cgpa !== undefined && edu.cgpa !== null ? parseFloat(edu.cgpa) : null,
                percentage:
                    edu.percentage !== undefined && edu.percentage !== null
                        ? parseFloat(edu.percentage)
                        : null
            });
        }
        allowedUpdates['professional.education'] = processedEducation;
    }

    if (firstName !== undefined || lastName !== undefined) {
        const updatedFirst =
            firstName !== undefined ? firstName : (user.profile?.name?.first || '');
        const updatedLast =
            lastName !== undefined ? lastName : (user.profile?.name?.last || '');
        allowedUpdates['profile.name.full'] = `${updatedFirst} ${updatedLast}`.trim();
    }

    if (Object.keys(allowedUpdates).length === 0) {
        throw new AppError('No valid fields to update', 400);
    }

    const updatedUser = await User.findByIdAndUpdate(
        user._id,
        { $set: allowedUpdates },
        { new: true, runValidators: true }
    )
        .populate('professional.workplace.company', 'name isCustom')
        .populate(
            'professional.education.institution',
            'name type city country logo verified isCustom'
        )
        .lean();

    const formattedWorkplace = (updatedUser.professional?.workplace || []).map((work) => ({
        company: work.company
            ? {
                id: work.company._id,
                name: work.company.name,
                isCustom: work.company.isCustom
            }
            : null,
        position: work.position,
        startDate: work.startDate,
        endDate: work.endDate,
        isCurrent: work.isCurrent
    }));

    const formattedEducation = (updatedUser.professional?.education || []).map((edu) => ({
        institution: edu.institution
            ? {
                id: edu.institution._id,
                name: edu.institution.name,
                type: edu.institution.type,
                city: edu.institution.city,
                country: edu.institution.country,
                logo: edu.institution.logo,
                verified: edu.institution.verified,
                isCustom: edu.institution.isCustom
            }
            : null,
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
        user: {
            id: updatedUser._id,
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
                coverPhoto: updatedUser.profile?.coverPhoto,
                visibility: updatedUser.profile?.visibility || 'public'
            },
            location: {
                currentCity: updatedUser.location?.currentCity,
                hometown: updatedUser.location?.hometown
            },
            social: {
                relationshipStatus: updatedUser.social?.relationshipStatus
            },
            professional: {
                workplace: formattedWorkplace,
                education: formattedEducation
            },
            account: {
                createdAt: updatedUser.createdAt,
                updatedAt: updatedUser.updatedAt
            }
        }
    };
}

/**
 * Refresh access token. Returns { accessToken }.
 */
async function refreshAccessToken(refreshTokenValue) {
    return tokenService.refreshAccessToken(refreshTokenValue);
}

/**
 * Logout. Returns { remainingDevices, loggedOutDevice? }.
 * Loads full user (with auth) when req.user from protect has no auth.
 */
async function logout(userFromReq, { refreshToken: rt, deviceId } = {}) {
    let user = userFromReq;
    if (!user.auth || !user.auth.tokens) {
        user = await User.findById(user._id);
    }
    if (!user) {
        throw new AppError('User not found', 404);
    }
    return deviceService.logout(user, { refreshToken: rt, deviceId });
}

/**
 * Get devices list for user. Returns { totalDevices, devices }.
 * Loads full user when req.user from protect has no auth.
 */
async function getDevices(userFromReq, currentRefreshToken) {
    const user =
        userFromReq.auth != null && userFromReq.auth.tokens != null
            ? userFromReq
            : await User.findById(userFromReq._id);
    if (!user) {
        throw new AppError('User not found', 404);
    }
    const devices = deviceService.getDevicesList(user, currentRefreshToken);
    return { totalDevices: devices.length, devices };
}

module.exports = {
    signup,
    login,
    sendOTPForPasswordReset,
    verifyOTPForPasswordReset,
    resetPassword,
    getProfile,
    updateProfile,
    refreshAccessToken,
    logout,
    getDevices
};

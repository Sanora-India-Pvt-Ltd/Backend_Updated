/**
 * University auth (OTP, register, login, logout, refresh, verify).
 * Used by universityAuth.controller.
 */

const University = require('../../models/auth/University');
const UniversitySession = require('../../models/auth/UniversitySession');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateAccessToken, generateRefreshToken } = require('../../core/auth/token');
const emailService = require('../../core/infra/email');
const { createOTPRecord, validateOTP } = require('../../core/infra/otp');
const cache = require('../../core/infra/cache');

function generateUniversityCode() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return `UNI-${n}`;
}

async function signupUniversity(data) {
  try {
    const email = (data?.email || '').trim().toLowerCase();
    const password = data?.password;
    const name = data?.name;
    const contactPhone = data?.contact?.phone;
    const contactAddress = data?.contact?.address;

    const existing = await University.findOne({ 'account.email': email });
    if (existing) {
      return {
        statusCode: 409,
        json: { success: false, message: 'Email already registered' }
      };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    let universityCode = (data?.universityCode || '').trim();
    if (!universityCode) {
      // Best-effort unique code generation (collision-safe via unique index)
      for (let i = 0; i < 5; i += 1) {
        const candidate = generateUniversityCode();
        // eslint-disable-next-line no-await-in-loop
        const exists = await University.findOne({ universityCode: candidate }).select('_id').lean();
        if (!exists) {
          universityCode = candidate;
          break;
        }
      }
      if (!universityCode) {
        universityCode = generateUniversityCode();
      }
    }

    const university = await University.create({
      name,
      universityCode,
      contact: {
        phone: contactPhone,
        address: contactAddress
      },
      account: {
        email,
        password: hashedPassword
      }
    });

    return {
      statusCode: 201,
      json: {
        success: true,
        message: 'University registered successfully. Awaiting admin approval.',
        data: {
          id: university._id,
          universityCode: university.universityCode,
          email: university.account.email,
          isApproved: university.account.status.isApproved
        }
      }
    };
  } catch (err) {
    return {
      statusCode: 500,
      json: { success: false, message: 'Failed to register university' }
    };
  }
}

async function loginUniversity({
  email,
  password,
  rememberMe,
  ipAddress,
  userAgent,
  deviceFingerprint
}) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) {
    return {
      statusCode: 401,
      json: { success: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
    };
  }

  const university = await University.findOne({ 'account.email': normalizedEmail });
  if (!university) {
    return {
      statusCode: 401,
      json: { success: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
    };
  }

  const status = university.account?.status || {};
  if (status.isLocked === true) {
    return {
      statusCode: 423,
      json: {
        success: false,
        code: 'ACCOUNT_LOCKED',
        message: 'Account locked due to too many failed login attempts'
      }
    };
  }
  if (status.isApproved === false) {
    return {
      statusCode: 403,
      json: {
        success: false,
        code: 'ACCOUNT_NOT_APPROVED',
        message: 'Account is not approved yet'
      }
    };
  }
  if (status.isActive === false) {
    return {
      statusCode: 403,
      json: {
        success: false,
        code: 'ACCOUNT_INACTIVE',
        message: 'Account is inactive'
      }
    };
  }

  const passwordValid = await bcrypt.compare(password, university.account.password);
  if (!passwordValid) {
    const loginAttempts = (university.account.loginAttempts || 0) + 1;
    university.account.loginAttempts = loginAttempts;
    if (loginAttempts >= 5) {
      if (!university.account.status) university.account.status = {};
      university.account.status.isLocked = true;
    }
    await university.save();
    return {
      statusCode: 401,
      json: { success: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }
    };
  }

  university.account.loginAttempts = 0;
  university.account.lastLogin = new Date();
  await university.save();

  const accessToken = generateAccessToken({
    id: university._id,
    type: 'university',
    role: 'UNIVERSITY'
  });
  const { token: refreshToken, expiryDate } = generateRefreshToken();

  const sessionMs = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + sessionMs);

  await UniversitySession.create({
    universityId: university._id,
    token: accessToken,
    refreshToken,
    ipAddress: ipAddress || undefined,
    deviceFingerprint: deviceFingerprint || undefined,
    userAgent: userAgent || undefined,
    expiresAt,
    lastActivity: new Date()
  });

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Login successful',
      data: {
        token: accessToken,
        refreshToken,
        university: {
          id: university._id,
          email: university.account.email,
          name: university.name,
          isApproved: university.account.status.isApproved
        },
        sessionExpiry: expiresAt
      }
    }
  };
}

async function sendOTPForRegistration(body) {
  const email = (body?.email || '').trim().toLowerCase();
  if (!email) {
    return { statusCode: 400, json: { success: false, message: 'Email is required' } };
  }

  const existingUniversity = await University.findOne({ 'account.email': email });
  if (existingUniversity) {
    return { statusCode: 400, json: { success: false, message: 'University with this email already exists' } };
  }

  const { otpRecord, plainOTP } = await createOTPRecord(email, 'university_signup');

  if (!emailService.transporter) {
    return {
      statusCode: 503,
      json: {
        success: false,
        message: 'Email service is not configured',
        hint: 'Please configure EMAIL_USER and EMAIL_PASSWORD in your .env file. For Gmail, use an App Password (not your regular password).'
      }
    };
  }

  const emailSent = await emailService.sendOTPEmail(email, plainOTP);
  if (!emailSent) {
    return {
      statusCode: 503,
      json: { success: false, message: 'Failed to send OTP email', hint: 'Check email service configuration' }
    };
  }

  return {
    statusCode: 200,
    json: { success: true, message: 'OTP sent successfully to your email', data: { email, expiresAt: otpRecord.expiresAt } }
  };
}

async function verifyOTPForRegistration(body) {
  const { email, otp } = body || {};
  if (!email || !otp) {
    return { statusCode: 400, json: { success: false, message: 'Email and OTP are required' } };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const result = await validateOTP(normalizedEmail, 'university_signup', otp);
  if (!result.valid) {
    return {
      statusCode: 400,
      json: { success: false, message: result.message, remainingAttempts: result.remainingAttempts }
    };
  }

  const verificationToken = jwt.sign(
    { email: normalizedEmail, purpose: 'otp_verification', forUniversitySignup: true, verificationType: 'email' },
    process.env.JWT_SECRET,
    { expiresIn: '20m' }
  );

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Email OTP verified successfully. You can now complete registration.',
      data: { emailVerificationToken: verificationToken, email: normalizedEmail }
    }
  };
}

async function register(body) {
  const { name, adminEmail, password, emailVerificationToken } = body || {};

  if (!name || !adminEmail || !password) {
    return { statusCode: 400, json: { success: false, message: 'Name, admin email, and password are required' } };
  }
  if (!emailVerificationToken) {
    return {
      statusCode: 400,
      json: {
        success: false,
        message: 'Email verification is required. Please verify your email using /api/auth/university/send-otp and /api/auth/university/verify-otp'
      }
    };
  }
  if (password.length < 6) {
    return { statusCode: 400, json: { success: false, message: 'Password must be at least 6 characters long' } };
  }

  let emailDecoded;
  try {
    emailDecoded = jwt.verify(emailVerificationToken, process.env.JWT_SECRET);
  } catch (err) {
    return {
      statusCode: 400,
      json: { success: false, message: 'Invalid or expired email verification token. Please verify your email OTP again.' }
    };
  }

  if (
    emailDecoded.purpose !== 'otp_verification' ||
    emailDecoded.verificationType !== 'email' ||
    !emailDecoded.forUniversitySignup ||
    emailDecoded.email !== adminEmail.toLowerCase()
  ) {
    return {
      statusCode: 400,
      json: { success: false, message: 'Invalid email verification token. Email does not match or token is invalid.' }
    };
  }

  const existingUniversity = await University.findOne({ 'account.email': adminEmail.toLowerCase() });
  if (existingUniversity) {
    return { statusCode: 400, json: { success: false, message: 'University with this email already exists' } };
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const university = await University.create({
    account: {
      email: adminEmail.toLowerCase(),
      password: hashedPassword,
      status: { isActive: true }
    },
    profile: { name },
    verification: { isVerified: true }
  });

  const token = jwt.sign(
    { id: university._id, email: university.account.email, type: 'university' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    statusCode: 201,
    json: {
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
    }
  };
}

async function login(body) {
  const { adminEmail, password } = body || {};
  if (!adminEmail || !password) {
    return { statusCode: 400, json: { success: false, message: 'Admin email and password are required' } };
  }

  const university = await University.findOne({
    $or: [{ 'account.email': adminEmail.toLowerCase() }, { adminEmail: adminEmail.toLowerCase() }]
  });
  if (!university) {
    return { statusCode: 401, json: { success: false, message: 'Invalid credentials' } };
  }

  const email = university.account?.email ?? university.adminEmail;
  const universityPassword = university.account?.password ?? university.password;
  const isActive = university.account?.status?.isActive ?? university.isActive;
  if (!isActive) {
    return { statusCode: 403, json: { success: false, message: 'University account is inactive' } };
  }

  const isPasswordValid = await bcrypt.compare(password, universityPassword);
  if (!isPasswordValid) {
    return { statusCode: 401, json: { success: false, message: 'Invalid credentials' } };
  }

  const isVerified = university.verification?.isVerified ?? university.isVerified;
  const universityName = university.profile?.name ?? university.name;

  const token = jwt.sign(
    { id: university._id, email, type: 'university' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Login successful',
      data: {
        token,
        university: { id: university._id, name: universityName, adminEmail: email, isVerified }
      }
    }
  };
}

async function logout(authHeader) {
  const token = authHeader?.replace('Bearer ', '');
  if (token) {
    try {
      const redis = cache.getRedis ? cache.getRedis() : (cache.getClient && cache.getClient());
      if (redis && typeof redis.setex === 'function') {
        await redis.setex(`blacklist:university:${token}`, 7 * 24 * 60 * 60, '1');
      }
    } catch (err) {
      // ignore
    }
  }
  return { statusCode: 200, json: { success: true, message: 'Logged out successfully' } };
}

async function refreshToken(body) {
  const { refreshToken: refreshTokenValue } = body || {};
  if (!refreshTokenValue) {
    return { statusCode: 400, json: { success: false, message: 'Refresh token is required' } };
  }

  let decoded;
  try {
    decoded = jwt.verify(refreshTokenValue, process.env.JWT_SECRET);
  } catch (err) {
    return { statusCode: 401, json: { success: false, message: 'Invalid or expired refresh token' } };
  }

  if (decoded.type !== 'university') {
    return { statusCode: 401, json: { success: false, message: 'Invalid token type' } };
  }

  const university = await University.findById(decoded.id);
  if (!university || !university.account?.status?.isActive) {
    return { statusCode: 401, json: { success: false, message: 'University not found or inactive' } };
  }

  const newToken = jwt.sign(
    { id: university._id, email: university.account.email, type: 'university' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return {
    statusCode: 200,
    json: { success: true, message: 'Token refreshed successfully', data: { token: newToken } }
  };
}

async function resendVerificationOTP(body) {
  const email = (body?.email || '').trim().toLowerCase();
  if (!email) {
    return { statusCode: 400, json: { success: false, message: 'Email is required' } };
  }

  const university = await University.findOne({ 'account.email': email });
  if (!university) {
    return { statusCode: 404, json: { success: false, message: 'University not found with this email' } };
  }
  if (university.verification?.isVerified) {
    return { statusCode: 400, json: { success: false, message: 'University email is already verified' } };
  }

  const { otpRecord, plainOTP } = await createOTPRecord(email, 'university_verification');
  if (!emailService.transporter) {
    return {
      statusCode: 503,
      json: { success: false, message: 'Email service is not configured', hint: 'Please configure EMAIL_USER and EMAIL_PASSWORD in your .env file.' }
    };
  }
  const emailSent = await emailService.sendOTPEmail(email, plainOTP);
  if (!emailSent) {
    return { statusCode: 503, json: { success: false, message: 'Failed to send OTP email', hint: 'Check email service configuration' } };
  }

  return {
    statusCode: 200,
    json: { success: true, message: 'Verification OTP sent successfully to your email', data: { email, expiresAt: otpRecord.expiresAt } }
  };
}

async function verifyEmailWithOTP(body) {
  const { email, otp } = body || {};
  if (!email || !otp) {
    return { statusCode: 400, json: { success: false, message: 'Email and OTP are required' } };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const university = await University.findOne({ 'account.email': normalizedEmail });
  if (!university) {
    return { statusCode: 404, json: { success: false, message: 'University not found' } };
  }
  if (university.verification?.isVerified) {
    return { statusCode: 400, json: { success: false, message: 'University email is already verified' } };
  }

  const result = await validateOTP(normalizedEmail, 'university_verification', otp);
  if (!result.valid) {
    return {
      statusCode: 400,
      json: { success: false, message: result.message, remainingAttempts: result.remainingAttempts }
    };
  }

  university.verification = university.verification || {};
  university.verification.isVerified = true;
  await university.save();

  return { statusCode: 200, json: { success: true, message: 'Email verified successfully. You can now access all API endpoints.' } };
}

async function verifyEmail(tokenParam) {
  const token = tokenParam;
  if (!token) {
    return { statusCode: 400, json: { success: false, message: 'Verification token is required' } };
  }

  const university = await University.findOne({
    'verification.token': token,
    'verification.tokenExpires': { $gt: new Date() }
  });
  if (!university) {
    return { statusCode: 400, json: { success: false, message: 'Invalid or expired verification token' } };
  }

  university.verification.isVerified = true;
  university.verification.token = undefined;
  university.verification.tokenExpires = undefined;
  await university.save();

  return { statusCode: 200, json: { success: true, message: 'Email verified successfully' } };
}

module.exports = {
  signupUniversity,
  loginUniversity,
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

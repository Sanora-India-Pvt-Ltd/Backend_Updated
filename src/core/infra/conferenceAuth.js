/**
 * Conference Host/Speaker auth (signup, login, profile, refresh, logout).
 * Full implementation. Replaces legacy src/services/conferenceAuthService.js.
 */

const logger = require('../logger');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('../../models/conference/Host');
require('../../models/conference/Speaker');

const MAX_DEVICES = 5;

const normalizeEmail = (email) => email.trim().toLowerCase();
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const manageDeviceLimit = (entity) => {
  if (!entity.sessions) entity.sessions = {};
  if (!Array.isArray(entity.sessions.refreshTokens)) entity.sessions.refreshTokens = [];

  if (entity.sessions.refreshTokens.length >= MAX_DEVICES) {
    entity.sessions.refreshTokens.sort((a, b) => new Date(a.issuedAt) - new Date(b.issuedAt));
    entity.sessions.refreshTokens.shift();
  }
};

const generateDeviceId = (userAgent) => {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(userAgent || 'Unknown Device').digest('hex').substring(0, 16);
};

const signupEntity = async ({
  entityType,
  Model,
  generateAccessToken,
  generateRefreshToken,
  body,
  userAgent
}) => {
  const displayName = entityType === 'host' ? 'Host' : 'Speaker';
  const { email, password, name, bio, phone, emailVerificationToken, phoneVerificationToken } = body;

  if (!email || !password || !name) {
    return { status: 400, body: { success: false, message: 'Email, password, and name are required' } };
  }

  const normalizedEmail = normalizeEmail(email);
  if (!emailRegex.test(normalizedEmail)) {
    return { status: 400, body: { success: false, message: 'Invalid email format' } };
  }

  if (password.length < 6) {
    return { status: 400, body: { success: false, message: 'Password must be at least 6 characters long' } };
  }

  const emailSearchRegex = new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const existing = await Model.findOne({ 'account.email': emailSearchRegex });
  if (existing) {
    return { status: 400, body: { success: false, message: `${displayName} already exists with this email` } };
  }

  let normalizedPhone = null;
  if (phone) {
    normalizedPhone = phone.trim().replace(/[\s\-\(\)]/g, '');
    if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
    const existingPhone = await Model.findOne({ 'account.phone': normalizedPhone });
    if (existingPhone) {
      return { status: 400, body: { success: false, message: `${displayName} already exists with this phone number` } };
    }
  }

  if (!emailVerificationToken || !phoneVerificationToken) {
    return {
      status: 400,
      body: {
        success: false,
        message:
          'Both email and phone verification tokens are required. First verify email and phone via OTP, then call signup with the returned tokens.'
      }
    };
  }

  let emailDecoded;
  try {
    emailDecoded = jwt.verify(emailVerificationToken, process.env.JWT_SECRET);
  } catch (error) {
    return {
      status: 401,
      body: { success: false, message: 'Invalid or expired email verification token. Please verify your email OTP again.' }
    };
  }

  if (
    emailDecoded.purpose !== 'otp_verification' ||
    emailDecoded.verificationType !== 'email' ||
    !emailDecoded.forSignup ||
    normalizeEmail(emailDecoded.email) !== normalizedEmail
  ) {
    return {
      status: 401,
      body: { success: false, message: 'Invalid email verification token. Email does not match or token is invalid.' }
    };
  }

  let phoneDecoded;
  try {
    phoneDecoded = jwt.verify(phoneVerificationToken, process.env.JWT_SECRET);
  } catch (error) {
    return {
      status: 401,
      body: { success: false, message: 'Invalid or expired phone verification token. Please verify your phone OTP again.' }
    };
  }

  if (
    phoneDecoded.purpose !== 'otp_verification' ||
    phoneDecoded.verificationType !== 'phone' ||
    !phoneDecoded.forSignup ||
    (normalizedPhone && phoneDecoded.phone !== normalizedPhone)
  ) {
    return {
      status: 401,
      body: { success: false, message: 'Invalid phone verification token. Phone number does not match or token is invalid.' }
    };
  }

  const role = entityType === 'host' ? 'HOST' : 'SPEAKER';
  const deviceId = generateDeviceId(userAgent);
  const now = new Date();

  const entity = await Model.create({
    role,
    account: {
      email: normalizedEmail,
      phone: normalizedPhone || null,
      role,
      status: { isActive: true, isSuspended: false }
    },
    profile: { name: name.trim(), bio: bio || '', images: { avatar: '', cover: '' } },
    verification: {
      email: { verified: true, verifiedAt: now },
      phone: { verified: !!normalizedPhone, verifiedAt: normalizedPhone ? now : null },
      isVerified: false
    },
    security: {
      passwordHash: password,
      passwordChangedAt: now,
      lastLogin: now,
      devices: [{ deviceId, ip: null, lastActive: now }]
    },
    sessions: { refreshTokens: [] },
    system: { version: 2 }
  });

  const { token: refreshToken, expiryDate } = generateRefreshToken();
  manageDeviceLimit(entity);
  entity.sessions.refreshTokens.push({
    tokenId: refreshToken,
    issuedAt: now,
    expiresAt: expiryDate,
    deviceId
  });
  entity.security.lastLogin = now;
  await entity.save();

  const accessTokenPayload =
    entityType === 'host'
      ? { id: entity._id, type: 'host' }
      : { id: entity._id, sub: entity._id, type: 'speaker', verified: true };
  const accessToken = generateAccessToken(accessTokenPayload);

  const safeEntity = {
    _id: entity._id,
    email: entity.account.email,
    name: entity.profile.name,
    bio: entity.profile.bio,
    phone: entity.account.phone,
    profileImage: entity.profile.images.avatar,
    isVerified: entity.verification.isVerified,
    createdAt: entity.createdAt
  };

  return {
    status: 201,
    body: { success: true, data: { [entityType]: safeEntity, accessToken, refreshToken } }
  };
};

const loginEntity = async ({
  entityType,
  Model,
  generateAccessToken,
  generateRefreshToken,
  body,
  userAgent
}) => {
  const displayName = entityType === 'host' ? 'Host' : 'Speaker';
  const { email, password } = body;

  if (!email || !password) {
    return { status: 400, body: { success: false, message: 'Email and password are required' } };
  }

  const normalizedEmail = normalizeEmail(email);
  const emailSearchRegex = new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  const entity = await Model.findOne({ 'account.email': emailSearchRegex });

  if (!entity) {
    logger.info('[Login] Entity not found', { email: normalizedEmail, entityType });
    return { status: 401, body: { success: false, message: 'Invalid email or password' } };
  }

  if (!entity.account) {
    logger.info('[Login] Entity missing account', { email: normalizedEmail, entityType });
    return { status: 500, body: { success: false, message: 'Account data structure is invalid. Please contact support.' } };
  }

  if (!entity.account.status || typeof entity.account.status.isActive !== 'boolean') {
    logger.info('[Login] Entity missing account.status', { email: normalizedEmail, entityType });
    return { status: 500, body: { success: false, message: 'Account status data is invalid. Please contact support.' } };
  }

  if (!entity.account.status.isActive) {
    return { status: 403, body: { success: false, message: `${displayName} account is inactive` } };
  }

  if (!entity.security || !entity.security.passwordHash) {
    logger.info('[Login] Entity no password hash', { email: normalizedEmail, entityType });
    return { status: 401, body: { success: false, message: 'Invalid email or password' } };
  }

  const isPasswordValid = await entity.comparePassword(password);
  if (!isPasswordValid) {
    logger.info('[Login] Password validation failed', { email: normalizedEmail, entityType });
    return { status: 401, body: { success: false, message: 'Invalid email or password' } };
  }

  const deviceId = generateDeviceId(userAgent);
  const now = new Date();
  const { token: refreshToken, expiryDate } = generateRefreshToken();
  manageDeviceLimit(entity);
  entity.sessions.refreshTokens.push({
    tokenId: refreshToken,
    issuedAt: now,
    expiresAt: expiryDate,
    deviceId
  });
  const existingDevice = entity.security.devices.find((d) => d.deviceId === deviceId);
  if (existingDevice) {
    existingDevice.lastActive = now;
  } else {
    entity.security.devices.push({ deviceId, ip: null, lastActive: now });
  }
  entity.security.lastLogin = now;
  await entity.save();

  const accessTokenPayload =
    entityType === 'host'
      ? { id: entity._id, type: 'host' }
      : { id: entity._id, sub: entity._id, type: 'speaker', verified: true };
  const accessToken = generateAccessToken(accessTokenPayload);

  const safeEntity = {
    _id: entity._id,
    email: entity.account.email,
    name: entity.profile.name,
    bio: entity.profile.bio,
    phone: entity.account.phone,
    profileImage: entity.profile.images.avatar,
    isVerified: entity.verification.isVerified,
    lastLogin: entity.security.lastLogin
  };

  return {
    status: 200,
    body: { success: true, data: { [entityType]: safeEntity, accessToken, refreshToken } }
  };
};

const getProfileEntity = async ({ entityType, req }) => {
  const key = entityType;
  const current = req[key];
  const Model = mongoose.model(entityType === 'host' ? 'Host' : 'Speaker');
  const entity = await Model.findById(current._id).select('-security.passwordHash -sessions');
  return { status: 200, body: { success: true, data: entity } };
};

const updateProfileEntity = async ({ entityType, req }) => {
  const key = entityType;
  const Model = mongoose.model(entityType === 'host' ? 'Host' : 'Speaker');
  const { name, bio, phone, profileImage } = req.body;
  const entity = await Model.findById(req[key]._id);

  if (name !== undefined) entity.profile.name = name.trim();
  if (bio !== undefined) entity.profile.bio = bio || '';
  if (phone !== undefined) {
    if (phone) {
      let normalizedPhone = phone.trim().replace(/[\s\-\(\)]/g, '');
      if (!normalizedPhone.startsWith('+')) normalizedPhone = '+' + normalizedPhone;
      entity.account.phone = normalizedPhone;
    } else {
      entity.account.phone = null;
    }
  }
  if (profileImage !== undefined) entity.profile.images.avatar = profileImage || '';

  await entity.save();

  const safeEntity = {
    _id: entity._id,
    email: entity.account.email,
    name: entity.profile.name,
    bio: entity.profile.bio,
    phone: entity.account.phone,
    profileImage: entity.profile.images.avatar,
    isVerified: entity.verification.isVerified
  };

  return { status: 200, body: { success: true, data: safeEntity } };
};

const refreshTokenEntity = async ({
  entityType,
  generateAccessToken,
  generateRefreshToken,
  req
}) => {
  const key = entityType;
  const entity = req[key];
  const { refreshToken: oldRefreshToken } = req.body;

  entity.sessions.refreshTokens = entity.sessions.refreshTokens.filter((rt) => rt.tokenId !== oldRefreshToken);
  const deviceId = generateDeviceId(req.headers['user-agent']);
  const now = new Date();
  const { token: newRefreshToken, expiryDate } = generateRefreshToken();
  manageDeviceLimit(entity);
  entity.sessions.refreshTokens.push({
    tokenId: newRefreshToken,
    issuedAt: now,
    expiresAt: expiryDate,
    deviceId
  });
  await entity.save();

  const accessTokenPayload =
    entityType === 'host'
      ? { id: entity._id, type: 'host' }
      : { id: entity._id, sub: entity._id, type: 'speaker', verified: true };
  const accessToken = generateAccessToken(accessTokenPayload);

  return {
    status: 200,
    body: { success: true, data: { accessToken, refreshToken: newRefreshToken } }
  };
};

const logoutEntity = async ({ entityType, req }) => {
  const key = entityType;
  const entity = req[key];
  const { refreshToken } = req.body;

  if (refreshToken) {
    entity.sessions.refreshTokens = entity.sessions.refreshTokens.filter((rt) => rt.tokenId !== refreshToken);
    await entity.save();
  }

  return { status: 200, body: { success: true, message: 'Logged out successfully' } };
};

module.exports = {
  manageDeviceLimit,
  signupEntity,
  loginEntity,
  getProfileEntity,
  updateProfileEntity,
  refreshTokenEntity,
  logoutEntity
};

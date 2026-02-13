/**
 * Google auth (check email, mobile login) and related social auth logic.
 * Used by googleAuthController for checkEmailExists and googleLoginMobile.
 */

const User = require('../../models/authorization/User');
const { OAuth2Client } = require('google-auth-library');
const { generateAccessToken, generateRefreshToken } = require('../../core/auth/token');

const MAX_DEVICES = 5;

function manageDeviceLimit(user) {
  if (!user.auth) user.auth = {};
  if (!user.auth.tokens) user.auth.tokens = {};
  if (!user.auth.tokens.refreshTokens) user.auth.tokens.refreshTokens = [];

  if (user.auth.tokens.refreshTokens.length >= MAX_DEVICES) {
    user.auth.tokens.refreshTokens.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    user.auth.tokens.refreshTokens.shift();
  }
}

const validClientIds = [
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID
].filter(Boolean);

const client = validClientIds.length > 0 ? new OAuth2Client() : null;

async function checkEmailExists(body) {
  const email = body?.email;
  const user = await User.findOne({ 'profile.email': email }).lean();

  return {
    statusCode: 200,
    json: {
      success: true,
      exists: !!user,
      data: { email, hasGoogleAccount: !!user?.auth?.googleId }
    }
  };
}

async function googleLoginMobile(body, headers) {
  const { idToken, platform } = body || {};
  const detectedPlatform =
    platform ||
    headers?.['x-platform'] ||
    (headers?.['user-agent']?.toLowerCase().includes('ios')
      ? 'ios'
      : headers?.['user-agent']?.toLowerCase().includes('android')
        ? 'android'
        : null);

  if (!idToken) {
    return { statusCode: 400, json: { success: false, message: 'idToken is required' } };
  }

  if (!client || validClientIds.length === 0) {
    return {
      statusCode: 500,
      json: {
        success: false,
        message:
          'Google OAuth not configured. Please set GOOGLE_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID, and/or GOOGLE_IOS_CLIENT_ID'
      }
    };
  }

  let payload;
  let verified = false;
  for (const clientId of validClientIds) {
    try {
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      payload = ticket.getPayload();
      verified = true;
      break;
    } catch (err) {
      continue;
    }
  }

  if (!verified) {
    return {
      statusCode: 401,
      json: {
        success: false,
        message: 'Invalid Google token - token does not match any configured client ID',
        error: `Please ensure you are using the correct Google Sign-In configuration for your platform (${detectedPlatform || 'Android/iOS'})`
      }
    };
  }

  const email = payload.email.toLowerCase();
  const name = payload.name || 'User';
  const googleId = payload.sub;
  const picture = payload.picture;

  let user = await User.findOne({ 'profile.email': email });

  if (!user) {
    const nameParts = name.split(' ');
    user = await User.create({
      profile: {
        email,
        name: {
          first: nameParts[0] || 'User',
          last: nameParts.slice(1).join(' ') || 'User',
          full: name
        },
        gender: 'Other',
        profileImage: picture
      },
      auth: {
        password: 'oauth-user',
        isGoogleOAuth: true,
        googleId,
        tokens: { refreshTokens: [] }
      },
      account: { isActive: true, isVerified: false },
      social: { friends: [], blockedUsers: [] },
      location: {},
      professional: { education: [], workplace: [] },
      content: { generalWeightage: 0, professionalWeightage: 0 }
    });
  } else {
    if (!user.auth) user.auth = {};
    if (!user.auth.googleId) user.auth.googleId = googleId;
    if (!user.profile) user.profile = {};
    if (!user.profile.profileImage) user.profile.profileImage = picture;
    user.auth.isGoogleOAuth = true;
    await user.save();
  }

  const accessToken = generateAccessToken({
    id: user._id,
    email: user.profile?.email,
    name: user.profile?.name?.full
  });

  const { token: refreshToken, expiryDate } = generateRefreshToken();
  const deviceInfo = (headers?.['user-agent'] || body?.deviceInfo || 'Unknown Device').substring(0, 200);

  manageDeviceLimit(user);
  user.auth.tokens.refreshTokens.push({
    token: refreshToken,
    expiresAt: expiryDate,
    device: deviceInfo,
    createdAt: new Date()
  });
  await user.save();

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Google Sign-in successful',
      data: { accessToken, refreshToken, user }
    }
  };
}

module.exports = {
  checkEmailExists,
  googleLoginMobile
};

/**
 * Conference host/speaker auth – app service layer.
 * Delegates to core/infra/conferenceAuth with Host or Speaker model.
 * Used by hostAuthController and speakerAuthController.
 */

const Host = require('../../models/conference/Host');
const Speaker = require('../../models/conference/Speaker');
const { generateAccessToken, generateRefreshToken } = require('../../core/auth/token');
const {
  signupEntity,
  loginEntity,
  getProfileEntity,
  updateProfileEntity,
  refreshTokenEntity,
  logoutEntity
} = require('../../core/infra/conferenceAuth');
const StorageService = require('../../core/infra/storage');

function getModel(entityType) {
  return entityType === 'host' ? Host : Speaker;
}

function getTokenGenerators(entityType) {
  return { generateAccessToken, generateRefreshToken };
}

async function signup(body, entityType, userAgent) {
  const Model = getModel(entityType);
  const { generateAccessToken, generateRefreshToken } = getTokenGenerators(entityType);
  return signupEntity({
    entityType,
    Model,
    generateAccessToken,
    generateRefreshToken,
    body,
    userAgent
  });
}

async function login(body, entityType, userAgent) {
  const Model = getModel(entityType);
  const { generateAccessToken, generateRefreshToken } = getTokenGenerators(entityType);
  return loginEntity({
    entityType,
    Model,
    generateAccessToken,
    generateRefreshToken,
    body,
    userAgent
  });
}

async function getProfile(req, entityType) {
  return getProfileEntity({ entityType, req });
}

async function updateProfile(req, entityType) {
  return updateProfileEntity({ entityType, req });
}

async function refreshToken(req, entityType) {
  const { generateAccessToken, generateRefreshToken } = getTokenGenerators(entityType);
  return refreshTokenEntity({
    entityType,
    generateAccessToken,
    generateRefreshToken,
    req
  });
}

async function logout(req, entityType) {
  return logoutEntity({ entityType, req });
}

async function uploadProfileImage(req, entityType) {
  if (!req.file) {
    return { status: 400, body: { success: false, message: 'No file uploaded' } };
  }

  const entity = entityType === 'host' ? req.hostUser : req.speaker;
  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    return {
      status: 400,
      body: {
        success: false,
        message: 'Only image files are allowed for profile pictures (JPEG, PNG, GIF, WebP)'
      }
    };
  }

  const Model = getModel(entityType);
  const url = entity?.profile?.images?.avatar;

  if (url) {
    try {
      let key = null;
      if (url.includes('.s3.') || url.includes('.s3-')) {
        const urlObj = new URL(url);
        key = urlObj.pathname.substring(1);
      } else if (url.includes('/uploads/')) {
        const parts = url.split('/uploads/');
        if (parts.length > 1) key = 'uploads/' + parts[1];
      }
      if (key) await StorageService.delete(key);
    } catch (err) {
      // ignore
    }
  }

  let uploadResult;
  if (req.file.path) {
    uploadResult = await StorageService.uploadFromPath(req.file.path);
  } else if (req.file.location && req.file.key) {
    uploadResult = StorageService.uploadFromRequest(req.file);
  } else {
    return {
      status: 400,
      body: { success: false, message: 'Invalid file object: missing path or location/key' }
    };
  }

  const updated = await Model.findByIdAndUpdate(
    entity._id,
    { 'profile.images.avatar': uploadResult.url },
    { new: true, runValidators: true }
  ).select('-security.passwordHash -sessions');

  const key = entityType === 'host' ? 'host' : 'speaker';
  return {
    status: 200,
    body: {
      success: true,
      message: 'Profile image uploaded successfully',
      data: {
        url: uploadResult.url,
        [key]: {
          _id: updated._id,
          email: updated.account?.email,
          name: updated.profile?.name,
          profileImage: updated.profile?.images?.avatar
        }
      }
    }
  };
}

module.exports = {
  signup,
  login,
  getProfile,
  updateProfile,
  refreshToken,
  logout,
  uploadProfileImage
};

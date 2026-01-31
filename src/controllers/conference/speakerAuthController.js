const conferenceAuthService = require('../../app/services/conferenceAuth.service');

const signup = async (req, res, next) => {
  try {
    const result = await conferenceAuthService.signup(
      req.body,
      'speaker',
      req.headers['user-agent']
    );
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to create speaker account',
      error: error.message
    });
  }
};

const login = async (req, res) => {
  try {
    const result = await conferenceAuthService.login(
      req.body,
      'speaker',
      req.headers['user-agent']
    );
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to login',
      error: error.message
    });
  }
};

const getProfile = async (req, res) => {
  try {
    const result = await conferenceAuthService.getProfile(req, 'speaker');
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const result = await conferenceAuthService.updateProfile(req, 'speaker');
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

const refreshToken = async (req, res) => {
  try {
    const result = await conferenceAuthService.refreshToken(req, 'speaker');
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to refresh token',
      error: error.message
    });
  }
};

const logout = async (req, res) => {
  try {
    const result = await conferenceAuthService.logout(req, 'speaker');
    return res.status(result.status).json(result.body);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to logout',
      error: error.message
    });
  }
};

const uploadProfileImage = async (req, res) => {
  try {
    const result = await conferenceAuthService.uploadProfileImage(req, 'speaker');
    return res.status(result.status).json(result.body);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Profile image upload failed',
      error: err.message
    });
  }
};

module.exports = {
  signup,
  login,
  getProfile,
  updateProfile,
  refreshToken,
  logout,
  uploadProfileImage
};

const universityAuthService = require('../../app/services/universityAuth.service');

const sendOTPForRegistration = async (req, res) => {
  try {
    const result = await universityAuthService.sendOTPForRegistration(req.body);
    return res.status(result.statusCode).json(result.json);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error sending OTP',
      error: error.message
    });
  }
};

const verifyOTPForRegistration = async (req, res) => {
  try {
    const result = await universityAuthService.verifyOTPForRegistration(req.body);
    return res.status(result.statusCode).json(result.json);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error verifying OTP',
      error: error.message
    });
  }
};

const register = async (req, res) => {
  try {
    const result = await universityAuthService.register(req.body);
    return res.status(result.statusCode).json(result.json);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error registering university',
      error: error.message
    });
  }
};

const login = async (req, res) => {
  try {
    const result = await universityAuthService.login(req.body);
    return res.status(result.statusCode).json(result.json);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error logging in',
      error: error.message
    });
  }
};

const logout = async (req, res) => {
  try {
    const result = await universityAuthService.logout(req.headers.authorization);
    return res.status(result.statusCode).json(result.json);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error logging out',
      error: error.message
    });
  }
};

const refreshToken = async (req, res) => {
  try {
    const result = await universityAuthService.refreshToken(req.body);
    return res.status(result.statusCode).json(result.json);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error refreshing token',
      error: error.message
    });
  }
};

const resendVerificationOTP = async (req, res) => {
  try {
    const result = await universityAuthService.resendVerificationOTP(req.body);
    return res.status(result.statusCode).json(result.json);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error sending verification OTP',
      error: error.message
    });
  }
};

const verifyEmailWithOTP = async (req, res) => {
  try {
    const result = await universityAuthService.verifyEmailWithOTP(req.body);
    return res.status(result.statusCode).json(result.json);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error verifying email',
      error: error.message
    });
  }
};

const verifyEmail = async (req, res) => {
  try {
    const result = await universityAuthService.verifyEmail(req.params.token);
    return res.status(result.statusCode).json(result.json);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error verifying email',
      error: error.message
    });
  }
};

module.exports = {
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

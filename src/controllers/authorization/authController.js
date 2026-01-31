const asyncHandler = require('../../core/utils/asyncHandler');
const authService = require('../../app/services/auth.service');

const getDeviceInfo = (req) =>
    req.headers['user-agent'] || req.body?.deviceInfo || 'Unknown Device';

const getCurrentRefreshToken = (req) =>
    req.body?.refreshToken || req.headers['x-refresh-token'] || null;

/**
 * User Signup (with OTP verification). Responses identical to pre-extraction.
 */
const signup = asyncHandler(async (req, res) => {
    const deviceInfo = getDeviceInfo(req);
    try {
        const result = await authService.signup(req.body, deviceInfo);
        return res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                token: result.accessToken,
                user: result.user
            }
        });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0] || 'field';
            const errorMessage = err.message || '';
            if (
                field.includes('email') ||
                errorMessage.includes('email_1') ||
                errorMessage.includes('dup key: { email: null }')
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Database configuration error: Old email index detected. This needs to be fixed by running the database migration script.',
                    error: 'Duplicate email index conflict',
                    hint: 'Run "node fix-email-index.js" to fix the database indexes. This will remove the old email index and ensure the correct profile.email index is in place.',
                    technicalDetails: err.message
                });
            }
            if (field.includes('email')) {
                return res.status(400).json({
                    success: false,
                    message:
                        'Email is already registered. If you continue to see this error, there may be an old database index that needs to be removed.',
                    error: 'Duplicate email',
                    hint: 'Run "node fix-email-index.js" to fix the database indexes.'
                });
            }
            return res.status(400).json({
                success: false,
                message: `Duplicate key error on ${field}`,
                error: err.message
            });
        }
        return res.status(500).json({
            success: false,
            message: 'Error in user signup',
            error: err.message,
            transactionAborted: true
        });
    }
});

/**
 * User Login. Responses identical to pre-extraction.
 */
const login = asyncHandler(async (req, res) => {
    const deviceInfo = getDeviceInfo(req);
    const result = await authService.login(req.body, deviceInfo);
    return res.status(200).json({
        success: true,
        message: 'Login successful',
        data: {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            token: result.accessToken,
            user: result.user
        }
    });
});

/**
 * Forgot Password - Send OTP (email or phone). Responses identical to pre-extraction.
 */
const sendOTPForPasswordReset = asyncHandler(async (req, res) => {
    const result = await authService.sendOTPForPasswordReset(req.body);
    const isEmail = 'email' in result;
    return res.status(200).json({
        success: true,
        message: isEmail
            ? 'OTP sent successfully to your email'
            : 'OTP sent successfully to your phone',
        data: result
    });
});

/**
 * Forgot Password - Verify OTP. Responses identical to pre-extraction.
 */
const verifyOTPForPasswordReset = asyncHandler(async (req, res) => {
    const result = await authService.verifyOTPForPasswordReset(req.body);
    return res.status(200).json({
        success: true,
        message: 'OTP verified successfully. You can now reset your password.',
        data: result
    });
});

/**
 * Forgot Password - Reset Password. Responses identical to pre-extraction.
 */
const resetPassword = asyncHandler(async (req, res) => {
    await authService.resetPassword(req.body);
    return res.status(200).json({
        success: true,
        message: 'Password reset successfully. You can now login with your new password.'
    });
});

/**
 * Get Current User Profile. Responses identical to pre-extraction.
 */
const getProfile = asyncHandler(async (req, res) => {
    const result = await authService.getProfile(req.user);
    return res.status(200).json({
        success: true,
        message: 'User profile retrieved successfully',
        data: result
    });
});

/**
 * Update User Profile. Responses identical to pre-extraction.
 */
const updateProfile = asyncHandler(async (req, res) => {
    const result = await authService.updateProfile(req.user, req.body);
    return res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: result
    });
});

/**
 * Refresh Access Token. Responses identical to pre-extraction.
 */
const refreshToken = asyncHandler(async (req, res) => {
    const result = await authService.refreshAccessToken(req.body.refreshToken);
    return res.status(200).json({
        success: true,
        message: 'Access token refreshed successfully',
        data: result
    });
});

/**
 * Logout (invalidate refresh token). Responses identical to pre-extraction.
 */
const logout = asyncHandler(async (req, res) => {
    const result = await authService.logout(req.user, {
        refreshToken: req.body.refreshToken,
        deviceId: req.body.deviceId
    });
    const response = {
        success: true,
        message:
            req.body.refreshToken || req.body.deviceId
                ? 'Logged out successfully from this device'
                : 'Logged out successfully from all devices',
        data: { remainingDevices: result.remainingDevices }
    };
    if (result.loggedOutDevice) {
        response.data.loggedOutDevice = result.loggedOutDevice;
    }
    return res.status(200).json(response);
});

/**
 * Get all logged-in devices. Responses identical to pre-extraction.
 */
const getDevices = asyncHandler(async (req, res) => {
    const currentRefreshToken = getCurrentRefreshToken(req);
    const result = await authService.getDevices(req.user, currentRefreshToken);
    return res.status(200).json({
        success: true,
        message: 'Devices retrieved successfully',
        data: result
    });
});

module.exports = {
    signup,
    login,
    sendOTPForPasswordReset,
    verifyOTPForPasswordReset,
    resetPassword,
    getProfile,
    updateProfile,
    refreshToken,
    logout,
    getDevices
};

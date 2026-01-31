const jwt = require('jsonwebtoken');
const User = require('../../models/authorization/User');
const { generateAccessToken, generateRefreshToken } = require('../../middleware/auth');
const AppError = require('../../core/errors/AppError');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

/**
 * Verify refresh token and return user. Throws AppError if invalid.
 */
async function verifyRefreshToken(refreshToken) {
    if (!refreshToken) {
        throw new AppError('Refresh token is required', 400);
    }

    const user = await User.findOne({ 'auth.tokens.refreshTokens.token': refreshToken });
    if (!user) {
        throw new AppError('Invalid refresh token', 401);
    }

    const tokenRecord = user.auth?.tokens?.refreshTokens?.find((rt) => rt.token === refreshToken);
    if (!tokenRecord) {
        throw new AppError('Invalid refresh token', 401);
    }

    return user;
}

/**
 * Refresh access token. Returns { accessToken }.
 */
async function refreshAccessToken(refreshToken) {
    const user = await verifyRefreshToken(refreshToken);
    const userEmail = user.profile?.email || user.profile.email;
    const accessToken = generateAccessToken({ id: user._id, email: userEmail });
    return { accessToken };
}

/**
 * Create JWT for password reset (15 min).
 */
function createPasswordResetToken(userId, email, phoneNumber) {
    return jwt.sign(
        {
            userId,
            email,
            phoneNumber,
            purpose: 'password_reset'
        },
        JWT_SECRET,
        { expiresIn: '15m' }
    );
}

/**
 * Verify password reset JWT. Returns decoded payload. Throws AppError if invalid.
 */
function verifyPasswordResetToken(token) {
    if (!token) {
        throw new AppError('Verification token, password, and confirm password are required', 400);
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.purpose !== 'password_reset') {
            throw new AppError('Invalid token purpose', 401);
        }
        return decoded;
    } catch (err) {
        if (err.name === 'TokenExpiredError' || err.name === 'JsonWebTokenError') {
            throw new AppError('Invalid or expired verification token. Please request a new OTP.', 401);
        }
        throw err;
    }
}

/**
 * Verify email verification token (OTP signup). Returns decoded. Throws AppError if invalid.
 */
function verifyEmailVerificationToken(token, normalizedEmail) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (
            decoded.purpose !== 'otp_verification' ||
            decoded.verificationType !== 'email' ||
            !decoded.forSignup ||
            decoded.email !== normalizedEmail
        ) {
            throw new AppError(
                'Invalid email verification token. Email does not match or token is invalid.',
                401
            );
        }
        return decoded;
    } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError(
            'Invalid or expired email verification token. Please verify your email OTP again.',
            401
        );
    }
}

/**
 * Verify phone verification token (OTP signup). Returns decoded. Throws AppError if invalid.
 */
function verifyPhoneVerificationToken(token, normalizedPhone) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (
            decoded.purpose !== 'otp_verification' ||
            decoded.verificationType !== 'phone' ||
            !decoded.forSignup ||
            decoded.phone !== normalizedPhone
        ) {
            throw new AppError(
                'Invalid phone verification token. Phone number does not match or token is invalid.',
                401
            );
        }
        return decoded;
    } catch (err) {
        if (err instanceof AppError) throw err;
        throw new AppError(
            'Invalid or expired phone verification token. Please verify your phone OTP again.',
            401
        );
    }
}

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyRefreshToken,
    refreshAccessToken,
    createPasswordResetToken,
    verifyPasswordResetToken,
    verifyEmailVerificationToken,
    verifyPhoneVerificationToken
};

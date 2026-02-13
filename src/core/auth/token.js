/**
 * Core token utilities: JWT access/refresh generation.
 * Used by middleware and app services. No Express or middleware dependencies.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Generate Access Token (short-lived - 1 hour for better UX, still secure)
function generateAccessToken(payload) {
    return jwt.sign(
        payload,
        JWT_SECRET,
        { expiresIn: '1h' } // 1 hour - balances security and user experience
    );
}

// Generate Refresh Token (never expires - only invalidated on explicit logout)
function generateRefreshToken() {
    const token = crypto.randomBytes(40).toString('hex'); // Secure random token
    // Set expiry to 100 years from now (effectively never expires)
    // Tokens are only invalidated when user explicitly logs out
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 100); // 100 years from now (effectively never expires)
    return { token, expiryDate };
}

// Legacy function for backward compatibility (now generates access token)
function generateToken(payload) {
    return generateAccessToken(payload);
}

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    generateToken,
    JWT_SECRET
};

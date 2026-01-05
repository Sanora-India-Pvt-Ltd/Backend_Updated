const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Generate JWT token for university
 */
const generateToken = (university) => {
    return jwt.sign(
        { id: university._id, email: university.adminEmail, type: 'university' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
};

/**
 * Generate refresh token
 */
const generateRefreshToken = () => {
    const token = crypto.randomBytes(32).toString('hex');
    const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    return {
        token,
        expiryDate
    };
};

/**
 * Hash password
 */
const hashPassword = async (password) => {
    return await bcrypt.hash(password, 10);
};

/**
 * Verify password
 */
const verifyPassword = async (password, hashedPassword) => {
    return await bcrypt.compare(password, hashedPassword);
};

/**
 * Verify JWT token
 */
const verifyToken = (token) => {
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return null;
    }
};

/**
 * Generate email verification token
 */
const generateEmailVerificationToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

module.exports = {
    generateToken,
    generateRefreshToken,
    hashPassword,
    verifyPassword,
    verifyToken,
    generateEmailVerificationToken
};


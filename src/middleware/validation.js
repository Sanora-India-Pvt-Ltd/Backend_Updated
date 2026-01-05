// Simple validation without external dependencies
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate request body (email, password, etc.)
 */
const validateEmail = (email) => {
    return email && typeof email === 'string' && emailRegex.test(email);
};

const validatePassword = (password, minLength = 6) => {
    return password && typeof password === 'string' && password.length >= minLength;
};

/**
 * Sanitize inputs (basic XSS prevention)
 */
const sanitizeString = (str) => {
    if (typeof str !== 'string') return '';
    return str.trim()
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
};

/**
 * Check required fields
 */
const checkRequiredFields = (body, requiredFields) => {
    const missing = [];
    
    requiredFields.forEach(field => {
        if (!body[field] || (typeof body[field] === 'string' && body[field].trim() === '')) {
            missing.push(field);
        }
    });

    return {
        valid: missing.length === 0,
        missing
    };
};

/**
 * Middleware to validate request
 */
const validateRequest = (requiredFields = []) => {
    return (req, res, next) => {
        const validation = checkRequiredFields(req.body, requiredFields);
        
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${validation.missing.join(', ')}`
            });
        }

        next();
    };
};

module.exports = {
    validateEmail,
    validatePassword,
    sanitizeString,
    checkRequiredFields,
    validateRequest
};


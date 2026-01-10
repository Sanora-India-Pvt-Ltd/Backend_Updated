/**
 * Role-based authorization guards
 * 
 * These guards enforce role restrictions after flexibleAuth middleware.
 * flexibleAuth sets req.user (for USER tokens) or req.universityId (for UNIVERSITY tokens).
 * 
 * Usage:
 * - USER-only routes: flexibleAuth → requireUser → controller
 * - UNIVERSITY-only routes: flexibleAuth → requireUniversity → controller
 */

/**
 * Require USER role (blocks UNIVERSITY tokens)
 * Must be used after flexibleAuth middleware
 */
const requireUser = (req, res, next) => {
    // Check if req.user exists (set by flexibleAuth for USER tokens)
    if (!req.user || !req.userId) {
        return res.status(403).json({
            success: false,
            message: 'This endpoint requires a USER account. University accounts cannot access this resource.'
        });
    }

    // Block if university token was used
    if (req.universityId) {
        return res.status(403).json({
            success: false,
            message: 'This endpoint requires a USER account. University accounts cannot access this resource.'
        });
    }

    next();
};

/**
 * Require UNIVERSITY role (blocks USER tokens)
 * Must be used after flexibleAuth middleware
 */
const requireUniversity = (req, res, next) => {
    // Check if req.universityId exists (set by flexibleAuth for UNIVERSITY tokens)
    if (!req.universityId) {
        return res.status(403).json({
            success: false,
            message: 'This endpoint requires a UNIVERSITY account. User accounts cannot access this resource.'
        });
    }

    // Block if user token was used
    if (req.user || req.userId) {
        return res.status(403).json({
            success: false,
            message: 'This endpoint requires a UNIVERSITY account. User accounts cannot access this resource.'
        });
    }

    next();
};

module.exports = {
    requireUser,
    requireUniversity
};


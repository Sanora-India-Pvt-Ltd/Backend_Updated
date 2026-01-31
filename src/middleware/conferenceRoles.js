const jwt = require('jsonwebtoken');
const Conference = require('../models/conference/Conference');
const Speaker = require('../models/conference/Speaker');
const Host = require('../models/conference/Host');
const User = require('../models/authorization/User');

// Role constants
const ROLES = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    HOST: 'HOST',
    SPEAKER: 'SPEAKER',
    USER: 'USER'
};

/**
 * Get user's role for a specific conference
 * Supports: Host, Speaker, User (with SUPER_ADMIN check)
 * @param {Object} req - Request object (may have req.hostUser, req.speaker, or req.user)
 * @param {Object} conference - Conference object
 * @returns {Promise<string>} - User's role
 */
const getUserConferenceRole = async (req, conference) => {
    // Check if authenticated as Host
    if (req.hostUser) {
        if (conference.hostId && conference.hostId.toString() === req.hostUser._id.toString()) {
            return ROLES.HOST;
        }
    }

    // Treat a speaker as host when they own the conference
    if (req.speaker) {
        if (conference.hostId && conference.hostId.toString() === req.speaker._id.toString()) {
            return ROLES.HOST;
        }
    }

    // Check if authenticated as Speaker
    if (req.speaker) {
        if (conference.speakers && conference.speakers.length > 0) {
            if (conference.speakers.some(s => s.toString() === req.speaker._id.toString())) {
                return ROLES.SPEAKER;
            }
        }
    }

    // Check if authenticated as User
    if (req.user) {
        // Check if user is SUPER_ADMIN (platform owner)
        if (req.user.role === 'SUPER_ADMIN' || req.user.role === 'admin') {
            return ROLES.SUPER_ADMIN;
        }

        // Check if user is HOST (conference owner) - legacy support
        if (conference.hostId && conference.hostId.toString() === req.user._id.toString()) {
            return ROLES.HOST;
        }

        // Check if user is SPEAKER - legacy support
        if (conference.speakers && conference.speakers.length > 0) {
            const speaker = await Speaker.findOne({ 'account.email': req.user.profile?.email });
            if (speaker && conference.speakers.some(s => s.toString() === speaker._id.toString())) {
                return ROLES.SPEAKER;
            }
        }

        // Default to USER (attendee)
        return ROLES.USER;
    }

    // No authentication
    return null;
};

/**
 * Middleware to check if user has required role(s)
 * Supports: Host, Speaker, User authentication
 * @param {string[]} allowedRoles - Array of allowed roles
 */
const requireConferenceRole = (...allowedRoles) => {
    return async (req, res, next) => {
        try {
            const { conferenceId } = req.params;

        // Check if any authentication is present
        if (!req.hostUser && !req.speaker && !req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            if (!conferenceId) {
                return res.status(400).json({
                    success: false,
                    message: 'Conference ID is required'
                });
            }

            const conference = await Conference.findById(conferenceId);
            if (!conference) {
                return res.status(404).json({
                    success: false,
                    message: 'Conference not found'
                });
            }

            const userRole = await getUserConferenceRole(req, conference);

            if (!userRole || !allowedRoles.includes(userRole)) {
                return res.status(403).json({
                    success: false,
                    message: `Access denied. Required role: ${allowedRoles.join(' or ')}`
                });
            }

            req.conference = conference;
            req.userRole = userRole;
            next();
        } catch (error) {
            console.error('Conference role middleware error:', error);
            res.status(500).json({
                success: false,
                message: 'Server error during role verification'
            });
        }
    };
};

/**
 * Middleware to check if user can create conference (HOST, SPEAKER owner, or SUPER_ADMIN)
 * Supports: Host authentication, Speaker authentication, or User with SUPER_ADMIN role
 */
const requireHostOrSuperAdmin = (req, res, next) => {
    try {
        // Check if authenticated as Host
        if (req.hostUser) {
            return next();
        }

        // Allow Speakers to create conferences (they become the owner)
        if (req.speaker) {
            return next();
        }

        // Check if authenticated as User with SUPER_ADMIN role
        if (req.user && (req.user.role === 'SUPER_ADMIN' || req.user.role === 'admin')) {
            return next();
        }

        return res.status(403).json({
            success: false,
            message: 'Access denied. Only HOST, SPEAKER, or SUPER_ADMIN can create conferences'
        });
    } catch (error) {
        console.error('Host/SuperAdmin middleware error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error during role verification'
        });
    }
};

/**
 * Middleware to attach conference and user role to request
 * (Does not block, just attaches info)
 * Supports: Host, Speaker, User authentication
 */
const attachConferenceRole = async (req, res, next) => {
    try {
        const { conferenceId } = req.params;

        if ((req.hostUser || req.speaker || req.user) && conferenceId) {
            const conference = await Conference.findById(conferenceId);
            if (conference) {
                const userRole = await getUserConferenceRole(req, conference);
                req.conference = conference;
                req.userRole = userRole;
            }
        }

        next();
    } catch (error) {
        // Don't block on error, just continue
        console.error('Attach conference role error:', error);
        next();
    }
};

/**
 * Middleware to support multiple auth types (Host, Speaker, User).
 * Checks token type from JWT payload and attaches req.hostUser, req.speaker, or req.user.
 * Routes use this instead of importing models directly.
 */
const multiAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized to access this route'
            });
        }

        const token = authHeader.split(' ')[1];

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

            if (decoded.type === 'host') {
                const host = await Host.findById(decoded.id).select('-security.passwordHash -sessions');
                if (!host) {
                    return res.status(404).json({
                        success: false,
                        message: 'Host not found'
                    });
                }
                if (!host.account?.status?.isActive) {
                    return res.status(403).json({
                        success: false,
                        message: 'Host account is inactive'
                    });
                }
                req.hostUser = host;
                return next();
            }
            if (decoded.type === 'speaker') {
                const speaker = await Speaker.findById(decoded.id).select('-security.passwordHash -sessions');
                if (!speaker) {
                    return res.status(404).json({
                        success: false,
                        message: 'Speaker not found'
                    });
                }
                if (!speaker.account?.status?.isActive) {
                    return res.status(403).json({
                        success: false,
                        message: 'Speaker account is inactive'
                    });
                }
                req.speaker = speaker;
                return next();
            }

            const user = await User.findById(decoded.id).select('-auth');
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }
            req.user = user;
            return next();
        } catch (jwtError) {
            return res.status(401).json({
                success: false,
                message: 'Not authorized, token failed'
            });
        }
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Authentication error'
        });
    }
};

module.exports = {
    ROLES,
    getUserConferenceRole,
    requireConferenceRole,
    requireHostOrSuperAdmin,
    attachConferenceRole,
    multiAuth
};


/**
 * Core conference role helpers: ROLES and getUserConferenceRole.
 * Pure logic only. Used by middleware and app services.
 */

const Speaker = require('../../models/conference/Speaker');

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

module.exports = {
    ROLES,
    getUserConferenceRole
};

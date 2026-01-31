/**
 * Centralized role and actor-type constants used across the project.
 * Do not replace usages in existing code yet — this is the single source of truth for future refactors.
 */

// Conference / platform roles (conferenceRoles.js, socket, controllers)
const CONFERENCE_ROLES = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    HOST: 'HOST',
    SPEAKER: 'SPEAKER',
    USER: 'USER'
};

// Legacy admin role (often checked with SUPER_ADMIN)
const ADMIN_ROLE = 'admin';

// Recipient / identity types (notifications, device tokens, products)
const RECIPIENT_TYPES = {
    USER: 'USER',
    UNIVERSITY: 'UNIVERSITY',
    ADMIN: 'ADMIN'
};

// Creator / seller types (marketplace)
const CREATOR_TYPES = {
    USER: 'USER',
    UNIVERSITY: 'UNIVERSITY'
};

// Socket / auth identity type
const IDENTITY_TYPE = {
    USER: 'USER'
};

// Conference question created-by role
const CREATED_BY_ROLE = {
    HOST: 'HOST',
    SPEAKER: 'SPEAKER'
};

// User model role enum (authorization/User.js)
const USER_ROLES = [
    'USER',
    'HOST',
    'SPEAKER',
    'SUPER_ADMIN',
    'admin'
];

// Conference account types
const CONFERENCE_ACCOUNT_TYPES = ['HOST', 'SPEAKER'];

// Conference owner model names
const OWNER_MODEL = {
    User: 'User',
    Host: 'Host',
    Speaker: 'Speaker'
};

module.exports = {
    CONFERENCE_ROLES,
    ADMIN_ROLE,
    RECIPIENT_TYPES,
    CREATOR_TYPES,
    IDENTITY_TYPE,
    CREATED_BY_ROLE,
    USER_ROLES,
    CONFERENCE_ACCOUNT_TYPES,
    OWNER_MODEL
};

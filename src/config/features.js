/**
 * Feature Flags Configuration
 * Centralized feature toggles for system capabilities
 */

/**
 * Token Redemption Feature Flag
 * 
 * ⚠️ IMPORTANT: Token redemption is currently DISABLED.
 * Tokens are EARN-ONLY. Redemption functionality is intentionally disabled
 * until payment integration is implemented.
 * 
 * When enabled, this flag will allow token redemption for purchases.
 * Until then, tokens can only be earned through course completion.
 */
const TOKEN_REDEMPTION_ENABLED = false;

module.exports = {
    TOKEN_REDEMPTION_ENABLED
};


/**
 * Token System Guards
 * 
 * Hard guards to prevent token redemption until payment integration is ready.
 * These guards ensure tokens remain EARN-ONLY until explicitly enabled.
 */

const { TOKEN_REDEMPTION_ENABLED } = require('../config/features');

/**
 * Assert that token redemption is enabled
 * 
 * Throws an error if redemption is disabled.
 * Use this guard before any redemption/debit operations.
 * 
 * @throws {Error} If TOKEN_REDEMPTION_ENABLED is false
 */
const assertRedemptionEnabled = () => {
    if (!TOKEN_REDEMPTION_ENABLED) {
        throw new Error('Token redemption is disabled. Tokens are currently EARN-ONLY.');
    }
};

/**
 * Check if token redemption is enabled (non-throwing)
 * 
 * @returns {boolean} True if redemption is enabled, false otherwise
 */
const isRedemptionEnabled = () => {
    return TOKEN_REDEMPTION_ENABLED === true;
};

module.exports = {
    assertRedemptionEnabled,
    isRedemptionEnabled
};


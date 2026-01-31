const asyncHandler = require('../../core/utils/asyncHandler');
const notificationPreferenceService = require('../../app/services/notificationPreference.service');

/**
 * Get notification preferences
 * GET /api/notifications/preferences
 */
const getPreferences = asyncHandler(async (req, res) => {
    const { recipientId, role } = notificationPreferenceService.getRecipientFromReq(req);
    const preferencesByCategory = await notificationPreferenceService.getPreferences(
        recipientId,
        role
    );

    return res.status(200).json({
        success: true,
        message: 'Preferences retrieved successfully',
        data: {
            preferences: preferencesByCategory
        }
    });
});

/**
 * Update notification preference for a category
 * PUT /api/notifications/preferences
 */
const updatePreference = asyncHandler(async (req, res) => {
    const { recipientId, role } = notificationPreferenceService.getRecipientFromReq(req);
    const { category, muted, channels } = req.body;

    const preference = await notificationPreferenceService.updatePreference(recipientId, role, {
        category,
        muted,
        channels
    });

    return res.status(200).json({
        success: true,
        message: 'Preference updated successfully',
        data: {
            preference
        }
    });
});

module.exports = {
    getPreferences,
    updatePreference
};

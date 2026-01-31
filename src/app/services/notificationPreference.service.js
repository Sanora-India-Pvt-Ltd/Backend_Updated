const NotificationPreference = require('../../models/notification/NotificationPreference');
const { NOTIFICATION_CATEGORIES } = require('../../core/constants/notificationCategories');
const AppError = require('../../core/errors/AppError');

function getRecipientFromReq(req) {
    if (req.user && req.userId) {
        return { recipientId: req.userId, role: 'USER' };
    }
    if (req.universityId) {
        return { recipientId: req.universityId, role: 'UNIVERSITY' };
    }
    throw new AppError('Authentication required', 401);
}

async function getPreferences(recipientId, role) {
    const query = { role };
    if (role === 'USER') {
        query.userId = recipientId;
    } else {
        query.universityId = recipientId;
    }

    const preferences = await NotificationPreference.find(query).lean();

    const preferencesByCategory = {};
    NOTIFICATION_CATEGORIES.forEach((category) => {
        preferencesByCategory[category] = {
            muted: false,
            channels: { inApp: true, push: true }
        };
    });
    preferences.forEach((pref) => {
        preferencesByCategory[pref.category] = {
            muted: pref.muted,
            channels: { inApp: pref.channels.inApp, push: pref.channels.push }
        };
    });

    return preferencesByCategory;
}

async function updatePreference(recipientId, role, { category, muted, channels }) {
    if (!category || !NOTIFICATION_CATEGORIES.includes(category)) {
        throw new AppError(
            `Category is required and must be one of: ${NOTIFICATION_CATEGORIES.join(', ')}`,
            400
        );
    }

    if (channels !== undefined) {
        if (typeof channels !== 'object' || channels === null) {
            throw new AppError('channels must be an object', 400);
        }
        if (channels.inApp !== undefined && typeof channels.inApp !== 'boolean') {
            throw new AppError('channels.inApp must be a boolean', 400);
        }
        if (channels.push !== undefined && typeof channels.push !== 'boolean') {
            throw new AppError('channels.push must be a boolean', 400);
        }
    }
    if (muted !== undefined && typeof muted !== 'boolean') {
        throw new AppError('muted must be a boolean', 400);
    }

    const preferenceData = {
        role,
        category,
        channels:
            channels !== undefined
                ? {
                      inApp: channels.inApp !== undefined ? channels.inApp : true,
                      push: channels.push !== undefined ? channels.push : true
                  }
                : { inApp: true, push: true },
        muted: muted !== undefined ? muted : false
    };
    if (role === 'USER') preferenceData.userId = recipientId;
    else preferenceData.universityId = recipientId;

    const filter = {
        role,
        category,
        ...(role === 'USER' ? { userId: recipientId } : { universityId: recipientId })
    };

    const preference = await NotificationPreference.findOneAndUpdate(
        filter,
        preferenceData,
        { upsert: true, new: true, runValidators: true }
    );

    return {
        category: preference.category,
        muted: preference.muted,
        channels: preference.channels
    };
}

module.exports = {
    getRecipientFromReq,
    getPreferences,
    updatePreference
};

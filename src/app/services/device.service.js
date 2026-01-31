const User = require('../../models/authorization/User');
const AppError = require('../../core/errors/AppError');

const MAX_DEVICES = 5;

/**
 * Ensure refreshTokens array exists and remove oldest device if at limit.
 */
function manageDeviceLimit(user) {
    if (!user.auth) user.auth = {};
    if (!user.auth.tokens) user.auth.tokens = {};
    if (!Array.isArray(user.auth.tokens.refreshTokens)) user.auth.tokens.refreshTokens = [];

    if (user.auth.tokens.refreshTokens.length >= MAX_DEVICES) {
        user.auth.tokens.refreshTokens.sort(
            (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
        );
        user.auth.tokens.refreshTokens.shift();
    }
}

/**
 * Parse user-agent string into device info object.
 */
function parseDeviceInfo(userAgent) {
    if (!userAgent || userAgent === 'Unknown Device') {
        return {
            deviceName: 'Unknown Device',
            deviceType: 'Unknown',
            browser: 'Unknown',
            os: 'Unknown',
            raw: userAgent || 'Unknown Device'
        };
    }

    const ua = userAgent.toLowerCase();
    let deviceType = 'Desktop';
    if (
        ua.includes('mobile') ||
        ua.includes('android') ||
        ua.includes('iphone') ||
        ua.includes('ipad')
    ) {
        deviceType = 'Mobile';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
        deviceType = 'Tablet';
    }

    let browser = 'Unknown';
    if (ua.includes('chrome') && !ua.includes('edg')) browser = 'Chrome';
    else if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('edg')) browser = 'Edge';
    else if (ua.includes('opera') || ua.includes('opr')) browser = 'Opera';

    let os = 'Unknown';
    if (ua.includes('windows')) os = 'Windows';
    else if (ua.includes('mac os') || ua.includes('macos')) os = 'macOS';
    else if (ua.includes('linux')) os = 'Linux';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';

    let deviceName = `${os} - ${browser}`;
    if (deviceType !== 'Desktop') deviceName = `${deviceType} (${os}) - ${browser}`;

    return {
        deviceName,
        deviceType,
        browser,
        os,
        raw: userAgent
    };
}

/**
 * Add refresh token to user and persist. Used after signup/login.
 * @param {Object} [options] - Optional. extraSet: merged into $set (e.g. { 'account.lastLogin': new Date() } for login).
 */
async function addRefreshTokenToUser(user, refreshToken, expiryDate, deviceInfo, options = {}) {
    manageDeviceLimit(user);
    user.auth.tokens.refreshTokens.push({
        token: refreshToken,
        expiresAt: expiryDate,
        device: deviceInfo.substring(0, 200),
        createdAt: new Date()
    });
    const setPayload = { 'auth.tokens.refreshTokens': user.auth.tokens.refreshTokens };
    if (options.extraSet && typeof options.extraSet === 'object') {
        Object.assign(setPayload, options.extraSet);
    }
    await User.findByIdAndUpdate(
        user._id,
        { $set: setPayload },
        { new: true, runValidators: true }
    ).lean();
}

/**
 * Get list of devices (refresh token records) for user.
 */
function getDevicesList(user, currentRefreshToken) {
    const devices = [];
    if (user.auth?.tokens?.refreshTokens && Array.isArray(user.auth.tokens.refreshTokens)) {
        user.auth.tokens.refreshTokens.forEach((tokenRecord) => {
            const parsedInfo = parseDeviceInfo(tokenRecord.device);
            devices.push({
                deviceInfo: parsedInfo,
                loggedInAt: tokenRecord.createdAt || new Date(),
                isCurrentDevice: currentRefreshToken
                    ? tokenRecord.token === currentRefreshToken
                    : false,
                tokenId: tokenRecord.token ? tokenRecord.token.substring(0, 16) : null
            });
        });
    }
    devices.sort((a, b) => new Date(b.loggedInAt) - new Date(a.loggedInAt));
    return devices.map((device, index) => ({ id: index + 1, ...device }));
}

/**
 * Logout: remove specific token/device or all. Returns { remainingDevices, loggedOutDevice? }.
 */
async function logout(user, { refreshToken, deviceId } = {}) {
    if (!user.auth) user.auth = {};
    if (!user.auth.tokens) user.auth.tokens = {};
    if (!user.auth.tokens.refreshTokens) user.auth.tokens.refreshTokens = [];

    let loggedOutDevice = null;
    let remainingDevices = 0;

    if (refreshToken || deviceId) {
        if (refreshToken) {
            const deviceToLogout = user.auth.tokens.refreshTokens.find(
                (rt) => rt.token === refreshToken
            );
            if (deviceToLogout) loggedOutDevice = parseDeviceInfo(deviceToLogout.device);
            user.auth.tokens.refreshTokens = user.auth.tokens.refreshTokens.filter(
                (rt) => rt.token !== refreshToken
            );
        } else if (deviceId) {
            const deviceIndex = parseInt(deviceId, 10) - 1;
            if (deviceIndex >= 0 && deviceIndex < user.auth.tokens.refreshTokens.length) {
                const sortedTokens = [...user.auth.tokens.refreshTokens].sort(
                    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
                );
                const deviceToLogout = sortedTokens[deviceIndex];
                if (deviceToLogout) {
                    loggedOutDevice = parseDeviceInfo(deviceToLogout.device);
                    user.auth.tokens.refreshTokens = user.auth.tokens.refreshTokens.filter(
                        (rt) => rt.token !== deviceToLogout.token
                    );
                }
            }
        }
        remainingDevices = user.auth.tokens.refreshTokens.length;
    } else {
        user.auth.tokens.refreshTokens = [];
        remainingDevices = 0;
    }

    await user.save();

    return { remainingDevices, loggedOutDevice };
}

module.exports = {
    MAX_DEVICES,
    manageDeviceLimit,
    parseDeviceInfo,
    addRefreshTokenToUser,
    getDevicesList,
    logout
};

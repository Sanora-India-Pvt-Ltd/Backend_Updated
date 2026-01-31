/**
 * Thin user controller: reads req, calls userService, sends same JSON/status.
 * No models, no StorageService, no business logic.
 */

const userService = require('../app/services/user.service');

function respond(res, result) {
    res.status(result.statusCode).json(result.json);
}

async function handle(req, res, fn) {
    try {
        const result = await fn();
        respond(res, result);
    } catch (err) {
        if (err && err.statusCode && err.json) {
            respond(res, err);
        } else {
            console.error(err);
            res.status(500).json({
                success: false,
                message: err?.message || 'Internal server error',
                error: err?.message
            });
        }
    }
}

const updateProfile = (req, res) => handle(req, res, () => userService.updateProfile(req.user, req.body));
const sendOTPForPhoneUpdate = (req, res) => handle(req, res, () => userService.sendOTPForPhoneUpdate(req.user, req.body));
const verifyOTPAndUpdatePhone = (req, res) => handle(req, res, () => userService.verifyOTPAndUpdatePhone(req.user, req.body));
const sendOTPForAlternatePhone = (req, res) => handle(req, res, () => userService.sendOTPForAlternatePhone(req.user, req.body));
const verifyOTPAndUpdateAlternatePhone = (req, res) => handle(req, res, () => userService.verifyOTPAndUpdateAlternatePhone(req.user, req.body));
const removeAlternatePhone = (req, res) => handle(req, res, () => userService.removeAlternatePhone(req.user));
const uploadMedia = (req, res) => handle(req, res, () => userService.uploadMedia(req.user, req.file));
const uploadProfileImage = (req, res) => handle(req, res, () => userService.uploadProfileImage(req.user, req.file));
const uploadCoverPhoto = (req, res) => handle(req, res, () => userService.uploadCoverPhoto(req.user, req.file));
const getUserMedia = (req, res) => handle(req, res, () => userService.getUserMedia(req.user));
const getUserImages = (req, res) => handle(req, res, () => userService.getUserImages(req.user, req.query));
const getUserImagesPublic = (req, res) => handle(req, res, () => userService.getUserImagesPublicById(req.params.id, req.query));
const deleteUserMedia = (req, res) => handle(req, res, () => userService.deleteUserMedia(req.user, req.params.mediaId));
const updateProfileMedia = (req, res) => handle(req, res, () => userService.updateProfileMedia(req.user, req.body));
const updatePersonalInfo = (req, res) => handle(req, res, () => userService.updatePersonalInfo(req.user, req.body));
const updateLocationAndDetails = (req, res) => handle(req, res, () => userService.updateLocationAndDetails(req.user, req.body));
const searchUsers = (req, res) => handle(req, res, () => userService.searchUsers(req.user, req.query));
const removeEducationEntry = (req, res) => handle(req, res, () => userService.removeEducationEntry(req.user, req.params.educationId));
const removeWorkplaceEntry = (req, res) => handle(req, res, () => userService.removeWorkplaceEntry(req.user, req.params.index));
const blockUser = (req, res) => handle(req, res, () => userService.blockUser(req.user._id, req.params.blockedUserId));
const unblockUser = (req, res) => handle(req, res, () => userService.unblockUser(req.user._id, req.params.blockedUserId));
const listBlockedUsers = (req, res) => handle(req, res, () => userService.listBlockedUsers(req.user._id));
const getUserProfileById = (req, res) => handle(req, res, () => userService.getUserProfileById(req.user, req.params.userId));
const updateProfileVisibility = (req, res) => handle(req, res, () => userService.updateProfileVisibility(req.user, req.body));

module.exports = {
    updateProfile,
    sendOTPForPhoneUpdate,
    verifyOTPAndUpdatePhone,
    sendOTPForAlternatePhone,
    verifyOTPAndUpdateAlternatePhone,
    removeAlternatePhone,
    uploadMedia,
    uploadProfileImage,
    uploadCoverPhoto,
    getUserMedia,
    getUserImages,
    getUserImagesPublic,
    deleteUserMedia,
    updateProfileMedia,
    updatePersonalInfo,
    updateLocationAndDetails,
    searchUsers,
    removeEducationEntry,
    removeWorkplaceEntry,
    blockUser,
    unblockUser,
    listBlockedUsers,
    updateProfileVisibility,
    getUserProfileById
};

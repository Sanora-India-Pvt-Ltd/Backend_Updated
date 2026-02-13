/**
 * Thin controller: user profile, media, and relationships.
 * Delegates all logic to app services. No models, mongoose, infra, or utils.
 */

const userProfileService = require('../../app/services/user.profile.service');
const userMediaService = require('../../app/services/user.media.service');
const userRelationshipService = require('../../app/services/user.relationship.service');

// ---- Profile ----
async function updateProfile(req, res) {
    const result = await userProfileService.updateProfile(req.user, req.body);
    res.status(result.statusCode).json(result.json);
}

async function updatePersonalInfo(req, res) {
    const result = await userProfileService.updatePersonalInfo(req.user, req.body);
    res.status(result.statusCode).json(result.json);
}

async function updateLocationAndDetails(req, res) {
    const result = await userProfileService.updateLocationAndDetails(req.user, req.body);
    res.status(result.statusCode).json(result.json);
}

async function updateProfileVisibility(req, res) {
    const result = await userProfileService.updateProfileVisibility(req.user, req.body);
    res.status(result.statusCode).json(result.json);
}

async function getUserProfileById(req, res) {
    const result = await userProfileService.getUserProfileById(req.user, req.params.userId);
    res.status(result.statusCode).json(result.json);
}

async function searchUsers(req, res) {
    const result = await userProfileService.searchUsers(req.user, req.query);
    res.status(result.statusCode).json(result.json);
}

async function removeEducationEntry(req, res) {
    const result = await userProfileService.removeEducationEntry(req.user._id, req.params.educationId);
    res.status(result.statusCode).json(result.json);
}

async function removeWorkplaceEntry(req, res) {
    const result = await userProfileService.removeWorkplaceEntry(req.user, req.params.workplaceId);
    res.status(result.statusCode).json(result.json);
}

// ---- OTP / Phone ----
async function sendOTPForPhoneUpdate(req, res) {
    const result = await userProfileService.sendOTPForPhoneUpdate(req.user, req.body);
    res.status(result.statusCode).json(result.json);
}

async function verifyOTPAndUpdatePhone(req, res) {
    const result = await userProfileService.verifyOTPAndUpdatePhone(req.user, req.body);
    res.status(result.statusCode).json(result.json);
}

async function sendOTPForAlternatePhone(req, res) {
    const result = await userProfileService.sendOTPForAlternatePhone(req.user, req.body);
    res.status(result.statusCode).json(result.json);
}

async function verifyOTPAndUpdateAlternatePhone(req, res) {
    const result = await userProfileService.verifyOTPAndUpdateAlternatePhone(req.user, req.body);
    res.status(result.statusCode).json(result.json);
}

async function removeAlternatePhone(req, res) {
    const result = await userProfileService.removeAlternatePhone(req.user);
    res.status(result.statusCode).json(result.json);
}

// ---- Media ----
async function uploadMedia(req, res) {
    const result = await userMediaService.uploadMedia({
        files: req.files,
        user: req.user,
        university: req.university,
        userId: req.userId,
        universityId: req.universityId
    });
    res.status(result.statusCode).json(result.json);
}

async function uploadProfileImage(req, res) {
    const result = await userMediaService.uploadProfileImage(req.user, req.file);
    res.status(result.statusCode).json(result.json);
}

async function uploadCoverPhoto(req, res) {
    const result = await userMediaService.uploadCoverPhoto(req.user, req.file);
    res.status(result.statusCode).json(result.json);
}

async function removeProfileImage(req, res) {
    const result = await userMediaService.removeProfileImage(req.user);
    res.status(result.statusCode).json(result.json);
}

async function removeCoverPhoto(req, res) {
    const result = await userMediaService.removeCoverPhoto(req.user);
    res.status(result.statusCode).json(result.json);
}

async function getUserMedia(req, res) {
    const result = await userMediaService.getUserMedia(req.user);
    res.status(result.statusCode).json(result.json);
}

async function getUserImages(req, res) {
    const result = await userMediaService.getUserImages(req.user, req.query);
    res.status(result.statusCode).json(result.json);
}

async function getUserImagesPublic(req, res) {
    const result = await userMediaService.getUserImagesPublicById(req.params.id, req.query);
    res.status(result.statusCode).json(result.json);
}

async function deleteUserMedia(req, res) {
    const result = await userMediaService.deleteUserMedia(req.user, req.params.mediaId);
    res.status(result.statusCode).json(result.json);
}

async function updateProfileMedia(req, res) {
    const result = await userMediaService.updateProfileMedia(req.user, req.body);
    res.status(result.statusCode).json(result.json);
}

// ---- Relationships ----
async function blockUser(req, res) {
    const result = await userRelationshipService.blockUser(req.user._id, req.params.blockedUserId);
    res.status(result.statusCode).json(result.json);
}

async function unblockUser(req, res) {
    const result = await userRelationshipService.unblockUser(req.user._id, req.params.blockedUserId);
    res.status(result.statusCode).json(result.json);
}

async function listBlockedUsers(req, res) {
    const result = await userRelationshipService.listBlockedUsers(req.user._id);
    res.status(result.statusCode).json(result.json);
}

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
    removeProfileImage,
    removeCoverPhoto,
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

const express = require("express");
const upload = require("../middleware/s3Upload");
const { protect } = require("../middleware/auth");
const { flexibleAuth } = require("../middleware/flexibleAuth.middleware");
const { 
    uploadMedia, 
    uploadProfileImage,
    uploadCoverPhoto, 
    getUserMedia,
    getUserImages,
    getUserImagesPublic, 
    deleteUserMedia,
    removeProfileImage,
    removeCoverPhoto
} = require("../controllers/authorization/userController");

const router = express.Router();

// Upload route - public endpoint (no authentication required) - accepts any field name and multiple files
router.post("/upload", upload.any(), uploadMedia);

// Profile image upload route - ensures image is only associated with the authenticated user
router.post("/profile-image", protect, upload.single("profileImage"), uploadProfileImage);

// Cover photo upload route - ensures image is only associated with the authenticated user
router.post("/cover-photo", protect, upload.single("coverPhoto"), uploadCoverPhoto);

// Remove profile image route
router.delete("/profile-image", protect, removeProfileImage);

// Remove cover photo route
router.delete("/cover-photo", protect, removeCoverPhoto);

// Get user's media - ensures users can only see their own uploads
router.get("/my-media", protect, getUserMedia);

// Get user's images only - ensures users can only see their own uploads
router.get("/my-images", protect, getUserImages);

// Get user's images by user ID - public endpoint (anyone can view)
router.get("/user/:id", getUserImagesPublic);

// Delete user's media - ensures users can only delete their own uploads
router.delete("/:mediaId", protect, deleteUserMedia);

module.exports = router;

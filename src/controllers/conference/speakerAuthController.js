const Speaker = require('../../models/conference/Speaker');
const { generateAccessToken, generateRefreshToken } = require('../../middleware/speakerAuth');
const {
    signupEntity,
    loginEntity,
    getProfileEntity,
    updateProfileEntity,
    refreshTokenEntity,
    logoutEntity
} = require('../../services/conferenceAuthService');
const StorageService = require('../../services/storage.service');

// Speaker Signup
const signup = async (req, res, next) => {
    try {
        const result = await signupEntity({
            entityType: 'speaker',
            Model: Speaker,
            generateAccessToken,
            generateRefreshToken,
            body: req.body,
            userAgent: req.headers['user-agent']
        });

        res.status(result.status).json(result.body);
    } catch (error) {
        console.error('Speaker signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create speaker account',
            error: error.message
        });
    }
};

// Speaker Login
const login = async (req, res) => {
    try {
        const result = await loginEntity({
            entityType: 'speaker',
            Model: Speaker,
            generateAccessToken,
            generateRefreshToken,
            body: req.body,
            userAgent: req.headers['user-agent']
        });

        res.status(result.status).json(result.body);
    } catch (error) {
        console.error('Speaker login error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to login',
            error: error.message
        });
    }
};

// Get Speaker Profile
const getProfile = async (req, res) => {
    try {
        const result = await getProfileEntity({ entityType: 'speaker', req });
        res.status(result.status).json(result.body);
    } catch (error) {
        console.error('Get speaker profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch profile',
            error: error.message
        });
    }
};

// Update Speaker Profile
const updateProfile = async (req, res) => {
    try {
        const result = await updateProfileEntity({ entityType: 'speaker', req });
        res.status(result.status).json(result.body);
    } catch (error) {
        console.error('Update speaker profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
            error: error.message
        });
    }
};

// Refresh Token
const refreshToken = async (req, res) => {
    try {
        const result = await refreshTokenEntity({
            entityType: 'speaker',
            generateAccessToken,
            generateRefreshToken,
            req
        });

        res.status(result.status).json(result.body);
    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to refresh token',
            error: error.message
        });
    }
};

// Logout
const logout = async (req, res) => {
    try {
        const result = await logoutEntity({ entityType: 'speaker', req });
        res.status(result.status).json(result.body);
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to logout',
            error: error.message
        });
    }
};

// Upload Profile Image
const uploadProfileImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded"
            });
        }

        const speaker = req.speaker; // From protect middleware

        // Validate that it's an image
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedMimeTypes.includes(req.file.mimetype)) {
            return res.status(400).json({
                success: false,
                message: "Only image files are allowed for profile pictures (JPEG, PNG, GIF, WebP)"
            });
        }

        // Delete old profile image from S3 if it exists
        if (speaker.profile?.images?.avatar) {
            try {
                // Extract key from URL
                // Format: https://bucket.s3.region.amazonaws.com/key or https://bucket.s3-region.amazonaws.com/key
                let key = null;
                const url = speaker.profile.images.avatar;
                
                // Try to extract key from S3 URL
                if (url.includes('.s3.') || url.includes('.s3-')) {
                    // Extract everything after the domain
                    const urlObj = new URL(url);
                    key = urlObj.pathname.substring(1); // Remove leading slash
                } else if (url.includes('/uploads/')) {
                    // Fallback: extract key if URL contains /uploads/
                    const parts = url.split('/uploads/');
                    if (parts.length > 1) {
                        key = 'uploads/' + parts[1];
                    }
                }
                
                if (key) {
                    await StorageService.delete(key);
                }
            } catch (deleteError) {
                // Log but don't fail if old image deletion fails
                console.warn('Failed to delete old profile image:', deleteError.message);
            }
        }

        // Handle file upload based on storage type
        let uploadResult;
        if (req.file.path) {
            // File was saved to disk (diskStorage) - upload to S3
            uploadResult = await StorageService.uploadFromPath(req.file.path);
        } else if (req.file.location && req.file.key) {
            // File was already uploaded via multer-s3
            uploadResult = await StorageService.uploadFromRequest(req.file);
        } else {
            throw new Error('Invalid file object: missing path (diskStorage) or location/key (multer-s3)');
        }

        // Update speaker's profile image field
        const updatedSpeaker = await Speaker.findByIdAndUpdate(
            speaker._id,
            { 'profile.images.avatar': uploadResult.url },
            { new: true, runValidators: true }
        ).select('-security.passwordHash -sessions');

        return res.status(200).json({
            success: true,
            message: "Profile image uploaded successfully",
            data: {
                url: uploadResult.url,
                speaker: {
                    _id: updatedSpeaker._id,
                    email: updatedSpeaker.account.email,
                    name: updatedSpeaker.profile.name,
                    profileImage: updatedSpeaker.profile.images.avatar
                }
            }
        });

    } catch (err) {
        console.error('Profile image upload error:', err);
        return res.status(500).json({
            success: false,
            message: "Profile image upload failed",
            error: err.message
        });
    }
};

module.exports = {
    signup,
    login,
    getProfile,
    updateProfile,
    refreshToken,
    logout,
    uploadProfileImage
};


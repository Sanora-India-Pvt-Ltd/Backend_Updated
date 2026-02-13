/**
 * User media service: upload, get, delete media; profile/cover images.
 * Returns { statusCode, json } for each method. No res usage.
 */

const Media = require('../../models/Media');
const User = require('../../models/authorization/User');
const mongoose = require('mongoose');
const StorageService = require('../../core/infra/storage');
const { isVideo } = require('../../core/infra/videoTranscoder');

async function getUserMedia(user) {
    try {
        const media = await Media.find({ userId: user._id }).sort({ createdAt: -1 }).select('-__v').lean();
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Media retrieved successfully',
                data: {
                    count: media.length,
                    media: media.map(item => ({
                        id: item._id,
                        url: item.url,
                        public_id: item.public_id,
                        format: item.format,
                        type: item.resource_type,
                        fileSize: item.fileSize,
                        originalFilename: item.originalFilename,
                        folder: item.folder,
                        uploadedAt: item.createdAt
                    }))
                }
            }
        };
    } catch (err) {
        console.error('Get user media error:', err);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve media', error: err.message } };
    }
}

async function getUserImages(user, query) {
    try {
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 20;
        const skip = (page - 1) * limit;
        const images = await Media.find({ userId: user._id, resource_type: 'image' })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('-__v')
            .lean();
        const totalImages = await Media.countDocuments({ userId: user._id, resource_type: 'image' });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Images retrieved successfully',
                data: {
                    count: images.length,
                    totalImages,
                    images: images.map(item => ({
                        id: item._id,
                        url: item.url,
                        public_id: item.public_id,
                        format: item.format,
                        type: item.resource_type,
                        fileSize: item.fileSize,
                        originalFilename: item.originalFilename,
                        folder: item.folder,
                        uploadedAt: item.createdAt
                    })),
                    pagination: {
                        currentPage: page,
                        totalPages: Math.ceil(totalImages / limit),
                        totalImages,
                        hasNextPage: page < Math.ceil(totalImages / limit),
                        hasPrevPage: page > 1
                    }
                }
            }
        };
    } catch (err) {
        console.error('Get user images error:', err);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve images', error: err.message } };
    }
}

async function getUserImagesPublicById(userId, query) {
    try {
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid user ID' } };
        }
        const user = await User.findById(userId).lean();
        if (!user) return { statusCode: 404, json: { success: false, message: 'User not found' } };
        const page = parseInt(query.page) || 1;
        const limit = parseInt(query.limit) || 20;
        const skip = (page - 1) * limit;
        const images = await Media.find({ userId, resource_type: 'image' })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .select('-__v')
            .lean();
        const totalImages = await Media.countDocuments({ userId, resource_type: 'image' });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'User images retrieved successfully',
                data: {
                    user: { id: user._id.toString(), name: user.profile?.name?.full, email: user.profile?.email, profileImage: user.profile?.profileImage },
                    count: images.length,
                    totalImages,
                    images: images.map(item => ({
                        id: item._id,
                        url: item.url,
                        public_id: item.public_id,
                        format: item.format,
                        type: item.resource_type,
                        fileSize: item.fileSize,
                        originalFilename: item.originalFilename,
                        folder: item.folder,
                        uploadedAt: item.createdAt
                    })),
                    pagination: {
                        currentPage: page,
                        totalPages: Math.ceil(totalImages / limit),
                        totalImages,
                        hasNextPage: page < Math.ceil(totalImages / limit),
                        hasPrevPage: page > 1
                    }
                }
            }
        };
    } catch (err) {
        console.error('Get user images public error:', err);
        return { statusCode: 500, json: { success: false, message: 'Failed to retrieve user images', error: err.message } };
    }
}

async function uploadMedia(reqContext) {
    try {
        const { files, user, university, userId, universityId } = reqContext;
        if (!files || !Array.isArray(files) || files.length === 0) {
            return { statusCode: 400, json: { success: false, message: 'No files uploaded' } };
        }
        const uploadedFiles = [];
        for (const file of files) {
            const isVideoFile = isVideo(file.mimetype);
            const isAudioFile = file.mimetype.startsWith('audio/');
            const isImageFile = file.mimetype.startsWith('image/');
            let uploadResult;
            if (file.path) {
                uploadResult = await StorageService.uploadFromPath(file.path);
            } else if (file.location && file.key) {
                uploadResult = await StorageService.uploadFromRequest(file);
            } else continue;
            let mediaType;
            if (isVideoFile) mediaType = 'video';
            else if (isAudioFile) mediaType = 'audio';
            else if (isImageFile) mediaType = 'image';
            else {
                const primaryType = file.mimetype.split('/')[0];
                mediaType = (primaryType === 'application' || primaryType === 'text') ? primaryType : 'file';
            }
            const format = file.mimetype.split('/')[1] || 'unknown';
            const mediaData = {
                url: uploadResult.url,
                public_id: uploadResult.key,
                format,
                resource_type: mediaType,
                fileSize: file.size,
                originalFilename: file.originalname,
                folder: user ? 'user_uploads' : (university ? 'university_uploads' : 'public_uploads'),
                provider: uploadResult.provider
            };
            if (user && userId) mediaData.userId = userId;
            else if (university && universityId) mediaData.universityId = universityId;
            const mediaRecord = await Media.create(mediaData);
            uploadedFiles.push({ url: uploadResult.url, key: uploadResult.key, mimetype: file.mimetype, id: mediaRecord._id, format, type: mediaType, fileSize: file.size });
        }
        if (uploadedFiles.length === 0) {
            return { statusCode: 400, json: { success: false, message: 'No files were uploaded or processed successfully.' } };
        }
        return { statusCode: 200, json: { success: true, message: 'Media uploaded successfully', data: { files: uploadedFiles } } };
    } catch (err) {
        console.error('S3 upload error:', err);
        return { statusCode: 500, json: { success: false, message: 'Upload failed', error: err.message } };
    }
}

async function uploadProfileImage(user, file) {
    try {
        if (!file) return { statusCode: 400, json: { success: false, message: 'No file uploaded' } };
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedMimeTypes.includes(file.mimetype)) return { statusCode: 400, json: { success: false, message: 'Only image files are allowed for profile pictures (JPEG, PNG, GIF, WebP)' } };
        if (user.profile?.profileImage) {
            try {
                const oldMedia = await Media.findOne({ userId: user._id, url: user.profile.profileImage });
                if (oldMedia?.public_id) await StorageService.delete(oldMedia.public_id);
                await Media.findOneAndDelete({ userId: user._id, url: user.profile.profileImage });
            } catch (e) { console.warn('Failed to delete old profile image:', e.message); }
        }
        let uploadResult;
        if (file.path) uploadResult = await StorageService.uploadFromPath(file.path);
        else if (file.location && file.key) uploadResult = await StorageService.uploadFromRequest(file);
        else return { statusCode: 500, json: { success: false, message: 'Invalid file object' } };
        const updatedUser = await User.findByIdAndUpdate(user._id, { 'profile.profileImage': uploadResult.url }, { new: true, runValidators: true }).lean().select('-auth');
        const format = file.mimetype.split('/')[1] || 'unknown';
        const mediaRecord = await Media.create({
            userId: user._id,
            url: uploadResult.url,
            public_id: uploadResult.key,
            format,
            resource_type: 'image',
            fileSize: file.size,
            originalFilename: file.originalname,
            folder: 'user_uploads',
            provider: uploadResult.provider
        });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Profile image uploaded successfully',
                data: {
                    id: mediaRecord._id,
                    url: uploadResult.url,
                    public_id: uploadResult.key,
                    format,
                    fileSize: file.size,
                    user: { id: updatedUser._id, email: updatedUser.profile?.email, name: updatedUser.profile?.name?.full, profileImage: updatedUser.profile?.profileImage },
                    uploadedAt: mediaRecord.createdAt
                }
            }
        };
    } catch (err) {
        console.error('Profile image upload error:', err);
        return { statusCode: 500, json: { success: false, message: 'Profile image upload failed', error: err.message } };
    }
}

async function uploadCoverPhoto(user, file) {
    try {
        if (!file) return { statusCode: 400, json: { success: false, message: 'No file uploaded' } };
        const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedMimeTypes.includes(file.mimetype)) return { statusCode: 400, json: { success: false, message: 'Only image files are allowed for cover photos (JPEG, PNG, GIF, WebP)' } };
        if (user.profile?.coverPhoto) {
            try {
                const oldMedia = await Media.findOne({ userId: user._id, url: user.profile.coverPhoto });
                if (oldMedia?.public_id) await StorageService.delete(oldMedia.public_id);
                await Media.findOneAndDelete({ userId: user._id, url: user.profile.coverPhoto });
            } catch (e) { console.warn('Failed to delete old cover photo:', e.message); }
        }
        let uploadResult;
        if (file.path) uploadResult = await StorageService.uploadFromPath(file.path);
        else if (file.location && file.key) uploadResult = await StorageService.uploadFromRequest(file);
        else return { statusCode: 500, json: { success: false, message: 'Invalid file object' } };
        const updatedUser = await User.findByIdAndUpdate(user._id, { 'profile.coverPhoto': uploadResult.url }, { new: true, runValidators: true }).lean().select('-auth');
        const format = file.mimetype.split('/')[1] || 'unknown';
        const mediaRecord = await Media.create({
            userId: user._id,
            url: uploadResult.url,
            public_id: uploadResult.key,
            format,
            resource_type: 'image',
            fileSize: file.size,
            originalFilename: file.originalname,
            folder: 'user_uploads',
            provider: uploadResult.provider
        });
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Cover photo uploaded successfully',
                data: {
                    id: mediaRecord._id,
                    url: uploadResult.url,
                    public_id: uploadResult.key,
                    format,
                    fileSize: file.size,
                    user: { id: updatedUser._id, email: updatedUser.profile?.email, name: updatedUser.profile?.name?.full, coverPhoto: updatedUser.profile?.coverPhoto },
                    uploadedAt: mediaRecord.createdAt
                }
            }
        };
    } catch (err) {
        console.error('Cover photo upload error:', err);
        return { statusCode: 500, json: { success: false, message: 'Cover photo upload failed', error: err.message } };
    }
}

async function removeProfileImage(user) {
    try {
        if (!user.profile?.profileImage) return { statusCode: 404, json: { success: false, message: 'No profile image found to remove' } };
        const profileImageUrl = user.profile.profileImage;
        const media = await Media.findOne({ userId: user._id, url: profileImageUrl });
        if (media?.public_id) {
            try { await StorageService.delete(media.public_id); } catch (e) { console.warn('Failed to delete profile image from S3:', e.message); }
        }
        if (media) await Media.findByIdAndDelete(media._id);
        const updatedUser = await User.findByIdAndUpdate(user._id, { 'profile.profileImage': '' }, { new: true, runValidators: true }).lean().select('-auth');
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Profile image removed successfully',
                data: { user: { id: updatedUser._id, email: updatedUser.profile?.email, name: updatedUser.profile?.name?.full, profileImage: updatedUser.profile?.profileImage } }
            }
        };
    } catch (err) {
        console.error('Remove profile image error:', err);
        return { statusCode: 500, json: { success: false, message: 'Failed to remove profile image', error: err.message } };
    }
}

async function removeCoverPhoto(user) {
    try {
        if (!user.profile?.coverPhoto) return { statusCode: 404, json: { success: false, message: 'No cover photo found to remove' } };
        const coverPhotoUrl = user.profile.coverPhoto;
        const media = await Media.findOne({ userId: user._id, url: coverPhotoUrl });
        if (media?.public_id) {
            try { await StorageService.delete(media.public_id); } catch (e) { console.warn('Failed to delete cover photo from S3:', e.message); }
        }
        if (media) await Media.findByIdAndDelete(media._id);
        const updatedUser = await User.findByIdAndUpdate(user._id, { 'profile.coverPhoto': '' }, { new: true, runValidators: true }).lean().select('-auth');
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Cover photo removed successfully',
                data: { user: { id: updatedUser._id, email: updatedUser.profile?.email, name: updatedUser.profile?.name?.full, coverPhoto: updatedUser.profile?.coverPhoto } }
            }
        };
    } catch (err) {
        console.error('Remove cover photo error:', err);
        return { statusCode: 500, json: { success: false, message: 'Failed to remove cover photo', error: err.message } };
    }
}

async function deleteUserMedia(user, mediaId) {
    try {
        if (!mediaId) return { statusCode: 400, json: { success: false, message: 'Media ID is required' } };
        if (mediaId === 'profile-image' || mediaId === 'cover-photo') {
            return { statusCode: 400, json: { success: false, message: `"${mediaId}" is a reserved route name. Use DELETE /api/media/${mediaId} to remove your ${mediaId === 'profile-image' ? 'profile image' : 'cover photo'}.` } };
        }
        if (!mongoose.Types.ObjectId.isValid(mediaId)) return { statusCode: 400, json: { success: false, message: 'Invalid media ID format. Media ID must be a valid ObjectId.' } };
        const media = await Media.findOne({ _id: mediaId, userId: user._id });
        if (!media) return { statusCode: 404, json: { success: false, message: "Media not found or you don't have permission to delete it" } };
        try { await StorageService.delete(media.public_id); } catch (e) { console.warn('Failed to delete from S3:', e.message); }
        await Media.findByIdAndDelete(mediaId);
        if (user.profile?.profileImage === media.url) await User.findByIdAndUpdate(user._id, { 'profile.profileImage': '' });
        if (user.profile?.coverPhoto === media.url) await User.findByIdAndUpdate(user._id, { 'profile.coverPhoto': '' });
        return { statusCode: 200, json: { success: true, message: 'Media deleted successfully' } };
    } catch (err) {
        console.error('Delete user media error:', err);
        if (err.name === 'CastError' && err.path === '_id') {
            const invalidValue = err.value;
            if (invalidValue === 'profile-image' || invalidValue === 'cover-photo') {
                return { statusCode: 400, json: { success: false, message: `"${invalidValue}" is a reserved route name. Use DELETE /api/media/${invalidValue} to remove your ${invalidValue === 'profile-image' ? 'profile image' : 'cover photo'}.` } };
            }
            return { statusCode: 400, json: { success: false, message: `Invalid media ID format: "${invalidValue}". Media ID must be a valid ObjectId.` } };
        }
        return { statusCode: 500, json: { success: false, message: 'Failed to delete media', error: err.message } };
    }
}

async function updateProfileMedia(user, body) {
    try {
        const { bio, coverPhoto, profileImage } = body;
        const updateData = {};
        if (bio !== undefined) updateData['profile.bio'] = bio.trim();
        if (coverPhoto !== undefined) {
            if (coverPhoto === null || coverPhoto === '') updateData['profile.coverPhoto'] = '';
            else {
                try { new URL(coverPhoto); updateData['profile.coverPhoto'] = coverPhoto.trim(); }
                catch { return { statusCode: 400, json: { success: false, message: 'Cover photo must be a valid URL' } }; }
            }
        }
        if (profileImage !== undefined) {
            const currentProfileImage = user.profile?.profileImage || '';
            if (coverPhoto !== undefined && profileImage === coverPhoto && !currentProfileImage) {
                // skip profileImage update
            } else if (profileImage === null || profileImage === '') updateData['profile.profileImage'] = '';
            else {
                try { new URL(profileImage); updateData['profile.profileImage'] = profileImage.trim(); }
                catch { return { statusCode: 400, json: { success: false, message: 'Profile image must be a valid URL' } }; }
            }
        }
        if (Object.keys(updateData).length === 0) return { statusCode: 400, json: { success: false, message: 'No fields provided to update' } };
        const updatedUser = await User.findByIdAndUpdate(user._id, updateData, { new: true, runValidators: true }).lean().select('-auth');
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Profile media updated successfully',
                data: {
                    user: {
                        id: updatedUser._id,
                        bio: updatedUser.profile?.bio,
                        coverPhoto: updatedUser.profile?.coverPhoto,
                        profileImage: updatedUser.profile?.profileImage,
                        updatedAt: updatedUser.updatedAt
                    }
                }
            }
        };
    } catch (error) {
        console.error('Update profile media error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error updating profile media', error: error.message } };
    }
}

module.exports = {
    getUserMedia,
    getUserImages,
    getUserImagesPublicById,
    uploadMedia,
    uploadProfileImage,
    uploadCoverPhoto,
    removeProfileImage,
    removeCoverPhoto,
    deleteUserMedia,
    updateProfileMedia
};

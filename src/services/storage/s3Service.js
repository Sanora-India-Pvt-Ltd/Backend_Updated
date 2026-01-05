const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = require('../../config/s3');

/**
 * Upload video to S3 with progress tracking
 */
const uploadVideo = async (file, key, onProgress) => {
    const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: file.buffer || file,
        ContentType: file.mimetype || 'video/mp4'
    });

    await s3.send(command);
    return key;
};

/**
 * Upload thumbnail
 */
const uploadThumbnail = async (file, key) => {
    const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key,
        Body: file.buffer || file,
        ContentType: file.mimetype || 'image/jpeg',
        // ACL: 'public-read'
    });

    await s3.send(command);
    return key;
};

/**
 * Delete video/thumbnail
 */
const deleteObject = async (key) => {
    const command = new DeleteObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key
    });

    await s3.send(command);
};

/**
 * Generate signed URLs for streaming
 */
const generateSignedUrl = async (key, expiresIn = 3600) => {
    const command = new GetObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: key
    });

    const url = await getSignedUrl(s3, command, { expiresIn });
    return url;
};

/**
 * Handle multipart uploads for large files
 */
const initiateMultipartUpload = async (key, contentType) => {
    // This would use CreateMultipartUploadCommand for large files
    // For now, using simple upload
    return { uploadId: null, key };
};

module.exports = {
    uploadVideo,
    uploadThumbnail,
    deleteObject,
    generateSignedUrl,
    initiateMultipartUpload
};


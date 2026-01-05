const Video = require('../../models/course/Video');
const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = require('../../config/s3');

/**
 * Upload video to S3 and create video document
 */
const uploadVideo = async (file, videoData) => {
    const { playlistId, courseId, title, description, order } = videoData;

    // Generate S3 key
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const ext = file.originalname.split('.').pop();
    const s3Key = `videos/${courseId}/${timestamp}-${randomStr}.${ext}`;

    // Upload to S3
    await s3.send(
        new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
            Body: file.buffer,
            ContentType: file.mimetype,
            ACL: 'private' // Videos should be private, use signed URLs
        })
    );

    // Generate video URL (will use signed URLs for streaming)
    const videoUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

    // Create video document
    const video = await Video.create({
        playlistId,
        courseId,
        details: {
            title,
            description: description || ''
        },
        media: {
            videoUrl,
            s3Key,
            duration: 0 // Can be calculated later with ffmpeg
        },
        order: order || 0
    });

    return video;
};

/**
 * Delete video from S3 & DB
 */
const deleteVideo = async (s3Key) => {
    try {
        await s3.send(
            new DeleteObjectCommand({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: s3Key
            })
        );
    } catch (error) {
        console.error('Error deleting video from S3:', error);
        throw error;
    }
};

/**
 * Generate signed URL for video streaming
 */
const getSignedVideoUrl = async (s3Key, expiresIn = 3600) => {
    const command = new GetObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: s3Key
    });

    const url = await getSignedUrl(s3, command, { expiresIn });
    return url;
};

/**
 * Upload thumbnail
 */
const uploadThumbnail = async (file, videoId) => {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(7);
    const ext = file.originalname.split('.').pop();
    const s3Key = `thumbnails/${videoId}/${timestamp}-${randomStr}.${ext}`;

    await s3.send(
        new PutObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
            Body: file.buffer,
            ContentType: file.mimetype,
            // ACL: 'public-read' // Thumbnails can be public
        })
    );

    const thumbnailUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
    return thumbnailUrl;
};

module.exports = {
    uploadVideo,
    deleteVideo,
    getSignedVideoUrl,
    uploadThumbnail
};


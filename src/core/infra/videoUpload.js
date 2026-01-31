/**
 * Video S3 upload, delete, signed URL, thumbnail. Full implementation.
 * Replaces legacy src/services/video/videoService.js.
 */

const logger = require('../logger');
const Video = require('../../models/course/Video');
const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3 = require('../../config/s3');

async function uploadVideo(file, videoData) {
  const { playlistId, courseId, title, description, order } = videoData;

  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(7);
  const ext = file.originalname.split('.').pop();
  const s3Key = `videos/${courseId}/${timestamp}-${randomStr}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'private'
    })
  );

  const videoUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

  const video = await Video.create({
    playlistId,
    courseId,
    details: { title, description: description || '' },
    media: { videoUrl, s3Key, duration: 0 },
    order: order || 0
  });

  return video;
}

async function deleteVideo(s3Key) {
  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: s3Key
      })
    );
  } catch (error) {
    logger.error('Error deleting video from S3', error);
    throw error;
  }
}

async function getSignedVideoUrl(s3Key, expiresIn = 3600) {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: s3Key
  });
  const url = await getSignedUrl(s3, command, { expiresIn });
  return url;
}

async function uploadThumbnail(file, videoId) {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(7);
  const ext = file.originalname.split('.').pop();
  const s3Key = `thumbnails/${videoId}/${timestamp}-${randomStr}.${ext}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
      Body: file.buffer,
      ContentType: file.mimetype
    })
  );

  const thumbnailUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
  return thumbnailUrl;
}

module.exports = {
  uploadVideo,
  deleteVideo,
  getSignedVideoUrl,
  uploadThumbnail
};

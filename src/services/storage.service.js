const { DeleteObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const s3 = require('../config/s3');
const fs = require('fs').promises;
const path = require('path');

class StorageService {
  static async uploadFromRequest(file) {
    // multer-s3 already uploaded the file
    if (!file || !file.location || !file.key) {
      throw new Error('Invalid file object: missing location or key');
    }
    return {
      url: file.location,
      key: file.key,
      provider: 's3'
    };
  }

  /**
   * Upload a file from a local file path to S3
   * @param {string} filePath - Path to local file
   * @param {string} key - S3 key (optional, will generate if not provided)
   * @returns {Promise<{url: string, key: string, provider: string}>}
   */
  static async uploadFromPath(filePath, key = null) {
    if (!filePath) {
      throw new Error('File path is required');
    }

    try {
      // Check if file exists
      await fs.access(filePath);

      // Generate key if not provided
      if (!key) {
        const ext = path.extname(filePath);
        const fileName = `uploads/${Date.now()}-${Math.round(
          Math.random() * 1e9
        )}${ext}`;
        key = fileName;
      }

      // Read file
      const fileContent = await fs.readFile(filePath);

      // Get content type
      const ext = path.extname(filePath).toLowerCase();
      const contentTypeMap = {
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.webm': 'video/webm',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };
      const contentType = contentTypeMap[ext] || 'application/octet-stream';

      // Upload to S3
      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: key,
          Body: fileContent,
          ContentType: contentType
        })
      );

      // Generate URL (assuming bucket is not public, you may need to use presigned URLs)
      const url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

      return {
        url,
        key,
        provider: 's3'
      };
    } catch (error) {
      console.error(`[StorageService] Failed to upload file from path ${filePath}:`, error);
      throw error;
    }
  }

  static async delete(key) {
    if (!key) {
      throw new Error('Key is required for deletion');
    }
    try {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: key
        })
      );
    } catch (error) {
      console.error(`[StorageService] Failed to delete object with key ${key}:`, error);
      throw error;
    }
  }
}

module.exports = StorageService;

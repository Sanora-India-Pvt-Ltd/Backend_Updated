/**
 * QR code generation (external integration). Full implementation.
 * Replaces legacy project-root services/qrService.js.
 */

const logger = require('../logger');
const QRCode = require('qrcode');

/**
 * Generate a Base64 data URL for a QR code image
 * @param {string} publicCode - The public code to encode in the QR code
 * @param {object} options - Optional QR code generation options
 * @returns {Promise<string>} Base64 data URL string (e.g., "data:image/png;base64,...")
 */
const generateQRCode = async (publicCode, options = {}) => {
  try {
    const baseUrl = process.env.BACKEND_URL || process.env.BASE_URL || 'http://13.203.123.56:3100';
    const url = `${baseUrl}/api/conference/public/${publicCode}`;

    const defaultOptions = {
      errorCorrectionLevel: 'M',
      type: 'image/png',
      quality: 0.92,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      },
      width: 300
    };

    const qrOptions = { ...defaultOptions, ...options };
    const dataUrl = await QRCode.toDataURL(url, qrOptions);

    return dataUrl;
  } catch (error) {
    logger.error('Error generating QR code:', error);
    throw new Error(`Failed to generate QR code: ${error.message}`);
  }
};

module.exports = {
  generateQRCode
};

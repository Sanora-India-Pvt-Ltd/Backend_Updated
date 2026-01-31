/**
 * OTP generation and verification (external integration). Full implementation.
 * Replaces legacy project-root services/otpService.js.
 */

const logger = require('../logger');
const bcrypt = require('bcryptjs');
const OTP = require('../../models/authorization/OTP');

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const hashOTP = async (otp) => {
  return await bcrypt.hash(otp, 10);
};

const verifyOTP = async (hashedOTP, otp) => {
  return await bcrypt.compare(otp, hashedOTP);
};

const createOTPRecord = async (email, userType) => {
  const normalizedEmail = email.toLowerCase().trim();

  await OTP.deleteMany({ email: normalizedEmail });

  const otp = generateOTP();
  const hashedOTP = await hashOTP(otp);
  const expiresAt = new Date(Date.now() + (process.env.OTP_EXPIRY_MINUTES || 5) * 60000);

  const otpRecord = await OTP.create({
    email: normalizedEmail,
    otp: hashedOTP,
    userType,
    expiresAt,
    attempts: 0,
    verified: false
  });

  return {
    otpRecord,
    plainOTP: otp
  };
};

const validateOTP = async (email, userType, otp) => {
  const normalizedEmail = email.toLowerCase().trim();

  const otpRecord = await OTP.findOne({
    email: normalizedEmail,
    userType,
    verified: false
  });

  if (!otpRecord) {
    return { valid: false, message: 'OTP not found or already used' };
  }

  if (new Date() > otpRecord.expiresAt) {
    await OTP.deleteOne({ _id: otpRecord._id });
    return { valid: false, message: 'OTP expired' };
  }

  if (otpRecord.attempts >= 5) {
    await OTP.deleteOne({ _id: otpRecord._id });
    return { valid: false, message: 'Too many attempts. Please request a new OTP' };
  }

  const isValid = await verifyOTP(otpRecord.otp, otp);

  if (isValid) {
    otpRecord.verified = true;
    await otpRecord.save();
    return { valid: true, message: 'OTP verified successfully' };
  } else {
    otpRecord.attempts += 1;
    await otpRecord.save();
    return {
      valid: false,
      message: 'Invalid OTP',
      remainingAttempts: 5 - otpRecord.attempts
    };
  }
};

module.exports = {
  generateOTP,
  hashOTP,
  verifyOTP,
  createOTPRecord,
  validateOTP
};

'use strict';

const universityAuthService = require('../app/services/universityAuth.service');

const signupUniversity = async (req, res) => {
  const result = await universityAuthService.signupUniversity(req.body);
  return res.status(result.statusCode).json(result.json);
};

const loginUniversity = async (req, res) => {
  const result = await universityAuthService.loginUniversity({
    email: req.body.email,
    password: req.body.password,
    rememberMe: req.body.rememberMe,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    deviceFingerprint: req.body.deviceFingerprint
  });
  return res.status(result.statusCode).json(result.json);
};

module.exports = {
  signupUniversity,
  loginUniversity
};


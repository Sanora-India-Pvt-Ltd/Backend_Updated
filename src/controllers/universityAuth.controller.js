'use strict';

const universityAuthService = require('../app/services/universityAuth.service');

const signupUniversity = async (req, res) => {
  const result = await universityAuthService.signupUniversity(req.body);
  return res.status(result.statusCode).json(result.json);
};

module.exports = {
  signupUniversity
};


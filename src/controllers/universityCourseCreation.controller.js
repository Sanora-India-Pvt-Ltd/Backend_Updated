'use strict';

const courseCreationService = require('../app/services/courseCreation.service');

async function createCourse(req, res) {
  const result = await courseCreationService.createCourse(req.body, req.universityId);
  return res.status(result.statusCode).json(result.json);
}

module.exports = {
  createCourse
};

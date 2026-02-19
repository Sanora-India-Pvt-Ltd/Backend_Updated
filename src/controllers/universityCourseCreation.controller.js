'use strict';

const universityCourseCreationService = require('../app/services/universityCourseCreation.service');

async function createCourse(req, res) {
  const result = await universityCourseCreationService.createUniversityCourse(req.universityId, req.body);
  return res.status(result.statusCode).json(result.json);
}

module.exports = {
  createCourse
};

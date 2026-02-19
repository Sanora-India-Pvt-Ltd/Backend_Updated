'use strict';

const universityCourseQueryService = require('../app/services/universityCourseQuery.service');

async function getUniversityCourse(req, res) {
  const result = await universityCourseQueryService.getUniversityCourseById(
    req.params.courseId,
    req.universityId
  );
  return res.status(result.statusCode).json(result.json);
}

module.exports = {
  getUniversityCourse
};

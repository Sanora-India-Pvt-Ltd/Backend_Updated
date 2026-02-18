'use strict';

const universityDashboardService = require('../app/services/universityDashboard.service');

async function getDashboard(req, res) {
  const result = await universityDashboardService.getUniversityDashboard(req.universityId);
  return res.status(result.statusCode).json(result.json);
}

module.exports = {
  getDashboard
};

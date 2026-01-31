const analyticsService = require('../../app/services/analytics.service');

const getCourseAnalytics = async (req, res) => {
  try {
    const result = await analyticsService.getCourseAnalytics(req.universityId, req.params);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving analytics',
      error: err.message
    });
  }
};

const getMostRepeatedSegments = async (req, res) => {
  try {
    const result = await analyticsService.getMostRepeatedSegments(req.universityId, req.params);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving repeated segments',
      error: err.message
    });
  }
};

const getIdleUsers = async (req, res) => {
  try {
    const result = await analyticsService.getIdleUsers(req.universityId, req.params, req.query);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving idle users',
      error: err.message
    });
  }
};

const getUserEngagementMetrics = async (req, res) => {
  try {
    const result = await analyticsService.getUserEngagementMetrics(req.universityId, req.params);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving engagement metrics',
      error: err.message
    });
  }
};

module.exports = {
  getCourseAnalytics,
  getMostRepeatedSegments,
  getIdleUsers,
  getUserEngagementMetrics
};

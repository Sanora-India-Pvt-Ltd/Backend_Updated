const progressService = require('../../app/services/progress.service');

const getCourseProgress = async (req, res) => {
  try {
    const result = await progressService.getCourseProgress(req.userId, req.params);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving course progress',
      error: err.message
    });
  }
};

const getCompletionStats = async (req, res) => {
  try {
    const result = await progressService.getCompletionStats(req.userId);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving completion stats',
      error: err.message
    });
  }
};

const resetProgress = async (req, res) => {
  try {
    const result = await progressService.resetProgress(req.userId, req.params);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error resetting progress',
      error: err.message
    });
  }
};

module.exports = {
  getCourseProgress,
  getCompletionStats,
  resetProgress
};

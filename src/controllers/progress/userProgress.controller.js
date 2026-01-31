const progressService = require('../../app/services/progress.service');

const updateVideoProgress = async (req, res) => {
  try {
    const result = await progressService.updateVideoProgress(req.userId, req.params, req.body);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error updating progress',
      error: err.message
    });
  }
};

const getVideoProgress = async (req, res) => {
  try {
    const result = await progressService.getVideoProgress(req.userId, req.params);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving progress',
      error: err.message
    });
  }
};

const getMultipleProgress = async (req, res) => {
  try {
    const result = await progressService.getMultipleProgress(req.userId, req.params);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error retrieving progress',
      error: err.message
    });
  }
};

const markVideoComplete = async (req, res) => {
  try {
    const result = await progressService.markVideoComplete(req.userId, req.params);
    return res.status(result.statusCode).json(result.json);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Error marking video as complete',
      error: err.message
    });
  }
};

module.exports = {
  updateVideoProgress,
  getVideoProgress,
  getMultipleProgress,
  markVideoComplete
};

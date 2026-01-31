const bugReportService = require('../../app/services/bugReport.service');

const createBugReport = async (req, res) => {
  try {
    const result = await bugReportService.createBugReport(req.user, req.body);
    return res.status(result.statusCode).json(result.json);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to submit bug report',
      error: error.message
    });
  }
};

const getMyBugReports = async (req, res) => {
  try {
    const result = await bugReportService.getMyBugReports(req.user, req.query);
    return res.status(result.statusCode).json(result.json);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve bug reports',
      error: error.message
    });
  }
};

const getBugReportById = async (req, res) => {
  try {
    const result = await bugReportService.getBugReportById(req.user, req.params.id);
    return res.status(result.statusCode).json(result.json);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve bug report',
      error: error.message
    });
  }
};

module.exports = {
  createBugReport,
  getMyBugReports,
  getBugReportById
};

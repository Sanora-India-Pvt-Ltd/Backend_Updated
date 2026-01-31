/**
 * Thin user report controller: reads req, calls reportService, sends same JSON.
 */

const reportService = require('../../app/services/report.service');

function respond(res, result) {
    res.status(result.statusCode).json(result.json);
}

const getReportReasons = (req, res) => {
    const result = reportService.getReportReasons();
    respond(res, result);
};

const reportUser = async (req, res) => {
    const result = await reportService.reportUser(req.user._id, req.params.userId, req.body);
    respond(res, result);
};

const getUserReports = async (req, res) => {
    const result = await reportService.getUserReports(req.query);
    respond(res, result);
};

const updateReportStatus = async (req, res) => {
    const result = await reportService.updateReportStatus(req.params.reportId, req.body);
    respond(res, result);
};

module.exports = {
    reportUser,
    getReportReasons,
    getUserReports,
    updateReportStatus
};

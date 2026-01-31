/**
 * Bug report CRUD. Used by bugReportController.
 */

const mongoose = require('mongoose');
const { BugReport, BUG_SEVERITY, BUG_STATUS } = require('../../models/social/BugReport');

async function createBugReport(user, body) {
  const {
    title,
    description,
    severity,
    deviceInfo,
    browserInfo,
    osInfo,
    appVersion,
    stepsToReproduce,
    expectedBehavior,
    actualBehavior,
    attachments
  } = body || {};

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return { statusCode: 400, json: { success: false, message: 'Title is required' } };
  }
  if (title.length > 200) {
    return { statusCode: 400, json: { success: false, message: 'Title must be 200 characters or less' } };
  }
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return { statusCode: 400, json: { success: false, message: 'Description is required' } };
  }
  if (description.length > 5000) {
    return { statusCode: 400, json: { success: false, message: 'Description must be 5000 characters or less' } };
  }
  if (severity && !BUG_SEVERITY.includes(severity)) {
    return {
      statusCode: 400,
      json: { success: false, message: `Invalid severity. Must be one of: ${BUG_SEVERITY.join(', ')}` }
    };
  }
  if (attachments && Array.isArray(attachments)) {
    for (const attachment of attachments) {
      if (!attachment.url || !attachment.type) {
        return {
          statusCode: 400,
          json: { success: false, message: 'Each attachment must have url and type (image/video/file)' }
        };
      }
      if (!['image', 'video', 'file'].includes(attachment.type)) {
        return {
          statusCode: 400,
          json: { success: false, message: 'Attachment type must be one of: image, video, file' }
        };
      }
    }
  }

  const bugReport = await BugReport.create({
    userId: user._id,
    title: title.trim(),
    description: description.trim(),
    severity: severity || 'medium',
    deviceInfo: deviceInfo || '',
    browserInfo: browserInfo || '',
    osInfo: osInfo || '',
    appVersion: appVersion || '',
    stepsToReproduce: stepsToReproduce ? stepsToReproduce.trim() : '',
    expectedBehavior: expectedBehavior ? expectedBehavior.trim() : '',
    actualBehavior: actualBehavior ? actualBehavior.trim() : '',
    attachments: attachments || []
  });

  const userInfo = {
    id: user._id.toString(),
    firstName: user.profile?.name?.first,
    lastName: user.profile?.name?.last,
    name: user.profile?.name?.full,
    email: user.profile?.email,
    profileImage: user.profile?.profileImage
  };

  return {
    statusCode: 201,
    json: {
      success: true,
      message: 'Bug report submitted successfully',
      data: {
        bugReport: {
          id: bugReport._id.toString(),
          userId: user._id.toString(),
          user: userInfo,
          title: bugReport.title,
          description: bugReport.description,
          severity: bugReport.severity,
          status: bugReport.status,
          deviceInfo: bugReport.deviceInfo,
          browserInfo: bugReport.browserInfo,
          osInfo: bugReport.osInfo,
          appVersion: bugReport.appVersion,
          stepsToReproduce: bugReport.stepsToReproduce,
          expectedBehavior: bugReport.expectedBehavior,
          actualBehavior: bugReport.actualBehavior,
          attachments: bugReport.attachments,
          adminResponse: bugReport.adminResponse,
          resolvedAt: bugReport.resolvedAt,
          createdAt: bugReport.createdAt,
          updatedAt: bugReport.updatedAt
        }
      }
    }
  };
}

async function getMyBugReports(user, query) {
  const page = parseInt(query?.page) || 1;
  const limit = parseInt(query?.limit) || 10;
  const skip = (page - 1) * limit;
  const status = query?.status;
  const severity = query?.severity;

  const findQuery = { userId: user._id };
  if (status && BUG_STATUS.includes(status)) findQuery.status = status;
  if (severity && BUG_SEVERITY.includes(severity)) findQuery.severity = severity;

  const bugReports = await BugReport.find(findQuery)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const totalReports = await BugReport.countDocuments(findQuery);

  const userInfo = {
    id: user._id.toString(),
    firstName: user.profile?.name?.first,
    lastName: user.profile?.name?.last,
    name: user.profile?.name?.full,
    email: user.profile?.email,
    profileImage: user.profile?.profileImage
  };

  const totalPages = Math.ceil(totalReports / limit);

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Bug reports retrieved successfully',
      data: {
        user: userInfo,
        bugReports: bugReports.map((report) => ({
          id: report._id.toString(),
          userId: report.userId.toString(),
          user: userInfo,
          title: report.title,
          description: report.description,
          severity: report.severity,
          status: report.status,
          deviceInfo: report.deviceInfo,
          browserInfo: report.browserInfo,
          osInfo: report.osInfo,
          appVersion: report.appVersion,
          stepsToReproduce: report.stepsToReproduce,
          expectedBehavior: report.expectedBehavior,
          actualBehavior: report.actualBehavior,
          attachments: report.attachments,
          adminResponse: report.adminResponse,
          resolvedAt: report.resolvedAt,
          createdAt: report.createdAt,
          updatedAt: report.updatedAt
        })),
        pagination: {
          currentPage: page,
          totalPages,
          totalReports,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    }
  };
}

async function getBugReportById(user, id) {
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return { statusCode: 400, json: { success: false, message: 'Invalid bug report ID' } };
  }

  const bugReport = await BugReport.findById(id).lean();
  if (!bugReport) {
    return { statusCode: 404, json: { success: false, message: 'Bug report not found' } };
  }
  if (bugReport.userId.toString() !== user._id.toString()) {
    return {
      statusCode: 403,
      json: { success: false, message: 'You do not have permission to view this bug report' }
    };
  }

  const userInfo = {
    id: user._id.toString(),
    firstName: user.profile?.name?.first,
    lastName: user.profile?.name?.last,
    name: user.profile?.name?.full,
    email: user.profile?.email,
    profileImage: user.profile?.profileImage
  };

  return {
    statusCode: 200,
    json: {
      success: true,
      message: 'Bug report retrieved successfully',
      data: {
        bugReport: {
          id: bugReport._id.toString(),
          userId: bugReport.userId.toString(),
          user: userInfo,
          title: bugReport.title,
          description: bugReport.description,
          severity: bugReport.severity,
          status: bugReport.status,
          deviceInfo: bugReport.deviceInfo,
          browserInfo: bugReport.browserInfo,
          osInfo: bugReport.osInfo,
          appVersion: bugReport.appVersion,
          stepsToReproduce: bugReport.stepsToReproduce,
          expectedBehavior: bugReport.expectedBehavior,
          actualBehavior: bugReport.actualBehavior,
          attachments: bugReport.attachments,
          adminResponse: bugReport.adminResponse,
          resolvedAt: bugReport.resolvedAt,
          createdAt: bugReport.createdAt,
          updatedAt: bugReport.updatedAt
        }
      }
    }
  };
}

module.exports = {
  createBugReport,
  getMyBugReports,
  getBugReportById
};

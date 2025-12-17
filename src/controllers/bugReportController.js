const { BugReport, BUG_SEVERITY, BUG_STATUS } = require('../models/BugReport');
const User = require('../models/User');
const mongoose = require('mongoose');

// Create a new bug report
const createBugReport = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
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
        } = req.body;

        // Validate required fields
        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Title is required'
            });
        }

        if (title.length > 200) {
            return res.status(400).json({
                success: false,
                message: 'Title must be 200 characters or less'
            });
        }

        if (!description || typeof description !== 'string' || description.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Description is required'
            });
        }

        if (description.length > 5000) {
            return res.status(400).json({
                success: false,
                message: 'Description must be 5000 characters or less'
            });
        }

        // Validate severity if provided
        if (severity && !BUG_SEVERITY.includes(severity)) {
            return res.status(400).json({
                success: false,
                message: `Invalid severity. Must be one of: ${BUG_SEVERITY.join(', ')}`
            });
        }

        // Validate attachments if provided
        if (attachments && Array.isArray(attachments)) {
            for (const attachment of attachments) {
                if (!attachment.url || !attachment.type) {
                    return res.status(400).json({
                        success: false,
                        message: 'Each attachment must have url and type (image/video/file)'
                    });
                }
                if (!['image', 'video', 'file'].includes(attachment.type)) {
                    return res.status(400).json({
                        success: false,
                        message: 'Attachment type must be one of: image, video, file'
                    });
                }
            }
        }

        // Create the bug report
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

        // Populate user info for response
        const userInfo = {
            id: user._id.toString(),
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.name,
            email: user.email,
            profileImage: user.profileImage
        };

        return res.status(201).json({
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
        });

    } catch (error) {
        console.error('Create bug report error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to submit bug report',
            error: error.message
        });
    }
};

// Get bug reports for the authenticated user
const getMyBugReports = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const status = req.query.status; // Optional filter by status
        const severity = req.query.severity; // Optional filter by severity

        // Build query
        const query = { userId: user._id };
        if (status && BUG_STATUS.includes(status)) {
            query.status = status;
        }
        if (severity && BUG_SEVERITY.includes(severity)) {
            query.severity = severity;
        }

        // Get bug reports
        const bugReports = await BugReport.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        // Get total count for pagination
        const totalReports = await BugReport.countDocuments(query);

        // Get user info
        const userInfo = {
            id: user._id.toString(),
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.name,
            email: user.email,
            profileImage: user.profileImage
        };

        return res.status(200).json({
            success: true,
            message: 'Bug reports retrieved successfully',
            data: {
                user: userInfo,
                bugReports: bugReports.map(report => ({
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
                    totalPages: Math.ceil(totalReports / limit),
                    totalReports: totalReports,
                    hasNextPage: page < Math.ceil(totalReports / limit),
                    hasPrevPage: page > 1
                }
            }
        });

    } catch (error) {
        console.error('Get my bug reports error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve bug reports',
            error: error.message
        });
    }
};

// Get a specific bug report by ID (only if user owns it)
const getBugReportById = async (req, res) => {
    try {
        const user = req.user; // From protect middleware
        const { id } = req.params;

        // Validate bug report ID
        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid bug report ID'
            });
        }

        // Find the bug report
        const bugReport = await BugReport.findById(id);

        if (!bugReport) {
            return res.status(404).json({
                success: false,
                message: 'Bug report not found'
            });
        }

        // Check if user owns this bug report
        if (bugReport.userId.toString() !== user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to view this bug report'
            });
        }

        // Get user info
        const userInfo = {
            id: user._id.toString(),
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.name,
            email: user.email,
            profileImage: user.profileImage
        };

        return res.status(200).json({
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
        });

    } catch (error) {
        console.error('Get bug report by ID error:', error);
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


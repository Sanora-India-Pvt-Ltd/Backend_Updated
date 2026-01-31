/**
 * User report business logic. Returns { statusCode, json } or throws { statusCode, json }.
 */

const UserReport = require('../../models/social/UserReport');
const User = require('../../models/authorization/User');

const validReasons = {
    under_18: 'Problem involving someone under 18',
    bullying_harassment_abuse: 'Bullying, harassment or abuse',
    suicide_self_harm: 'Suicide or self-harm',
    violent_hateful_disturbing: 'Violent, hateful or disturbing content',
    restricted_items: 'Selling or promoting restricted items',
    adult_content: 'Adult content',
    scam_fraud_false_info: 'Scam, fraud or false information',
    fake_profile: 'Fake profile',
    intellectual_property: 'Intellectual property',
    other: 'Something else'
};

function getReportReasons() {
    const reasons = Object.entries(validReasons).map(([value, label]) => ({ value, label }));
    return { statusCode: 200, json: { success: true, data: { reasons } } };
}

async function reportUser(reporterId, reportedUserId, body) {
    try {
        const { reason, description } = body;

        if (!reason) {
            return {
                statusCode: 400,
                json: {
                    success: false,
                    message: 'Report reason is required',
                    validReasons: Object.entries(validReasons).map(([value, label]) => ({ value, label }))
                }
            };
        }

        if (!validReasons[reason]) {
            return {
                statusCode: 400,
                json: {
                    success: false,
                    message: 'Invalid report reason',
                    validReasons: Object.entries(validReasons).map(([value, label]) => ({ value, label }))
                }
            };
        }

        if (reason === 'other' && (!description || description.trim().length === 0)) {
            return {
                statusCode: 400,
                json: {
                    success: false,
                    message: 'Description is required when selecting "Something else"',
                    field: 'description'
                }
            };
        }

        if (reportedUserId === reporterId.toString()) {
            return { statusCode: 400, json: { success: false, message: 'You cannot report yourself' } };
        }

        const reportedUser = await User.findById(reportedUserId).select('_id isActive');
        if (!reportedUser) {
            return { statusCode: 404, json: { success: false, message: 'User not found' } };
        }

        if (reportedUser.isActive === false) {
            return { statusCode: 400, json: { success: false, message: 'Cannot report a deactivated user' } };
        }

        const existingReport = await UserReport.findOne({
            reporter: reporterId,
            reportedUser: reportedUserId
        });

        if (existingReport) {
            return {
                statusCode: 400,
                json: {
                    success: false,
                    message: 'You have already reported this user',
                    reportId: existingReport._id
                }
            };
        }

        const report = new UserReport({
            reporter: reporterId,
            reportedUser: reportedUserId,
            reason,
            description: description?.trim() || undefined
        });
        await report.save();

        const similarReportsCount = await UserReport.countDocuments({
            reportedUser: reportedUserId,
            reason: report.reason,
            _id: { $ne: report._id }
        });

        const AUTO_ACTION_THRESHOLD = 2;
        const requiresAction = similarReportsCount + 1 >= AUTO_ACTION_THRESHOLD;

        if (requiresAction) {
            console.log(`User ${reportedUserId} has received ${similarReportsCount + 1} reports for ${report.reason}. Action may be required.`);
        }

        return {
            statusCode: 201,
            json: {
                success: true,
                message: 'Report submitted successfully',
                data: {
                    reportId: report._id,
                    requiresAction,
                    totalSimilarReports: similarReportsCount + 1,
                    actionThreshold: AUTO_ACTION_THRESHOLD
                }
            }
        };
    } catch (error) {
        if (error.code === 11000) {
            return {
                statusCode: 400,
                json: { success: false, message: 'You have already reported this user' }
            };
        }
        console.error('Report error:', error);
        return {
            statusCode: 500,
            json: {
                success: false,
                message: 'Error submitting report',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            }
        };
    }
}

async function getUserReports(queryParams) {
    try {
        const { page = 1, limit = 20, status } = queryParams;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = {};
        if (status) query.status = status;

        const [reports, total] = await Promise.all([
            UserReport.find(query)
                .populate('reporter', 'username profilePicture')
                .populate('reportedUser', 'username profilePicture')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            UserReport.countDocuments(query)
        ]);

        return {
            statusCode: 200,
            json: {
                success: true,
                data: {
                    reports,
                    pagination: {
                        total,
                        page: parseInt(page),
                        pages: Math.ceil(total / parseInt(limit)),
                        limit: parseInt(limit)
                    }
                }
            }
        };
    } catch (error) {
        console.error('Error getting user reports:', error);
        return {
            statusCode: 500,
            json: {
                success: false,
                message: 'Error retrieving user reports',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            }
        };
    }
}

async function updateReportStatus(reportId, body) {
    try {
        const { status, adminNotes } = body;

        if (!['pending', 'reviewed', 'action_taken', 'dismissed'].includes(status)) {
            return {
                statusCode: 400,
                json: {
                    success: false,
                    message: 'Invalid status. Must be one of: pending, reviewed, action_taken, dismissed'
                }
            };
        }

        const report = await UserReport.findById(reportId);
        if (!report) {
            return { statusCode: 404, json: { success: false, message: 'Report not found' } };
        }

        report.status = status;
        if (adminNotes) report.adminNotes = adminNotes;
        await report.save();

        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Report status updated successfully',
                data: { report }
            }
        };
    } catch (error) {
        console.error('Error updating report status:', error);
        return {
            statusCode: 500,
            json: {
                success: false,
                message: 'Error updating report status',
                error: process.env.NODE_ENV === 'development' ? error.message : undefined
            }
        };
    }
}

module.exports = {
    getReportReasons,
    reportUser,
    getUserReports,
    updateReportStatus
};

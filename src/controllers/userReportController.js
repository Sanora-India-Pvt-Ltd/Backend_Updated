const UserReport = require('../models/UserReport');
const User = require('../models/User');

// Define valid report reasons with user-friendly messages
const validReasons = {
  'under_18': 'Problem involving someone under 18',
  'bullying_harassment_abuse': 'Bullying, harassment or abuse',
  'suicide_self_harm': 'Suicide or self-harm',
  'violent_hateful_disturbing': 'Violent, hateful or disturbing content',
  'restricted_items': 'Selling or promoting restricted items',
  'adult_content': 'Adult content',
  'scam_fraud_false_info': 'Scam, fraud or false information',
  'fake_profile': 'Fake profile',
  'intellectual_property': 'Intellectual property',
  'other': 'Something else'
};

// Get available report reasons
const getReportReasons = (req, res) => {
  try {
    const reasons = Object.entries(validReasons).map(([value, label]) => ({
      value,
      label
    }));

    res.status(200).json({
      success: true,
      data: { reasons }
    });
  } catch (error) {
    console.error('Error getting report reasons:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving report reasons',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Report a user
const reportUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, description } = req.body;
    const reporterId = req.user._id;

    // Validate required fields
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Report reason is required',
        validReasons: Object.entries(validReasons).map(([value, label]) => ({
          value,
          label
        }))
      });
    }

    // Validate reason
    if (!validReasons[reason]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid report reason',
        validReasons: Object.entries(validReasons).map(([value, label]) => ({
          value,
          label
        }))
      });
    }

    // Validate description if reason is 'other'
    if (reason === 'other' && (!description || description.trim().length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Description is required when selecting "Something else"',
        field: 'description'
      });
    }

    // Prevent self-reporting
    if (userId === reporterId.toString()) {
      return res.status(400).json({ 
        success: false, 
        message: 'You cannot report yourself' 
      });
    }

    // Check if reported user exists
    const reportedUser = await User.findById(userId).select('_id isActive');
    if (!reportedUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Check if user is active
    if (reportedUser.isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'Cannot report a deactivated user'
      });
    }

    // Check for existing report from same user
    const existingReport = await UserReport.findOne({
      reporter: reporterId,
      reportedUser: userId
    });

    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this user',
        reportId: existingReport._id
      });
    }

    // Create and save report
    const report = new UserReport({
      reporter: reporterId,
      reportedUser: userId,
      reason,
      description: description?.trim() || undefined
    });

    await report.save();

    // Get count of similar reports for this user
    const similarReportsCount = await UserReport.countDocuments({
      reportedUser: userId,
      reason: report.reason,
      _id: { $ne: report._id } // Exclude current report
    });

    // Check if we've reached the threshold for auto-action (e.g., 2 reports)
    const AUTO_ACTION_THRESHOLD = 2;
    const requiresAction = similarReportsCount + 1 >= AUTO_ACTION_THRESHOLD;

    if (requiresAction) {
      // Here you can add logic to take automatic action
      // For example, temporarily suspending the reported user
      // or flagging for admin review
      console.log(`User ${userId} has received ${similarReportsCount + 1} reports for ${report.reason}. Action may be required.`);
    }

    res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      data: {
        reportId: report._id,
        requiresAction,
        totalSimilarReports: similarReportsCount + 1,
        actionThreshold: AUTO_ACTION_THRESHOLD
      }
    });

  } catch (error) {
    console.error('Report error:', error);
    
    // Handle duplicate key error (unique index on reporter + reportedUser)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this user'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error submitting report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get reports for the currently logged-in user (admin only)
const getUserReports = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (status) {
      query.status = status;
    }

    const [reports, total] = await Promise.all([
      UserReport.find(query)
        .populate('reporter', 'username profilePicture')
        .populate('reportedUser', 'username profilePicture')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      UserReport.countDocuments(query)
    ]);

    res.status(200).json({
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
    });
  } catch (error) {
    console.error('Error getting user reports:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving user reports',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update report status (admin only)
const updateReportStatus = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { status, adminNotes } = req.body;

    if (!['pending', 'reviewed', 'action_taken', 'dismissed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: pending, reviewed, action_taken, dismissed'
      });
    }

    const report = await UserReport.findById(reportId);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    report.status = status;
    if (adminNotes) {
      report.adminNotes = adminNotes;
    }

    await report.save();

    res.status(200).json({
      success: true,
      message: 'Report status updated successfully',
      data: { report }
    });
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating report status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  reportUser,
  getReportReasons,
  getUserReports,
  updateReportStatus
};
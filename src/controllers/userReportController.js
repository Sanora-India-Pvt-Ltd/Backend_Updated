const UserReport = require('../models/UserReport');
const User = require('../models/User');

// Report a user
const reportUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, description } = req.body;
    const reporterId = req.user._id;

    // Basic validation
    if (!reason) {
      return res.status(400).json({ 
        success: false, 
        message: 'Reason is required' 
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
    const userExists = await User.exists({ _id: userId });
    if (!userExists) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Create and save report
    const report = new UserReport({
      reporter: reporterId,
      reportedUser: userId,
      reason,
      description: description || undefined
    });

    await report.save();

    res.status(201).json({
      success: true,
      message: 'Report submitted successfully',
      reportId: report._id
    });

  } catch (error) {
    console.error('Report error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error submitting report',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  reportUser
};
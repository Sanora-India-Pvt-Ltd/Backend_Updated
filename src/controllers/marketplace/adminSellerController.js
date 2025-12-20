const SellerApplication = require('../../models/marketplace/SellerApplication');
const User = require('../../models/User');
const mongoose = require('mongoose');

const approveSeller = async (req, res) => {
    try {
        const { userId } = req.params;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID'
            });
        }

        const application = await SellerApplication.findOne({ userId });
        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Seller application not found'
            });
        }

        if (application.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Cannot approve application with status: ${application.status}`
            });
        }

        application.status = 'approved';
        application.reviewedAt = new Date();
        await application.save();

        await User.findByIdAndUpdate(userId, {
            'marketplace.sellerStatus': 'approved',
            'marketplace.sellerSince': new Date()
        });

        return res.status(200).json({
            success: true,
            status: 'approved'
        });
    } catch (error) {
        console.error('Approve seller error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to approve seller application',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const rejectSeller = async (req, res) => {
    try {
        const { userId } = req.params;
        const { remarks } = req.body;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid user ID'
            });
        }

        const application = await SellerApplication.findOne({ userId });
        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Seller application not found'
            });
        }

        if (application.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: `Cannot reject application with status: ${application.status}`
            });
        }

        application.status = 'rejected';
        if (remarks) {
            application.remarks = remarks.trim();
        }
        application.reviewedAt = new Date();
        await application.save();

        await User.findByIdAndUpdate(userId, {
            'marketplace.sellerStatus': 'rejected'
        });

        return res.status(200).json({
            success: true,
            status: 'rejected'
        });
    } catch (error) {
        console.error('Reject seller error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to reject seller application',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    approveSeller,
    rejectSeller
};


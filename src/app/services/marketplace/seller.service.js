/**
 * Seller domain: apply, get status (user); approve, reject (admin). Returns { statusCode, json }.
 */

const SellerApplication = require('../../../models/marketplace/SellerApplication');
const User = require('../../../models/authorization/User');
const mongoose = require('mongoose');

async function applySeller(userId, user, body) {
    try {
        const { storeName, documents } = body;

        if (!storeName || !storeName.trim()) {
            return { statusCode: 400, json: { success: false, message: 'Store name is required' } };
        }
        if (!documents || !documents.pan || !documents.pan.trim()) {
            return { statusCode: 400, json: { success: false, message: 'PAN document is required' } };
        }

        const currentStatus = user.marketplace?.sellerStatus || 'none';
        if (currentStatus !== 'none') {
            return { statusCode: 400, json: { success: false, message: `You already have a seller application. Current status: ${currentStatus}` } };
        }

        const existingApplication = await SellerApplication.findOne({ userId });
        if (existingApplication) {
            return { statusCode: 400, json: { success: false, message: 'You already have a seller application' } };
        }

        await SellerApplication.create({
            userId,
            storeName: storeName.trim(),
            documents: {
                pan: documents.pan.trim(),
                gst: documents.gst ? documents.gst.trim() : undefined,
                bank: documents.bank || undefined
            },
            status: 'pending'
        });

        await User.findByIdAndUpdate(userId, { 'marketplace.sellerStatus': 'pending' });

        return { statusCode: 201, json: { success: true, status: 'pending' } };
    } catch (error) {
        console.error('Apply seller error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to submit seller application', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function getSellerStatus(user) {
    try {
        const sellerStatus = user.marketplace?.sellerStatus || 'none';
        return { statusCode: 200, json: { success: true, sellerStatus } };
    } catch (error) {
        console.error('Get seller status error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to get seller status', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function approveSeller(userIdParam) {
    try {
        const userId = userIdParam;
        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid user ID' } };
        }

        const application = await SellerApplication.findOne({ userId });
        if (!application) {
            return { statusCode: 404, json: { success: false, message: 'Seller application not found' } };
        }
        if (application.status !== 'pending') {
            return { statusCode: 400, json: { success: false, message: `Cannot approve application with status: ${application.status}` } };
        }

        application.status = 'approved';
        application.reviewedAt = new Date();
        await application.save();

        await User.findByIdAndUpdate(userId, {
            'marketplace.sellerStatus': 'approved',
            'marketplace.sellerSince': new Date()
        });

        return { statusCode: 200, json: { success: true, status: 'approved' } };
    } catch (error) {
        console.error('Approve seller error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to approve seller application', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

async function rejectSeller(userIdParam, body) {
    try {
        const userId = userIdParam;
        const { remarks } = body || {};

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return { statusCode: 400, json: { success: false, message: 'Invalid user ID' } };
        }

        const application = await SellerApplication.findOne({ userId });
        if (!application) {
            return { statusCode: 404, json: { success: false, message: 'Seller application not found' } };
        }
        if (application.status !== 'pending') {
            return { statusCode: 400, json: { success: false, message: `Cannot reject application with status: ${application.status}` } };
        }

        application.status = 'rejected';
        if (remarks) application.remarks = remarks.trim();
        application.reviewedAt = new Date();
        await application.save();

        await User.findByIdAndUpdate(userId, { 'marketplace.sellerStatus': 'rejected' });

        return { statusCode: 200, json: { success: true, status: 'rejected' } };
    } catch (error) {
        console.error('Reject seller error:', error);
        return { statusCode: 500, json: { success: false, message: 'Failed to reject seller application', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

module.exports = {
    applySeller,
    getSellerStatus,
    approveSeller,
    rejectSeller
};

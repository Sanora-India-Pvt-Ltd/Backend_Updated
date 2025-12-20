const SellerApplication = require('../../models/marketplace/SellerApplication');
const User = require('../../models/User');

const applySeller = async (req, res) => {
    try {
        const userId = req.user._id;
        const { storeName, documents } = req.body;

        if (!storeName || !storeName.trim()) {
            return res.status(400).json({
                success: false,
                message: 'Store name is required'
            });
        }

        if (!documents || !documents.pan || !documents.pan.trim()) {
            return res.status(400).json({
                success: false,
                message: 'PAN document is required'
            });
        }

        const currentStatus = req.user.marketplace?.sellerStatus || 'none';
        if (currentStatus !== 'none') {
            return res.status(400).json({
                success: false,
                message: `You already have a seller application. Current status: ${currentStatus}`
            });
        }

        const existingApplication = await SellerApplication.findOne({ userId });
        if (existingApplication) {
            return res.status(400).json({
                success: false,
                message: 'You already have a seller application'
            });
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

        await User.findByIdAndUpdate(userId, {
            'marketplace.sellerStatus': 'pending'
        });

        return res.status(201).json({
            success: true,
            status: 'pending'
        });
    } catch (error) {
        console.error('Apply seller error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to submit seller application',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

const getSellerStatus = async (req, res) => {
    try {
        const sellerStatus = req.user.marketplace?.sellerStatus || 'none';

        return res.status(200).json({
            success: true,
            sellerStatus
        });
    } catch (error) {
        console.error('Get seller status error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get seller status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

module.exports = {
    applySeller,
    getSellerStatus
};


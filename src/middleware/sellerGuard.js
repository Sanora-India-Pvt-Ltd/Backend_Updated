const sellerGuard = (req, res, next) => {
    // Allow universities to bypass seller approval check
    if (req.universityId) {
        return next();
    }

    // For users, check seller status
    const sellerStatus = req.user?.marketplace?.sellerStatus || 'none';

    if (sellerStatus !== 'approved') {
        return res.status(403).json({
            success: false,
            message: 'Seller account not approved'
        });
    }

    next();
};

module.exports = sellerGuard;
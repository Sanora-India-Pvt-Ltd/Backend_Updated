const Notification = require('../../models/notification/Notification');
const mongoose = require('mongoose');
const { getCategoryMeta } = require('../../utils/notificationCategoryMeta');
const { NOTIFICATION_CATEGORIES } = require('../../constants/notificationCategories');

/**
 * Get user's notifications (paginated)
 * GET /api/notifications
 * 
 * Query params:
 * - page (default: 1)
 * - limit (default: 20, max: 50)
 * - unreadOnly (boolean, optional)
 * - category (optional) - Filter by category (e.g., 'COURSE', 'SYSTEM')
 */
const getMyNotifications = async (req, res) => {
    try {
        // Detect recipient from flexibleAuth
        let recipientId, recipientType;
        
        if (req.user && req.userId) {
            recipientId = req.userId;
            recipientType = 'USER';
        } else if (req.universityId) {
            recipientId = req.universityId;
            recipientType = 'UNIVERSITY';
        } else {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Parse query parameters
        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
        const skip = (page - 1) * limit;
        const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === true;
        const { category } = req.query;

        // Build query
        const query = {
            recipientId,
            recipientType
        };

        // Add unread filter if requested
        if (unreadOnly) {
            query.isRead = false;
        }

        // Add category filter ONLY if valid
        if (category && NOTIFICATION_CATEGORIES.includes(category.toUpperCase())) {
            query.category = category.toUpperCase();
        }

        // Fetch notifications (using compound index for performance)
        const [notifications, totalCount] = await Promise.all([
            Notification.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Notification.countDocuments(query)
        ]);

        // Enrich notifications with category metadata
        const enrichedNotifications = notifications.map(notification => {
            const categoryMeta = getCategoryMeta(notification.category || 'SYSTEM');
            return {
                ...notification,
                categoryMeta
            };
        });

        // Calculate pagination metadata
        const totalPages = Math.ceil(totalCount / limit);
        const hasNextPage = page < totalPages;
        const hasPrevPage = page > 1;

        return res.status(200).json({
            success: true,
            message: 'Notifications retrieved successfully',
            data: {
                notifications: enrichedNotifications,
                pagination: {
                    currentPage: page,
                    limit,
                    totalCount,
                    totalPages,
                    hasNextPage,
                    hasPrevPage
                }
            }
        });

    } catch (error) {
        console.error('Get notifications error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve notifications',
            error: error.message
        });
    }
};

/**
 * Get unread notification count
 * GET /api/notifications/unread-count
 */
const getUnreadCount = async (req, res) => {
    try {
        // Detect recipient from flexibleAuth
        let recipientId, recipientType;
        
        if (req.user && req.userId) {
            recipientId = req.userId;
            recipientType = 'USER';
        } else if (req.universityId) {
            recipientId = req.universityId;
            recipientType = 'UNIVERSITY';
        } else {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Count unread notifications (using compound index)
        const unreadCount = await Notification.countDocuments({
            recipientId,
            recipientType,
            isRead: false
        });

        return res.status(200).json({
            success: true,
            message: 'Unread count retrieved successfully',
            data: {
                unreadCount
            }
        });

    } catch (error) {
        console.error('Get unread count error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve unread count',
            error: error.message
        });
    }
};

/**
 * Mark a single notification as read
 * PUT /api/notifications/:notificationId/read
 */
const markAsRead = async (req, res) => {
    try {
        const { notificationId } = req.params;

        // Validate notification ID
        if (!mongoose.Types.ObjectId.isValid(notificationId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid notification ID'
            });
        }

        // Detect recipient from flexibleAuth
        let recipientId, recipientType;
        
        if (req.user && req.userId) {
            recipientId = req.userId;
            recipientType = 'USER';
        } else if (req.universityId) {
            recipientId = req.universityId;
            recipientType = 'UNIVERSITY';
        } else {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Find notification by ID first
        const notification = await Notification.findById(notificationId);

        if (!notification) {
            return res.status(404).json({
                success: false,
                message: 'Notification not found'
            });
        }

        // Verify ownership - return 403 if belongs to someone else
        if (
            notification.recipientId.toString() !== recipientId.toString() ||
            notification.recipientType !== recipientType
        ) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to mark this notification as read'
            });
        }

        // Mark as read (idempotent - already read is still success)
        if (!notification.isRead) {
            notification.isRead = true;
            notification.readAt = new Date();
            await notification.save();
        }

        return res.status(200).json({
            success: true,
            message: 'Notification marked as read'
        });

    } catch (error) {
        console.error('Mark as read error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to mark notification as read',
            error: error.message
        });
    }
};

/**
 * Mark all notifications as read
 * PUT /api/notifications/read-all
 */
const markAllAsRead = async (req, res) => {
    try {
        // Detect recipient from flexibleAuth
        let recipientId, recipientType;
        
        if (req.user && req.userId) {
            recipientId = req.userId;
            recipientType = 'USER';
        } else if (req.universityId) {
            recipientId = req.universityId;
            recipientType = 'UNIVERSITY';
        } else {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Update all unread notifications
        const result = await Notification.updateMany(
            {
                recipientId,
                recipientType,
                isRead: false
            },
            {
                $set: {
                    isRead: true,
                    readAt: new Date()
                }
            }
        );

        return res.status(200).json({
            success: true,
            message: 'All notifications marked as read',
            data: {
                updatedCount: result.modifiedCount
            }
        });

    } catch (error) {
        console.error('Mark all as read error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to mark all notifications as read',
            error: error.message
        });
    }
};

/**
 * Mark all notifications of a specific category as read
 * PUT /api/notifications/read-category
 */
const markCategoryAsRead = async (req, res) => {
    try {
        // Extract category from request body
        const { category } = req.body;

        // Validate category is provided
        if (!category) {
            return res.status(400).json({
                success: false,
                message: 'Category is required'
            });
        }

        // Normalize category to uppercase
        const categoryUpper = category.toUpperCase();

        // Validate category against allowed categories
        if (!NOTIFICATION_CATEGORIES.includes(categoryUpper)) {
            return res.status(400).json({
                success: false,
                message: `Invalid category. Allowed categories: ${NOTIFICATION_CATEGORIES.join(', ')}`
            });
        }

        // Detect recipient from flexibleAuth
        let recipientId, recipientType;
        
        if (req.user && req.userId) {
            recipientId = req.userId;
            recipientType = 'USER';
        } else if (req.universityId) {
            recipientId = req.universityId;
            recipientType = 'UNIVERSITY';
        } else {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Update all unread notifications of the specified category
        const result = await Notification.updateMany(
            {
                recipientId,
                recipientType,
                category: categoryUpper,
                isRead: false
            },
            {
                $set: {
                    isRead: true,
                    readAt: new Date()
                }
            }
        );

        return res.status(200).json({
            success: true,
            message: 'Category notifications marked as read',
            data: {
                category: categoryUpper,
                updatedCount: result.modifiedCount
            }
        });

    } catch (error) {
        console.error('Mark category as read error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to mark category notifications as read',
            error: error.message
        });
    }
};

module.exports = {
    getMyNotifications,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    markCategoryAsRead
};

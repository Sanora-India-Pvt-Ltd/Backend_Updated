/**
 * Product Analytics Service
 * Handles product view, click, and purchase attribution tracking
 * All operations are non-blocking and safe to fail
 * 
 * USAGE EXAMPLE (in order creation handler):
 * 
 * const { trackPurchaseAttribution } = require('./services/analytics/productAnalyticsService');
 * 
 * // After order is successfully created:
 * trackPurchaseAttribution({
 *     userId: order.userId,
 *     orderId: order._id,
 *     products: order.items.map(item => ({
 *         productId: item.productId,
 *         videoId: item.videoId // Optional, will be found automatically if not provided
 *     })),
 *     courseId: order.courseId // Optional, will be inferred from video if not provided
 * }).catch(err => {
 *     console.error('Purchase attribution failed:', err);
 *     // Don't throw - attribution failure shouldn't break order creation
 * });
 */

const Video = require('../../models/course/Video');
const ProductPurchaseAttribution = require('../../models/analytics/ProductPurchaseAttribution');

/**
 * Track purchase attribution when order is created
 * This should be called after order is successfully created
 * 
 * @param {Object} params
 * @param {string} params.userId - User who made the purchase
 * @param {string} params.orderId - Order ID
 * @param {Array} params.products - Array of { productId, videoId? }
 * @param {string} params.courseId - Course ID (optional, inferred from video if not provided)
 * 
 * @returns {Promise<void>}
 */
const trackPurchaseAttribution = async ({ userId, orderId, products, courseId = null }) => {
    try {
        if (!userId || !orderId || !products || !Array.isArray(products)) {
            console.warn('Invalid parameters for purchase attribution tracking');
            return;
        }

        for (const item of products) {
            const { productId, videoId } = item;

            if (!productId) {
                continue; // Skip if no product ID
            }

            // Find video that has this product attached
            let video = null;
            let finalCourseId = courseId;

            if (videoId) {
                // Video ID provided directly
                video = await Video.findById(videoId);
                if (video) {
                    finalCourseId = video.courseId;
                }
            } else {
                // Find video by attached product
                video = await Video.findOne({ attachedProductId: productId });
                if (video) {
                    finalCourseId = video.courseId;
                }
            }

            // Only track if product is linked to a video
            if (!video || !finalCourseId) {
                continue; // Product not attached to any video, skip attribution
            }

            // Check if attribution already exists (idempotency)
            const existingAttribution = await ProductPurchaseAttribution.findOne({
                orderId,
                productId
            });

            if (existingAttribution) {
                // Already attributed - skip to prevent double counting
                continue;
            }

            // Create attribution record
            try {
                await ProductPurchaseAttribution.create({
                    userId,
                    courseId: finalCourseId,
                    videoId: video._id,
                    productId,
                    orderId
                });

                // Increment purchase count on video (non-blocking)
                Video.findByIdAndUpdate(
                    video._id,
                    { $inc: { 'productAnalytics.purchases': 1 } },
                    { new: false }
                ).catch(err => {
                    console.error('Error incrementing purchase count:', err);
                });

                console.log(`✅ Purchase attribution tracked: Order ${orderId}, Product ${productId}, Video ${video._id}`);
            } catch (error) {
                // Handle unique index violation (race condition)
                if (error.code === 11000) {
                    console.log(`⏭️  Attribution already exists for order ${orderId}, product ${productId}`);
                } else {
                    throw error;
                }
            }
        }
    } catch (error) {
        console.error('Error tracking purchase attribution:', error);
        // Don't throw - attribution failure shouldn't break order creation
    }
};

module.exports = {
    trackPurchaseAttribution
};


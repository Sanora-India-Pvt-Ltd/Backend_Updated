const Like = require('../../models/social/Like');
const Post = require('../../models/social/Post');
const Reel = require('../../models/social/Reel');
const mongoose = require('mongoose');

// Reaction types and their indices in the likes array
const REACTION_TYPES = {
    happy: 0,
    sad: 1,
    angry: 2,
    hug: 3,
    wow: 4,
    like: 5
};

// Helper to handle like operations
const handleLike = async (contentType, contentId, userId, reaction = 'like') => {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
        // Check if content exists
        const contentModel = contentType === 'post' ? Post : Reel;
        const contentExists = await contentModel.exists({ _id: contentId }).session(session);
        if (!contentExists) {
            throw new Error(`${contentType} not found`);
        }

        // Find or create like document
        let likeDoc = await Like.findOneAndUpdate(
            { content: contentType, contentId },
            { $setOnInsert: { likes: [[], [], [], [], [], []] } },
            { 
                upsert: true, 
                new: true,
                session 
            }
        );

        // Convert user ID to string for comparison
        const userIdStr = userId.toString();
        const reactionIndex = REACTION_TYPES[reaction] ?? 5; // Default to 'like' if invalid
        let action = 'liked';
        
        // Check for existing reaction
        let existingReaction = null;
        let existingIndex = -1;
        
        // Find if user has already reacted
        for (let i = 0; i < likeDoc.likes.length; i++) {
            const index = likeDoc.likes[i].findIndex(id => id && id.toString() === userIdStr);
            if (index !== -1) {
                existingReaction = Object.keys(REACTION_TYPES)[i];
                existingIndex = i;
                break;
            }
        }

        // Prepare update operation
        const update = {};

        // If same reaction, remove it (unlike)
        if (existingReaction === reaction) {
            update.$pull = { [`likes.${reactionIndex}`]: userId };
            action = 'unliked';
        } 
        // If different reaction, update it
        else if (existingReaction) {
            // Remove from old reaction array and add to new one
            update.$pull = { [`likes.${existingIndex}`]: userId };
            update.$addToSet = { [`likes.${reactionIndex}`]: userId };
            action = 'reaction_updated';
        }
        // New reaction
        else {
            update.$addToSet = { [`likes.${reactionIndex}`]: userId };
        }

        // Apply the update
        likeDoc = await Like.findOneAndUpdate(
            { _id: likeDoc._id },
            update,
            { 
                new: true, 
                session
            }
        );

        // Manually populate user data
        const populatedLikes = await Promise.all(likeDoc.likes.map(async (userIds, index) => {
            if (!userIds || userIds.length === 0) return [];
            const users = await mongoose.model('User').find({
                _id: { $in: userIds }
            }).select('profile.name.full profile.profileImage').lean();
            return users;
        }));

        await session.commitTransaction();
        
        // Calculate total like count
        const likeCount = populatedLikes.reduce((sum, users) => sum + (users?.length || 0), 0);

        return {
            action,
            reaction: action === 'unliked' ? null : reaction,
            likeCount,
            isLiked: action !== 'unliked',
            reactions: populatedLikes
        };

    } catch (error) {
        console.error('Error in handleLike:', error);
        await session.abortTransaction();
        throw error;
    } finally {
        session.endSession();
    }
};

// Controller for post likes
exports.toggleLikePost = async (req, res) => {
    try {
        const { id } = req.params;
        const { reaction = 'like' } = req.body;
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid post ID'
            });
        }

        if (!Object.keys(REACTION_TYPES).includes(reaction)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reaction type'
            });
        }

        const result = await handleLike('post', id, userId, reaction);

        res.json({
            success: true,
            message: `Post ${result.action} successfully`,
            data: result
        });

    } catch (error) {
        console.error('Toggle like error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle like',
            error: error.message
        });
    }
};

// Controller for reel likes
exports.toggleLikeReel = async (req, res) => {
    try {
        const { id } = req.params;
        const { reaction = 'like' } = req.body;
        const userId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reel ID'
            });
        }

        if (!Object.keys(REACTION_TYPES).includes(reaction)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid reaction type'
            });
        }

        const result = await handleLike('reel', id, userId, reaction);

        res.json({
            success: true,
            message: `Reel ${result.action} successfully`,
            data: result
        });

    } catch (error) {
        console.error('Toggle like error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle like',
            error: error.message
        });
    }
};

// Get reactions for a post/reel
exports.getReactions = async (req, res) => {
    try {
        const { content, contentId } = req.params;

        if (!['post', 'reel'].includes(content)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid content type. Must be "post" or "reel"'
            });
        }

        if (!mongoose.Types.ObjectId.isValid(contentId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid content ID'
            });
        }

        const likeDoc = await Like.findOne({ content, contentId }).lean();

        // If no reactions exist yet, return empty result
        if (!likeDoc) {
            return res.json({
                success: true,
                data: {}
            });
        }

        // Manually populate user data for each reaction type
        const reactionTypes = Object.keys(REACTION_TYPES);
        const result = {};
        
        await Promise.all(likeDoc.likes.map(async (userIds, index) => {
            const reaction = reactionTypes[index];
            if (!reaction || !Array.isArray(userIds) || userIds.length === 0) {
                return;
            }

            const users = await mongoose.model('User').find({
                _id: { $in: userIds }
            }).select('profile.name.full profile.profileImage').lean();

            result[reaction] = {
                count: users.length,
                users: users.map(user => ({
                    id: user._id,
                    name: user.profile?.name?.full,
                    profileImage: user.profile?.profileImage
                }))
            };
        }));

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Get reactions error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get reactions',
            error: error.message
        });
    }
};

/**
 * Get user's reaction status for multiple posts/reels
 * This allows the frontend to check which posts the user has liked
 * POST /api/likes/my-reactions
 * Body: { content: 'post' | 'reel', contentIds: ['id1', 'id2', ...] }
 */
exports.getMyReactions = async (req, res) => {
    try {
        const userId = req.user._id;
        const { content, contentIds } = req.body;

        if (!content || !['post', 'reel'].includes(content)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid content type. Must be "post" or "reel"'
            });
        }

        if (!contentIds || !Array.isArray(contentIds) || contentIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'contentIds must be a non-empty array'
            });
        }

        // Validate all IDs are valid ObjectIds
        const validIds = contentIds.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid content IDs provided'
            });
        }

        // Find all Like documents for the given content IDs
        const likeDocs = await Like.find({
            content,
            contentId: { $in: validIds }
        }).lean();

        // Build result map: contentId -> reaction type (or null if not liked)
        const result = {};
        const reactionTypes = Object.keys(REACTION_TYPES);
        const userIdStr = userId.toString();

        // Initialize all IDs as null (not liked)
        validIds.forEach(id => {
            result[id.toString()] = null;
        });

        // Check each Like document for user's reaction
        likeDocs.forEach(likeDoc => {
            const contentIdStr = likeDoc.contentId.toString();
            
            // Check each reaction type array for the user
            for (let i = 0; i < likeDoc.likes.length; i++) {
                const userIds = likeDoc.likes[i];
                if (Array.isArray(userIds) && userIds.some(id => id && id.toString() === userIdStr)) {
                    // User has reacted with this reaction type
                    result[contentIdStr] = reactionTypes[i];
                    break; // User can only have one reaction per content
                }
            }
        });

        return res.status(200).json({
            success: true,
            message: 'User reactions retrieved successfully',
            data: {
                reactions: result
            }
        });

    } catch (error) {
        console.error('Get my reactions error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get user reactions',
            error: error.message
        });
    }
};

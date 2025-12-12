const { RateLimiterMemory } = require('rate-limiter-flexible');

// Rate limiter for sending messages (max 30 messages per minute per user)
const messageRateLimiter = new RateLimiterMemory({
    points: 30, // 30 messages
    duration: 60, // per minute
    blockDuration: 60 // block for 1 minute if exceeded
});

// Rate limiter for creating conversations (max 10 conversations per hour per user)
const conversationRateLimiter = new RateLimiterMemory({
    points: 10, // 10 conversations
    duration: 60 * 60, // per hour
    blockDuration: 60 * 60 // block for 1 hour if exceeded
});

const limitMessageRequests = async (req, res, next) => {
    try {
        const userId = req.user?._id?.toString() || req.user?.id?.toString();
        
        if (!userId) {
            return next();
        }
        
        const key = `message_${userId}`;
        await messageRateLimiter.consume(key);
        next();
    } catch (error) {
        // Check if it's a rate limit error
        if (error.remainingPoints !== undefined) {
            return res.status(429).json({
                success: false,
                message: 'Too many messages. Please wait a minute before sending more.',
                retryAfter: Math.ceil(error.msBeforeNext / 1000)
            });
        }
        // For other errors, log and continue
        console.error('Message rate limiter error:', error.message);
        next();
    }
};

const limitConversationRequests = async (req, res, next) => {
    try {
        const userId = req.user?._id?.toString() || req.user?.id?.toString();
        
        if (!userId) {
            return next();
        }
        
        const key = `conversation_${userId}`;
        await conversationRateLimiter.consume(key);
        next();
    } catch (error) {
        // Check if it's a rate limit error
        if (error.remainingPoints !== undefined) {
            return res.status(429).json({
                success: false,
                message: 'Too many conversation requests. Please wait before creating more.',
                retryAfter: Math.ceil(error.msBeforeNext / 1000)
            });
        }
        // For other errors, log and continue
        console.error('Conversation rate limiter error:', error.message);
        next();
    }
};

module.exports = {
    limitMessageRequests,
    limitConversationRequests
};



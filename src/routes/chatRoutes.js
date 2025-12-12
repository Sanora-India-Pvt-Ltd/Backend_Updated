const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { limitMessageRequests, limitConversationRequests } = require('../middleware/chatRateLimiter');
const {
    getConversations,
    getOrCreateConversation,
    getMessages,
    sendMessage,
    deleteMessage,
    markMessagesAsRead,
    getUnreadCount
} = require('../controllers/chatController');

// All routes require authentication
router.use(protect);

// Get all conversations for the authenticated user
router.get('/conversations', getConversations);

// Get or create a conversation with a specific user
// Support both singular and plural forms for better API usability
router.get('/conversation/:participantId', limitConversationRequests, getOrCreateConversation);
router.get('/conversations/:participantId', limitConversationRequests, getOrCreateConversation);

// Get messages for a conversation
router.get('/conversation/:conversationId/messages', getMessages);

// Send a message (REST API - WebSocket is preferred for real-time)
router.post('/message', limitMessageRequests, sendMessage);

// Delete a message
router.delete('/message/:messageId', deleteMessage);

// Mark messages as read
router.post('/messages/read', markMessagesAsRead);

// Get unread message count
router.get('/unread-count', getUnreadCount);

module.exports = router;


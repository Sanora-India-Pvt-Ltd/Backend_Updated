const express = require('express');
const { protect } = require('../middleware/auth');
const {
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    listFriends,
    listReceivedRequests,
    listSentRequests,
    unfriend,
    cancelSentRequest
} = require('../controllers/friendController');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Core endpoints
router.post('/send/:receiverId', sendFriendRequest);
router.post('/accept/:requestId', acceptFriendRequest);
router.post('/reject/:requestId', rejectFriendRequest);
router.get('/list', listFriends);
router.get('/requests/received', listReceivedRequests);
router.get('/requests/sent', listSentRequests);

// Optional endpoints
router.delete('/unfriend/:friendId', unfriend);
router.delete('/cancel/:requestId', cancelSentRequest);

// Debug: Log all registered routes
console.log('📋 Friend routes registered:');
console.log('  POST   /api/friend/send/:receiverId (protected)');
console.log('  POST   /api/friend/accept/:requestId (protected)');
console.log('  POST   /api/friend/reject/:requestId (protected)');
console.log('  GET    /api/friend/list (protected)');
console.log('  GET    /api/friend/requests/received (protected)');
console.log('  GET    /api/friend/requests/sent (protected)');
console.log('  DELETE /api/friend/unfriend/:friendId (protected)');
console.log('  DELETE /api/friend/cancel/:requestId (protected)');

module.exports = router;


const express = require('express');
const router = express.Router();
const {
    generateInvite,
    validateInvite,
    acceptInvite,
    getMyInvites,
    getInvitesSent
} = require('../../controllers/course/invite.controller');
const { protectUniversity } = require('../../middleware/universityAuth.middleware');
const { protect } = require('../../middleware/auth');

// Invite Routes
router.post('/courses/:courseId/generate', protectUniversity, generateInvite);
router.get('/validate/:token', validateInvite); // Public
router.post('/accept/:token', protect, acceptInvite);
router.get('/my-invites', protect, getMyInvites);
router.get('/sent/:courseId', protectUniversity, getInvitesSent);
router.delete('/:id', protectUniversity, async (req, res) => {
    // Delete invite controller function can be added if needed
    res.status(501).json({ success: false, message: 'Not implemented yet' });
});

module.exports = router;


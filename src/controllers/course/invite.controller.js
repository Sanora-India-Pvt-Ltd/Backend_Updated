const CourseInvite = require('../../models/course/CourseInvite');
const Course = require('../../models/course/Course');
const User = require('../../models/authorization/User');
const UserCourseProgress = require('../../models/progress/UserCourseProgress');
const crypto = require('crypto');

/**
 * Generate invite (university creates invite, returns shareable link/code)
 */
const generateInvite = async (req, res) => {
    try {
        const { courseId } = req.params;
        const { email, expiresInDays } = req.body;
        const universityId = req.universityId; // From middleware

        // Verify course ownership
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to create invites for this course'
            });
        }

        // Generate token
        const randomToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(randomToken).digest('hex');

        // Set expiration (default 7 days)
        const expiresIn = expiresInDays || 7;
        const expiresAt = new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000);

        // Create invite
        const invite = await CourseInvite.create({
            courseId,
            email: email ? email.toLowerCase() : null, // null for open invite
            token: hashedToken,
            expiresAt
        });

        // Generate shareable link
        const shareableLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/${randomToken}`;
        const inviteCode = randomToken.substring(0, 8).toUpperCase(); // Short code for manual entry

        res.status(201).json({
            success: true,
            message: 'Invite generated successfully',
            data: {
                invite: {
                    id: invite._id,
                    email: invite.email,
                    expiresAt: invite.expiresAt
                },
                shareableLink,
                inviteCode,
                token: randomToken // Only return plain token once
            }
        });
    } catch (error) {
        console.error('Generate invite error:', error);
        res.status(500).json({
            success: false,
            message: 'Error generating invite',
            error: error.message
        });
    }
};

/**
 * Validate invite (check if token is valid & not expired)
 */
const validateInvite = async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Invite token is required'
            });
        }

        // Hash token to compare
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const invite = await CourseInvite.findOne({
            token: hashedToken,
            used: false,
            expiresAt: { $gt: new Date() }
        }).populate('courseId', 'name description thumbnail');

        if (!invite) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired invite token'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Invite is valid',
            data: {
                invite: {
                    id: invite._id,
                    course: invite.courseId,
                    email: invite.email,
                    expiresAt: invite.expiresAt
                }
            }
        });
    } catch (error) {
        console.error('Validate invite error:', error);
        res.status(500).json({
            success: false,
            message: 'Error validating invite',
            error: error.message
        });
    }
};

/**
 * Accept invite (user accepts invite, creates user-course relationship)
 */
const acceptInvite = async (req, res) => {
    try {
        const { token } = req.params;
        const userId = req.userId; // From user auth middleware

        if (!token) {
            return res.status(400).json({
                success: false,
                message: 'Invite token is required'
            });
        }

        // Hash token to compare
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const invite = await CourseInvite.findOne({
            token: hashedToken,
            used: false,
            expiresAt: { $gt: new Date() }
        });

        if (!invite) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired invite token'
            });
        }

        // Check if email matches (if invite is email-specific)
        if (invite.email) {
            const user = await User.findById(userId);
            if (!user || user.profile.email !== invite.email) {
                return res.status(403).json({
                    success: false,
                    message: 'This invite is for a different email address'
                });
            }
        }

        // Check if user already enrolled
        const existingProgress = await UserCourseProgress.findOne({
            userId,
            courseId: invite.courseId
        });

        if (existingProgress) {
            return res.status(400).json({
                success: false,
                message: 'You are already enrolled in this course'
            });
        }

        // Mark invite as used
        invite.used = true;
        invite.usedBy = userId;
        invite.usedAt = new Date();
        await invite.save();

        // Create user-course progress
        await UserCourseProgress.create({
            userId,
            courseId: invite.courseId,
            progress: {
                completedVideos: 0,
                completionPercent: 0
            }
        });

        // Update course stats
        await Course.findByIdAndUpdate(invite.courseId, {
            $inc: { 'stats.totalUsers': 1 }
        });

        res.status(200).json({
            success: true,
            message: 'Invite accepted successfully. You are now enrolled in the course.'
        });
    } catch (error) {
        console.error('Accept invite error:', error);
        res.status(500).json({
            success: false,
            message: 'Error accepting invite',
            error: error.message
        });
    }
};

/**
 * Get my invites (user views pending invites)
 */
const getMyInvites = async (req, res) => {
    try {
        const userId = req.userId; // From user auth middleware

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Find invites for user's email
        const invites = await CourseInvite.find({
            email: user.profile.email,
            used: false,
            expiresAt: { $gt: new Date() }
        })
            .populate('courseId', 'name description thumbnail')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            message: 'Invites retrieved successfully',
            data: { invites }
        });
    } catch (error) {
        console.error('Get my invites error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving invites',
            error: error.message
        });
    }
};

/**
 * Get invites sent (university views sent invites)
 */
const getInvitesSent = async (req, res) => {
    try {
        const { courseId } = req.params;
        const universityId = req.universityId; // From middleware

        // Verify course ownership
        const course = await Course.findById(courseId);
        if (!course) {
            return res.status(404).json({
                success: false,
                message: 'Course not found'
            });
        }

        if (course.universityId.toString() !== universityId.toString()) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to view invites for this course'
            });
        }

        const invites = await CourseInvite.find({ courseId })
            .populate('usedBy', 'profile.name.full profile.email')
            .sort({ createdAt: -1 })
            .lean();

        res.status(200).json({
            success: true,
            message: 'Invites retrieved successfully',
            data: { invites }
        });
    } catch (error) {
        console.error('Get invites sent error:', error);
        res.status(500).json({
            success: false,
            message: 'Error retrieving invites',
            error: error.message
        });
    }
};

module.exports = {
    generateInvite,
    validateInvite,
    acceptInvite,
    getMyInvites,
    getInvitesSent
};


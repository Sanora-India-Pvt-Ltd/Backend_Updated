/**
 * Course invite domain: generate, validate, accept, list. Returns { statusCode, json }.
 */

const crypto = require('crypto');
const CourseInvite = require('../../models/course/CourseInvite');
const Course = require('../../models/course/Course');
const User = require('../../models/authorization/User');
const UserCourseProgress = require('../../models/progress/UserCourseProgress');

async function generateInvite(courseId, universityId, body) {
    try {
        const { email, expiresInDays } = body;
        const course = await Course.findById(courseId);
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to create invites for this course' } };
        }
        const randomToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(randomToken).digest('hex');
        const expiresIn = expiresInDays || 7;
        const expiresAt = new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000);
        const invite = await CourseInvite.create({
            courseId,
            email: email ? email.toLowerCase() : null,
            token: hashedToken,
            expiresAt
        });
        const shareableLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/invite/${randomToken}`;
        const inviteCode = randomToken.substring(0, 8).toUpperCase();
        return {
            statusCode: 201,
            json: {
                success: true,
                message: 'Invite generated successfully',
                data: {
                    invite: { id: invite._id, email: invite.email, expiresAt: invite.expiresAt },
                    shareableLink,
                    inviteCode,
                    token: randomToken
                }
            }
        };
    } catch (error) {
        console.error('Generate invite error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error generating invite', error: error.message } };
    }
}

async function validateInvite(token) {
    try {
        if (!token) {
            return { statusCode: 400, json: { success: false, message: 'Invite token is required' } };
        }
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const invite = await CourseInvite.findOne({
            token: hashedToken,
            used: false,
            expiresAt: { $gt: new Date() }
        }).populate('courseId', 'name description thumbnail');
        if (!invite) {
            return { statusCode: 400, json: { success: false, message: 'Invalid or expired invite token' } };
        }
        return {
            statusCode: 200,
            json: {
                success: true,
                message: 'Invite is valid',
                data: { invite: { id: invite._id, course: invite.courseId, email: invite.email, expiresAt: invite.expiresAt } }
            }
        };
    } catch (error) {
        console.error('Validate invite error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error validating invite', error: error.message } };
    }
}

async function acceptInvite(token, userId) {
    try {
        if (!token) {
            return { statusCode: 400, json: { success: false, message: 'Invite token is required' } };
        }
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
        const invite = await CourseInvite.findOne({
            token: hashedToken,
            used: false,
            expiresAt: { $gt: new Date() }
        });
        if (!invite) {
            return { statusCode: 400, json: { success: false, message: 'Invalid or expired invite token' } };
        }
        if (invite.email) {
            const user = await User.findById(userId);
            if (!user || user.profile.email !== invite.email) {
                return { statusCode: 403, json: { success: false, message: 'This invite is for a different email address' } };
            }
        }
        const existingProgress = await UserCourseProgress.findOne({ userId, courseId: invite.courseId });
        if (existingProgress) {
            return { statusCode: 400, json: { success: false, message: 'You are already enrolled in this course' } };
        }
        invite.used = true;
        invite.usedBy = userId;
        invite.usedAt = new Date();
        await invite.save();
        await UserCourseProgress.create({
            userId,
            courseId: invite.courseId,
            completedVideos: 0,
            completionPercent: 0
        });
        await Course.findByIdAndUpdate(invite.courseId, { $inc: { 'stats.totalUsers': 1 } });
        return { statusCode: 200, json: { success: true, message: 'Invite accepted successfully. You are now enrolled in the course.' } };
    } catch (error) {
        console.error('Accept invite error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error accepting invite', error: error.message } };
    }
}

async function getMyInvites(userId) {
    try {
        const user = await User.findById(userId);
        if (!user) {
            return { statusCode: 404, json: { success: false, message: 'User not found' } };
        }
        const invites = await CourseInvite.find({
            email: user.profile.email,
            used: false,
            expiresAt: { $gt: new Date() }
        })
            .populate('courseId', 'name description thumbnail')
            .sort({ createdAt: -1 })
            .lean();
        return { statusCode: 200, json: { success: true, message: 'Invites retrieved successfully', data: { invites } } };
    } catch (error) {
        console.error('Get my invites error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error retrieving invites', error: error.message } };
    }
}

async function getInvitesSent(courseId, universityId) {
    try {
        const course = await Course.findById(courseId);
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to view invites for this course' } };
        }
        const invites = await CourseInvite.find({ courseId })
            .populate('usedBy', 'profile.name.full profile.email')
            .sort({ createdAt: -1 })
            .lean();
        return { statusCode: 200, json: { success: true, message: 'Invites retrieved successfully', data: { invites } } };
    } catch (error) {
        console.error('Get invites sent error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error retrieving invites', error: error.message } };
    }
}

module.exports = {
    generateInvite,
    validateInvite,
    acceptInvite,
    getMyInvites,
    getInvitesSent
};

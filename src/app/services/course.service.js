/**
 * Course domain: CRUD, enrollment, analytics, publish. Returns { statusCode, json }.
 */

const cache = require('../../core/infra/cache');
const Course = require('../../models/course/Course');
const Playlist = require('../../models/course/Playlist');
const Video = require('../../models/course/Video');
const CourseInvite = require('../../models/course/CourseInvite');
const CourseEnrollment = require('../../models/course/CourseEnrollment');
const UserCourseProgress = require('../../models/progress/UserCourseProgress');
const TokenTransaction = require('../../models/wallet/TokenTransaction');
const videoService = require('../../core/infra/videoUpload');
const { emitNotification } = require('../../core/infra/notificationEmitter');

async function createCourse(body, universityId) {
    try {
        const { name, description, thumbnail, inviteOnly } = body;
        if (!name) {
            return { statusCode: 400, json: { success: false, message: 'Course name is required' } };
        }
        const course = await Course.create({
            universityId,
            name,
            description: description || '',
            thumbnail: thumbnail || null,
            inviteOnly: inviteOnly !== undefined ? inviteOnly : true,
            maxCompletions: body.maxCompletions ?? null,
            completionDeadline: body.completionDeadline ?? null,
            rewardTokensPerCompletion: body.rewardTokensPerCompletion ?? 0,
            status: 'draft'
        });
        return { statusCode: 201, json: { success: true, message: 'Course created successfully', data: { course } } };
    } catch (error) {
        console.error('Create course error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error creating course', error: error.message } };
    }
}

async function getCourses(universityId) {
    try {
        const query = universityId
            ? { universityId }
            : { status: { $in: ['active', 'down'] } };
        const courses = await Course.find(query).select('-__v').sort({ createdAt: -1 }).lean();
        return { statusCode: 200, json: { success: true, message: 'Courses retrieved successfully', data: { courses } } };
    } catch (error) {
        console.error('Get courses error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error retrieving courses', error: error.message } };
    }
}

async function getCourseById(id, universityId, userId, userObj) {
    const cacheKey = `course:${id}:${universityId || 'none'}:${userId || 'anon'}`;
    const client = cache.getClient();
    if (client) {
        try {
            const cached = await client.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch (e) { /* fall through to DB */ }
    }
    try {
        const course = await Course.findById(id).select('-__v').lean();
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (universityId && course.universityId.toString() !== universityId.toString()) {
            if (userId) {
                const progress = await UserCourseProgress.findOne({ userId, courseId: id }).lean();
                if (!progress) {
                    return { statusCode: 403, json: { success: false, message: 'Access denied. You must be enrolled in this course.' } };
                }
            } else {
                return { statusCode: 403, json: { success: false, message: 'Access denied' } };
            }
        }
        let enrollment = null;
        let videos = null;
        if (universityId && course.universityId.toString() === universityId.toString()) {
            videos = await Video.find({ courseId: course._id, status: 'READY' })
                .select('_id title videoUrl status attachedProductId')
                .lean();
        } else if (userObj && userObj._id) {
            enrollment = await CourseEnrollment.findOne({ userId: userObj._id, courseId: course._id }).lean();
            if (enrollment && ['enrolled', 'in_progress', 'completed'].includes(enrollment.status)) {
                videos = await Video.find({ courseId: course._id, status: 'READY' })
                    .select('_id title videoUrl status attachedProductId')
                    .lean();
            }
        }
        const responseData = { course };
        if (enrollment && videos !== null) {
            responseData.enrollmentStatus = enrollment.status;
            responseData.videos = videos;
        } else if (videos !== null) {
            responseData.videos = videos;
        }
        const result = { statusCode: 200, json: { success: true, message: 'Course retrieved successfully', data: responseData } };
        if (client) {
            try {
                await client.set(cacheKey, JSON.stringify(result), 'EX', 300);
            } catch (e) { /* ignore */ }
        }
        return result;
    } catch (error) {
        console.error('Get course error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error retrieving course', error: error.message } };
    }
}

async function updateCourse(id, universityId, body) {
    try {
        const { name, description, thumbnail, inviteOnly } = body;
        const course = await Course.findById(id);
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to update this course' } };
        }
        if (name !== undefined) { course.details = course.details || {}; course.details.name = name; }
        if (description !== undefined) { course.details = course.details || {}; course.details.description = description; }
        if (thumbnail !== undefined) { course.details = course.details || {}; course.details.thumbnail = thumbnail; }
        if (inviteOnly !== undefined) { course.settings = course.settings || {}; course.settings.inviteOnly = inviteOnly; }
        await course.save();
        try {
            const client = cache.getClient();
            if (client) {
                let keys = await client.keys(`course:${id}:*`);
                if (keys.length) await client.del(...keys);
                keys = await client.keys(`course_analytics:${id}:*`);
                if (keys.length) await client.del(...keys);
            }
        } catch (e) { /* fail-safe */ }
        return { statusCode: 200, json: { success: true, message: 'Course updated successfully', data: { course } } };
    } catch (error) {
        console.error('Update course error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error updating course', error: error.message } };
    }
}

async function deleteCourse(id, universityId) {
    try {
        const course = await Course.findById(id).lean();
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to delete this course' } };
        }
        await Playlist.deleteMany({ courseId: id });
        await Video.deleteMany({ courseId: id });
        await CourseInvite.deleteMany({ courseId: id });
        await UserCourseProgress.deleteMany({ courseId: id });
        await CourseEnrollment.deleteMany({ courseId: id });
        await Course.findByIdAndDelete(id);
        return { statusCode: 200, json: { success: true, message: 'Course deleted successfully' } };
    } catch (error) {
        console.error('Delete course error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error deleting course', error: error.message } };
    }
}

async function updateCourseThumbnail(id, universityId, file, fileValidationError) {
    try {
        if (!file) {
            if (fileValidationError) {
                return { statusCode: 400, json: { success: false, message: fileValidationError } };
            }
            return { statusCode: 400, json: { success: false, message: 'Thumbnail file is required' } };
        }
        if (!file.mimetype.startsWith('image/')) {
            return { statusCode: 400, json: { success: false, message: 'Only image files are allowed for thumbnails' } };
        }
        const course = await Course.findById(id);
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to update this course thumbnail' } };
        }
        const thumbnailUrl = await videoService.uploadThumbnail(file, `course-${course._id}`);
        course.details = course.details || {}; course.details.thumbnail = thumbnailUrl;
        await course.save();
        return { statusCode: 200, json: { success: true, message: 'Course thumbnail updated successfully', data: { thumbnail: thumbnailUrl } } };
    } catch (error) {
        console.error('Update course thumbnail error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error updating course thumbnail', error: error.message } };
    }
}

async function requestEnrollment(courseId, userId) {
    try {
        if (!userId) {
            return { statusCode: 401, json: { success: false, message: 'Authentication required' } };
        }
        const course = await Course.findById(courseId).lean();
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.status !== 'active') {
            return { statusCode: 400, json: { success: false, message: `Course is not available for enrollment. Current status: ${course.status}` } };
        }
        const existingEnrollment = await CourseEnrollment.findOne({ userId, courseId });
        if (existingEnrollment) {
            return { statusCode: 400, json: { success: false, message: 'Enrollment request already exists', data: { enrollment: existingEnrollment, status: existingEnrollment.status } } };
        }
        const isInviteOnly = course.isInviteOnly !== undefined ? course.isInviteOnly : course.inviteOnly;
        if (isInviteOnly) {
            const enrollment = await CourseEnrollment.create({ userId, courseId, status: 'invited' });
            try {
                await emitNotification({
                    recipientType: 'UNIVERSITY',
                    recipientId: course.universityId,
                    category: 'COURSE',
                    type: 'COURSE_ENROLLMENT_REQUESTED',
                    title: 'New Enrollment Request',
                    message: `A student has requested enrollment in "${course.name}"`,
                    channels: ['IN_APP', 'PUSH'],
                    entity: { type: 'COURSE', id: courseId },
                    payload: { courseId: courseId.toString(), courseName: course.name, enrollmentId: enrollment._id.toString() }
                });
            } catch (notifError) {
                console.error('Failed to emit enrollment request notification:', notifError);
            }
            return { statusCode: 201, json: { success: true, message: 'Enrollment request submitted', data: { enrollment } } };
        }
        if (course.maxCompletions != null) {
            const activeEnrollmentCount = await CourseEnrollment.countDocuments({
                courseId,
                status: { $in: ['enrolled', 'in_progress', 'completed'] }
            });
            if (activeEnrollmentCount >= course.maxCompletions) {
                if (course.status !== 'down') {
                    await Course.findByIdAndUpdate(courseId, { status: 'down' });
                }
                return { statusCode: 400, json: { success: false, message: 'Course enrollment limit reached. This course is now full.', data: { maxCompletions: course.maxCompletions, currentEnrollments: activeEnrollmentCount } } };
            }
        }
        const enrollmentData = { userId, courseId, status: 'enrolled', approvedAt: new Date() };
        if (course.completionDeadline) enrollmentData.expiresAt = course.completionDeadline;
        const enrollment = await CourseEnrollment.create(enrollmentData);
        return { statusCode: 201, json: { success: true, message: 'Enrollment approved automatically', data: { enrollment } } };
    } catch (error) {
        console.error('Request enrollment error:', error);
        if (error.code === 11000) {
            return { statusCode: 400, json: { success: false, message: 'Enrollment request already exists' } };
        }
        return { statusCode: 500, json: { success: false, message: 'Error processing enrollment request', error: error.message } };
    }
}

async function getCourseEnrollments(courseId, universityId) {
    try {
        const course = await Course.findById(courseId).select('universityId').lean();
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to view enrollments for this course' } };
        }
        const enrollments = await CourseEnrollment.find({ courseId })
            .select('-__v')
            .populate('userId', 'profile.name.first profile.name.last profile.email')
            .sort({ createdAt: -1 })
            .lean();
        return { statusCode: 200, json: { success: true, message: 'Enrollments retrieved successfully', data: { enrollments } } };
    } catch (error) {
        console.error('Get course enrollments error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error retrieving enrollments', error: error.message } };
    }
}

async function approveEnrollment(courseId, enrollmentId, universityId) {
    try {
        const course = await Course.findById(courseId);
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to approve enrollments for this course' } };
        }
        const enrollment = await CourseEnrollment.findOne({ _id: enrollmentId, courseId });
        if (!enrollment) {
            return { statusCode: 404, json: { success: false, message: 'Enrollment not found' } };
        }
        if (course.maxCompletions != null && course.completedCount >= course.maxCompletions) {
            course.status = 'down';
            await course.save();
            return { statusCode: 400, json: { success: false, message: 'Course enrollment limit reached', data: { maxCompletions: course.maxCompletions, completedCount: course.completedCount, courseStatus: 'down' } } };
        }
        enrollment.status = 'enrolled';
        enrollment.approvedAt = new Date();
        if (course.completionDeadline) enrollment.expiresAt = course.completionDeadline;
        await enrollment.save();
        try {
            await emitNotification({
                recipientType: 'USER',
                recipientId: enrollment.userId,
                category: 'COURSE',
                type: 'COURSE_ENROLLMENT_APPROVED',
                title: 'Enrollment Approved',
                message: `Your enrollment request for "${course.name}" has been approved`,
                channels: ['IN_APP', 'PUSH'],
                entity: { type: 'COURSE', id: courseId },
                payload: { courseId: courseId.toString(), courseName: course.name, enrollmentId: enrollment._id.toString() }
            });
        } catch (notifError) {
            console.error('Failed to emit enrollment approved notification:', notifError);
        }
        try {
            const client = cache.getClient();
            if (client) {
                let keys = await client.keys(`course:${courseId}:*`);
                if (keys.length) await client.del(...keys);
                keys = await client.keys(`course_analytics:${courseId}:*`);
                if (keys.length) await client.del(...keys);
            }
        } catch (e) { /* fail-safe */ }
        return { statusCode: 200, json: { success: true, message: 'Enrollment approved successfully', data: { enrollment } } };
    } catch (error) {
        console.error('Approve enrollment error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error approving enrollment', error: error.message } };
    }
}

async function rejectEnrollment(courseId, enrollmentId, universityId) {
    try {
        const course = await Course.findById(courseId).lean();
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to reject enrollments for this course' } };
        }
        const enrollment = await CourseEnrollment.findOne({ _id: enrollmentId, courseId });
        if (!enrollment) {
            return { statusCode: 404, json: { success: false, message: 'Enrollment not found' } };
        }
        enrollment.status = 'dropped';
        await enrollment.save();
        try {
            const client = cache.getClient();
            if (client) {
                let keys = await client.keys(`course:${courseId}:*`);
                if (keys.length) await client.del(...keys);
                keys = await client.keys(`course_analytics:${courseId}:*`);
                if (keys.length) await client.del(...keys);
            }
        } catch (e) { /* fail-safe */ }
        return { statusCode: 200, json: { success: true, message: 'Enrollment rejected successfully', data: { enrollment } } };
    } catch (error) {
        console.error('Reject enrollment error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error rejecting enrollment', error: error.message } };
    }
}

async function getCourseAnalytics(courseId, universityId) {
    const cacheKey = `course_analytics:${courseId}:${universityId}`;
    const client = cache.getClient();
    if (client) {
        try {
            const cached = await client.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch (e) { /* fall through to DB */ }
    }
    try {
        const course = await Course.findById(courseId).select('name maxCompletions completedCount status universityId').lean();
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to view analytics for this course' } };
        }
        const [enrollmentStats, tokenStats, videos] = await Promise.all([
            CourseEnrollment.aggregate([
                { $match: { courseId: course._id } },
                { $group: { _id: '$status', count: { $sum: 1 } } }
            ]),
            TokenTransaction.aggregate([
                { $match: { source: 'COURSE_COMPLETION', sourceId: course._id } },
                { $group: { _id: null, totalTokensIssued: { $sum: '$amount' } } }
            ]),
            Video.find({ courseId: course._id }).select('_id title productAnalytics attachedProductId').lean()
        ]);
        const enrollmentMap = {};
        enrollmentStats.forEach(stat => { enrollmentMap[stat._id] = stat.count; });
        const totalTokensIssued = tokenStats.length > 0 ? tokenStats[0].totalTokensIssued : 0;
        const videoAnalytics = videos.map(video => {
            const views = video.productAnalytics?.views || 0;
            const clicks = video.productAnalytics?.clicks || 0;
            const purchases = video.productAnalytics?.purchases || 0;
            const conversionRate = clicks > 0 ? (purchases / clicks) * 100 : 0;
            return {
                videoId: video._id,
                title: video.title,
                productAnalytics: { views, clicks, purchases, conversionRate: Math.round(conversionRate * 100) / 100 }
            };
        });
        const analytics = {
            course: { title: course.name, maxCompletions: course.maxCompletions || null, completedCount: course.completedCount || 0, status: course.status || 'draft' },
            enrollments: {
                totalRequested: enrollmentMap['invited'] || 0,
                totalApproved: enrollmentMap['enrolled'] || 0,
                totalCompleted: enrollmentMap['completed'] || 0,
                totalExpired: 0,
                totalRejected: enrollmentMap['dropped'] || 0,
                totalInProgress: enrollmentMap['in_progress'] || 0
            },
            tokens: { totalTokensIssued },
            videos: videoAnalytics
        };
        const result = { statusCode: 200, json: { success: true, message: 'Course analytics retrieved successfully', data: { analytics } } };
        if (client) {
            try {
                await client.set(cacheKey, JSON.stringify(result), 'EX', 30);
            } catch (e) { /* ignore */ }
        }
        return result;
    } catch (error) {
        console.error('Get course analytics error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error retrieving course analytics', error: error.message } };
    }
}

async function publishCourse(courseId, universityId) {
    try {
        if (!courseId) {
            return { statusCode: 400, json: { success: false, message: 'Course ID is required' } };
        }
        const course = await Course.findById(courseId);
        if (!course) {
            return { statusCode: 404, json: { success: false, message: 'Course not found' } };
        }
        if (course.universityId.toString() !== universityId.toString()) {
            return { statusCode: 403, json: { success: false, message: 'You do not have permission to publish this course' } };
        }
        if (course.status !== 'draft') {
            return { statusCode: 400, json: { success: false, message: `Course cannot be published. Current status: ${course.status}. Only draft courses can be published.` } };
        }
        const videoCount = await Video.countDocuments({ courseId: course._id });
        if (videoCount === 0) {
            return { statusCode: 400, json: { success: false, message: 'Course must have at least one video before it can be published' } };
        }
        if (course.maxCompletions != null && course.maxCompletions <= 0) {
            return { statusCode: 400, json: { success: false, message: 'maxCompletions must be greater than 0 if set' } };
        }
        course.status = 'active';
        course.publishedAt = new Date();
        await course.save();
        try {
            const client = cache.getClient();
            if (client) {
                let keys = await client.keys(`course:${courseId}:*`);
                if (keys.length) await client.del(...keys);
                keys = await client.keys(`course_analytics:${courseId}:*`);
                if (keys.length) await client.del(...keys);
            }
        } catch (e) { /* fail-safe */ }
        return { statusCode: 200, json: { success: true, message: 'Course is now live', data: { courseId: course._id.toString(), status: course.status, publishedAt: course.publishedAt } } };
    } catch (error) {
        console.error('Publish course error:', error);
        return { statusCode: 500, json: { success: false, message: 'Error publishing course', error: process.env.NODE_ENV === 'development' ? error.message : undefined } };
    }
}

module.exports = {
    createCourse,
    getCourses,
    getCourseById,
    updateCourse,
    deleteCourse,
    updateCourseThumbnail,
    requestEnrollment,
    getCourseEnrollments,
    approveEnrollment,
    rejectEnrollment,
    getCourseAnalytics,
    publishCourse
};

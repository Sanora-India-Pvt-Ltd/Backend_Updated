const Course = require('../../models/course/Course');
const { getRedis } = require('../../config/redisConnection');

/**
 * Create course with university validation
 */
const createCourse = async (universityId, courseData) => {
    const course = await Course.create({
        universityId,
        ...courseData
    });

    // Cache course in Redis (5-15 min TTL)
    const redis = getRedis();
    if (redis) {
        const ttl = Math.floor(Math.random() * 10 + 5) * 60; // 5-15 minutes
        await redis.setex(`course:${course._id}`, ttl, JSON.stringify(course));
    }

    return course;
};

/**
 * Update course metadata
 */
const updateCourse = async (courseId, universityId, updateData) => {
    const course = await Course.findOneAndUpdate(
        { _id: courseId, universityId },
        updateData,
        { new: true }
    );

    if (course) {
        // Update cache
        const redis = getRedis();
        if (redis) {
            const ttl = Math.floor(Math.random() * 10 + 5) * 60; // 5-15 minutes
            await redis.setex(`course:${course._id}`, ttl, JSON.stringify(course));
        }
    }

    return course;
};

/**
 * Delete course & cascade operations
 */
const deleteCourse = async (courseId, universityId) => {
    const course = await Course.findOne({ _id: courseId, universityId });
    
    if (!course) {
        return null;
    }

    // Cascade delete handled in controller
    await Course.findByIdAndDelete(courseId);

    // Remove from cache
    const redis = getRedis();
    if (redis) {
        await redis.del(`course:${courseId}`);
    }

    return course;
};

/**
 * Cache course in Redis
 */
const cacheCourse = async (course) => {
    const redis = getRedis();
    if (redis) {
        const ttl = Math.floor(Math.random() * 10 + 5) * 60; // 5-15 minutes
        await redis.setex(`course:${course._id}`, ttl, JSON.stringify(course));
    }
};

/**
 * Get course from cache or DB
 */
const getCourse = async (courseId) => {
    const redis = getRedis();
    
    if (redis) {
        const cached = await redis.get(`course:${courseId}`);
        if (cached) {
            return JSON.parse(cached);
        }
    }

    const course = await Course.findById(courseId).lean();
    
    if (course && redis) {
        await cacheCourse(course);
    }

    return course;
};

module.exports = {
    createCourse,
    updateCourse,
    deleteCourse,
    cacheCourse,
    getCourse
};


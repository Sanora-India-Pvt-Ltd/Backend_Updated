const courseService = require('../../app/services/course.service');

const createCourse = async (req, res) => {
    const result = await courseService.createCourse(req.body, req.universityId);
    res.status(result.statusCode).json(result.json);
};

const getCourses = async (req, res) => {
    const result = await courseService.getCourses(req.universityId);
    res.status(result.statusCode).json(result.json);
};

const getCourseById = async (req, res) => {
    const result = await courseService.getCourseById(req.params.id, req.universityId, req.userId, req.user);
    res.status(result.statusCode).json(result.json);
};

const updateCourse = async (req, res) => {
    const result = await courseService.updateCourse(req.params.id, req.universityId, req.body);
    res.status(result.statusCode).json(result.json);
};

const deleteCourse = async (req, res) => {
    const result = await courseService.deleteCourse(req.params.id, req.universityId);
    res.status(result.statusCode).json(result.json);
};

const updateCourseThumbnail = async (req, res) => {
    const result = await courseService.updateCourseThumbnail(req.params.id, req.universityId, req.file, req.fileValidationError);
    res.status(result.statusCode).json(result.json);
};

const requestEnrollment = async (req, res) => {
    const result = await courseService.requestEnrollment(req.params.courseId, req.userId);
    res.status(result.statusCode).json(result.json);
};

const getCourseEnrollments = async (req, res) => {
    const result = await courseService.getCourseEnrollments(req.params.courseId, req.universityId);
    res.status(result.statusCode).json(result.json);
};

const approveEnrollment = async (req, res) => {
    const result = await courseService.approveEnrollment(req.params.courseId, req.params.enrollmentId, req.universityId);
    res.status(result.statusCode).json(result.json);
};

const rejectEnrollment = async (req, res) => {
    const result = await courseService.rejectEnrollment(req.params.courseId, req.params.enrollmentId, req.universityId);
    res.status(result.statusCode).json(result.json);
};

const getCourseAnalytics = async (req, res) => {
    const result = await courseService.getCourseAnalytics(req.params.courseId, req.universityId);
    res.status(result.statusCode).json(result.json);
};

const publishCourse = async (req, res) => {
    const result = await courseService.publishCourse(req.params.courseId, req.universityId);
    res.status(result.statusCode).json(result.json);
};

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

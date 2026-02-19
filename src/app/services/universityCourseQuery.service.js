'use strict';

const mongoose = require('mongoose');
const Course = require('../../models/course/Course');
const CourseVideo = require('../../models/course/CourseVideo');
const CourseProduct = require('../../models/course/CourseProduct');
const CourseSummary = require('../../models/course/CourseSummary');

function omitV(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const { __v, ...rest } = doc;
  return rest;
}

/**
 * Get full course (Course + Video + Product + Summary) for a university. Read-only.
 * @param {string|ObjectId} courseId
 * @param {string|ObjectId} universityId
 * @returns {{ statusCode: number, json: object }}
 */
async function getUniversityCourseById(courseId, universityId) {
  if (!courseId || !universityId) {
    return {
      statusCode: 400,
      json: { success: false, message: 'courseId and universityId are required', data: null }
    };
  }
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    return {
      statusCode: 400,
      json: { success: false, message: 'COURSE_ID_INVALID', data: null }
    };
  }
  if (!mongoose.Types.ObjectId.isValid(universityId)) {
    return {
      statusCode: 400,
      json: { success: false, message: 'COURSE_ID_INVALID', data: null }
    };
  }

  const course = await Course.findOne({ _id: courseId, universityId }).lean();
  if (!course) {
    return {
      statusCode: 404,
      json: { success: false, message: 'COURSE_NOT_FOUND', data: null }
    };
  }

  const [videoDoc, productDoc, summaryDoc] = await Promise.all([
    CourseVideo.findOne({ courseId }).lean(),
    CourseProduct.findOne({ courseId }).lean(),
    CourseSummary.findOne({ courseId }).lean()
  ]);

  const coursePayload = {
    _id: course._id,
    title: course.title,
    description: course.description,
    courseType: course.courseType,
    status: course.status,
    eligibilityCriteria: course.eligibilityCriteria,
    reward: course.reward,
    createdAt: course.createdAt,
    updatedAt: course.updatedAt
  };

  return {
    statusCode: 200,
    json: {
      success: true,
      data: {
        course: coursePayload,
        video: videoDoc ? omitV(videoDoc) : null,
        product: productDoc ? omitV(productDoc) : null,
        summary: summaryDoc ? omitV(summaryDoc) : null
      }
    }
  };
}

module.exports = {
  getUniversityCourseById
};

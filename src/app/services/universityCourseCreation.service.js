'use strict';

const mongoose = require('mongoose');
const Course = require('../../models/course/Course');
const CourseVideo = require('../../models/course/CourseVideo');
const CourseProduct = require('../../models/course/CourseProduct');
const CourseSummary = require('../../models/course/CourseSummary');

/**
 * Create course + video + product + summary in a single transaction.
 * @param {ObjectId} universityId - required
 * @param {Object} payload - validated payload (courseType, title, description, eligibilityCriteria, reward, video, product, summary)
 * @returns {{ statusCode: number, json: object }}
 */
async function createUniversityCourse(universityId, payload) {
  if (!universityId) {
    return {
      statusCode: 400,
      json: { success: false, message: 'University ID is required' }
    };
  }

  const {
    courseType,
    title,
    description,
    eligibilityCriteria = {},
    reward = {},
    video = {},
    product = {},
    summary = {}
  } = payload;

  if (!courseType || !title || !description) {
    return {
      statusCode: 400,
      json: { success: false, message: 'courseType, title, and description are required' }
    };
  }
  if (!video.videoUrl) {
    return {
      statusCode: 400,
      json: { success: false, message: 'video.videoUrl is required' }
    };
  }
  if (product.description === undefined || product.description === null || product.price === undefined || product.price === null) {
    return {
      statusCode: 400,
      json: { success: false, message: 'product.description and product.price are required' }
    };
  }
  if (summary.content === undefined || summary.content === null || summary.wordCount === undefined || summary.wordCount === null) {
    return {
      statusCode: 400,
      json: { success: false, message: 'summary.content and summary.wordCount are required' }
    };
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const course = await Course.create(
      [
        {
          universityId,
          courseType,
          title,
          name: title,
          description,
          eligibilityCriteria: {
            spendabilityBands: eligibilityCriteria.spendabilityBands || [],
            deliveryLocations: eligibilityCriteria.deliveryLocations || []
          },
          reward: {
            type: reward.type,
            amount: reward.amount
          },
          enrollmentCount: 0,
          status: 'under_review'
        }
      ],
      { session }
    ).then((r) => r[0]);

    const courseId = course._id;

    await CourseVideo.create(
      [
        {
          courseId,
          videoUrl: video.videoUrl,
          questions: video.questions || []
        }
      ],
      { session }
    );

    await CourseProduct.create(
      [
        {
          courseId,
          images: product.images || [],
          description: product.description,
          price: product.price,
          discount: product.discount != null ? product.discount : 0,
          specifications: product.specifications,
          deliveryLocations: product.deliveryLocations || [],
          questions: product.questions || []
        }
      ],
      { session }
    );

    await CourseSummary.create(
      [
        {
          courseId,
          content: summary.content,
          wordCount: summary.wordCount,
          questions: summary.questions || []
        }
      ],
      { session }
    );

    await session.commitTransaction();

    return {
      statusCode: 201,
      json: {
        success: true,
        message: 'Course created successfully. Pending admin review.',
        data: {
          courseId,
          status: 'under_review'
        }
      }
    };
  } catch (err) {
    await session.abortTransaction();
    return {
      statusCode: 500,
      json: {
        success: false,
        message: 'Course creation failed',
        error: err.message
      }
    };
  } finally {
    session.endSession();
  }
}

module.exports = {
  createUniversityCourse
};

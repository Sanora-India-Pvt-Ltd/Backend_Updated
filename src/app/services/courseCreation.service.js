'use strict';

const mongoose = require('mongoose');
const Course = require('../../models/course/Course');
const CourseVideo = require('../../models/course/CourseVideo');
const CourseProduct = require('../../models/course/CourseProduct');
const CourseSummary = require('../../models/course/CourseSummary');

/**
 * Create Course + CourseVideo + CourseProduct + CourseSummary in a single transaction.
 * @param {Object} data - validated payload (courseType, title, description, eligibilityCriteria, reward, video, product, summary)
 * @param {ObjectId} universityId - required
 * @returns {{ statusCode: number, json: object }}
 */
async function createCourse(data, universityId) {
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
  } = data;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [course] = await Course.create(
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
          status: 'draft'
        }
      ],
      { session }
    );

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
        message: 'Course created successfully',
        data: { courseId: courseId.toString() }
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
  createCourse
};

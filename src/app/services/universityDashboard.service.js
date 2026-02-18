'use strict';

const Course = require('../../models/course/Course');
const CourseEnrollment = require('../../models/course/CourseEnrollment');
const TokenTransaction = require('../../models/wallet/TokenTransaction');

/**
 * University dashboard stats. Read-only, .lean() only.
 * @param {ObjectId} universityId - required
 * @returns {{ statusCode: number, json: object }}
 */
async function getUniversityDashboard(universityId) {
  if (!universityId) {
    return {
      statusCode: 400,
      json: { success: false, message: 'University ID is required' }
    };
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const courseIds = await Course.find({ universityId }).select('_id').lean();
  const courseIdList = courseIds.map((c) => c._id);

  const [
    activeCourses,
    totalEnrollments,
    pendingCourses,
    pendingEnrollments,
    completedEnrollments,
    revenueThisMonth,
    rewardAgg
  ] = await Promise.all([
    Course.countDocuments({ universityId, status: 'active' }),
    courseIdList.length === 0
      ? 0
      : CourseEnrollment.countDocuments({ courseId: { $in: courseIdList } }),
    Course.countDocuments({ universityId, status: 'under_review' }),
    courseIdList.length === 0
      ? 0
      : CourseEnrollment.countDocuments({ courseId: { $in: courseIdList }, status: 'invited' }),
    courseIdList.length === 0
      ? 0
      : CourseEnrollment.countDocuments({ courseId: { $in: courseIdList }, status: 'completed' }),
    getRevenueThisMonth(universityId, startOfMonth),
    courseIdList.length === 0
      ? Promise.resolve({ avg: 0 })
      : TokenTransaction.aggregate([
          { $match: { status: 'CREDITED' } },
          {
            $lookup: {
              from: 'courseenrollments',
              localField: 'enrollmentId',
              foreignField: '_id',
              as: 'enr'
            }
          },
          { $unwind: '$enr' },
          { $match: { 'enr.courseId': { $in: courseIdList } } },
          { $group: { _id: null, avg: { $avg: '$amount' } } },
          { $project: { avg: { $ifNull: ['$avg', 0] } } }
        ]).then((r) => (r[0] ? { avg: r[0].avg } : { avg: 0 }))
  ]);

  const pendingActions = pendingCourses + pendingEnrollments;
  const completionRate =
    totalEnrollments > 0 ? Math.round((completedEnrollments / totalEnrollments) * 10000) / 100 : 0;
  const averageRewardPayout = rewardAgg && typeof rewardAgg.avg === 'number' ? rewardAgg.avg : 0;

  return {
    statusCode: 200,
    json: {
      success: true,
      data: {
        activeCourses,
        totalEnrollments,
        pendingActions,
        revenueThisMonth,
        quickStats: {
          completionRate,
          averageRewardPayout: Math.round(averageRewardPayout * 100) / 100
        }
      }
    }
  };
}

/**
 * Revenue this month. No Payment model in codebase; returns 0.
 * @param {ObjectId} universityId
 * @param {Date} startOfMonth
 * @returns {Promise<number>}
 */
async function getRevenueThisMonth(universityId, startOfMonth) {
  let Payment;
  try {
    Payment = require('../../models/wallet/Payment');
  } catch (_) {
    return 0;
  }
  const result = await Payment.aggregate([
    {
      $match: {
        universityId,
        status: 'completed',
        createdAt: { $gte: startOfMonth }
      }
    },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]).lean();
  return result[0] && typeof result[0].total === 'number' ? result[0].total : 0;
}

module.exports = {
  getUniversityDashboard
};

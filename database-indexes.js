/**
 * Database Index Commands for EdTech Platform
 * 
 * Run these commands in MongoDB shell or MongoDB Compass
 * to create the necessary indexes for optimal performance
 */

// ==================== University Model ====================
// db.universities.createIndex({ "adminEmail": 1 })
// db.universities.createIndex({ "isActive": 1, "isVerified": 1 })

// ==================== Course Model ====================
// db.courses.createIndex({ "universityId": 1 })
// db.courses.createIndex({ "inviteOnly": 1 })
// db.courses.createIndex({ "createdAt": -1 })

// ==================== Playlist Model ====================
// db.playlists.createIndex({ "courseId": 1, "order": 1 })
// db.playlists.createIndex({ "courseId": 1 })

// ==================== Video Model ====================
// db.videos.createIndex({ "playlistId": 1, "order": 1 })
// db.videos.createIndex({ "courseId": 1 })
// db.videos.createIndex({ "playlistId": 1 })

// ==================== Question Model ====================
// db.questions.createIndex({ "videoId": 1, "checkpointTime": 1 })
// db.questions.createIndex({ "videoId": 1 })

// ==================== CourseInvite Model ====================
// db.courseinvites.createIndex({ "expiresAt": 1 }, { expireAfterSeconds: 0 }) // TTL index
// db.courseinvites.createIndex({ "courseId": 1 })
// db.courseinvites.createIndex({ "token": 1 })
// db.courseinvites.createIndex({ "email": 1 })
// db.courseinvites.createIndex({ "used": 1 })

// ==================== UserVideoProgress Model ====================
// CRITICAL: UNIQUE compound index for userId + videoId (hot table)
// db.uservideoprogresses.createIndex({ "userId": 1, "videoId": 1 }, { unique: true })
// db.uservideoprogresses.createIndex({ "userId": 1, "completed": 1 })
// db.uservideoprogresses.createIndex({ "videoId": 1 })

// ==================== UserCourseProgress Model ====================
// db.usercourseprogresses.createIndex({ "userId": 1, "courseId": 1 })
// db.usercourseprogresses.createIndex({ "courseId": 1 })
// db.usercourseprogresses.createIndex({ "userId": 1 })

// ==================== UserActivity Model ====================
// db.useractivities.createIndex({ "userId": 1 }, { unique: true })
// db.useractivities.createIndex({ "lastActiveAt": 1 })

// ==================== CourseAnalytics Model ====================
// db.courseanalytics.createIndex({ "courseId": 1 }, { unique: true })

// ==================== AnalyticsEvent Model ====================
// db.analyticevents.createIndex({ "courseId": 1, "createdAt": -1 })
// db.analyticevents.createIndex({ "videoId": 1, "createdAt": -1 })
// db.analyticevents.createIndex({ "userId": 1, "createdAt": -1 })
// db.analyticevents.createIndex({ "eventType": 1, "createdAt": -1 })
// db.analyticevents.createIndex({ "createdAt": 1 }, { expireAfterSeconds: 7776000 }) // 90 days TTL

// ==================== CourseReview Model ====================
// db.coursereviews.createIndex({ "courseId": 1, "userId": 1 }, { unique: true })
// db.coursereviews.createIndex({ "courseId": 1, "rating": 1 })
// db.coursereviews.createIndex({ "userId": 1 })

/**
 * To run all indexes at once, you can use:
 * 
 * mongo your_database_name < database-indexes.js
 * 
 * Or copy-paste each command into MongoDB Compass or MongoDB shell
 */


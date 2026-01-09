# University API Documentation

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
   - [University Registration (OTP-Based)](#university-registration-otp-based)
   - [University Login](#university-login)
   - [Token Management](#token-management)
   - [Email Verification](#email-verification)
3. [Course Management](#course-management)
   - [Create Course](#1-create-course)
   - [Get All Courses](#2-get-all-courses)
   - [Get Course by ID](#3-get-course-by-id)
   - [Update Course](#4-update-course)
   - [Update Course Thumbnail](#5-update-course-thumbnail)
   - [Delete Course](#6-delete-course)
   - [Publish Course](#7-publish-course)
4. [Playlist Management](#playlist-management)
   - [Create Playlist](#1-create-playlist)
   - [Get Playlists](#2-get-playlists)
   - [Update Playlist](#3-update-playlist)
   - [Delete Playlist](#4-delete-playlist)
5. [Video Management](#video-management)
   - [Upload Video](#1-upload-video)
   - [Get Video](#2-get-video)
   - [Get Playlist Videos](#3-get-playlist-videos)
   - [Update Video](#4-update-video)
   - [Delete Video](#5-delete-video)
   - [Update Video Thumbnail](#6-update-video-thumbnail)
6. [Invite Management](#invite-management)
   - [Generate Invite](#1-generate-invite)
   - [Get Sent Invites](#2-get-sent-invites)
7. [Checkpoint Questions](#checkpoint-questions)
   - [Create Question](#1-create-question)
   - [Update Question](#2-update-question)
   - [Delete Question](#3-delete-question)
8. [Analytics](#analytics)
   - [Get Course Analytics](#1-get-course-analytics)
9. [Enrollment Management](#enrollment-management)
   - [Get Course Enrollments](#1-get-course-enrollments)
   - [Approve Enrollment](#2-approve-enrollment)
   - [Reject Enrollment](#3-reject-enrollment)
10. [Error Codes](#error-codes)

---

## Overview

The University API provides endpoints for universities to manage their courses, content, and analytics on the EdTech platform. Universities can create courses, upload videos, manage playlists, generate invites, track analytics, and manage student enrollments.

**Base URL:** `http://13.203.123.56:3100/api`

**Key Features:**
- OTP-based registration and email verification
- Course lifecycle management (DRAFT → LIVE → FULL → COMPLETED)
- Video content management with S3 storage
- Invite-based access control
- Comprehensive analytics and reporting
- Enrollment request management

---

## Authentication

All protected endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <university_jwt_token>
```

**Token Type:** `university`  
**Token Expiry:** 7 days  
**Verification Required:** Yes - Universities must verify their email before accessing protected endpoints

---

### University Registration (OTP-Based)

University registration requires a 3-step OTP verification process:

1. **Send OTP** to admin email
2. **Verify OTP** to get email verification token
3. **Register** with the verification token

#### 1. Send OTP for Registration

Send a 6-digit OTP code to the university admin email address.

**Endpoint:** `POST /api/auth/university/send-otp`

**Authentication:** None (Public)

**Request Body:**
```json
{
  "email": "admin@stanford.edu"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "OTP sent successfully to your email",
  "data": {
    "email": "admin@stanford.edu",
    "expiresAt": "2024-01-15T10:35:00.000Z"
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Email is required |
| 400 | University with this email already exists |
| 503 | Email service is not configured |
| 503 | Failed to send OTP email |

---

#### 2. Verify OTP

Verify the OTP code received via email to get an email verification token.

**Endpoint:** `POST /api/auth/university/verify-otp`

**Authentication:** None (Public)

**Request Body:**
```json
{
  "email": "admin@stanford.edu",
  "otp": "123456"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Email OTP verified successfully. You can now complete registration.",
  "data": {
    "emailVerificationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "email": "admin@stanford.edu"
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Email and OTP are required |
| 400 | Invalid or expired OTP |
| 400 | Maximum verification attempts exceeded |

---

#### 3. Register

Complete university registration using the email verification token from OTP verification.

**Endpoint:** `POST /api/auth/university/register`

**Authentication:** None (Public)

**Request Body:**
```json
{
  "name": "Stanford University",
  "adminEmail": "admin@stanford.edu",
  "password": "securePassword123",
  "emailVerificationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "University registered and verified successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "university": {
      "id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "name": "Stanford University",
      "adminEmail": "admin@stanford.edu",
      "isVerified": true
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Name, admin email, and password are required |
| 400 | Email verification is required |
| 400 | Password must be at least 6 characters long |
| 400 | Invalid or expired email verification token |
| 400 | University with this email already exists |

---

### University Login

**Endpoint:** `POST /api/auth/university/login`

**Authentication:** None (Public)

**Request Body:**
```json
{
  "adminEmail": "admin@stanford.edu",
  "password": "securePassword123"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "university": {
      "id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "name": "Stanford University",
      "adminEmail": "admin@stanford.edu",
      "isVerified": true
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Admin email and password are required |
| 401 | Invalid credentials |
| 403 | University account is inactive |

---

### Token Management

#### Refresh Token

**Endpoint:** `POST /api/auth/university/refresh`

**Authentication:** None (Public)

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

#### Logout

**Endpoint:** `POST /api/auth/university/logout`

**Authentication:** University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### Email Verification

For existing unverified university accounts, use these endpoints to verify email:

#### 1. Resend Verification OTP

**Endpoint:** `POST /api/auth/university/resend-verification-otp`

**Authentication:** None (Public)

**Request Body:**
```json
{
  "email": "admin@stanford.edu"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Verification OTP sent successfully to your email",
  "data": {
    "email": "admin@stanford.edu",
    "expiresAt": "2024-01-15T10:35:00.000Z"
  }
}
```

---

#### 2. Verify Email with OTP

**Endpoint:** `POST /api/auth/university/verify-email-otp`

**Authentication:** None (Public)

**Request Body:**
```json
{
  "email": "admin@stanford.edu",
  "otp": "123456"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Email verified successfully. You can now access all API endpoints."
}
```

---

#### 3. Verify Email (Legacy Token-Based)

**Endpoint:** `GET /api/auth/university/verify-email/:token`

**Authentication:** None (Public)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

---

## Course Management

### 1. Create Course

Create a new course owned by the authenticated university.

**Endpoint:** `POST /api/courses`

**Authentication:** University (Required)

**Request Body:**
```json
{
  "name": "Introduction to Machine Learning",
  "description": "Learn the fundamentals of ML and AI",
  "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/course-123.jpg",
  "inviteOnly": true,
  "maxCompletions": 100,
  "completionDeadline": "2024-12-31T23:59:59.000Z",
  "rewardTokensPerCompletion": 50
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | Course name (max 200 chars) |
| description | string | No | Course description |
| thumbnail | string | No | S3 URL for course thumbnail |
| inviteOnly | boolean | No | Whether course requires invite (default: true) |
| maxCompletions | number | No | Maximum number of course completions allowed |
| completionDeadline | string | No | ISO date string for course completion deadline |
| rewardTokensPerCompletion | number | No | Tokens to reward per completion (default: 0) |

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Course created successfully",
  "data": {
    "course": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "universityId": "65a1b2c3d4e5f6g7h8i9j0k2",
      "name": "Introduction to Machine Learning",
      "description": "Learn the fundamentals of ML and AI",
      "status": "DRAFT",
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Course name is required |
| 401 | Not authorized to access this route |
| 403 | Email verification required |

---

### 2. Get All Courses

Get all courses owned by the authenticated university (includes DRAFT, LIVE, FULL, COMPLETED statuses).

**Endpoint:** `GET /api/courses`

**Authentication:** University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Courses retrieved successfully",
  "data": {
    "courses": [
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
        "universityId": "65a1b2c3d4e5f6g7h8i9j0k2",
        "name": "Introduction to Machine Learning",
        "description": "Learn the fundamentals of ML and AI",
        "status": "LIVE",
        "createdAt": "2024-01-15T10:30:00.000Z"
      }
    ]
  }
}
```

---

### 3. Get Course by ID

Get detailed information about a specific course.

**Endpoint:** `GET /api/courses/:id`

**Authentication:** User or University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Course retrieved successfully",
  "data": {
    "course": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "name": "Introduction to Machine Learning",
      "description": "Learn the fundamentals of ML and AI",
      "status": "LIVE",
      "universityId": "65a1b2c3d4e5f6g7h8i9j0k2"
    }
  }
}
```

---

### 4. Update Course

Update course details (university owner only).

**Endpoint:** `PUT /api/courses/:id`

**Authentication:** University (Required)

**Request Body:**
```json
{
  "name": "Advanced Machine Learning",
  "description": "Updated description",
  "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/new-thumb.jpg",
  "inviteOnly": false
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Course updated successfully",
  "data": {
    "course": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "name": "Advanced Machine Learning",
      "description": "Updated description"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 403 | You do not have permission to update this course |
| 404 | Course not found |

---

### 5. Update Course Thumbnail

Upload and update course thumbnail image.

**Endpoint:** `POST /api/courses/:id/thumbnail`

**Authentication:** University (Required)

**Request:** Multipart form data with `thumbnail` file (max 40MB, image files only)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Course thumbnail updated successfully",
  "data": {
    "course": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/course-123.jpg"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Only image files are allowed for thumbnails |
| 400 | File size too large. Maximum size is 40MB for thumbnails |

---

### 6. Delete Course

Delete a course (university owner only).

**Endpoint:** `DELETE /api/courses/:id`

**Authentication:** University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Course deleted successfully"
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 403 | You do not have permission to delete this course |
| 404 | Course not found |

---

### 7. Publish Course

Publish a course from DRAFT to LIVE status.

**Endpoint:** `POST /api/university/courses/:courseId/publish`

**Authentication:** University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Course is now live",
  "data": {
    "courseId": "65a1b2c3d4e5f6g7h8i9j0k1",
    "status": "LIVE",
    "publishedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Course cannot be published. Current status: LIVE. Only DRAFT courses can be published. |
| 400 | Course must have at least one video before it can be published |
| 400 | maxCompletions must be greater than 0 if set |
| 403 | You do not have permission to publish this course |
| 404 | Course not found |

**Publishing Requirements:**
- Course must be in DRAFT status
- At least one video must exist for the course
- If maxCompletions is set, it must be > 0

---

## Playlist Management

### 1. Create Playlist

Create a new playlist within a course.

**Endpoint:** `POST /api/courses/:courseId/playlists`

**Authentication:** University (Required)

**Request Body:**
```json
{
  "name": "Week 1: Introduction",
  "description": "Introduction to the course",
  "order": 1
}
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Playlist created successfully",
  "data": {
    "playlist": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "courseId": "65a1b2c3d4e5f6g7h8i9j0k2",
      "name": "Week 1: Introduction",
      "order": 1
    }
  }
}
```

---

### 2. Get Playlists

Get all playlists for a course.

**Endpoint:** `GET /api/courses/:courseId/playlists`

**Authentication:** User or University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Playlists retrieved successfully",
  "data": {
    "playlists": [
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
        "name": "Week 1: Introduction",
        "order": 1
      }
    ]
  }
}
```

---

### 3. Update Playlist

Update playlist details.

**Endpoint:** `PUT /api/playlists/:id`

**Authentication:** University (Required)

**Request Body:**
```json
{
  "name": "Week 1: Introduction (Updated)",
  "description": "Updated description",
  "order": 1
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Playlist updated successfully",
  "data": {
    "playlist": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "name": "Week 1: Introduction (Updated)"
    }
  }
}
```

---

### 4. Delete Playlist

Delete a playlist.

**Endpoint:** `DELETE /api/playlists/:id`

**Authentication:** University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Playlist deleted successfully"
}
```

---

## Video Management

### 1. Upload Video

Upload a video file to a playlist.

**Endpoint:** `POST /api/videos`

**Authentication:** University (Required)

**Request:** Multipart form data with:
- `video`: Video file (max 500MB)
- `playlistId`: Playlist ID
- `title`: Video title
- `description`: Video description (optional)
- `order`: Order in playlist (optional)

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Video uploaded successfully",
  "data": {
    "video": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "title": "Introduction Video",
      "playlistId": "65a1b2c3d4e5f6g7h8i9j0k2",
      "videoUrl": "https://s3.amazonaws.com/bucket/videos/video-123.mp4",
      "duration": 3600
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Video file is required |
| 400 | Playlist ID is required |
| 400 | Title is required |
| 413 | File size exceeds 500MB limit |

---

### 2. Get Video

Get video details by ID.

**Endpoint:** `GET /api/videos/:id`

**Authentication:** User or University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Video retrieved successfully",
  "data": {
    "video": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "title": "Introduction Video",
      "videoUrl": "https://s3.amazonaws.com/bucket/videos/video-123.mp4",
      "duration": 3600
    }
  }
}
```

---

### 3. Get Playlist Videos

Get all videos in a playlist.

**Endpoint:** `GET /api/videos/playlists/:playlistId/videos`

**Authentication:** User or University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Videos retrieved successfully",
  "data": {
    "videos": [
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
        "title": "Introduction Video",
        "order": 1
      }
    ]
  }
}
```

---

### 4. Update Video

Update video details.

**Endpoint:** `PUT /api/videos/:id`

**Authentication:** University (Required)

**Request Body:**
```json
{
  "title": "Updated Video Title",
  "description": "Updated description",
  "order": 2
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Video updated successfully",
  "data": {
    "video": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "title": "Updated Video Title"
    }
  }
}
```

---

### 5. Delete Video

Delete a video.

**Endpoint:** `DELETE /api/videos/:id`

**Authentication:** University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Video deleted successfully"
}
```

---

### 6. Update Video Thumbnail

Upload and update video thumbnail image.

**Endpoint:** `POST /api/videos/:id/thumbnail`

**Authentication:** University (Required)

**Request:** Multipart form data with `thumbnail` file (max 40MB, image files only)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Video thumbnail updated successfully",
  "data": {
    "video": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/video-123.jpg"
    }
  }
}
```

---

## Invite Management

### 1. Generate Invite

Generate an invite for a course (email, link, or code).

**Endpoint:** `POST /api/invites/courses/:courseId/generate`

**Authentication:** University (Required)

**Request Body:**
```json
{
  "type": "email",
  "email": "student@example.com",
  "expiresIn": 7
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | string | Yes | Invite type: "email", "link", or "code" |
| email | string | Conditional | Required if type is "email" |
| expiresIn | number | No | Days until invite expires (default: 30) |

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Invite generated successfully",
  "data": {
    "invite": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "courseId": "65a1b2c3d4e5f6g7h8i9j0k2",
      "type": "email",
      "token": "abc123xyz",
      "expiresAt": "2024-02-15T10:30:00.000Z"
    }
  }
}
```

---

### 2. Get Sent Invites

Get all invites sent for a course.

**Endpoint:** `GET /api/invites/sent/:courseId`

**Authentication:** University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Invites retrieved successfully",
  "data": {
    "invites": [
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
        "type": "email",
        "email": "student@example.com",
        "status": "PENDING",
        "expiresAt": "2024-02-15T10:30:00.000Z"
      }
    ]
  }
}
```

---

## Checkpoint Questions

### 1. Create Question

Create a checkpoint question for a video.

**Endpoint:** `POST /api/checkpoints/videos/:videoId/questions`

**Authentication:** University (Required)

**Request Body:**
```json
{
  "checkpointTime": 300,
  "question": "What is machine learning?",
  "options": [
    "A type of database",
    "A subset of artificial intelligence",
    "A programming language",
    "A web framework"
  ],
  "correctAnswer": 1,
  "explanation": "Machine learning is a subset of AI that enables systems to learn from data."
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| checkpointTime | number | Yes | Time in seconds when question appears |
| question | string | Yes | Question text |
| options | array | Yes | Array of answer options |
| correctAnswer | number | Yes | Index of correct answer (0-based) |
| explanation | string | No | Explanation for the correct answer |

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Question created successfully",
  "data": {
    "question": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "videoId": "65a1b2c3d4e5f6g7h8i9j0k2",
      "checkpointTime": 300,
      "question": "What is machine learning?"
    }
  }
}
```

---

### 2. Update Question

Update a checkpoint question.

**Endpoint:** `PUT /api/checkpoints/questions/:id`

**Authentication:** University (Required)

**Request Body:**
```json
{
  "question": "What is machine learning? (Updated)",
  "options": [
    "A type of database",
    "A subset of artificial intelligence",
    "A programming language"
  ],
  "correctAnswer": 1
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Question updated successfully",
  "data": {
    "question": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "question": "What is machine learning? (Updated)"
    }
  }
}
```

---

### 3. Delete Question

Delete a checkpoint question.

**Endpoint:** `DELETE /api/checkpoints/questions/:id`

**Authentication:** University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Question deleted successfully"
}
```

---

## Analytics

### 1. Get Course Analytics

Get comprehensive analytics for a course.

**Endpoint:** `GET /api/university/courses/:courseId/analytics`

**Authentication:** University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Course analytics retrieved successfully",
  "data": {
    "analytics": {
      "course": {
        "title": "Introduction to Machine Learning",
        "maxCompletions": 100,
        "completedCount": 45,
        "status": "LIVE"
      },
      "enrollments": {
        "totalRequested": 50,
        "totalApproved": 45,
        "totalCompleted": 30,
        "totalExpired": 2,
        "totalRejected": 3,
        "totalInProgress": 15
      },
      "tokens": {
        "totalTokensIssued": 1500
      },
      "videos": [
        {
          "videoId": "65a1b2c3d4e5f6g7h8i9j0k1",
          "title": "Introduction Video",
          "productAnalytics": {
            "views": 100,
            "clicks": 25,
            "purchases": 5,
            "conversionRate": 20
          }
        }
      ]
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 403 | You do not have permission to view analytics for this course |
| 404 | Course not found |

---

## Enrollment Management

### 1. Get Course Enrollments

Get all enrollment requests for a course.

**Endpoint:** `GET /api/courses/:courseId/enrollments`

**Authentication:** University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Enrollments retrieved successfully",
  "data": {
    "enrollments": [
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
        "userId": {
          "_id": "65a1b2c3d4e5f6g7h8i9j0k2",
          "profile": {
            "name": {
              "first": "John",
              "last": "Doe"
            },
            "email": "john@example.com"
          }
        },
        "status": "REQUESTED",
        "createdAt": "2024-01-15T10:30:00.000Z"
      }
    ]
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 403 | You do not have permission to view enrollments for this course |
| 404 | Course not found |

---

### 2. Approve Enrollment

Approve a pending enrollment request.

**Endpoint:** `POST /api/courses/:courseId/enrollments/:enrollmentId/approve`

**Authentication:** University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Enrollment approved successfully",
  "data": {
    "enrollment": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "status": "APPROVED"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Course has reached maximum completions limit |
| 403 | You do not have permission to approve enrollments for this course |
| 404 | Enrollment not found |
| 404 | Course not found |

**Note:** If the course reaches `maxCompletions`, the course status will automatically change to `FULL` and no more enrollments can be approved.

---

### 3. Reject Enrollment

Reject a pending enrollment request.

**Endpoint:** `POST /api/courses/:courseId/enrollments/:enrollmentId/reject`

**Authentication:** University (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Enrollment rejected successfully",
  "data": {
    "enrollment": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "status": "REJECTED"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 403 | You do not have permission to reject enrollments for this course |
| 404 | Enrollment not found |
| 404 | Course not found |

---

## Error Codes

### Common HTTP Status Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 201 | Created successfully |
| 400 | Bad request (validation error, missing parameters) |
| 401 | Unauthorized (missing or invalid token) |
| 403 | Forbidden (insufficient permissions, unverified email) |
| 404 | Resource not found |
| 413 | Payload too large (file size limit exceeded) |
| 500 | Internal server error |
| 503 | Service unavailable (email service not configured) |

### Common Error Response Format

```json
{
  "success": false,
  "message": "Error message describing what went wrong",
  "error": "Detailed error message (development only)"
}
```

### Authentication Errors

- **401 Unauthorized:** Token missing, invalid, or expired
- **403 Forbidden:** 
  - Email verification required
  - University account is inactive
  - Insufficient permissions (not course owner)

### Validation Errors

- **400 Bad Request:** Missing required fields, invalid data format, or business rule violations

---

## Notes

1. **Email Verification:** All universities must verify their email before accessing protected endpoints. Unverified universities will receive a `403 Forbidden` error.

2. **Course Status Flow:** 
   - `DRAFT` → `LIVE` (via publish endpoint)
   - `LIVE` → `FULL` (when maxCompletions reached)
   - `FULL` → `COMPLETED` (when all enrollments completed)

3. **File Upload Limits:**
   - Video files: 500MB maximum
   - Thumbnail images: 40MB maximum
   - Only image files allowed for thumbnails

4. **Token Management:**
   - Tokens expire after 7 days
   - Use refresh token endpoint to get new tokens
   - Logout invalidates tokens in Redis blacklist

5. **Ownership Verification:** All course-related operations verify that the authenticated university owns the course before allowing access.


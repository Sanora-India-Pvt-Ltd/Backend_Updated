# Course API Documentation

## Table of Contents

1. [Overview](#overview)
2. [Authentication](#authentication)
   - [University Registration (OTP-Based)](#university-registration-otp-based)
   - [University Login](#university-login)
   - [University Email Verification](#university-email-verification)
     - [Resend Verification OTP](#1-resend-verification-otp)
     - [Verify Email with OTP](#2-verify-email-with-otp)
     - [Verify Email (Legacy)](#3-verify-email-legacy-token-based)
3. [Course Management](#course-management)
   - [Create Course](#1-create-course)
   - [Get All Courses](#2-get-all-courses)
   - [Get Course by ID](#3-get-course-by-id)
   - [Update Course](#4-update-course)
   - [Update Course Thumbnail](#5-update-course-thumbnail)
   - [Delete Course](#6-delete-course)
4. [Playlist Management](#playlist-management)
   - [Create Playlist](#1-create-playlist)
   - [Get Playlists](#2-get-playlists)
   - [Get Single Playlist](#2a-get-single-playlist)
   - [Update Playlist](#3-update-playlist)
   - [Update Playlist Thumbnail](#4-update-playlist-thumbnail)
   - [Delete Playlist](#5-delete-playlist)
5. [Invite System](#invite-system)
   - [Generate Invite](#1-generate-invite)
   - [Validate Invite](#2-validate-invite)
   - [Accept Invite](#3-accept-invite)
   - [Get My Invites](#4-get-my-invites)
   - [Get Sent Invites](#5-get-sent-invites)
6. [Video Management](#video-management)
   - [Upload Video](#1-upload-video)
   - [Get Video](#2-get-video)
   - [Get Playlist Videos](#3-get-playlist-videos)
   - [Update Video](#4-update-video)
   - [Delete Video](#5-delete-video)
   - [Update Video Thumbnail](#6-update-video-thumbnail)
7. [Checkpoint Questions](#checkpoint-questions)
   - [Create Question](#1-create-question)
   - [Get Question at Checkpoint](#2-get-question-at-checkpoint)
   - [Get All Questions](#3-get-all-questions)
   - [Validate Answer](#4-validate-answer)
   - [Update Question](#5-update-question)
   - [Delete Question](#6-delete-question)
8. [Progress Tracking](#progress-tracking)
   - [Update Video Progress](#1-update-video-progress)
   - [Get Video Progress](#2-get-video-progress)
   - [Get Playlist Progress](#3-get-playlist-progress)
   - [Get Course Progress](#4-get-course-progress)
   - [Mark Video Complete](#5-mark-video-complete)
   - [Get Completion Stats](#6-get-completion-stats)
   - [Reset Progress](#7-reset-progress)
9. [Analytics](#analytics)
   - [Get Course Analytics](#1-get-course-analytics)
   - [Get Most Repeated Segments](#2-get-most-repeated-segments)
   - [Get Idle Users](#3-get-idle-users)
   - [Get Engagement Metrics](#4-get-engagement-metrics)
10. [Reviews](#reviews)
    - [Create Review](#1-create-review)
    - [Get Reviews](#2-get-reviews)
    - [Update Review](#3-update-review)
    - [Delete Review](#4-delete-review)
    - [Get Average Rating](#5-get-average-rating)
11. [Error Codes](#error-codes)
12. [Rate Limiting](#rate-limiting)

---

## Overview

The Course API provides comprehensive endpoints for managing an invite-only EdTech platform where universities own and manage courses. The API supports:

- **University-owned courses** (not public marketplace)
- **Invite-based access** (email/link/code)
- **Video content management** with S3 storage
- **Progress tracking** with throttling
- **Analytics and reporting**
- **Course reviews and ratings**

**Base URL:** `http://13.203.123.56:3100/api`

---

## Authentication

### University Authentication

University endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <university_jwt_token>
```

**Token Type:** `university`

**Token Expiry:** 7 days

**Verification Required:** 
- Universities must verify their email via OTP during registration
- Registration automatically verifies the account (no separate verification step needed)
- Unverified universities (if any exist from legacy registration) will receive a `403 Forbidden` error with message: "Email verification required"
- Only verified universities can create courses, upload videos, generate invites, and access analytics

### University Registration (OTP-Based)

University registration requires **email OTP verification** before account creation. The process involves three steps:

1. **Send OTP** to admin email
2. **Verify OTP** to get email verification token
3. **Register** with the verification token

---

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

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | Yes | Admin email address (must not be already registered) |

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

**What Happens:**
- 6-digit OTP code is generated
- OTP is sent to the provided email address
- OTP expires in 5 minutes (configurable via `OTP_EXPIRY_MINUTES`)
- Maximum 5 verification attempts allowed

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Email is required |
| 400 | University with this email already exists |
| 503 | Email service is not configured |
| 503 | Failed to send OTP email |
| 500 | Error sending OTP |

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

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | Yes | Admin email address (same as used in send-otp) |
| otp | string | Yes | 6-digit OTP code received via email |

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

**What Happens:**
- OTP is validated (checks expiry, attempts, and correctness)
- Email verification token (JWT) is generated (expires in 20 minutes)
- Token must be used in registration request

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Email and OTP are required |
| 400 | OTP not found or already used |
| 400 | OTP expired |
| 400 | Too many attempts. Please request a new OTP |
| 400 | Invalid OTP |
| 500 | Error verifying OTP |

**Note:** The `emailVerificationToken` expires in 20 minutes. Use it immediately in the registration request.

---

#### 3. Register University

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

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | University name |
| adminEmail | string | Yes | Admin email address (must match OTP verification email) |
| password | string | Yes | Password (minimum 6 characters) |
| emailVerificationToken | string | Yes | Token from `/verify-otp` endpoint |

**Response (201 Created):**
```json
{
  "success": true,
  "message": "University registered and verified successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "university": {
      "id": "65a1b2c3d4e5f6g7h8i9j0k2",
      "name": "Stanford University",
      "adminEmail": "admin@stanford.edu",
      "isVerified": true
    }
  }
}
```

**What Happens:**
- Email verification token is validated
- University account is created with `isVerified: true` (automatically verified via OTP)
- JWT token is returned (expires in 7 days) for immediate API access
- Password is hashed and stored securely

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Name, admin email, and password are required |
| 400 | Email verification is required. Please verify your email using /api/auth/university/send-otp and /api/auth/university/verify-otp |
| 400 | Invalid or expired email verification token. Please verify your email OTP again. |
| 400 | Invalid email verification token. Email does not match or token is invalid. |
| 400 | Password must be at least 6 characters long |
| 400 | University with this email already exists |
| 500 | Error registering university |

**Registration Flow:**
1. Call `POST /api/auth/university/send-otp` with email
2. Receive OTP code via email
3. Call `POST /api/auth/university/verify-otp` with email and OTP
4. Receive `emailVerificationToken` (valid for 20 minutes)
5. Call `POST /api/auth/university/register` with university details and token
6. Account is created and automatically verified - ready to use API immediately

---

### University Login

Login to an existing university account.

**Endpoint:** `POST /api/auth/university/login`

**Authentication:** None (Public)

**Request Body:**
```json
{
  "adminEmail": "admin@stanford.edu",
  "password": "securePassword123"
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| adminEmail | string | Yes | Admin email address |
| password | string | Yes | Password |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "university": {
      "id": "65a1b2c3d4e5f6g7h8i9j0k2",
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
| 403 | Email verification required (if trying to access protected endpoints) |
| 500 | Error logging in |

---

### University Email Verification

For existing unverified university accounts, you can verify your email using OTP. This is useful if your account was created before the OTP flow was implemented or if verification was not completed.

---

#### 1. Resend Verification OTP

Request a new verification OTP code to be sent to your email address.

**Endpoint:** `POST /api/auth/university/resend-verification-otp`

**Authentication:** None (Public)

**Request Body:**
```json
{
  "email": "admin@stanford.edu"
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | Yes | Admin email address of existing university account |

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

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Email is required |
| 400 | University email is already verified |
| 404 | University not found with this email |
| 503 | Email service is not configured |
| 503 | Failed to send OTP email |
| 500 | Error sending verification OTP |

---

#### 2. Verify Email with OTP

Verify your email address using the OTP code received via email.

**Endpoint:** `POST /api/auth/university/verify-email-otp`

**Authentication:** None (Public)

**Request Body:**
```json
{
  "email": "admin@stanford.edu",
  "otp": "123456"
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | Yes | Admin email address |
| otp | string | Yes | 6-digit OTP code received via email |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Email verified successfully. You can now access all API endpoints."
}
```

**What Happens:**
- OTP is validated
- University `verification.isVerified` is set to `true`
- University can now access all protected API endpoints

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Email and OTP are required |
| 400 | University email is already verified |
| 400 | OTP not found or already used |
| 400 | OTP expired |
| 400 | Too many attempts. Please request a new OTP |
| 400 | Invalid OTP |
| 404 | University not found |
| 500 | Error verifying email |

**Verification Flow for Existing Accounts:**
1. Call `POST /api/auth/university/resend-verification-otp` with your email
2. Receive OTP code via email
3. Call `POST /api/auth/university/verify-email-otp` with email and OTP
4. Account is verified - you can now use all API endpoints

---

#### 3. Verify Email (Legacy - Token-based)

Verify university email address using a verification token (legacy method, for accounts created before OTP flow).

**Endpoint:** `GET /api/auth/university/verify-email/:token`

**Authentication:** None (Public)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| token | string | Yes | Verification token (received via email) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Verification token is required |
| 400 | Invalid or expired verification token |
| 500 | Error verifying email |

**Important Notes:** 
- **Email verification is REQUIRED** - Unverified universities cannot access protected API endpoints (course creation, video upload, etc.)
- **For existing unverified accounts:** Use the OTP verification flow (`resend-verification-otp` → `verify-email-otp`)
- **For new registrations:** Verification is automatic via OTP during registration
- After verification, the university can immediately use all API endpoints

---

### User Authentication

User endpoints require a JWT token in the Authorization header:

```
Authorization: Bearer <user_jwt_token>
```

**Token Type:** `user`

**Token Expiry:** 1 hour (with refresh token support)

### Getting Tokens

- **University Registration (OTP-Based):**
  - `POST /api/auth/university/send-otp` - Send OTP to email
  - `POST /api/auth/university/verify-otp` - Verify OTP and get token
  - `POST /api/auth/university/register` - Complete registration with token
- **University Login:** `POST /api/auth/university/login`
- **University Email Verification:**
  - `POST /api/auth/university/resend-verification-otp` - Resend OTP for existing accounts
  - `POST /api/auth/university/verify-email-otp` - Verify email with OTP
  - `GET /api/auth/university/verify-email/:token` - Legacy token-based verification
- **User Login:** `POST /api/auth/login` (existing user auth)

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
  "inviteOnly": true
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | Course name (max 200 chars) |
| description | string | No | Course description |
| thumbnail | string | No | S3 URL for course thumbnail |
| inviteOnly | boolean | No | Whether course requires invite (default: true) |

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
      "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/course-123.jpg",
      "inviteOnly": true,
      "stats": {
        "totalUsers": 0
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Course name is required |
| 401 | Not authorized to access this route |
| 500 | Error creating course |

---

### 2. Get All Courses

Get all courses owned by the authenticated university.

**Endpoint:** `GET /api/courses`

**Authentication:** University (Required)

**Query Parameters:** None

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
        "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/course-123.jpg",
        "inviteOnly": true,
        "stats": {
          "totalUsers": 45
        },
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      }
    ]
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 500 | Error retrieving courses |

---

### 3. Get Course by ID

Get detailed information about a specific course.

**Endpoint:** `GET /api/courses/:id`

**Authentication:** User or University (Required)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Course ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Course retrieved successfully",
  "data": {
    "course": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "universityId": "65a1b2c3d4e5f6g7h8i9j0k2",
      "name": "Introduction to Machine Learning",
      "description": "Learn the fundamentals of ML and AI",
      "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/course-123.jpg",
      "inviteOnly": true,
      "stats": {
        "totalUsers": 45
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 403 | Access denied. You must be enrolled in this course. |
| 404 | Course not found |
| 500 | Error retrieving course |

**Note:** 
- Course owners can always access their courses
- Other users must be enrolled (have progress record) to access

---

### 4. Update Course

Update course details (owner only).

**Endpoint:** `PUT /api/courses/:id`

**Authentication:** University (Required - Owner Only)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Course ID (MongoDB ObjectId) |

**Request Body:**
```json
{
  "name": "Advanced Machine Learning",
  "description": "Deep dive into advanced ML techniques",
  "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/course-123-updated.jpg",
  "inviteOnly": false
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | No | Course name |
| description | string | No | Course description |
| thumbnail | string | No | S3 URL for course thumbnail |
| inviteOnly | boolean | No | Whether course requires invite |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Course updated successfully",
  "data": {
    "course": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "universityId": "65a1b2c3d4e5f6g7h8i9j0k2",
      "name": "Advanced Machine Learning",
      "description": "Deep dive into advanced ML techniques",
      "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/course-123-updated.jpg",
      "inviteOnly": false,
      "stats": {
        "totalUsers": 45
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-16T14:20:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 403 | You do not have permission to update this course |
| 404 | Course not found |
| 500 | Error updating course |

---

### 5. Update Course Thumbnail

Upload a new thumbnail for a course (course owner only).

**Endpoint:** `POST /api/courses/:id/thumbnail`

**Authentication:** University (Required - Course Owner)

**Content-Type:** `multipart/form-data`

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Course ID (MongoDB ObjectId) |

**Request Body (Form Data):**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| thumbnail | file | Yes | Thumbnail image file (JPG, PNG, GIF, WebP, etc.) - **Images only** |

**Example Request (cURL):**
```bash
curl -X POST http://localhost:3100/api/courses/65a1b2c3d4e5f6g7h8i9j0k1/thumbnail \
  -H "Authorization: Bearer <university_token>" \
  -F "thumbnail=@/path/to/thumbnail.jpg"
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Course thumbnail updated successfully",
  "data": {
    "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/course-123/thumb-789.jpg"
  }
}
```

**What Happens:**
- Thumbnail file is uploaded to S3
- Course thumbnail field is updated with the S3 URL
- Thumbnail is stored as public-read in S3

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Thumbnail file is required |
| 400 | Only image files are allowed for thumbnails |
| 400 | File size too large. Maximum size is 40MB for thumbnails |
| 401 | Not authorized to access this route |
| 403 | You do not have permission to update this course thumbnail |
| 404 | Course not found |
| 500 | Error updating course thumbnail |

**Note:** 
- Maximum file size is **40MB** for thumbnails
- **Only image files are allowed** (JPG, PNG, GIF, WebP, etc.) - video files are not accepted

---

### 6. Delete Course

Delete a course and all associated data (owner only).

**Endpoint:** `DELETE /api/courses/:id`

**Authentication:** University (Required - Owner Only)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Course ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Course deleted successfully"
}
```

**Cascade Deletion:**
When a course is deleted, the following are also deleted:
- All playlists in the course
- All videos in the course
- All invites for the course
- All user progress records for the course

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 403 | You do not have permission to delete this course |
| 404 | Course not found |
| 500 | Error deleting course |

---

## Playlist Management

### 1. Create Playlist

Create a new playlist within a course (course owner only).

**Endpoint:** `POST /api/courses/:courseId/playlists`

**Authentication:** University (Required - Course Owner)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| courseId | string | Yes | Course ID (MongoDB ObjectId) |

**Request Body:**
```json
{
  "name": "Week 1: Introduction",
  "description": "Introduction to the course",
  "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/playlist-123.jpg",
  "order": 1
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | Playlist name |
| description | string | No | Playlist description |
| thumbnail | string | No | S3 URL for playlist thumbnail |
| order | number | No | Display order (default: 0) |

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Playlist created successfully",
  "data": {
    "playlist": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k3",
      "courseId": "65a1b2c3d4e5f6g7h8i9j0k1",
      "name": "Week 1: Introduction",
      "description": "Introduction to the course",
      "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/playlist-123.jpg",
      "order": 1,
      "createdAt": "2024-01-15T10:35:00.000Z",
      "updatedAt": "2024-01-15T10:35:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Playlist name is required |
| 401 | Not authorized to access this route |
| 403 | You do not have permission to create playlists for this course |
| 404 | Course not found |
| 500 | Error creating playlist |

---

### 2. Get Playlists

Get all playlists for a specific course.

**Endpoint:** `GET /api/courses/:courseId/playlists`

**Authentication:** User or University (Required - Course Owner or Enrolled User)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| courseId | string | Yes | Course ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Playlists retrieved successfully",
  "data": {
    "playlists": [
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k3",
        "courseId": "65a1b2c3d4e5f6g7h8i9j0k1",
        "name": "Week 1: Introduction",
        "description": "Introduction to the course",
        "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/playlist-123.jpg",
        "order": 1,
        "createdAt": "2024-01-15T10:35:00.000Z",
        "updatedAt": "2024-01-15T10:35:00.000Z"
      }
    ]
  }
}
```

**Note:** 
- Playlists are sorted by `order` field (ascending), then by `createdAt`.
- **Course owners (universities)** can access this endpoint using their university token.
- **Enrolled users** can access this endpoint using their user token.

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 500 | Error retrieving playlists |

---

### 2a. Get Single Playlist

Get a single playlist by ID with all its videos.

**Endpoint:** `GET /api/playlists/:id`

**Authentication:** User or University (Required - Course Owner or Enrolled User)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Playlist ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Playlist retrieved successfully",
  "data": {
    "playlist": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k3",
      "courseId": "65a1b2c3d4e5f6g7h8i9j0k1",
      "details": {
        "name": "Week 1: Introduction",
        "description": "Introduction to the course",
        "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/playlist-123.jpg"
      },
      "order": 1,
      "createdAt": "2024-01-15T10:35:00.000Z",
      "updatedAt": "2024-01-15T10:35:00.000Z",
      "videos": [
        {
          "_id": "65a1b2c3d4e5f6g7h8i9j0k4",
          "details": {
            "title": "Introduction Video",
            "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/video-456.jpg"
          },
          "media": {
            "duration": 600
          },
          "order": 1
        }
      ]
    }
  }
}
```

**What's Included:**
- Full playlist details (name, description, thumbnail, order)
- All videos in the playlist (sorted by order)
- Each video includes title, thumbnail, and duration

**Access Control:**
- **Course owners (universities)** can access any playlist in their courses
- **Enrolled users** can access playlists from courses they're enrolled in
- Returns 403 if user is not enrolled and not the course owner

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 403 | You do not have permission to access this playlist |
| 403 | You must be enrolled in this course to access playlists |
| 404 | Playlist not found |
| 404 | Course not found |
| 500 | Error retrieving playlist |

---

### 3. Update Playlist

Update playlist details (reorder, rename, etc.) - course owner only.

**Endpoint:** `PUT /api/playlists/:id`

**Authentication:** University (Required - Course Owner)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Playlist ID (MongoDB ObjectId) |

**Request Body:**
```json
{
  "name": "Week 1: Introduction (Updated)",
  "description": "Updated description",
  "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/playlist-123-updated.jpg",
  "order": 2
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | No | Playlist name |
| description | string | No | Playlist description |
| thumbnail | string | No | S3 URL for playlist thumbnail |
| order | number | No | Display order |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Playlist updated successfully",
  "data": {
    "playlist": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k3",
      "courseId": "65a1b2c3d4e5f6g7h8i9j0k1",
      "name": "Week 1: Introduction (Updated)",
      "description": "Updated description",
      "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/playlist-123-updated.jpg",
      "order": 2,
      "createdAt": "2024-01-15T10:35:00.000Z",
      "updatedAt": "2024-01-16T14:25:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 403 | You do not have permission to update this playlist |
| 404 | Playlist not found |
| 500 | Error updating playlist |

---

### 4. Update Playlist Thumbnail

Upload a new thumbnail for a playlist (course owner only).

**Endpoint:** `POST /api/playlists/:id/thumbnail`

**Authentication:** University (Required - Course Owner)

**Content-Type:** `multipart/form-data`

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Playlist ID (MongoDB ObjectId) |

**Request Body (Form Data):**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| thumbnail | file | Yes | Thumbnail image file (JPG, PNG, GIF, WebP, etc.) - **Images only** |

**Example Request (cURL):**
```bash
curl -X POST http://localhost:3100/api/playlists/65a1b2c3d4e5f6g7h8i9j0k3/thumbnail \
  -H "Authorization: Bearer <university_token>" \
  -F "thumbnail=@/path/to/thumbnail.jpg"
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Playlist thumbnail updated successfully",
  "data": {
    "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/playlist-123/thumb-789.jpg"
  }
}
```

**What Happens:**
- Thumbnail file is uploaded to S3
- Playlist thumbnail field is updated with the S3 URL
- Thumbnail is stored as public-read in S3

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Thumbnail file is required |
| 400 | Only image files are allowed for thumbnails |
| 400 | File size too large. Maximum size is 40MB for thumbnails |
| 401 | Not authorized to access this route |
| 403 | You do not have permission to update this playlist thumbnail |
| 404 | Playlist not found |
| 500 | Error updating playlist thumbnail |

**Note:** 
- Maximum file size is **40MB** for thumbnails
- **Only image files are allowed** (JPG, PNG, GIF, WebP, etc.) - video files are not accepted

---

### 5. Delete Playlist

Delete a playlist and all videos in it (course owner only).

**Endpoint:** `DELETE /api/playlists/:id`

**Authentication:** University (Required - Course Owner)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Playlist ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Playlist deleted successfully"
}
```

**Cascade Deletion:**
When a playlist is deleted, all videos in the playlist are also deleted.

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 403 | You do not have permission to delete this playlist |
| 404 | Playlist not found |
| 500 | Error deleting playlist |

---

## Invite System

### 1. Generate Invite

Generate an invite link/code for a course (university only).

**Endpoint:** `POST /api/invites/courses/:courseId/generate`

**Authentication:** University (Required - Course Owner)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| courseId | string | Yes | Course ID (MongoDB ObjectId) |

**Request Body:**
```json
{
  "email": "student@example.com",
  "expiresInDays": 7
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| email | string | No | Specific email for invite (null for open invite) |
| expiresInDays | number | No | Days until invite expires (default: 7) |

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Invite generated successfully",
  "data": {
    "invite": {
      "id": "65a1b2c3d4e5f6g7h8i9j0k4",
      "email": "student@example.com",
      "expiresAt": "2024-01-22T10:40:00.000Z"
    },
    "shareableLink": "https://your-frontend.com/invite/a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",
    "inviteCode": "A1B2C3D4",
    "token": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6"
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| shareableLink | string | Full URL to accept invite (frontend) |
| inviteCode | string | Short 8-character code for manual entry |
| token | string | Full token (returned only once) |

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 403 | You do not have permission to create invites for this course |
| 404 | Course not found |
| 500 | Error generating invite |

---

### 2. Validate Invite

Check if an invite token is valid and not expired (public endpoint).

**Endpoint:** `GET /api/invites/validate/:token`

**Authentication:** None (Public)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| token | string | Yes | Invite token (from shareable link or code) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Invite is valid",
  "data": {
    "invite": {
      "id": "65a1b2c3d4e5f6g7h8i9j0k4",
      "course": {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
        "name": "Introduction to Machine Learning",
        "description": "Learn the fundamentals of ML and AI",
        "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/course-123.jpg"
      },
      "email": "student@example.com",
      "expiresAt": "2024-01-22T10:40:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Invalid or expired invite token |
| 500 | Error validating invite |

---

### 3. Accept Invite

Accept an invite and enroll in the course (user authentication required).

**Endpoint:** `POST /api/invites/accept/:token`

**Authentication:** User (Required)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| token | string | Yes | Invite token |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Invite accepted successfully. You are now enrolled in the course."
}
```

**What Happens:**
- Invite is marked as used
- User-course progress record is created
- Course `totalUsers` stat is incremented

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Invalid or expired invite token |
| 400 | You are already enrolled in this course |
| 401 | Not authorized to access this route |
| 403 | This invite is for a different email address |
| 500 | Error accepting invite |

**Note:** If invite is email-specific, user's email must match invite email.

---

### 4. Get My Invites

Get all pending invites for the authenticated user.

**Endpoint:** `GET /api/invites/my-invites`

**Authentication:** User (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Invites retrieved successfully",
  "data": {
    "invites": [
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k4",
        "courseId": {
          "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
          "name": "Introduction to Machine Learning",
          "description": "Learn the fundamentals of ML and AI",
          "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/course-123.jpg"
        },
        "email": "student@example.com",
        "expiresAt": "2024-01-22T10:40:00.000Z",
        "used": false,
        "createdAt": "2024-01-15T10:40:00.000Z"
      }
    ]
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 404 | User not found |
| 500 | Error retrieving invites |

---

### 5. Get Sent Invites

Get all invites sent for a course (university only).

**Endpoint:** `GET /api/invites/sent/:courseId`

**Authentication:** University (Required - Course Owner)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| courseId | string | Yes | Course ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Invites retrieved successfully",
  "data": {
    "invites": [
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k4",
        "courseId": "65a1b2c3d4e5f6g7h8i9j0k1",
        "email": "student@example.com",
        "expiresAt": "2024-01-22T10:40:00.000Z",
        "used": true,
        "usedBy": {
          "_id": "65a1b2c3d4e5f6g7h8i9j0k5",
          "profile": {
            "name": {
              "full": "John Doe"
            },
            "email": "student@example.com"
          }
        },
        "usedAt": "2024-01-16T09:15:00.000Z",
        "createdAt": "2024-01-15T10:40:00.000Z"
      }
    ]
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 403 | You do not have permission to view invites for this course |
| 404 | Course not found |
| 500 | Error retrieving invites |

---

## Video Management

### 1. Upload Video

Upload a video file to S3 and create video document (course owner only).

**Endpoint:** `POST /api/videos`

**Authentication:** University (Required - Course Owner)

**Content-Type:** `multipart/form-data`

**Request Body (Form Data):**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| video | file | Yes | Video file (max 500MB) |
| playlistId | string | Yes | Playlist ID (MongoDB ObjectId) |
| title | string | Yes | Video title |
| description | string | No | Video description |
| order | number | No | Display order (default: 0) |

**Example Request (cURL):**
```bash
curl -X POST https://your-api-domain.com/api/videos \
  -H "Authorization: Bearer <university_token>" \
  -F "video=@/path/to/video.mp4" \
  -F "playlistId=65a1b2c3d4e5f6g7h8i9j0k3" \
  -F "title=Introduction Video" \
  -F "description=Welcome to the course"
```

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Video uploaded successfully",
  "data": {
    "video": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k6",
      "playlistId": "65a1b2c3d4e5f6g7h8i9j0k3",
      "courseId": "65a1b2c3d4e5f6g7h8i9j0k1",
      "title": "Introduction Video",
      "description": "Welcome to the course",
      "videoUrl": "https://s3.amazonaws.com/bucket/videos/course-123/video-456.mp4",
      "s3Key": "videos/course-123/video-456.mp4",
      "duration": 0,
      "order": 0,
      "createdAt": "2024-01-15T10:45:00.000Z",
      "updatedAt": "2024-01-15T10:45:00.000Z"
    }
  }
}
```

**Note:** 
- Videos are stored as **private** in S3
- Use signed URLs for streaming (see video service)
- Duration can be calculated later with ffmpeg

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Playlist ID and title are required |
| 400 | Video file is required |
| 401 | Not authorized to access this route |
| 403 | You do not have permission to upload videos to this playlist |
| 404 | Playlist not found |
| 500 | Error uploading video |

---

### 2. Get Video

Get video details with progress tracking.

**Endpoint:** `GET /api/videos/:id`

**Authentication:** User (Required)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Video ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Video retrieved successfully",
  "data": {
    "video": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k6",
      "playlistId": {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k3",
        "name": "Week 1: Introduction"
      },
      "courseId": {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k1",
        "name": "Introduction to Machine Learning"
      },
      "title": "Introduction Video",
      "description": "Welcome to the course",
      "videoUrl": "https://s3.amazonaws.com/bucket/videos/course-123/video-456.mp4",
      "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/video-456.jpg",
      "subtitles": "WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nWelcome to the course...",
      "duration": 300,
      "order": 0,
      "createdAt": "2024-01-15T10:45:00.000Z",
      "updatedAt": "2024-01-15T10:45:00.000Z"
    },
    "progress": {
      "lastWatchedSecond": 120,
      "completed": false
    }
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| video | object | Video details |
| progress | object | User's progress (if authenticated) |
| progress.lastWatchedSecond | number | Last watched position in seconds |
| progress.completed | boolean | Whether video is completed |

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 404 | Video not found |
| 500 | Error retrieving video |

---

### 3. Get Playlist Videos

Get all videos in a playlist with progress tracking.

**Endpoint:** `GET /api/videos/playlists/:playlistId/videos`

**Authentication:** User (Required)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| playlistId | string | Yes | Playlist ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Videos retrieved successfully",
  "data": {
    "videos": [
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k6",
        "playlistId": "65a1b2c3d4e5f6g7h8i9j0k3",
        "courseId": "65a1b2c3d4e5f6g7h8i9j0k1",
        "title": "Introduction Video",
        "description": "Welcome to the course",
        "videoUrl": "https://s3.amazonaws.com/bucket/videos/course-123/video-456.mp4",
        "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/video-456.jpg",
        "duration": 300,
        "order": 0,
        "progress": {
          "lastWatchedSecond": 120,
          "completed": false
        },
        "createdAt": "2024-01-15T10:45:00.000Z"
      }
    ]
  }
}
```

**Note:** Videos are sorted by `order` field (ascending), then by `createdAt`.

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 500 | Error retrieving videos |

---

### 4. Update Video

Update video metadata (course owner only).

**Endpoint:** `PUT /api/videos/:id`

**Authentication:** University (Required - Course Owner)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Video ID (MongoDB ObjectId) |

**Request Body:**
```json
{
  "title": "Introduction Video (Updated)",
  "description": "Updated description",
  "order": 1
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| title | string | No | Video title |
| description | string | No | Video description |
| order | number | No | Display order |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Video updated successfully",
  "data": {
    "video": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k6",
      "title": "Introduction Video (Updated)",
      "description": "Updated description",
      "order": 1,
      "updatedAt": "2024-01-16T14:30:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 403 | You do not have permission to update this video |
| 404 | Video not found |
| 500 | Error updating video |

---

### 5. Delete Video

Delete video from S3 and database (course owner only).

**Endpoint:** `DELETE /api/videos/:id`

**Authentication:** University (Required - Course Owner)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Video ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Video deleted successfully"
}
```

**What Happens:**
- Video file is deleted from S3
- Video document is deleted from database
- User progress records for this video are deleted

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 403 | You do not have permission to delete this video |
| 404 | Video not found |
| 500 | Error deleting video |

---

### 6. Update Video Thumbnail

Upload a new thumbnail for a video (course owner only).

**Endpoint:** `POST /api/videos/:id/thumbnail`

**Authentication:** University (Required - Course Owner)

**Content-Type:** `multipart/form-data`

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Video ID (MongoDB ObjectId) |

**Request Body (Form Data):**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| thumbnail | file | Yes | Thumbnail image file (JPG, PNG, GIF, WebP, etc.) - **Images only** |

**Example Request (cURL):**
```bash
curl -X POST https://your-api-domain.com/api/videos/65a1b2c3d4e5f6g7h8i9j0k6/thumbnail \
  -H "Authorization: Bearer <university_token>" \
  -F "thumbnail=@/path/to/thumbnail.jpg"
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Thumbnail updated successfully",
  "data": {
    "thumbnail": "https://s3.amazonaws.com/bucket/thumbnails/video-456/thumb-789.jpg"
  }
}
```

**What Happens:**
- Thumbnail file is uploaded to S3
- Video thumbnail field is updated with the S3 URL
- Thumbnail is stored as public-read in S3

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Thumbnail file is required |
| 400 | Only image files are allowed for thumbnails |
| 400 | File size too large. Maximum size is 40MB for thumbnails |
| 401 | Not authorized to access this route |
| 403 | You do not have permission to update this video thumbnail |
| 404 | Video not found |
| 500 | Error updating thumbnail |

**Note:** 
- Maximum file size is **40MB** for thumbnails
- **Only image files are allowed** (JPG, PNG, GIF, WebP, etc.) - video files are not accepted

---

## Checkpoint Questions

### 1. Create Question

Create a checkpoint question for a video (course owner only).

**Endpoint:** `POST /api/videos/:videoId/questions`

**Authentication:** University (Required - Course Owner)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| videoId | string | Yes | Video ID (MongoDB ObjectId) |

**Request Body:**
```json
{
  "checkpointTime": 120,
  "question": "What is machine learning?",
  "options": [
    "A type of database",
    "A method of teaching computers to learn from data",
    "A programming language",
    "A cloud service"
  ],
  "correctAnswer": "A method of teaching computers to learn from data"
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| checkpointTime | number | Yes | Time in seconds when question appears (min: 0) |
| question | string | Yes | Question text |
| options | array | Yes | Array of answer options (min: 2) |
| correctAnswer | string | Yes | Correct answer (must be one of options) |

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Question created successfully",
  "data": {
    "question": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k7",
      "videoId": "65a1b2c3d4e5f6g7h8i9j0k6",
      "checkpointTime": 120,
      "question": "What is machine learning?",
      "options": [
        "A type of database",
        "A method of teaching computers to learn from data",
        "A programming language",
        "A cloud service"
      ],
      "correctAnswer": "A method of teaching computers to learn from data",
      "createdAt": "2024-01-15T10:50:00.000Z",
      "updatedAt": "2024-01-15T10:50:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | checkpointTime, question, options, and correctAnswer are required |
| 400 | At least 2 options are required |
| 400 | correctAnswer must be one of the options |
| 401 | Not authorized to access this route |
| 403 | You do not have permission to create questions for this video |
| 404 | Video not found |
| 500 | Error creating question |

---

### 2. Get Question at Checkpoint

Get question at a specific checkpoint time.

**Endpoint:** `GET /api/videos/:videoId/questions/:checkpointTime`

**Authentication:** User (Required)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| videoId | string | Yes | Video ID (MongoDB ObjectId) |
| checkpointTime | number | Yes | Checkpoint time in seconds |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Question retrieved successfully",
  "data": {
    "question": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k7",
      "videoId": "65a1b2c3d4e5f6g7h8i9j0k6",
      "checkpointTime": 120,
      "question": "What is machine learning?",
      "options": [
        "A type of database",
        "A method of teaching computers to learn from data",
        "A programming language",
        "A cloud service"
      ]
    }
  }
}
```

**Note:** `correctAnswer` is **not** included in the response to prevent cheating.

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 404 | Question not found at this checkpoint |
| 500 | Error retrieving question |

---

### 3. Get All Questions

Get all questions for a video.

**Endpoint:** `GET /api/videos/:videoId/questions`

**Authentication:** User (Required)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| videoId | string | Yes | Video ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Questions retrieved successfully",
  "data": {
    "questions": [
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k7",
        "videoId": "65a1b2c3d4e5f6g7h8i9j0k6",
        "checkpointTime": 120,
        "question": "What is machine learning?",
        "options": [
          "A type of database",
          "A method of teaching computers to learn from data",
          "A programming language",
          "A cloud service"
        ]
      }
    ]
  }
}
```

**Note:** Questions are sorted by `checkpointTime` (ascending). `correctAnswer` is not included.

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 500 | Error retrieving questions |

---

### 4. Validate Answer

Submit an answer and get validation result (no DB write if wrong).

**Endpoint:** `POST /api/questions/:id/validate`

**Authentication:** User (Required)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Question ID (MongoDB ObjectId) |

**Request Body:**
```json
{
  "answer": "A method of teaching computers to learn from data"
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| answer | string | Yes | User's answer |

**Response (200 OK) - Correct:**
```json
{
  "success": true,
  "message": "Correct answer!",
  "data": {
    "isCorrect": true,
    "correctAnswer": "A method of teaching computers to learn from data"
  }
}
```

**Response (200 OK) - Incorrect:**
```json
{
  "success": true,
  "message": "Incorrect answer",
  "data": {
    "isCorrect": false
  }
}
```

**Note:** `correctAnswer` is only revealed if the answer is correct.

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Answer is required |
| 401 | Not authorized to access this route |
| 404 | Question not found |
| 500 | Error validating answer |

---

### 5. Update Question

Update question details (course owner only).

**Endpoint:** `PUT /api/questions/:id`

**Authentication:** University (Required - Course Owner)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Question ID (MongoDB ObjectId) |

**Request Body:**
```json
{
  "checkpointTime": 125,
  "question": "What is machine learning? (Updated)",
  "options": [
    "A type of database",
    "A method of teaching computers to learn from data",
    "A programming language",
    "A cloud service",
    "A new operating system"
  ],
  "correctAnswer": "A method of teaching computers to learn from data"
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| checkpointTime | number | No | Checkpoint time in seconds |
| question | string | No | Question text |
| options | array | No | Array of answer options (min: 2) |
| correctAnswer | string | No | Correct answer (must be one of options) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Question updated successfully",
  "data": {
    "question": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k7",
      "checkpointTime": 125,
      "question": "What is machine learning? (Updated)",
      "options": [
        "A type of database",
        "A method of teaching computers to learn from data",
        "A programming language",
        "A cloud service",
        "A new operating system"
      ],
      "correctAnswer": "A method of teaching computers to learn from data",
      "updatedAt": "2024-01-16T14:35:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | At least 2 options are required |
| 400 | correctAnswer must be one of the options |
| 401 | Not authorized to access this route |
| 403 | You do not have permission to update this question |
| 404 | Question not found |
| 500 | Error updating question |

---

### 6. Delete Question

Delete a checkpoint question (course owner only).

**Endpoint:** `DELETE /api/questions/:id`

**Authentication:** University (Required - Course Owner)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Question ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Question deleted successfully"
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 403 | You do not have permission to delete this question |
| 404 | Question not found |
| 500 | Error deleting question |

---

## Progress Tracking

### 1. Update Video Progress

Update user's progress for a video (throttled to 10 seconds).

**Endpoint:** `PUT /api/progress/video/:videoId`

**Authentication:** User (Required)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| videoId | string | Yes | Video ID (MongoDB ObjectId) |

**Request Body:**
```json
{
  "lastWatchedSecond": 120,
  "completed": false
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| lastWatchedSecond | number | No | Last watched position in seconds (default: 0) |
| completed | boolean | No | Whether video is completed (default: false) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Progress updated successfully",
  "data": {
    "progress": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k8",
      "userId": "65a1b2c3d4e5f6g7h8i9j0k5",
      "videoId": "65a1b2c3d4e5f6g7h8i9j0k6",
      "lastWatchedSecond": 120,
      "completed": false,
      "updatedAt": "2024-01-15T11:00:00.000Z"
    }
  }
}
```

**Response (200 OK) - Throttled:**
```json
{
  "success": true,
  "message": "Progress update throttled (10 second interval)",
  "data": {
    "throttled": true
  }
}
```

**Throttling:**
- Updates are throttled to **once per 10 seconds** per user-video pair
- This prevents database overload at scale
- Throttled requests return success but don't update the database

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Authentication required |
| 404 | Video not found |
| 500 | Error updating progress |

---

### 2. Get Video Progress

Get user's progress for a specific video.

**Endpoint:** `GET /api/progress/video/:videoId`

**Authentication:** User (Required)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| videoId | string | Yes | Video ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Progress retrieved successfully",
  "data": {
    "progress": {
      "lastWatchedSecond": 120,
      "completed": false
    }
  }
}
```

**Note:** If no progress exists, returns default values (0 seconds, not completed).

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Authentication required |
| 500 | Error retrieving progress |

---

### 3. Get Playlist Progress

Get progress for all videos in a playlist.

**Endpoint:** `GET /api/progress/playlist/:playlistId`

**Authentication:** User (Required)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| playlistId | string | Yes | Playlist ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Progress retrieved successfully",
  "data": {
    "progress": {
      "65a1b2c3d4e5f6g7h8i9j0k6": {
        "lastWatchedSecond": 120,
        "completed": false
      },
      "65a1b2c3d4e5f6g7h8i9j0k9": {
        "lastWatchedSecond": 300,
        "completed": true
      }
    }
  }
}
```

**Response Format:**
- Key: Video ID (string)
- Value: Progress object with `lastWatchedSecond` and `completed`

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Authentication required |
| 500 | Error retrieving progress |

---

### 4. Get Course Progress

Get aggregated progress stats for user in a course.

**Endpoint:** `GET /api/progress/course/:courseId`

**Authentication:** User (Required)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| courseId | string | Yes | Course ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Course progress retrieved successfully",
  "data": {
    "progress": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k10",
      "userId": "65a1b2c3d4e5f6g7h8i9j0k5",
      "courseId": "65a1b2c3d4e5f6g7h8i9j0k1",
      "completedVideos": 5,
      "completionPercent": 45,
      "totalVideos": 11,
      "remainingVideos": 6,
      "lastAccessedAt": "2024-01-16T15:00:00.000Z",
      "updatedAt": "2024-01-16T15:00:00.000Z"
    }
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| completedVideos | number | Number of videos completed |
| completionPercent | number | Completion percentage (0-100) |
| totalVideos | number | Total videos in course |
| remainingVideos | number | Videos not yet completed |
| lastAccessedAt | date | Last time user accessed course |

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Authentication required |
| 404 | You are not enrolled in this course |
| 500 | Error retrieving course progress |

---

### 5. Mark Video Complete

Mark a video as completed (triggers course progress update).

**Endpoint:** `POST /api/progress/video/:videoId/complete`

**Authentication:** User (Required)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| videoId | string | Yes | Video ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Video marked as complete",
  "data": {
    "progress": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k8",
      "userId": "65a1b2c3d4e5f6g7h8i9j0k5",
      "videoId": "65a1b2c3d4e5f6g7h8i9j0k6",
      "completed": true,
      "updatedAt": "2024-01-16T15:05:00.000Z"
    }
  }
}
```

**What Happens:**
- Video progress is marked as completed
- Course progress is updated asynchronously (completion % recalculated)

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Authentication required |
| 404 | Video not found |
| 500 | Error marking video as complete |

---

### 6. Get Completion Stats

Get overall completion stats across all courses for the user.

**Endpoint:** `GET /api/progress/stats`

**Authentication:** User (Required)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Completion stats retrieved successfully",
  "data": {
    "stats": [
      {
        "courseId": "65a1b2c3d4e5f6g7h8i9j0k1",
        "courseName": "Introduction to Machine Learning",
        "completedVideos": 5,
        "totalVideos": 11,
        "completionPercent": 45
      },
      {
        "courseId": "65a1b2c3d4e5f6g7h8i9j0k11",
        "courseName": "Advanced Python",
        "completedVideos": 8,
        "totalVideos": 10,
        "completionPercent": 80
      }
    ]
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Authentication required |
| 500 | Error retrieving completion stats |

---

### 7. Reset Progress

Reset user progress for a course (admin/course owner only).

**Endpoint:** `POST /api/progress/course/:courseId/reset/:userId?`

**Authentication:** User (Required - Admin or Course Owner)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| courseId | string | Yes | Course ID (MongoDB ObjectId) |
| userId | string | No | User ID to reset (default: authenticated user) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Progress reset successfully"
}
```

**What Happens:**
- All video progress for the course is deleted
- Course progress is reset to 0%

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Authentication required |
| 403 | You do not have permission to reset progress |
| 404 | Course not found |
| 500 | Error resetting progress |

---

## Analytics

### 1. Get Course Analytics

Get pre-aggregated analytics for a course (course owner only).

**Endpoint:** `GET /api/analytics/courses/:courseId`

**Authentication:** University (Required - Course Owner)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| courseId | string | Yes | Course ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Analytics retrieved successfully",
  "data": {
    "analytics": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k12",
      "courseId": "65a1b2c3d4e5f6g7h8i9j0k1",
      "totalUsers": 45,
      "avgCompletionTime": 1250,
      "mostRepeatedSegments": [
        {
          "from": 120,
          "to": 180,
          "count": 25
        },
        {
          "from": 300,
          "to": 360,
          "count": 18
        }
      ],
      "updatedAt": "2024-01-16T16:00:00.000Z"
    }
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| totalUsers | number | Total enrolled users |
| avgCompletionTime | number | Average completion time in minutes (null if no completions) |
| mostRepeatedSegments | array | Top segments with most replays (sorted by count) |

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 403 | You do not have permission to view analytics for this course |
| 404 | Course not found |
| 500 | Error retrieving analytics |

---

### 2. Get Most Repeated Segments

Get video segments with the most replays (course owner only).

**Endpoint:** `GET /api/analytics/courses/:courseId/segments`

**Authentication:** University (Required - Course Owner)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| courseId | string | Yes | Course ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Repeated segments retrieved successfully",
  "data": {
    "segments": [
      {
        "from": 120,
        "to": 180,
        "count": 25
      },
      {
        "from": 300,
        "to": 360,
        "count": 18
      },
      {
        "from": 60,
        "to": 90,
        "count": 12
      }
    ]
  }
}
```

**Response Format:**
- Segments are sorted by `count` (descending)
- `from` and `to` are in seconds
- `count` is the number of times this segment was replayed

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 403 | You do not have permission to view analytics for this course |
| 404 | Course not found |
| 500 | Error retrieving repeated segments |

---

### 3. Get Idle Users

Get users with no activity for X days (course owner only).

**Endpoint:** `GET /api/analytics/courses/:courseId/idle-users?days=7`

**Authentication:** University (Required - Course Owner)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| courseId | string | Yes | Course ID (MongoDB ObjectId) |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| days | number | No | Days of inactivity (default: 7) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Idle users retrieved successfully",
  "data": {
    "idleUsers": [
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k5",
        "profile": {
          "name": {
            "full": "John Doe"
          },
          "email": "john@example.com"
        }
      }
    ],
    "totalIdle": 1,
    "days": 7
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 403 | You do not have permission to view analytics for this course |
| 404 | Course not found |
| 500 | Error retrieving idle users |

---

### 4. Get Engagement Metrics

Get engagement metrics (time spent, videos watched, etc.) for a course (course owner only).

**Endpoint:** `GET /api/analytics/courses/:courseId/engagement`

**Authentication:** University (Required - Course Owner)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| courseId | string | Yes | Course ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Engagement metrics retrieved successfully",
  "data": {
    "metrics": {
      "totalEnrolledUsers": 45,
      "totalVideosWatched": 320,
      "totalTimeSpentMinutes": 12500,
      "avgCompletionRate": 65.5
    }
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| totalEnrolledUsers | number | Total users enrolled in course |
| totalVideosWatched | number | Total video completions across all users |
| totalTimeSpentMinutes | number | Total time spent watching videos (in minutes) |
| avgCompletionRate | number | Average course completion rate (0-100) |

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Not authorized to access this route |
| 403 | You do not have permission to view analytics for this course |
| 404 | Course not found |
| 500 | Error retrieving engagement metrics |

---

## Reviews

### 1. Create Review

Create a review for a course (user must be enrolled).

**Endpoint:** `POST /api/reviews`

**Authentication:** User (Required)

**Request Body:**
```json
{
  "courseId": "65a1b2c3d4e5f6g7h8i9j0k1",
  "rating": 5,
  "comment": "Excellent course! Very well structured and easy to follow."
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| courseId | string | Yes | Course ID (MongoDB ObjectId) |
| rating | number | Yes | Rating (1-5) |
| comment | string | No | Review comment |

**Response (201 Created):**
```json
{
  "success": true,
  "message": "Review created successfully",
  "data": {
    "review": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k13",
      "courseId": "65a1b2c3d4e5f6g7h8i9j0k1",
      "userId": "65a1b2c3d4e5f6g7h8i9j0k5",
      "rating": 5,
      "comment": "Excellent course! Very well structured and easy to follow.",
      "createdAt": "2024-01-16T17:00:00.000Z",
      "updatedAt": "2024-01-16T17:00:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Course ID and rating are required |
| 400 | Rating must be between 1 and 5 |
| 401 | Authentication required |
| 403 | You must be enrolled in the course to leave a review |
| 400 | You have already reviewed this course. Use update endpoint to modify your review. |
| 404 | Course not found |
| 500 | Error creating review |

**Note:** One review per user per course (enforced by unique index).

---

### 2. Get Reviews

Get all reviews for a course (paginated, public endpoint).

**Endpoint:** `GET /api/reviews/courses/:courseId/reviews?page=1&limit=10`

**Authentication:** None (Public)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| courseId | string | Yes | Course ID (MongoDB ObjectId) |

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | Page number (default: 1) |
| limit | number | No | Items per page (default: 10) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Reviews retrieved successfully",
  "data": {
    "reviews": [
      {
        "_id": "65a1b2c3d4e5f6g7h8i9j0k13",
        "courseId": "65a1b2c3d4e5f6g7h8i9j0k1",
        "userId": {
          "_id": "65a1b2c3d4e5f6g7h8i9j0k5",
          "profile": {
            "name": {
              "full": "John Doe"
            },
            "email": "john@example.com",
            "profileImage": "https://s3.amazonaws.com/bucket/profiles/john.jpg"
          }
        },
        "rating": 5,
        "comment": "Excellent course! Very well structured and easy to follow.",
        "createdAt": "2024-01-16T17:00:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "pages": 3
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 500 | Error retrieving reviews |

---

### 3. Update Review

Update own review (user can only update their own review).

**Endpoint:** `PUT /api/reviews/:id`

**Authentication:** User (Required)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Review ID (MongoDB ObjectId) |

**Request Body:**
```json
{
  "rating": 4,
  "comment": "Updated: Good course, but could use more examples."
}
```

**Request Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| rating | number | No | Rating (1-5) |
| comment | string | No | Review comment |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Review updated successfully",
  "data": {
    "review": {
      "_id": "65a1b2c3d4e5f6g7h8i9j0k13",
      "rating": 4,
      "comment": "Updated: Good course, but could use more examples.",
      "updatedAt": "2024-01-17T10:00:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 400 | Rating must be between 1 and 5 |
| 401 | Authentication required |
| 403 | You do not have permission to update this review |
| 404 | Review not found |
| 500 | Error updating review |

---

### 4. Delete Review

Delete own review (user can only delete their own review).

**Endpoint:** `DELETE /api/reviews/:id`

**Authentication:** User (Required)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Review ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Review deleted successfully"
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 401 | Authentication required |
| 403 | You do not have permission to delete this review |
| 404 | Review not found |
| 500 | Error deleting review |

---

### 5. Get Average Rating

Get average rating for a course (public endpoint).

**Endpoint:** `GET /api/reviews/courses/:courseId/rating`

**Authentication:** None (Public)

**URL Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| courseId | string | Yes | Course ID (MongoDB ObjectId) |

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Average rating retrieved successfully",
  "data": {
    "avgRating": 4.5,
    "totalReviews": 25
  }
}
```

**Response (200 OK) - No Reviews:**
```json
{
  "success": true,
  "message": "No reviews found",
  "data": {
    "avgRating": 0,
    "totalReviews": 0
  }
}
```

**Error Responses:**

| Status Code | Error Message |
|-------------|---------------|
| 500 | Error retrieving average rating |

---

## Error Codes

### HTTP Status Codes

| Status Code | Meaning | Description |
|-------------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request parameters |
| 401 | Unauthorized | Authentication required or invalid token |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 500 | Internal Server Error | Server error |

### Error Response Format

All error responses follow this format:

```json
{
  "success": false,
  "message": "Error message describing what went wrong",
  "error": "Detailed error message (only in development)"
}
```

### Common Error Messages

| Error Message | Cause | Solution |
|---------------|-------|----------|
| Not authorized to access this route | Missing or invalid token | Include valid JWT token in Authorization header |
| You do not have permission to... | User doesn't own resource | Ensure user is course owner or has required role |
| Course not found | Invalid course ID | Verify course ID exists |
| You must be enrolled in this course | User not enrolled | Accept course invite first |
| Invalid or expired invite token | Token invalid/expired | Generate new invite |
| Progress update throttled | Too frequent updates | Wait 10 seconds between updates |

---

## Rate Limiting

### Progress Updates

- **Throttle:** 10 seconds per user-video pair
- **Purpose:** Prevent database overload at scale
- **Behavior:** Throttled requests return success but don't update database

### API Rate Limits

Rate limiting is implemented via Redis (if available) or in-memory fallback:

- **Default Limit:** 100 requests per minute per IP/user
- **Burst:** 20 requests per second
- **Headers:** Rate limit info included in response headers:
  - `X-RateLimit-Limit`: Maximum requests allowed
  - `X-RateLimit-Remaining`: Remaining requests in window
  - `X-RateLimit-Reset`: Time when limit resets

---

## Best Practices

### 1. Authentication
- Always include JWT token in `Authorization: Bearer <token>` header
- Refresh tokens before expiry
- Handle 401 errors gracefully

### 2. Error Handling
- Check `success` field in all responses
- Display user-friendly error messages
- Log detailed errors for debugging

### 3. Progress Updates
- Batch progress updates when possible
- Respect 10-second throttle
- Use `markVideoComplete` for explicit completion

### 4. File Uploads
- Use multipart/form-data for video/thumbnail uploads
- Maximum file size: 500MB for videos
- Maximum file size: 40MB for thumbnails (course, playlist, video)
- **Thumbnails: Only image files are allowed** (JPG, PNG, GIF, WebP, etc.) - video files are rejected
- Video formats: MP4, MOV, AVI, WebM

### 5. Pagination
- Use pagination for large result sets
- Default page size: 10 items
- Include pagination metadata in responses

### 6. Caching
- Course metadata is cached (5-15 min TTL)
- Invite validation cached (5 min TTL)
- Cache responses on client side when appropriate

---

## Support

For API support or questions:
- Check error messages for specific guidance
- Review this documentation for endpoint details
- Verify authentication tokens are valid
- Ensure required indexes are created in database

---

**Last Updated:** January 2024
**API Version:** 1.0.0


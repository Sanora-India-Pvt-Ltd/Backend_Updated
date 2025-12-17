# Sanora API Documentation

**Base URL:** `https://api.ulearnandearn.com`

---

## 📑 Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication](#-authentication)
   - [Signup](#1-signup)
   - [Login](#2-login)
   - [Refresh Token](#3-refresh-access-token)
   - [Logout](#4-logout)
   - [Get Logged-In Devices](#5-get-logged-in-devices)
   - [Upload Profile Image](#22-upload-profile-image)
   - [Get User Profile](#6-get-current-user-profile)
3. [User Profile Management](#-user-profile-management)
   - [Search Users](#search-users)
   - [Update Profile](#17-update-user-profile)
   - [Update Profile Media (Bio, Cover Photo, Profile Image)](#171-update-profile-media-bio-cover-photo-profile-image)
   - [Update Personal Information](#172-update-personal-information)
   - [Update Location and Details](#173-update-location-and-details)
   - [Remove Education Entry](#174-remove-education-entry)
   - [Remove Workplace Entry](#175-remove-workplace-entry)
   - [Update Phone Number](#18-update-phone-number)
   - [Update Alternate Phone Number](#19-update-alternate-phone-number)
   - [Remove Alternate Phone Number](#20-remove-alternate-phone-number)
   - [Upload Media](#21-upload-media-to-cloudinary)
   - [Get User's Media](#23-get-users-media)
   - [Get User's Images](#24-get-users-images)
   - [Delete User's Media](#25-delete-users-media)
4. [Company Management](#-company-management)
   - [Search Companies](#27-search-companies)
   - [Create Company](#28-create-company)
5. [Institution Management](#-institution-management)
   - [Search Institutions](#29-search-institutions)
   - [Create Institution](#30-create-institution)
6. [Posts Management](#-posts-management)
   - [Upload Post Media](#30-upload-post-media)
   - [Create Post](#31-create-post)
   - [Get All Posts](#32-get-all-posts)
   - [Get My Posts](#33-get-my-posts)
   - [Get User Posts](#34-get-user-posts)
   - [Like/Unlike Post](#35-likeunlike-post)
   - [Delete Post](#36-delete-post)
7. [Stories Management](#-stories-management)
   - [Upload Story Media](#42-upload-story-media)
   - [Create Story](#43-create-story)
   - [Get User Stories](#44-get-user-stories)
   - [Get All Friends Stories](#45-get-all-friends-stories)
8. [Reels Management](#-reels-management)
   - [Upload Reel Media](#upload-reel-media)
   - [Create Reel](#create-reel)
   - [Get Reels by Content Type](#get-reels-by-content-type)
   - [Get User Reels](#get-user-reels)
   - [Like/Unlike Reel](#likeunlike-reel)
9. [Friend Management](#-friend-management)
   - [Send Friend Request](#46-send-friend-request)
   - [Accept Friend Request](#47-accept-friend-request)
   - [Reject Friend Request](#48-reject-friend-request)
   - [List Friends](#49-list-friends)
   - [List Received Requests](#50-list-received-friend-requests)
   - [List Sent Requests](#51-list-sent-friend-requests)
   - [Get Friend Suggestions](#54-get-friend-suggestions)
   - [Unfriend User](#52-unfriend-user)
   - [Cancel Sent Request](#53-cancel-sent-friend-request)
10. [Chat/Messaging](#-chatmessaging)
   - [Get All Conversations](#55-get-all-conversations)
   - [Get or Create Conversation](#56-get-or-create-conversation)
   - [Get Messages](#57-get-messages)
   - [Send Message (REST)](#58-send-message-rest)
   - [Delete Message](#59-delete-message)
   - [Mark Messages as Read](#60-mark-messages-as-read)
   - [Get Unread Count](#61-get-unread-count)
   - [WebSocket Events](#websocket-events)
11. [Bug Reports](#-bug-reports)
   - [Create Bug Report](#62-create-bug-report)
   - [Get My Bug Reports](#63-get-my-bug-reports)
   - [Get Bug Report by ID](#64-get-bug-report-by-id)
12. [OTP Verification](#-otp-verification)
   - [Send Phone OTP (Twilio)](#send-phone-otp-twilio)
   - [Verify Phone OTP (Twilio)](#verify-phone-otp-twilio)
   - [Send OTP for Signup (Email)](#6-send-otp-for-signup-email)
   - [Verify OTP for Signup (Email)](#7-verify-otp-for-signup-email)
   - [Send Phone OTP for Signup](#8-send-phone-otp-for-signup)
   - [Verify Phone OTP for Signup](#9-verify-phone-otp-for-signup)
   - [Send OTP for Password Reset](#10-send-otp-for-password-reset)
   - [Verify OTP for Password Reset](#11-verify-otp-for-password-reset)
   - [Reset Password](#12-reset-password)
13. [Google OAuth](#-google-oauth)
   - [Web OAuth](#13-google-oauth-web-redirect-flow)
   - [OAuth Callback](#14-google-oauth-callback)
   - [Mobile OAuth](#15-google-oauth-mobile-androidios)
   - [Verify Google Token](#16-verify-google-token-androidiosweb)
   - [Check Email](#18-check-email-exists)
14. [Authentication Flows](#-authentication-flows)
15. [Error Handling](#-error-handling)
16. [Security Features](#-security-features)
17. [Testing Examples](#-testing-examples)

---

## Quick Start

### Authentication Overview

The API uses a **two-token authentication system**:
- **Access Token**: Short-lived (1 hour) - used for API requests
- **Refresh Token**: Never expires - used to get new access tokens (only invalidated on explicit logout)

### Basic Flow

```javascript
// 1. Login or Signup
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'user@example.com', password: 'password123' })
});
const { accessToken, refreshToken } = await response.json().data;

// 2. Use access token for API requests
const profile = await fetch('/api/auth/profile', {
  headers: { 'Authorization': `Bearer ${accessToken}` }
});

// 3. When access token expires (401), refresh it
if (profile.status === 401) {
  const refresh = await fetch('/api/auth/refresh-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  const { accessToken: newToken } = await refresh.json().data;
  // Use newToken for subsequent requests
  // Note: Refresh tokens never expire - users stay logged in indefinitely
}
```

---

## 🔐 Authentication

### 1. Signup

**Method:** `POST`  
**URL:** `/api/auth/signup`

**⚠️ IMPORTANT:** Both email and phone OTP verification are **REQUIRED** before signup.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "yourPassword123",
  "confirmPassword": "yourPassword123",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "gender": "Male",
  "emailVerificationToken": "token_from_verify_otp_signup",
  "phoneVerificationToken": "token_from_verify_phone_otp_signup"
}
```

**Required Fields:**
- `email` (string): User's email address
- `password` (string): Minimum 6 characters
- `firstName` (string): User's first name
- `lastName` (string): User's last name
- `phoneNumber` (string): Phone number in E.164 format
- `gender` (string): One of: "Male", "Female", "Other", "Prefer not to say"
- `emailVerificationToken` (string): From `/api/auth/verify-otp-signup` (valid 20 min)
- `phoneVerificationToken` (string): From `/api/auth/verify-phone-otp-signup` (valid 20 min)

**Success Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "accessToken": "jwt_access_token_here",
    "refreshToken": "refresh_token_here",
    "token": "jwt_access_token_here",
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+1234567890",
      "gender": "Male",
      "name": "John Doe"
    }
  }
}
```

**Note:**
- `accessToken`: Short-lived JWT token (1 hour) - use for API requests
- `refreshToken`: Never expires - use to refresh access token (only invalidated on explicit logout)
- `token`: Same as `accessToken` (included for backward compatibility)
- **Device Limit**: Maximum of 5 devices allowed per user. When logging in on a 6th device, the oldest device is automatically logged out.

**Error Responses:**
- `400`: Missing fields, invalid gender, password too short, password mismatch, user exists, phone already registered, missing verification tokens
- `401`: Invalid or expired verification tokens

---

### 2. Login

**Method:** `POST`  
**URL:** `/api/auth/login`

**Request Body (Email):**
```json
{
  "email": "user@example.com",
  "password": "yourPassword123"
}
```

**Request Body (Phone):**
```json
{
  "phoneNumber": "+1234567890",
  "password": "yourPassword123"
}
```

**Required Fields:**
- Either `email` OR `phoneNumber` (string)
- `password` (string)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "jwt_access_token_here",
    "refreshToken": "refresh_token_here",
    "token": "jwt_access_token_here",
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+1234567890",
      "gender": "Male",
      "name": "John Doe",
      "profileImage": "https://..."
    }
  }
}
```

**Note:**
- `accessToken`: Short-lived JWT token (1 hour) - use for API requests
- `refreshToken`: Never expires - use to refresh access token (only invalidated on explicit logout)
- `token`: Same as `accessToken` (included for backward compatibility)
- **Device Limit**: Maximum of 5 devices allowed per user. When logging in on a 6th device, the oldest device is automatically logged out.

**Error Responses:**
- `400`: Missing fields, invalid credentials

---

### 3. Refresh Access Token

**Method:** `POST`  
**URL:** `/api/auth/refresh-token`

**Request Body:**
```json
{
  "refreshToken": "refresh_token_from_login_or_signup"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Access token refreshed successfully",
  "data": {
    "accessToken": "new_jwt_access_token_here"
  }
}
```

**Error Responses:**
- `400`: Refresh token is required
- `401`: Invalid refresh token

**Note:** Use this endpoint when your access token expires (after 1 hour). Refresh tokens never expire - users stay logged in indefinitely unless they explicitly logout.

---

### 4. Logout

**Method:** `POST`  
**URL:** `/api/auth/logout`  
**Authentication:** Required

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Request Body (Optional):**
```json
{
  "refreshToken": "specific_refresh_token_to_logout",  // Optional: logout from specific device
  "deviceId": 1  // Optional: logout device by ID (from getDevices response)
}
```

**Note:** 
- If no `refreshToken` or `deviceId` is provided, logs out from **all devices**
- If `refreshToken` or `deviceId` is provided, logs out only from that specific device
- Use `deviceId` from the `/api/auth/devices` endpoint for easier device management

**Success Response (200) - Logout from specific device:**
```json
{
  "success": true,
  "message": "Logged out successfully from this device",
  "data": {
    "loggedOutDevice": {
      "deviceName": "Windows - Chrome",
      "deviceType": "Desktop",
      "browser": "Chrome",
      "os": "Windows"
    },
    "remainingDevices": 2
  }
}
```

**Success Response (200) - Logout from all devices:**
```json
{
  "success": true,
  "message": "Logged out successfully from all devices",
  "data": {
    "remainingDevices": 0
  }
}
```

**Note:** Invalidates the refresh token(s). User must login again to get new tokens.

---

### 5. Get Logged-In Devices

**Method:** `GET`  
**URL:** `/api/auth/devices`  
**Authentication:** Required

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Optional Headers (to identify current device):**
```
X-Refresh-Token: your_refresh_token_here
```

**Optional Request Body (to identify current device):**
```json
{
  "refreshToken": "your_refresh_token_here"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Devices retrieved successfully",
  "data": {
    "totalDevices": 3,
    "devices": [
      {
        "id": 1,
        "deviceInfo": {
          "deviceName": "Windows - Chrome",
          "deviceType": "Desktop",
          "browser": "Chrome",
          "os": "Windows",
          "raw": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36..."
        },
        "loggedInAt": "2024-01-15T10:30:00.000Z",
        "isCurrentDevice": true,
        "tokenId": "a1b2c3d4e5f6g7h8"
      },
      {
        "id": 2,
        "deviceInfo": {
          "deviceName": "Mobile (iOS) - Safari",
          "deviceType": "Mobile",
          "browser": "Safari",
          "os": "iOS",
          "raw": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)..."
        },
        "loggedInAt": "2024-01-14T08:20:00.000Z",
        "isCurrentDevice": false,
        "tokenId": "x9y8z7w6v5u4t3s2"
      },
      {
        "id": 3,
        "deviceInfo": {
          "deviceName": "Android - Chrome",
          "deviceType": "Mobile",
          "browser": "Chrome",
          "os": "Android",
          "raw": "Mozilla/5.0 (Linux; Android 13; SM-G991B)..."
        },
        "loggedInAt": "2024-01-13T15:45:00.000Z",
        "isCurrentDevice": false,
        "tokenId": "m1n2o3p4q5r6s7t8"
      }
    ]
  }
}
```

**Response Fields:**
- `id`: Sequential device ID (use this for logout by `deviceId`)
- `deviceInfo`: Parsed device information
  - `deviceName`: Human-readable device name
  - `deviceType`: "Desktop", "Mobile", or "Tablet"
  - `browser`: Browser name (Chrome, Firefox, Safari, Edge, etc.)
  - `os`: Operating system (Windows, macOS, Linux, Android, iOS)
  - `raw`: Original user-agent string
- `loggedInAt`: When the device logged in
- `isCurrentDevice`: `true` if this is the device making the request (requires `refreshToken` in header or body)
- `tokenId`: First 16 characters of the refresh token (for identification, not the full token)

**Error Responses:**
- `401`: No token, invalid token, expired token

**Note:** 
- Devices are sorted by most recent login first
- Each login from a different device/browser creates a new device entry
- **Maximum of 5 devices allowed** - when logging in on a 6th device, the oldest device is automatically logged out
- Use the `deviceId` from this response to logout from specific devices via the logout endpoint

---

### 6. Get Current User Profile

**Method:** `GET`  
**URL:** `/api/auth/profile`  
**Authentication:** Required

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User profile retrieved successfully",
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+1234567890",
      "alternatePhoneNumber": "+1987654321",
      "gender": "Male",
      "name": "John Doe",
      "dob": "1999-01-15T00:00:00.000Z",
      "profileImage": "https://...",
      "coverPhoto": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/cover/cover123.jpg",
      "bio": "Software developer passionate about building great products",
      "currentCity": "San Francisco, CA",
      "hometown": "New York, NY",
      "relationshipStatus": "Single",
      "workplace": [
        {
          "company": "Tech Corp",
          "position": "Senior Software Engineer",
          "startDate": "2020-01-15T00:00:00.000Z",
          "endDate": null,
          "isCurrent": true
        },
        {
          "company": "Startup Inc",
          "position": "Software Engineer",
          "startDate": "2018-06-01T00:00:00.000Z",
          "endDate": "2019-12-31T00:00:00.000Z",
          "isCurrent": false
        }
      ],
      "education": [
        {
          "institution": {
            "id": "507f1f77bcf86cd799439020",
            "name": "Delhi Public School",
            "type": "school",
            "city": "New Delhi",
            "country": "India",
            "logo": "",
            "verified": false,
            "isCustom": true
          },
          "description": "Completed Bachelor's degree with focus on software engineering",
          "degree": "B.Tech",
          "field": "Computer Science",
          "institutionType": "college",
          "startMonth": 8,
          "startYear": 2020,
          "endMonth": 5,
          "endYear": 2024,
          "cgpa": 8.5,
          "percentage": 85.0
        },
        {
          "institution": {
            "id": "507f1f77bcf86cd799439021",
            "name": "University of Technology",
            "type": "university",
            "city": "Mumbai",
            "country": "India",
            "logo": "",
            "verified": false,
            "isCustom": false
          },
          "description": "Master's degree in Data Science",
          "degree": "Master of Science",
          "field": "Data Science",
          "institutionType": "university",
          "startMonth": 9,
          "startYear": 2024,
          "endMonth": null,
          "endYear": null,
          "cgpa": null,
          "percentage": 88.5
        }
      ],
      "isGoogleOAuth": false,
      "googleId": null,
      "numberOfFriends": 15,
      "generalWeightage": 75.5,
      "professionalWeightage": 82.3,
      "token": "user_token_string_here",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    }
  }
}
```

**Response Fields:**
- `id` (string): User's database ID
- `email` (string): User's email address
- `firstName` (string): User's first name
- `lastName` (string): User's last name
- `phoneNumber` (string): User's primary phone number
- `alternatePhoneNumber` (string): User's alternate phone number
- `gender` (string): User's gender (Male, Female, Other, Prefer not to say)
- `name` (string): User's full name
- `dob` (date): User's date of birth
- `profileImage` (string): URL of user's profile image
- `coverPhoto` (string): URL of user's cover photo
- `bio` (string): User's biography/description
- `currentCity` (string): User's current city
- `hometown` (string): User's hometown
- `relationshipStatus` (string): User's relationship status
- `workplace` (array): Array of workplace objects
- `education` (array): Array of education objects
- `isGoogleOAuth` (boolean): Whether user signed up via Google OAuth
- `googleId` (string): Google ID if user signed up via Google OAuth
- `numberOfFriends` (number): Total number of friends the user has
- `generalWeightage` (number): General weightage value (default: 0)
- `professionalWeightage` (number): Professional weightage value (default: 0)
- `token` (string): User's token value (default: null)
- `createdAt` (date): Account creation timestamp
- `updatedAt` (date): Last update timestamp

**Error Responses:**
- `401`: No token, invalid token, expired token
- `404`: User not found

---

## 👤 User Profile Management

All user profile management endpoints require authentication. Include the access token in the `Authorization` header.

### Search Users

**Method:** `GET`  
**URL:** `/api/user/search`  
**Authentication:** Required

**Description:**  
Search for other users by their name. The search is case-insensitive and matches across firstName, lastName, and name fields. The authenticated user is automatically excluded from search results. Results are paginated and sorted alphabetically.

**Query Parameters:**
- `query` (string, required): Name to search for (searches firstName, lastName, and name fields)
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Number of users per page (default: 20)

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Example Request:**
```bash
GET /api/user/search?query=John
GET /api/user/search?query=John&page=1&limit=10
```

**Example using cURL:**
```bash
curl -X GET "https://api.ulearnandearn.com/api/user/search?query=John&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Example using JavaScript:**
```javascript
const response = await fetch('https://api.ulearnandearn.com/api/user/search?query=John&page=1&limit=10', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const result = await response.json();
```

**Success Response (200) - Users Found:**
```json
{
  "success": true,
  "message": "Found 2 user/users",
  "data": {
    "users": [
      {
        "id": "507f1f77bcf86cd799439011",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "profileImage": "https://res.cloudinary.com/...",
        "bio": "Software developer",
        "currentCity": "San Francisco, CA",
        "hometown": "New York, NY"
      },
      {
        "id": "507f1f77bcf86cd799439012",
        "firstName": "Johnny",
        "lastName": "Smith",
        "name": "Johnny Smith",
        "profileImage": "https://res.cloudinary.com/...",
        "bio": "Photographer",
        "currentCity": "Los Angeles, CA",
        "hometown": "Boston, MA"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalUsers": 2,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

**Success Response (200) - No Users Found:**
```json
{
  "success": true,
  "message": "No users found",
  "data": {
    "users": [],
    "pagination": {
      "currentPage": 1,
      "totalPages": 0,
      "totalUsers": 0,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "message": "Search query is required"
}
```

**Error Response (401):**
```json
{
  "success": false,
  "message": "Not authorized to access this route"
}
```

**Response Fields:**
- `users` (array): Array of user objects, each containing:
  - `id` (string): User's database ID
  - `firstName` (string): User's first name
  - `lastName` (string): User's last name
  - `name` (string): User's full name
  - `profileImage` (string): URL of user's profile image
  - `bio` (string): User's biography/description
  - `currentCity` (string): User's current city
  - `hometown` (string): User's hometown
- `pagination` (object): Pagination information:
  - `currentPage` (number): Current page number
  - `totalPages` (number): Total number of pages
  - `totalUsers` (number): Total number of users matching the search
  - `hasNextPage` (boolean): Whether there is a next page
  - `hasPrevPage` (boolean): Whether there is a previous page

**Notes:**
- **Case-Insensitive Search:** The search is case-insensitive and matches partial names
- **Authentication Required:** This endpoint requires a valid access token
- **Excludes Current User:** The authenticated user is automatically excluded from search results
- **Privacy:** Sensitive data (password, refreshToken, email) is excluded from results
- **Pagination:** Supports pagination with `page` and `limit` query parameters
- **Search Fields:** Searches across firstName, lastName, and name fields
- **Sorted Results:** Results are sorted alphabetically by name
- **Result Limit:** Default limit is 20 users per page

---

### 17. Update User Profile

**Method:** `PUT`  
**URL:** `/api/user/profile`  
**Authentication:** Required

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "name": "John Doe",
  "dob": "1999-01-15",
  "gender": "Male",
  "bio": "Software developer passionate about building great products",
  "currentCity": "San Francisco, CA",
  "hometown": "New York, NY",
  "coverPhoto": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/cover/cover123.jpg",
  "relationshipStatus": "Single",
      "workplace": [
        {
          "company": "Tech Corp",
          "position": "Senior Software Engineer",
          "startDate": "2020-01-15",
          "endDate": null,
          "isCurrent": true
        },
        {
          "company": "Startup Inc",
          "position": "Software Engineer",
          "startDate": "2018-06-01",
          "endDate": "2019-12-31",
          "isCurrent": false
        }
      ],
  "education": [
    {
      "institution": "Delhi Public School",
      "description": "Completed Bachelor's degree with focus on software engineering",
      "degree": "B.Tech",
      "field": "Computer Science",
      "institutionType": "college",
      "startMonth": 8,
      "startYear": 2020,
      "endMonth": 5,
      "endYear": 2024,
      "cgpa": 8.5,
      "percentage": 85.0
    },
    {
      "institution": "University of Technology",
      "degree": "Master of Science",
      "field": "Data Science",
      "startYear": 2024,
      "endYear": null,
      "institutionType": "university"
    }
  ]
}
```

**Fields:**
- `firstName` (string, optional): User's first name
- `lastName` (string, optional): User's last name
- `name` (string, optional): Full name (auto-updated if firstName/lastName changed)
- `dob` (string, optional): Date of birth in ISO 8601 format (YYYY-MM-DD). Must be a valid date, not in the future, and not more than 150 years ago
- `gender` (string, optional): One of: "Male", "Female", "Other", "Prefer not to say"
- `bio` (string, optional): User's biography/description
- `currentCity` (string, optional): Current city or address
- `hometown` (string, optional): User's hometown
- `coverPhoto` (string, optional): URL of the cover photo. Must be a valid URL format. Can be set to `null` or empty string to clear.
- `relationshipStatus` (string, optional): One of: "Single", "In a relationship", "Engaged", "Married", "In a civil partnership", "In a domestic partnership", "In an open relationship", "It's complicated", "Separated", "Divorced", "Widowed". Can be set to `null` or empty string to clear.
- `workplace` (array, optional): Array of work experiences. Each entry must have:
  - `company` (string, required): Company name. **Note:** If the company doesn't exist in the system, it will be automatically created when you update your profile. You can also search for companies using the [Search Companies](#27-search-companies) endpoint before updating your profile.
  - `position` (string, required): Job position/title
  - `startDate` (string, required): Start date in ISO 8601 format (YYYY-MM-DD)
  - `endDate` (string, optional): End date in ISO 8601 format (YYYY-MM-DD). Set to `null` for current position
  - `isCurrent` (boolean, optional): Whether this is the current job (default: false)
- `education` (array, optional): Array of education entries. Each entry can have:
  - `institution` (string or ObjectId, required if entry provided): Institution name or ObjectId. **Note:** If the institution doesn't exist in the system, it will be automatically created when you update your profile. You can also search for institutions using the [Search Institutions](#29-search-institutions) endpoint before updating your profile.
  - `description` (string, optional): Description of the education experience
  - `degree` (string, optional): Degree name (e.g., "B.Tech", "Bachelor of Science")
  - `field` (string, optional): Field of study (e.g., "Computer Science", "Engineering")
  - `institutionType` (string, optional): Type of institution - "school", "college", "university", or "others" (default: "school"). This field is stored with the education entry and can be different from the institution's type.
  - `startMonth` (number, optional): Start month (1-12, where 1 = January, 12 = December)
  - `startYear` (number, required if entry provided): Start year (must be a valid year between 1900 and current year + 10)
  - `endMonth` (number, optional): End month (1-12, where 1 = January, 12 = December). Set to `null` for ongoing education
  - `endYear` (number, optional): End year (must be a valid year between 1900 and current year + 10). Set to `null` for ongoing education
  - `cgpa` (number, optional): CGPA score (must be between 0 and 10). Set to `null` if not applicable
  - `percentage` (number, optional): Percentage score (must be between 0 and 100). Set to `null` if not applicable
  - `city` (string, optional): City where institution is located. Only used when creating a new institution.
  - `country` (string, optional): Country where institution is located. Only used when creating a new institution.
  - `logo` (string, optional): Logo URL for the institution. Only used when creating a new institution.

**Note:** 
- You can update any combination of these fields. Only provided fields will be updated.
- **Multiple Education Entries:** You can provide multiple education entries in the array. Each entry represents a different educational qualification. The system will process all entries and create institutions automatically if they don't exist.
- **Multiple Workplaces:** You can provide multiple workplace entries in the array. Each entry represents a different work experience. The system will process all entries and create companies automatically if they don't exist.
- For workplace and education, you can replace the entire array or update individual entries
- **Removing Individual Entries:** To remove a specific education or workplace entry, use the [Remove Education Entry](#174-remove-education-entry) or [Remove Workplace Entry](#175-remove-workplace-entry) endpoints instead of replacing the entire array.
- **Institution Auto-Creation:** When you provide an institution name in the `education` array, the system automatically checks if the institution exists. If it doesn't exist, it will be created automatically. You don't need to create institutions separately before updating your profile, though you can use the [Search Institutions](#29-search-institutions) endpoint to find existing institutions first.
- **Company Auto-Creation:** When you provide a company name in the `workplace` array, the system automatically checks if the company exists. If it doesn't exist, it will be created automatically. You don't need to create companies separately before updating your profile, though you can use the [Search Companies](#27-search-companies) endpoint to find existing companies first.
- **Education is Optional:** The education field is completely optional. You can provide an empty array `[]` to clear all education, or omit it entirely to leave education unchanged.
- `relationshipStatus` and `hometown` are optional and can be set to `null` or empty string to clear

**Success Response (200):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "name": "John Doe",
      "dob": "1999-01-15T00:00:00.000Z",
      "phoneNumber": "+1234567890",
      "alternatePhoneNumber": "+1987654321",
      "gender": "Male",
      "profileImage": "https://...",
      "coverPhoto": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/cover/cover123.jpg",
      "bio": "Software developer passionate about building great products",
      "currentCity": "San Francisco, CA",
      "hometown": "New York, NY",
      "relationshipStatus": "Single",
      "workplace": [
        {
          "company": {
            "id": "507f1f77bcf86cd799439011",
            "name": "Tech Corp",
            "isCustom": false
          },
          "position": "Senior Software Engineer",
          "startDate": "2020-01-15T00:00:00.000Z",
          "endDate": null,
          "isCurrent": true
        },
        {
          "company": {
            "id": "507f1f77bcf86cd799439012",
            "name": "Startup Inc",
            "isCustom": true
          },
          "position": "Software Engineer",
          "startDate": "2018-06-01T00:00:00.000Z",
          "endDate": "2019-12-31T00:00:00.000Z",
          "isCurrent": false
        }
      ],
      "education": [
        {
          "institution": {
            "id": "507f1f77bcf86cd799439020",
            "name": "Delhi Public School",
            "type": "school",
            "city": "New Delhi",
            "country": "India",
            "logo": "",
            "verified": false,
            "isCustom": true
          },
          "description": "Completed Bachelor's degree with focus on software engineering",
          "degree": "B.Tech",
          "field": "Computer Science",
          "institutionType": "college",
          "startMonth": 8,
          "startYear": 2020,
          "endMonth": 5,
          "endYear": 2024,
          "cgpa": 8.5,
          "percentage": 85.0
        },
        {
          "institution": {
            "id": "507f1f77bcf86cd799439021",
            "name": "University of Technology",
            "type": "university",
            "city": "Mumbai",
            "country": "India",
            "logo": "",
            "verified": false,
            "isCustom": false
          },
          "description": "Master's degree in Data Science",
          "degree": "Master of Science",
          "field": "Data Science",
          "institutionType": "university",
          "startMonth": 9,
          "startYear": 2024,
          "endMonth": null,
          "endYear": null,
          "cgpa": null,
          "percentage": 88.5
        }
      ],
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Invalid date of birth (must be valid date, not in future, not more than 150 years ago), invalid gender, empty name fields, invalid cover photo URL, invalid relationship status, invalid workplace structure, invalid education structure, invalid year format (startYear and endYear must be valid years between 1900 and current year + 10), invalid month format (startMonth and endMonth must be between 1 and 12), invalid institution type (must be one of: school, college, university, others), invalid CGPA (must be between 0 and 10), invalid percentage (must be between 0 and 100)
- `401`: No token, invalid token, expired token

---

### 17.1. Update Profile Media (Bio, Cover Photo, Profile Image)

**Method:** `PUT`  
**URL:** `/api/user/profile/media`  
**Authentication:** Required

**Description:**  
Update bio, cover photo, profile image, and cover image. This endpoint accepts URL strings for images. For file uploads, use the dedicated upload endpoints: [Upload Profile Image](#23-upload-profile-image) and [Upload Cover Photo](#18-upload-cover-photo).

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "bio": "Software developer passionate about building great products",
  "coverPhoto": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/cover/cover123.jpg",
  "profileImage": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/profile/profile123.jpg"
}
```

**Fields:**
- `bio` (string, optional): User's biography/description
- `coverPhoto` (string, optional): URL of the cover photo. Must be a valid URL format. Can be set to `null` or empty string to clear.
- `profileImage` (string, optional): URL of the profile image. Must be a valid URL format. Can be set to `null` or empty string to clear.
- `coverImage` (string, optional): Alias for `coverPhoto`. If provided, updates the cover photo. Must be a valid URL format. Can be set to `null` or empty string to clear.

**Note:** 
- You can update any combination of these fields. Only provided fields will be updated.
- All image URLs must be valid URLs. The system validates URL format.
- For file uploads, use the dedicated endpoints: `/api/media/profile-image` and `/api/media/cover-photo`
- `coverImage` is an alias for `coverPhoto` - both update the same field

**Success Response (200):**
```json
{
  "success": true,
  "message": "Profile media updated successfully",
  "data": {
    "user": {
      "id": "user_id",
      "bio": "Software developer passionate about building great products",
      "coverPhoto": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/cover/cover123.jpg",
      "profileImage": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/profile/profile123.jpg",
      "updatedAt": "2024-01-01T12:35:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Invalid URL format for images, no fields provided to update
- `401`: No token, invalid token, expired token
- `500`: Error updating profile media

---

### 17.2. Update Personal Information

**Method:** `PUT`  
**URL:** `/api/user/profile/personal-info`  
**Authentication:** Required

**Description:**  
Update personal information including name, gender, date of birth, and phone numbers. Note: Phone number updates via this endpoint do not require OTP verification. For OTP-verified phone updates, use the dedicated endpoints: [Update Phone Number](#19-update-phone-number) and [Update Alternate Phone Number](#20-update-alternate-phone-number).

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "gender": "Male",
  "dob": "1999-01-15",
  "phoneNumber": "+1234567890",
  "alternatePhoneNumber": "+1987654321"
}
```

**Fields:**
- `firstName` (string, optional): User's first name. Cannot be empty if provided.
- `lastName` (string, optional): User's last name. Cannot be empty if provided.
- `gender` (string, optional): One of: "Male", "Female", "Other", "Prefer not to say"
- `dob` (string, optional): Date of birth in ISO 8601 format (YYYY-MM-DD). Must be a valid date, not in the future, and not more than 150 years ago
- `phoneNumber` (string, optional): Phone number in E.164 format (e.g., +1234567890). Can be set to `null` or empty string to clear. Must not be already registered by another user.
- `alternatePhoneNumber` (string, optional): Alternate phone number in E.164 format. Can be set to `null` or empty string to clear. Must be different from primary phone number and not already registered by another user.

**Note:** 
- You can update any combination of these fields. Only provided fields will be updated.
- The `name` field is automatically updated when `firstName` or `lastName` changes.
- Phone numbers are automatically normalized to E.164 format (e.g., +1234567890).
- Phone number updates via this endpoint do NOT require OTP verification. For OTP-verified updates, use the dedicated phone update endpoints.
- Phone numbers must not be already registered by another user.
- Alternate phone number must be different from primary phone number.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Personal information updated successfully",
  "data": {
    "user": {
      "id": "user_id",
      "firstName": "John",
      "lastName": "Doe",
      "name": "John Doe",
      "gender": "Male",
      "dob": "1999-01-15T00:00:00.000Z",
      "phoneNumber": "+1234567890",
      "alternatePhoneNumber": "+1987654321",
      "updatedAt": "2024-01-01T12:40:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Invalid date of birth, invalid gender, empty name fields, phone number already registered, alternate phone same as primary phone, no fields provided to update
- `401`: No token, invalid token, expired token
- `500`: Error updating personal information

---

### 17.3. Update Location and Details

**Method:** `PUT`  
**URL:** `/api/user/profile/location-details`  
**Authentication:** Required

**Description:**  
Update location information, workplace, pronouns, education, relationship status, and hometown. This endpoint handles complex data structures like workplace and education arrays, automatically creating companies and institutions if they don't exist.

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "currentCity": "San Francisco, CA",
  "hometown": "New York, NY",
  "pronouns": "he/him",
  "relationshipStatus": "Single",
  "workplace": [
    {
      "company": "Tech Corp",
      "position": "Senior Software Engineer",
      "startDate": "2020-01-15",
      "endDate": null,
      "isCurrent": true
    }
  ],
  "education": [
    {
      "institution": "Delhi Public School",
      "description": "Completed Bachelor's degree with focus on software engineering",
      "degree": "B.Tech",
      "field": "Computer Science",
      "institutionType": "college",
      "startMonth": 8,
      "startYear": 2020,
      "endMonth": 5,
      "endYear": 2024,
      "cgpa": 8.5,
      "percentage": 85.0
    }
  ]
}
```

**Fields:**
- `currentCity` (string, optional): Current city or address
- `hometown` (string, optional): User's hometown
- `pronouns` (string, optional): User's pronouns (e.g., "he/him", "she/her", "they/them")
- `relationshipStatus` (string, optional): One of: "Single", "In a relationship", "Engaged", "Married", "In a civil partnership", "In a domestic partnership", "In an open relationship", "It's complicated", "Separated", "Divorced", "Widowed". Can be set to `null` or empty string to clear.
- `workplace` (array, optional): Array of work experiences. Each entry must have:
  - `company` (string, required): Company name. **Note:** If the company doesn't exist in the system, it will be automatically created when you update your profile.
  - `position` (string, required): Job position/title
  - `startDate` (string, required): Start date in ISO 8601 format (YYYY-MM-DD)
  - `endDate` (string, optional): End date in ISO 8601 format (YYYY-MM-DD). Set to `null` for current position
  - `isCurrent` (boolean, optional): Whether this is the current job (default: false)
- `education` (array, optional): Array of education entries. Each entry can have:
  - `institution` (string or ObjectId, required if entry provided): Institution name or ObjectId. **Note:** If the institution doesn't exist in the system, it will be automatically created when you update your profile.
  - `description` (string, optional): Description of the education experience
  - `degree` (string, optional): Degree name (e.g., "B.Tech", "Bachelor of Science")
  - `field` (string, optional): Field of study (e.g., "Computer Science", "Engineering")
  - `institutionType` (string, optional): Type of institution - "school", "college", "university", or "others" (default: "school"). This field is stored with the education entry and can be different from the institution's type.
  - `startMonth` (number, optional): Start month (1-12, where 1 = January, 12 = December)
  - `startYear` (number, required if entry provided): Start year (must be a valid year between 1900 and current year + 10)
  - `endMonth` (number, optional): End month (1-12, where 1 = January, 12 = December). Set to `null` for ongoing education
  - `endYear` (number, optional): End year (must be a valid year between 1900 and current year + 10). Set to `null` for ongoing education
  - `cgpa` (number, optional): CGPA score (must be between 0 and 10). Set to `null` if not applicable
  - `percentage` (number, optional): Percentage score (must be between 0 and 100). Set to `null` if not applicable
  - `city` (string, optional): City where institution is located. Only used when creating a new institution.
  - `country` (string, optional): Country where institution is located. Only used when creating a new institution.
  - `logo` (string, optional): Logo URL for the institution. Only used when creating a new institution.

**Note:** 
- You can update any combination of these fields. Only provided fields will be updated.
- **Multiple Education Entries:** You can provide multiple education entries in the array. Each entry represents a different educational qualification. The system will process all entries and create institutions automatically if they don't exist.
- **Multiple Workplaces:** You can provide multiple workplace entries in the array. Each entry represents a different work experience. The system will process all entries and create companies automatically if they don't exist.
- **Institution Auto-Creation:** When you provide an institution name in the `education` array, the system automatically checks if the institution exists. If it doesn't exist, it will be created automatically.
- **Company Auto-Creation:** When you provide a company name in the `workplace` array, the system automatically checks if the company exists. If it doesn't exist, it will be created automatically.
- **Education is Optional:** The education field is completely optional. You can provide an empty array `[]` to clear all education, or omit it entirely to leave education unchanged.
- **Removing Individual Entries:** To remove a specific education or workplace entry, use the [Remove Education Entry](#174-remove-education-entry) or [Remove Workplace Entry](#175-remove-workplace-entry) endpoints instead of replacing the entire array.
- `relationshipStatus` and `hometown` are optional and can be set to `null` or empty string to clear

**Success Response (200):**
```json
{
  "success": true,
  "message": "Location and details updated successfully",
  "data": {
    "user": {
      "id": "user_id",
      "currentCity": "San Francisco, CA",
      "hometown": "New York, NY",
      "pronouns": "he/him",
      "relationshipStatus": "Single",
      "workplace": [
        {
          "company": {
            "id": "507f1f77bcf86cd799439011",
            "name": "Tech Corp",
            "isCustom": true
          },
          "position": "Senior Software Engineer",
          "startDate": "2020-01-15T00:00:00.000Z",
          "endDate": null,
          "isCurrent": true
        }
      ],
      "education": [
        {
          "institution": {
            "id": "507f1f77bcf86cd799439020",
            "name": "Delhi Public School",
            "type": "school",
            "city": "New Delhi",
            "country": "India",
            "logo": "",
            "verified": false,
            "isCustom": true
          },
          "description": "Completed Bachelor's degree with focus on software engineering",
          "degree": "B.Tech",
          "field": "Computer Science",
          "institutionType": "college",
          "startMonth": 8,
          "startYear": 2020,
          "endMonth": 5,
          "endYear": 2024,
          "cgpa": 8.5,
          "percentage": 85.0
        }
      ],
      "updatedAt": "2024-01-01T12:45:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Invalid relationship status, invalid workplace structure, invalid education structure, invalid year format (startYear and endYear must be valid years between 1900 and current year + 10), invalid month format (startMonth and endMonth must be between 1 and 12), invalid institution type (must be one of: school, college, university, others), invalid CGPA (must be between 0 and 10), invalid percentage (must be between 0 and 100), no fields provided to update
- `401`: No token, invalid token, expired token
- `500`: Error updating location and details

---

### 17.4. Remove Education Entry

**Method:** `DELETE`  
**URL:** `/api/user/education/:index`  
**Authentication:** Required

**Description:**  
Remove a specific education entry from your profile by its index (0-based). The index corresponds to the position of the education entry in your education array.

**URL Parameters:**
- `index` (number, required): The index of the education entry to remove (0-based). For example, `0` for the first entry, `1` for the second entry, etc.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Education entry removed successfully",
  "data": {
    "removedEntry": {
      "description": "Completed Bachelor's degree with focus on software engineering",
      "degree": "B.Tech",
      "field": "Computer Science",
      "institutionType": "college",
      "startYear": 2020,
      "endYear": 2024
    },
    "education": [
      {
        "institution": {
          "id": "507f1f77bcf86cd799439021",
          "name": "University of Technology",
          "type": "university",
          "city": "Mumbai",
          "country": "India",
          "logo": "",
          "verified": false,
          "isCustom": false
        },
        "description": "Master's degree in Data Science",
        "degree": "Master of Science",
        "field": "Data Science",
        "institutionType": "university",
        "startMonth": 9,
        "startYear": 2024,
        "endMonth": null,
        "endYear": null,
        "cgpa": null,
        "percentage": 88.5
      }
    ],
    "remainingCount": 1
  }
}
```

**Error Responses:**
- `400`: Invalid education entry index (index must be a non-negative number), no education entries found
- `401`: No token, invalid token, expired token
- `404`: Education entry at the specified index not found
- `500`: Error removing education entry

**Example Request:**
```bash
# Remove the first education entry (index 0)
curl -X DELETE https://api.ulearnandearn.com/api/user/education/0 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Remove the second education entry (index 1)
curl -X DELETE https://api.ulearnandearn.com/api/user/education/1 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Notes:**
- The index is 0-based (first entry is at index 0, second at index 1, etc.)
- After removal, the remaining entries maintain their original order
- You can check your current education entries by calling the [Get User Profile](#16-get-user-profile) endpoint first to see the indices

---

### 17.5. Remove Workplace Entry

**Method:** `DELETE`  
**URL:** `/api/user/workplace/:index`  
**Authentication:** Required

**Description:**  
Remove a specific workplace entry from your profile by its index (0-based). The index corresponds to the position of the workplace entry in your workplace array.

**URL Parameters:**
- `index` (number, required): The index of the workplace entry to remove (0-based). For example, `0` for the first entry, `1` for the second entry, etc.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Workplace entry removed successfully",
  "data": {
    "removedEntry": {
      "position": "Senior Software Engineer",
      "description": "Led development of key features",
      "startDate": "2020-01-15T00:00:00.000Z",
      "endDate": null,
      "isCurrent": true
    },
    "workplace": [
      {
        "company": {
          "id": "507f1f77bcf86cd799439022",
          "name": "Startup Inc",
          "isCustom": true
        },
        "position": "Software Engineer",
        "description": "Developed web applications",
        "startDate": "2018-06-01T00:00:00.000Z",
        "endDate": "2019-12-31T00:00:00.000Z",
        "isCurrent": false
      }
    ],
    "remainingCount": 1
  }
}
```

**Error Responses:**
- `400`: Invalid workplace entry index (index must be a non-negative number), no workplace entries found
- `401`: No token, invalid token, expired token
- `404`: Workplace entry at the specified index not found
- `500`: Error removing workplace entry

**Example Request:**
```bash
# Remove the first workplace entry (index 0)
curl -X DELETE https://api.ulearnandearn.com/api/user/workplace/0 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Remove the second workplace entry (index 1)
curl -X DELETE https://api.ulearnandearn.com/api/user/workplace/1 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Notes:**
- The index is 0-based (first entry is at index 0, second at index 1, etc.)
- After removal, the remaining entries maintain their original order
- You can check your current workplace entries by calling the [Get User Profile](#16-get-user-profile) endpoint first to see the indices

---

### 18. Upload Cover Photo

**Method:** `POST`  
**URL:** `/api/media/cover-photo`  
**Authentication:** Required

**Description:**  
Upload a cover photo for the authenticated user. The image is automatically optimized (1200x400px), stored in a user-specific folder (`user_uploads/{userId}/cover`), and updates the user's `coverPhoto` field. If the user already has a cover photo, the old one is automatically deleted from Cloudinary. **Cover photos are only associated with the authenticated user who uploads them.**

**Content-Type:** `multipart/form-data`

**Request:**
- **Field Name:** `coverPhoto` (required)
- **File Types:** Images only (JPEG, PNG, GIF, WebP)
- **Max File Size:** 20MB

**Example using cURL:**
```bash
curl -X POST https://api.ulearnandearn.com/api/media/cover-photo \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "coverPhoto=@/path/to/your/cover.jpg"
```

**Example using JavaScript (FormData):**
```javascript
const formData = new FormData();
formData.append('coverPhoto', fileInput.files[0]);

const response = await fetch('https://api.ulearnandearn.com/api/media/cover-photo', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});

const result = await response.json();
```

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Cover photo uploaded successfully",
  "data": {
    "id": "media_record_id",
    "url": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/cover/abc123.jpg",
    "public_id": "user_uploads/user_id/cover/abc123",
    "format": "jpg",
    "fileSize": 245678,
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "name": "John Doe",
      "coverPhoto": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/cover/abc123.jpg"
    },
    "uploadedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Response Fields:**
- `id` (string): Database record ID for the upload
- `url` (string): Secure HTTPS URL of the uploaded cover photo
- `public_id` (string): Cloudinary public ID
- `format` (string): File format (e.g., "jpg", "png")
- `fileSize` (number): File size in bytes
- `user` (object): Updated user information including the new cover photo URL
- `uploadedAt` (string): ISO 8601 timestamp of when the file was uploaded

**Error Responses:**

**400 - No File Uploaded:**
```json
{
  "success": false,
  "message": "No file uploaded"
}
```

**400 - Invalid File Type:**
```json
{
  "success": false,
  "message": "Only image files are allowed for cover photos (JPEG, PNG, GIF, WebP)"
}
```

**401 - Not Authenticated:**
```json
{
  "success": false,
  "message": "Not authorized to access this route"
}
```

**500 - Upload Failed:**
```json
{
  "success": false,
  "message": "Cover photo upload failed",
  "error": "Error details (in development mode)"
}
```

**Notes:**
- **Authentication Required:** This endpoint requires a valid access token in the Authorization header
- **User-Specific:** Cover photos are stored in `user_uploads/{userId}/cover` folder
- **Automatic Optimization:** Images are automatically resized to 1200x400px (wider aspect ratio for cover photos)
- **Old Image Cleanup:** Previous cover photos are automatically deleted when a new one is uploaded
- **User Association:** The cover photo is automatically associated with the authenticated user's account
- Only the authenticated user can upload their own cover photo

---

### 19. Update Phone Number

**⚠️ IMPORTANT:** Phone number updates require OTP verification via Twilio.

#### Step 1: Send OTP for Phone Update

**Method:** `POST`  
**URL:** `/api/user/phone/send-otp`  
**Authentication:** Required

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Request Body:**
```json
{
  "phoneNumber": "+1234567890"
}
```

**Required Fields:**
- `phoneNumber` (string): New phone number in E.164 format (e.g., +1234567890)

**Success Response (200):**
```json
{
  "success": true,
  "message": "OTP sent successfully to your phone",
  "data": {
    "phone": "+1234567890",
    "sid": "VEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "status": "pending"
  }
}
```

**Error Responses:**
- `400`: Phone already registered by another user, same as current phone
- `401`: No token, invalid token, expired token
- `429`: Rate limited (3 requests per 15 minutes)
- `500`: Twilio not configured

#### Step 2: Verify OTP and Update Phone

**Method:** `POST`  
**URL:** `/api/user/phone/verify-otp`  
**Authentication:** Required

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Request Body:**
```json
{
  "phoneNumber": "+1234567890",
  "otp": "123456"
}
```

**Required Fields:**
- `phoneNumber` (string): Phone number (must match the one used in step 1)
- `otp` (string): OTP code received via SMS

**Success Response (200):**
```json
{
  "success": true,
  "message": "Phone number updated successfully",
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "name": "John Doe",
      "dob": "1999-01-15T00:00:00.000Z",
      "phoneNumber": "+1234567890",
      "alternatePhoneNumber": "+1987654321",
      "gender": "Male",
      "profileImage": "https://...",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:35:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Invalid OTP, phone already registered by another user
- `401`: No token, invalid token, expired token
- `429`: Rate limited (5 attempts per 15 minutes)
- `500`: Twilio not configured

**Note:** 
- Phone number must be in E.164 format
- OTP expires in 10 minutes (Twilio default)
- Phone number must not be already registered by another user

---

### 20. Update Alternate Phone Number

**⚠️ IMPORTANT:** Alternate phone number updates require OTP verification via Twilio.

#### Step 1: Send OTP for Alternate Phone

**Method:** `POST`  
**URL:** `/api/user/alternate-phone/send-otp`  
**Authentication:** Required

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Request Body:**
```json
{
  "alternatePhoneNumber": "+1987654321"
}
```

**Required Fields:**
- `alternatePhoneNumber` (string): Alternate phone number in E.164 format (e.g., +1987654321)

**Success Response (200):**
```json
{
  "success": true,
  "message": "OTP sent successfully to your alternate phone",
  "data": {
    "alternatePhone": "+1987654321",
    "sid": "VEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "status": "pending"
  }
}
```

**Error Responses:**
- `400`: Phone already registered by another user, same as primary phone, same as current alternate phone
- `401`: No token, invalid token, expired token
- `429`: Rate limited (3 requests per 15 minutes)
- `500`: Twilio not configured

#### Step 2: Verify OTP and Update Alternate Phone

**Method:** `POST`  
**URL:** `/api/user/alternate-phone/verify-otp`  
**Authentication:** Required

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Request Body:**
```json
{
  "alternatePhoneNumber": "+1987654321",
  "otp": "123456"
}
```

**Required Fields:**
- `alternatePhoneNumber` (string): Alternate phone number (must match the one used in step 1)
- `otp` (string): OTP code received via SMS

**Success Response (200):**
```json
{
  "success": true,
  "message": "Alternate phone number updated successfully",
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "name": "John Doe",
      "dob": "1999-01-15T00:00:00.000Z",
      "phoneNumber": "+1234567890",
      "alternatePhoneNumber": "+1987654321",
      "gender": "Male",
      "profileImage": "https://...",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:40:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Invalid OTP, phone already registered by another user, same as primary phone
- `401`: No token, invalid token, expired token
- `429`: Rate limited (5 attempts per 15 minutes)
- `500`: Twilio not configured

**Note:** 
- Alternate phone number must be different from primary phone number
- Phone number must be in E.164 format
- OTP expires in 10 minutes (Twilio default)

---

### 21. Remove Alternate Phone Number

**Method:** `DELETE`  
**URL:** `/api/user/alternate-phone`  
**Authentication:** Required

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Alternate phone number removed successfully",
  "data": {
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "name": "John Doe",
      "dob": "1999-01-15T00:00:00.000Z",
      "phoneNumber": "+1234567890",
      "alternatePhoneNumber": null,
      "gender": "Male",
      "profileImage": "https://...",
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:45:00.000Z"
    }
  }
}
```

**Error Responses:**
- `401`: No token, invalid token, expired token

---

### 22. Upload Media to Cloudinary

**Method:** `POST`  
**URL:** `/api/media/upload`  
**Authentication:** Required

**Description:**  
Upload images or videos to Cloudinary. Supports automatic resource type detection (images and videos). Files are uploaded to user-specific folders (`user_uploads/{userId}`) in Cloudinary to ensure proper organization and security. All uploads are tracked in the database and associated with the authenticated user. **Each user can only access their own uploads.**

**Content-Type:** `multipart/form-data`

**Request:**
- **Field Name:** `media` (required)
- **File Types:** Images (JPEG, PNG, GIF, WebP, etc.) and Videos (MP4, MOV, AVI, etc.)
- **Max File Size:** 20MB

**Example using cURL:**
```bash
curl -X POST https://api.ulearnandearn.com/api/media/upload \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "media=@/path/to/your/image.jpg"
```

**Example using JavaScript (FormData):**
```javascript
const formData = new FormData();
formData.append('media', fileInput.files[0]);

const response = await fetch('https://api.ulearnandearn.com/api/media/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});

const result = await response.json();
```

**Example using JavaScript (fetch with file):**
```javascript
const file = document.querySelector('input[type="file"]').files[0];
const formData = new FormData();
formData.append('media', file);

fetch('https://api.ulearnandearn.com/api/media/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
})
.then(response => response.json())
.then(data => {
  console.log('Upload successful:', data);
  console.log('File URL:', data.data.url);
  console.log('Uploaded by:', data.data.uploadedBy);
})
.catch(error => {
  console.error('Upload failed:', error);
});
```

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Uploaded successfully",
  "data": {
    "id": "media_record_id",
    "url": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/abc123.jpg",
    "public_id": "user_uploads/abc123",
    "format": "jpg",
    "type": "image",
    "fileSize": 245678,
    "uploadedBy": {
      "userId": "user_id",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "uploadedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Response Fields:**
- `id` (string): Database record ID for the upload (can be used to track/delete)
- `url` (string): Secure HTTPS URL of the uploaded file
- `public_id` (string): Cloudinary public ID (can be used for transformations/deletion)
- `format` (string): File format (e.g., "jpg", "png", "mp4", "mov")
- `type` (string): Resource type - "image" or "video"
- `fileSize` (number): File size in bytes
- `uploadedBy` (object): Information about the user who uploaded the file
  - `userId` (string): User's database ID
  - `email` (string): User's email address
  - `name` (string): User's full name
- `uploadedAt` (string): ISO 8601 timestamp of when the file was uploaded

**Error Responses:**

**400 - No File Uploaded:**
```json
{
  "success": false,
  "message": "No file uploaded"
}
```

**401 - Not Authenticated:**
```json
{
  "success": false,
  "message": "Not authorized to access this route"
}
```

**500 - Upload Failed:**
```json
{
  "success": false,
  "message": "Cloudinary upload failed",
  "error": "Error details (in development mode)"
}
```

**Common Issues:**
- **File too large:** Maximum file size is 20MB
- **Invalid file type:** Ensure the file is a valid image or video format
- **Missing field name:** Use `media` as the field name in your form data
- **Cloudinary not configured:** Ensure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, and `UPLOAD_PRESET` environment variables are set

**Notes:**
- **Authentication Required:** This endpoint requires a valid access token in the Authorization header
- **User Tracking:** All uploads are tracked in the database and associated with the authenticated user via `userId`
- **User-Specific Folders:** Files are automatically organized in user-specific folders (`user_uploads/{userId}`) in Cloudinary
- **Security:** Each user can only upload, view, and delete their own media files
- The upload preset (`UPLOAD_PRESET`) must be configured in your Cloudinary account
- Resource type is automatically detected (images and videos are supported)
- The returned URL is a secure HTTPS URL that can be used directly in your application
- You can query uploads by user ID using the Media model in the database

---

### 23. Upload Profile Image

**Method:** `POST`  
**URL:** `/api/media/profile-image`  
**Authentication:** Required

**Description:**  
Upload a profile image for the authenticated user. The image is automatically optimized (400x400px, face detection), stored in a user-specific folder (`user_uploads/{userId}/profile`), and updates the user's `profileImage` field. If the user already has a profile image, the old one is automatically deleted from Cloudinary. **Profile images are only associated with the authenticated user who uploads them.**

**Content-Type:** `multipart/form-data`

**Request:**
- **Field Name:** `profileImage` (required)
- **File Types:** Images only (JPEG, PNG, GIF, WebP)
- **Max File Size:** 20MB

**Example using cURL:**
```bash
curl -X POST https://api.ulearnandearn.com/api/media/profile-image \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "profileImage=@/path/to/your/profile.jpg"
```

**Example using JavaScript (FormData):**
```javascript
const formData = new FormData();
formData.append('profileImage', fileInput.files[0]);

const response = await fetch('https://api.ulearnandearn.com/api/media/profile-image', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});

const result = await response.json();
```

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Profile image uploaded successfully",
  "data": {
    "id": "media_record_id",
    "url": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/profile/abc123.jpg",
    "public_id": "user_uploads/user_id/profile/abc123",
    "format": "jpg",
    "fileSize": 245678,
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "name": "John Doe",
      "profileImage": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/profile/abc123.jpg"
    },
    "uploadedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Response Fields:**
- `id` (string): Database record ID for the upload
- `url` (string): Secure HTTPS URL of the uploaded profile image
- `public_id` (string): Cloudinary public ID
- `format` (string): File format (e.g., "jpg", "png")
- `fileSize` (number): File size in bytes
- `user` (object): Updated user information including the new profile image URL
- `uploadedAt` (string): ISO 8601 timestamp of when the file was uploaded

**Error Responses:**

**400 - No File Uploaded:**
```json
{
  "success": false,
  "message": "No file uploaded"
}
```

**400 - Invalid File Type:**
```json
{
  "success": false,
  "message": "Only image files are allowed for profile pictures (JPEG, PNG, GIF, WebP)"
}
```

**401 - Not Authenticated:**
```json
{
  "success": false,
  "message": "Not authorized to access this route"
}
```

**500 - Upload Failed:**
```json
{
  "success": false,
  "message": "Profile image upload failed",
  "error": "Error details (in development mode)"
}
```

**Notes:**
- **Authentication Required:** This endpoint requires a valid access token in the Authorization header
- **User-Specific:** Profile images are stored in `user_uploads/{userId}/profile` folder
- **Automatic Optimization:** Images are automatically resized to 400x400px with face detection
- **Old Image Cleanup:** Previous profile images are automatically deleted when a new one is uploaded
- **User Association:** The profile image is automatically associated with the authenticated user's account
- Only the authenticated user can upload their own profile image

---

### 23. Get User's Media

**Method:** `GET`  
**URL:** `/api/media/my-media`  
**Authentication:** Required

**Description:**  
Retrieve all media files uploaded by the authenticated user. **Users can only see their own uploads** - the response is automatically filtered by the authenticated user's ID.

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Media retrieved successfully",
  "data": {
    "count": 5,
    "media": [
      {
        "id": "media_record_id_1",
        "url": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/image1.jpg",
        "public_id": "user_uploads/user_id/image1",
        "format": "jpg",
        "type": "image",
        "fileSize": 245678,
        "originalFilename": "my-image.jpg",
        "folder": "user_uploads/user_id",
        "uploadedAt": "2024-01-15T10:30:00.000Z"
      },
      {
        "id": "media_record_id_2",
        "url": "https://res.cloudinary.com/your-cloud/video/upload/v1234567890/user_uploads/user_id/video1.mp4",
        "public_id": "user_uploads/user_id/video1",
        "format": "mp4",
        "type": "video",
        "fileSize": 5245678,
        "originalFilename": "my-video.mp4",
        "folder": "user_uploads/user_id",
        "uploadedAt": "2024-01-14T09:20:00.000Z"
      }
    ]
  }
}
```

**Response Fields:**
- `count` (number): Total number of media files for the user
- `media` (array): Array of media objects, each containing:
  - `id` (string): Database record ID
  - `url` (string): Secure HTTPS URL of the file
  - `public_id` (string): Cloudinary public ID
  - `format` (string): File format (e.g., "jpg", "png", "mp4")
  - `type` (string): Resource type - "image" or "video"
  - `fileSize` (number): File size in bytes
  - `originalFilename` (string): Original filename when uploaded
  - `folder` (string): Cloudinary folder path
  - `uploadedAt` (string): ISO 8601 timestamp of when the file was uploaded

**Error Responses:**

**401 - Not Authenticated:**
```json
{
  "success": false,
  "message": "Not authorized to access this route"
}
```

**500 - Retrieval Failed:**
```json
{
  "success": false,
  "message": "Failed to retrieve media",
  "error": "Error details (in development mode)"
}
```

**Notes:**
- **Authentication Required:** This endpoint requires a valid access token in the Authorization header
- **User-Specific:** Only returns media files uploaded by the authenticated user
- **Sorted by Date:** Results are sorted by creation date (newest first)
- **Security:** Users cannot see other users' media files

---

### 24. Get User's Images

**Method:** `GET`  
**URL:** `/api/media/my-images`  
**Authentication:** Required

**Description:**  
Retrieve all image files (excluding videos) uploaded by the authenticated user. **Users can only see their own uploads** - the response is automatically filtered by the authenticated user's ID and only includes images. This endpoint supports pagination.

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Number of images per page (default: 20)

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Example Request:**
```bash
GET /api/media/my-images?page=1&limit=20
```

**Example using cURL:**
```bash
curl -X GET "https://api.ulearnandearn.com/api/media/my-images?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Example using JavaScript:**
```javascript
const response = await fetch('https://api.ulearnandearn.com/api/media/my-images?page=1&limit=20', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const result = await response.json();
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Images retrieved successfully",
  "data": {
    "count": 10,
    "totalImages": 45,
    "images": [
      {
        "id": "media_record_id_1",
        "url": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/image1.jpg",
        "public_id": "user_uploads/user_id/image1",
        "format": "jpg",
        "type": "image",
        "fileSize": 245678,
        "originalFilename": "my-image.jpg",
        "folder": "user_uploads/user_id",
        "uploadedAt": "2024-01-15T10:30:00.000Z"
      },
      {
        "id": "media_record_id_2",
        "url": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/image2.png",
        "public_id": "user_uploads/user_id/image2",
        "format": "png",
        "type": "image",
        "fileSize": 189234,
        "originalFilename": "my-image2.png",
        "folder": "user_uploads/user_id",
        "uploadedAt": "2024-01-14T09:20:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalImages": 45,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

**Response Fields:**
- `count` (number): Number of images in the current page
- `totalImages` (number): Total number of images for the user
- `images` (array): Array of image objects, each containing:
  - `id` (string): Database record ID
  - `url` (string): Secure HTTPS URL of the image
  - `public_id` (string): Cloudinary public ID
  - `format` (string): File format (e.g., "jpg", "png", "webp")
  - `type` (string): Resource type - always "image"
  - `fileSize` (number): File size in bytes
  - `originalFilename` (string): Original filename when uploaded
  - `folder` (string): Cloudinary folder path
  - `uploadedAt` (string): ISO 8601 timestamp of when the file was uploaded
- `pagination` (object): Pagination information:
  - `currentPage` (number): Current page number
  - `totalPages` (number): Total number of pages
  - `totalImages` (number): Total number of images
  - `hasNextPage` (boolean): Whether there is a next page
  - `hasPrevPage` (boolean): Whether there is a previous page

**Error Responses:**

**401 - Not Authenticated:**
```json
{
  "success": false,
  "message": "Not authorized to access this route"
}
```

**500 - Retrieval Failed:**
```json
{
  "success": false,
  "message": "Failed to retrieve images",
  "error": "Error details (in development mode)"
}
```

**Notes:**
- **Authentication Required:** This endpoint requires a valid access token in the Authorization header
- **User-Specific:** Only returns image files uploaded by the authenticated user
- **Images Only:** This endpoint filters out videos and only returns images (resource_type: 'image')
- **Sorted by Date:** Results are sorted by creation date (newest first)
- **Pagination:** Supports pagination with `page` and `limit` query parameters
- **Security:** Users cannot see other users' images

---

### 25. Get User's Images (Public)

**Method:** `GET`  
**URL:** `/api/media/user/:id`  
**Authentication:** Not required

**Description:**  
Retrieve all image files (excluding videos) uploaded by a specific user. **This is a public endpoint** - anyone can view images posted by any user by providing their user ID. This endpoint is useful for displaying images on a user's profile page. Supports pagination.

**URL Parameters:**
- `id` (string, required): User ID (the `_id` field from the user document)

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Number of images per page (default: 20)

**Example Request:**
```bash
GET /api/media/user/user_id_123?page=1&limit=20
```

**Example using cURL:**
```bash
curl -X GET "https://api.ulearnandearn.com/api/media/user/user_id_123?page=1&limit=20"
```

**Example using JavaScript:**
```javascript
const response = await fetch('https://api.ulearnandearn.com/api/media/user/user_id_123?page=1&limit=20', {
  method: 'GET'
});

const result = await response.json();
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User images retrieved successfully",
  "data": {
    "user": {
      "id": "user_id_123",
      "name": "John Doe",
      "email": "user@example.com",
      "profileImage": "https://..."
    },
    "count": 10,
    "totalImages": 45,
    "images": [
      {
        "id": "media_record_id_1",
        "url": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/image1.jpg",
        "public_id": "user_uploads/user_id/image1",
        "format": "jpg",
        "type": "image",
        "fileSize": 245678,
        "originalFilename": "my-image.jpg",
        "folder": "user_uploads/user_id",
        "uploadedAt": "2024-01-15T10:30:00.000Z"
      },
      {
        "id": "media_record_id_2",
        "url": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/image2.png",
        "public_id": "user_uploads/user_id/image2",
        "format": "png",
        "type": "image",
        "fileSize": 189234,
        "originalFilename": "my-image2.png",
        "folder": "user_uploads/user_id",
        "uploadedAt": "2024-01-14T09:20:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalImages": 45,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

**Response Fields:**
- `user` (object): User information (id, name, email, profileImage)
- `count` (number): Number of images in the current page
- `totalImages` (number): Total number of images for the user
- `images` (array): Array of image objects, each containing:
  - `id` (string): Database record ID
  - `url` (string): Secure HTTPS URL of the image
  - `public_id` (string): Cloudinary public ID
  - `format` (string): File format (e.g., "jpg", "png", "webp")
  - `type` (string): Resource type - always "image"
  - `fileSize` (number): File size in bytes
  - `originalFilename` (string): Original filename when uploaded
  - `folder` (string): Cloudinary folder path
  - `uploadedAt` (string): ISO 8601 timestamp of when the file was uploaded
- `pagination` (object): Pagination information:
  - `currentPage` (number): Current page number
  - `totalPages` (number): Total number of pages
  - `totalImages` (number): Total number of images
  - `hasNextPage` (boolean): Whether there is a next page
  - `hasPrevPage` (boolean): Whether there is a previous page

**Error Responses:**

**400 - Invalid User ID:**
```json
{
  "success": false,
  "message": "Invalid user ID"
}
```

**404 - User Not Found:**
```json
{
  "success": false,
  "message": "User not found"
}
```

**500 - Retrieval Failed:**
```json
{
  "success": false,
  "message": "Failed to retrieve user images",
  "error": "Error details (in development mode)"
}
```

**Notes:**
- **Public Endpoint:** No authentication required - anyone can view any user's images
- **Profile Viewing:** Perfect for displaying images on a user's public profile page
- **Images Only:** This endpoint filters out videos and only returns images (resource_type: 'image')
- **Sorted by Date:** Results are sorted by creation date (newest first)
- **Pagination:** Supports pagination with `page` and `limit` query parameters
- **User Information:** Includes basic user information in the response

---

### 26. Delete User's Media

**Method:** `DELETE`  
**URL:** `/api/media/:mediaId`  
**Authentication:** Required

**Description:**  
Delete a media file that belongs to the authenticated user. The file is removed from both Cloudinary and the database. **Users can only delete their own media files** - attempting to delete another user's media will result in a 404 error. If the deleted media was the user's profile image, the user's `profileImage` field is automatically cleared.

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**URL Parameters:**
- `mediaId` (string, required): The database ID of the media file to delete

**Example using cURL:**
```bash
curl -X DELETE https://api.ulearnandearn.com/api/media/media_record_id_123 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Example using JavaScript:**
```javascript
const response = await fetch('https://api.ulearnandearn.com/api/media/media_record_id_123', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const result = await response.json();
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Media deleted successfully"
}
```

**Error Responses:**

**400 - Missing Media ID:**
```json
{
  "success": false,
  "message": "Media ID is required"
}
```

**401 - Not Authenticated:**
```json
{
  "success": false,
  "message": "Not authorized to access this route"
}
```

**404 - Media Not Found or Not Owned:**
```json
{
  "success": false,
  "message": "Media not found or you don't have permission to delete it"
}
```

**500 - Deletion Failed:**
```json
{
  "success": false,
  "message": "Failed to delete media",
  "error": "Error details (in development mode)"
}
```

**Notes:**
- **Authentication Required:** This endpoint requires a valid access token in the Authorization header
- **User-Specific:** Users can only delete their own media files
- **Automatic Cleanup:** If the deleted media was the user's profile image, the `profileImage` field is automatically cleared
- **Cloudinary Deletion:** The file is deleted from Cloudinary and the database record is removed
- **Security:** Attempting to delete another user's media will return a 404 error (not revealing that the media exists)

---

## 🏢 Company Management

### 27. Search Companies

**Method:** `GET`  
**URL:** `/api/company/search`  
**Authentication:** Not required

**Query Parameters:**
- `query` (string, required): Company name to search for

**Example Request:**
```bash
GET /api/company/search?query=BlueSky Innovations
```

**Success Response (200) - Companies Found:**
```json
{
  "success": true,
  "message": "Found 2 company/companies",
  "data": {
    "companies": [
      {
        "id": "507f1f77bcf86cd799439011",
        "name": "BlueSky Innovations",
        "isCustom": true,
        "createdAt": "2024-01-15T10:30:00.000Z"
      },
      {
        "id": "507f1f77bcf86cd799439012",
        "name": "BlueSky Technologies Pvt Ltd",
        "isCustom": false,
        "createdAt": "2024-01-10T08:20:00.000Z"
      }
    ],
    "canAddCustom": false,
    "suggestedName": null
  }
}
```

**Success Response (200) - No Companies Found:**
```json
{
  "success": true,
  "message": "No companies found",
  "data": {
    "companies": [],
    "canAddCustom": true,
    "suggestedName": "BlueSky Innovations Pvt Ltd"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "message": "Search query is required"
}
```

**Notes:**
- **Case-Insensitive Search:** The search is case-insensitive and matches partial company names
- **No Authentication Required:** This endpoint is public and can be used without authentication
- **Custom Entry Flag:** When `canAddCustom: true`, the frontend should show an option to add the company as a custom entry
- **Suggested Name:** When no matches are found, `suggestedName` contains the exact search query for easy creation
- **Result Limit:** Maximum of 20 companies are returned, sorted alphabetically

---

### 28. Create Company

**Method:** `POST`  
**URL:** `/api/company`  
**Authentication:** Required

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "BlueSky Innovations Pvt Ltd"
}
```

**Success Response (201) - Company Created:**
```json
{
  "success": true,
  "message": "Company created successfully",
  "data": {
    "company": {
      "id": "507f1f77bcf86cd799439013",
      "name": "BlueSky Innovations Pvt Ltd",
      "isCustom": true,
      "createdAt": "2024-01-15T12:00:00.000Z"
    }
  }
}
```

**Success Response (200) - Company Already Exists:**
```json
{
  "success": true,
  "message": "Company already exists",
  "data": {
    "company": {
      "id": "507f1f77bcf86cd799439011",
      "name": "BlueSky Innovations Pvt Ltd",
      "isCustom": true,
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "message": "Company name is required"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "message": "Error creating company",
  "error": "Error details (only in development)"
}
```

**Notes:**
- **Authentication Required:** This endpoint requires a valid access token
- **Case-Insensitive Duplicates:** The system prevents duplicate companies (case-insensitive). If a company with the same name (ignoring case) already exists, it returns the existing company
- **Auto-Normalization:** Company names are automatically normalized and stored consistently
- **Custom Flag:** All user-created companies are marked as `isCustom: true`
- **Automatic Creation:** Companies are also automatically created when users update their profile with workplace information (see [Update Profile](#17-update-user-profile))

**Frontend Flow Example:**
1. User types: "BlueSky Innovations Pvt Ltd"
2. Frontend calls: `GET /api/company/search?query=BlueSky Innovations Pvt Ltd`
3. If `canAddCustom: true` → Show: "Add BlueSky Innovations Pvt Ltd?"
4. When user selects it → Frontend calls: `POST /api/company` with `{ "name": "BlueSky Innovations Pvt Ltd" }`
5. Backend creates the company and returns it
6. Frontend can now use this company in profile updates

---

## 🎓 Institution Management

### 29. Search Institutions

**Method:** `GET`  
**URL:** `/api/institution/search`  
**Authentication:** Not required

**Query Parameters:**
- `query` (string, required): Institution name to search for
- `type` (string, optional): Filter by institution type - "school", "college", or "university"

**Example Request:**
```bash
GET /api/institution/search?query=Delhi Public School
GET /api/institution/search?query=MIT&type=university
```

**Success Response (200) - Institutions Found:**
```json
{
  "success": true,
  "message": "Found 2 institution/institutions",
  "data": {
    "institutions": [
      {
        "id": "507f1f77bcf86cd799439020",
        "name": "Delhi Public School",
        "type": "school",
        "city": "New Delhi",
        "country": "India",
        "logo": "",
        "verified": false,
        "isCustom": true,
        "createdAt": "2024-01-15T10:30:00.000Z"
      },
      {
        "id": "507f1f77bcf86cd799439021",
        "name": "Delhi Public School - Noida",
        "type": "school",
        "city": "Noida",
        "country": "India",
        "logo": "",
        "verified": false,
        "isCustom": false,
        "createdAt": "2024-01-10T08:20:00.000Z"
      }
    ],
    "canAddCustom": false,
    "suggestedName": null
  }
}
```

**Success Response (200) - No Institutions Found:**
```json
{
  "success": true,
  "message": "No institutions found",
  "data": {
    "institutions": [],
    "canAddCustom": true,
    "suggestedName": "ABC Coding School"
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "message": "Search query is required"
}
```

**Notes:**
- **Case-Insensitive Search:** The search is case-insensitive and matches partial institution names
- **No Authentication Required:** This endpoint is public and can be used without authentication
- **Type Filtering:** Optional `type` parameter allows filtering by institution type (school, college, university)
- **Custom Entry Flag:** When `canAddCustom: true`, the frontend should show an option to add the institution as a custom entry
- **Suggested Name:** When no matches are found, `suggestedName` contains the exact search query for easy creation
- **Result Limit:** Maximum of 20 institutions are returned, sorted alphabetically

---

### 30. Create Institution

**Method:** `POST`  
**URL:** `/api/institution`  
**Authentication:** Required

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "ABC Coding School",
  "type": "school",
  "city": "New Delhi",
  "country": "India",
  "logo": "https://example.com/logo.png"
}
```

**Required Fields:**
- `name` (string, required): Institution name

**Optional Fields:**
- `type` (string, optional): Institution type - "school", "college", or "university" (default: "school")
- `city` (string, optional): City where institution is located
- `country` (string, optional): Country where institution is located
- `logo` (string, optional): Logo URL for the institution

**Success Response (201) - Institution Created:**
```json
{
  "success": true,
  "message": "Institution created successfully",
  "data": {
    "institution": {
      "id": "507f1f77bcf86cd799439022",
      "name": "ABC Coding School",
      "type": "school",
      "city": "New Delhi",
      "country": "India",
      "logo": "https://example.com/logo.png",
      "verified": false,
      "isCustom": true,
      "createdAt": "2024-01-15T12:00:00.000Z"
    }
  }
}
```

**Success Response (200) - Institution Already Exists:**
```json
{
  "success": true,
  "message": "Institution already exists",
  "data": {
    "institution": {
      "id": "507f1f77bcf86cd799439020",
      "name": "ABC Coding School",
      "type": "school",
      "city": "New Delhi",
      "country": "India",
      "logo": "",
      "verified": false,
      "isCustom": true,
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "message": "Institution name is required"
}
```

**Error Response (500):**
```json
{
  "success": false,
  "message": "Error creating institution",
  "error": "Error details (only in development)"
}
```

**Notes:**
- **Authentication Required:** This endpoint requires a valid access token
- **Case-Insensitive Duplicates:** The system prevents duplicate institutions (case-insensitive). If an institution with the same name (ignoring case) already exists, it returns the existing institution
- **Auto-Normalization:** Institution names are automatically normalized and stored consistently
- **Custom Flag:** All user-created institutions are marked as `isCustom: true`
- **Automatic Creation:** Institutions are also automatically created when users update their profile with education information (see [Update Profile](#17-update-user-profile))
- **Type Default:** If no type is provided or an invalid type is provided, it defaults to "school"

**Frontend Flow Example:**
1. User types: "ABC Coding School"
2. Frontend calls: `GET /api/institution/search?query=ABC Coding School`
3. If `canAddCustom: true` → Show: "Add ABC Coding School?"
4. When user selects it → Frontend calls: `POST /api/institution` with `{ "name": "ABC Coding School", "type": "school" }`
5. Backend creates the institution and returns it
6. Frontend can now use this institution in profile updates

---

## 📝 Posts Management

### 31. Upload Post Media

**Method:** `POST`  
**URL:** `/api/posts/upload-media`  
**Authentication:** Required

**Description:**  
Upload images or videos for posts. Files are uploaded to Cloudinary in user-specific folders (`user_uploads/{userId}/posts`). This endpoint is used as part of the post creation flow - upload media first, then create the post with the returned URLs.

**Content-Type:** `multipart/form-data`

**Request:**
- **Field Name:** `media` (required)
- **File Types:** Images (JPEG, PNG, GIF, WebP, etc.) and Videos (MP4, MOV, AVI, etc.)
- **Max File Size:** 20MB

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Example using cURL:**
```bash
curl -X POST https://api.ulearnandearn.com/api/posts/upload-media \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "media=@/path/to/your/image.jpg"
```

**Example using JavaScript (FormData):**
```javascript
const formData = new FormData();
formData.append('media', fileInput.files[0]);

const response = await fetch('https://api.ulearnandearn.com/api/posts/upload-media', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});

const result = await response.json();
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Media uploaded successfully",
  "data": {
    "url": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/posts/abc123.jpg",
    "publicId": "user_uploads/user_id/posts/abc123",
    "type": "image",
    "format": "jpg",
    "fileSize": 245678,
    "mediaId": "media_record_id"
  }
}
```

**Response Fields:**
- `url` (string): Secure HTTPS URL of the uploaded file
- `publicId` (string): Cloudinary public ID
- `type` (string): Media type - "image" or "video"
- `format` (string): File format (e.g., "jpg", "png", "mp4")
- `fileSize` (number): File size in bytes
- `mediaId` (string): Database record ID for the upload

**Error Responses:**
- `400`: No file uploaded
- `401`: Not authenticated
- `500`: Upload failed

**Note:** Use the returned `url`, `publicId`, and `type` in the create post endpoint.

---

### 32. Create Post

**Method:** `POST`  
**URL:** `/api/posts/create`  
**Authentication:** Required

**Description:**  
Create a new post. Posts can have a caption, media (images/videos), or both. Media URLs should be obtained from the upload post media endpoint first.

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "caption": "Check out this amazing sunset! 🌅",
  "mediaUrls": [
    {
      "url": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/posts/abc123.jpg",
      "publicId": "user_uploads/user_id/posts/abc123",
      "type": "image",
      "format": "jpg"
    }
  ]
}
```

**Fields:**
- `caption` (string, optional): Post caption (max 2200 characters). Post must have either caption or media (or both).
- `mediaUrls` (array, optional): Array of media objects. Each object must have:
  - `url` (string, required): Media URL from upload endpoint
  - `publicId` (string, required): Cloudinary public ID from upload endpoint
  - `type` (string, required): "image" or "video"
  - `format` (string, optional): File format (e.g., "jpg", "mp4")

**Text-Only Post Example:**
```json
{
  "caption": "Just a text post!"
}
```

**Media-Only Post Example:**
```json
{
  "mediaUrls": [
    {
      "url": "https://res.cloudinary.com/...",
      "publicId": "user_uploads/user_id/posts/abc123",
      "type": "image"
    }
  ]
}
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Post created successfully",
  "data": {
    "post": {
      "id": "post_id",
      "userId": "user_id",
      "user": {
        "id": "user_id",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "email": "user@example.com",
        "profileImage": "https://..."
      },
      "caption": "Check out this amazing sunset! 🌅",
      "media": [
        {
          "url": "https://res.cloudinary.com/...",
          "publicId": "user_uploads/user_id/posts/abc123",
          "type": "image",
          "format": "jpg"
        }
      ],
      "likes": [],
      "comments": [],
      "likeCount": 0,
      "commentCount": 0,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Post must have either caption or media, invalid media structure, invalid media type
- `401`: Not authenticated
- `500`: Failed to create post

**Note:** 
- At least one of `caption` or `mediaUrls` must be provided
- Media URLs should come from the `/api/posts/upload-media` endpoint
- Posts support multiple media items (carousel posts)

---

### 33. Get All Posts

**Method:** `GET`  
**URL:** `/api/posts/all`  
**Authentication:** Not required

**Description:**  
Retrieve all posts for the feed. Results are sorted by newest first and include pagination support.

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Number of posts per page (default: 10)

**Example Request:**
```bash
GET /api/posts/all?page=1&limit=10
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Posts retrieved successfully",
  "data": {
    "posts": [
      {
        "id": "post_id_1",
        "userId": "user_id",
        "user": {
          "id": "user_id",
          "firstName": "John",
          "lastName": "Doe",
          "name": "John Doe",
          "email": "user@example.com",
          "profileImage": "https://..."
        },
        "caption": "Check out this amazing sunset! 🌅",
        "media": [
          {
            "url": "https://res.cloudinary.com/...",
            "publicId": "user_uploads/user_id/posts/abc123",
            "type": "image",
            "format": "jpg"
          }
        ],
        "likes": [],
        "comments": [],
        "likeCount": 0,
        "commentCount": 0,
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalPosts": 50,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

**Response Fields:**
- `posts` (array): Array of post objects
- `pagination` (object): Pagination metadata
  - `currentPage` (number): Current page number
  - `totalPages` (number): Total number of pages
  - `totalPosts` (number): Total number of posts
  - `hasNextPage` (boolean): Whether there are more pages
  - `hasPrevPage` (boolean): Whether there are previous pages

**Error Responses:**
- `500`: Failed to retrieve posts

**Note:** 
- Results are sorted by creation date (newest first)
- User information, likes, and comments are automatically populated
- This endpoint is public (no authentication required)

---

### 34. Get My Posts

**Method:** `GET`  
**URL:** `/api/posts/me`  
**Authentication:** Required (Bearer Token)

**Description:**  
Retrieve all posts for the currently authenticated user. No user ID needed - automatically uses the authenticated user's ID from the token. Results are sorted by newest first and include pagination support.

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Number of posts per page (default: 10)

**Example Request:**
```bash
GET /api/posts/me?page=1&limit=10
Authorization: Bearer <your_access_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "My posts retrieved successfully",
  "data": {
    "user": {
      "id": "693921193dc3d5315a43a12c",
      "name": "Mohd Zeeshan",
      "email": "fzeeshankhan637@gmail.com",
      "profileImage": "https://..."
    },
    "posts": [
      {
        "id": "post_id_1",
        "userId": "693921193dc3d5315a43a12c",
        "user": {
          "id": "693921193dc3d5315a43a12c",
          "firstName": "Mohd",
          "lastName": "Zeeshan",
          "name": "Mohd Zeeshan",
          "email": "fzeeshankhan637@gmail.com",
          "profileImage": "https://..."
        },
        "caption": "My first post!",
        "media": [],
        "likes": [],
        "comments": [],
        "likeCount": 0,
        "commentCount": 0,
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 2,
      "totalPosts": 15,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

**Error Responses:**
- `401`: Unauthorized (missing or invalid token)
- `500`: Failed to retrieve posts

**Note:** 
- Results are sorted by creation date (newest first)
- User information, likes, and comments are automatically populated
- This endpoint requires authentication - it automatically uses the authenticated user's ID
- Use this endpoint instead of `/api/posts/user/:id` when you want to get your own posts

---

### 35. Get User Posts

**Method:** `GET`  
**URL:** `/api/posts/user/:id`  
**Authentication:** Not required

**Description:**  
Retrieve all posts by a specific user. Results are sorted by newest first and include pagination support.

**URL Parameters:**
- `id` (string, required): User ID (the `_id` field from the user document)

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Number of posts per page (default: 10)

**Example Request:**
```bash
GET /api/posts/user/user_id_123?page=1&limit=10
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User posts retrieved successfully",
  "data": {
    "user": {
      "id": "user_id",
      "name": "John Doe",
      "email": "user@example.com",
      "profileImage": "https://..."
    },
    "posts": [
      {
        "id": "post_id_1",
        "userId": "user_id",
        "user": {
          "id": "user_id",
          "firstName": "John",
          "lastName": "Doe",
          "name": "John Doe",
          "email": "user@example.com",
          "profileImage": "https://..."
        },
        "caption": "My first post!",
        "media": [],
        "likes": [],
        "comments": [],
        "likeCount": 0,
        "commentCount": 0,
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 2,
      "totalPosts": 15,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

**Error Responses:**
- `400`: Invalid user ID
- `404`: User not found
- `500`: Failed to retrieve user posts

**Note:** 
- Results are sorted by creation date (newest first)
- User information, likes, and comments are automatically populated
- This endpoint is public (no authentication required)

---

### 35. Like/Unlike Post

**Method:** `POST`  
**URL:** `/api/posts/:id/like`  
**Authentication:** Required (Bearer Token)

**Description:**  
Toggle like on a post. If the user hasn't liked the post, it adds a like. If the user has already liked the post, it removes the like (unlike). The like count is automatically updated.

**URL Parameters:**
- `id` (string, required): Post ID (the `_id` field from the post document)

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Example using cURL:**
```bash
curl -X POST https://api.ulearnandearn.com/api/posts/post_id_123/like \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Example using JavaScript:**
```javascript
const response = await fetch('https://api.ulearnandearn.com/api/posts/post_id_123/like', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const result = await response.json();
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Post liked successfully",
  "data": {
    "post": {
      "id": "post_id_123",
      "userId": "user_id",
      "user": {
        "id": "user_id",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "email": "user@example.com",
        "profileImage": "https://..."
      },
      "caption": "Check out this amazing sunset! 🌅",
      "media": [
        {
          "url": "https://res.cloudinary.com/...",
          "publicId": "user_uploads/user_id/posts/abc123",
          "type": "image",
          "format": "jpg"
        }
      ],
      "likes": [
        {
          "userId": {
            "id": "current_user_id",
            "firstName": "Jane",
            "lastName": "Smith",
            "name": "Jane Smith",
            "profileImage": "https://..."
          },
          "createdAt": "2024-01-15T10:35:00.000Z"
        }
      ],
      "comments": [],
      "likeCount": 1,
      "commentCount": 0,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:35:00.000Z"
    },
    "action": "liked",
    "isLiked": true
  }
}
```

**Response Fields:**
- `post` (object): Updated post object with current like count
- `action` (string): Action performed - "liked" or "unliked"
- `isLiked` (boolean): Whether the current user has liked the post after this action

**Error Responses:**
- `400`: Invalid post ID
- `401`: Not authenticated
- `404`: Post not found
- `500`: Failed to toggle like on post

**Note:** 
- This is a toggle endpoint - calling it multiple times will alternate between liked and unliked states
- First call adds a like, second call removes it, third call adds it again, etc.
- The `likeCount` is automatically calculated from the `likes` array length
- User information in likes is automatically populated

---

### 36. Delete Post

**Method:** `DELETE`  
**URL:** `/api/posts/:id`  
**Authentication:** Required

**Description:**  
Delete a post. Only the post owner can delete their own posts. All associated media files are automatically deleted from Cloudinary when the post is deleted.

**URL Parameters:**
- `id` (string, required): Post ID (the `_id` field from the post document)

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Example using cURL:**
```bash
curl -X DELETE https://api.ulearnandearn.com/api/posts/post_id_123 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Example using JavaScript:**
```javascript
const response = await fetch('https://api.ulearnandearn.com/api/posts/post_id_123', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const result = await response.json();
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Post deleted successfully"
}
```

**Error Responses:**
- `400`: Invalid post ID
- `401`: Not authenticated
- `403`: You do not have permission to delete this post (not the owner)
- `404`: Post not found
- `500`: Failed to delete post

**Note:** 
- Only the post owner can delete their own posts
- All media files associated with the post are automatically deleted from Cloudinary
- The deletion is permanent and cannot be undone

---

## 📖 Stories Management

Stories are temporary posts that automatically expire after 24 hours. Stories can contain images or videos and are grouped by user, similar to Instagram/Facebook stories.

### 37. Upload Story Media

**Method:** `POST`  
**URL:** `/api/stories/upload-media`  
**Authentication:** Required

**Description:**  
Upload images or videos for stories. Files are uploaded to Cloudinary in user-specific folders (`user_uploads/{userId}/stories`). This endpoint is used as part of the story creation flow - upload media first, then create the story with the returned URLs.

**Content-Type:** `multipart/form-data`

**Request:**
- **Field Name:** `media` (required)
- **File Types:** Images (JPEG, PNG, GIF, WebP, etc.) and Videos (MP4, MOV, AVI, etc.)
- **Max File Size:** 20MB

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Example using cURL:**
```bash
curl -X POST https://api.ulearnandearn.com/api/stories/upload-media \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "media=@/path/to/your/image.jpg"
```

**Example using JavaScript (FormData):**
```javascript
const formData = new FormData();
formData.append('media', fileInput.files[0]);

const response = await fetch('https://api.ulearnandearn.com/api/stories/upload-media', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});

const result = await response.json();
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Story media uploaded successfully",
  "data": {
    "url": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/stories/abc123.jpg",
    "publicId": "user_uploads/user_id/stories/abc123",
    "type": "image",
    "format": "jpg",
    "fileSize": 245678
  }
}
```

**Response Fields:**
- `url` (string): Secure HTTPS URL of the uploaded file
- `publicId` (string): Cloudinary public ID
- `type` (string): Media type - "image" or "video"
- `format` (string): File format (e.g., "jpg", "png", "mp4")
- `fileSize` (number): File size in bytes

**Error Responses:**
- `400`: No file uploaded
- `401`: Not authenticated
- `500`: Upload failed

**Note:** Use the returned `url`, `publicId`, and `type` in the create story endpoint.

---

### 38. Create Story

**Method:** `POST`  
**URL:** `/api/stories/create`  
**Authentication:** Required

**Description:**  
Create a new story. Stories automatically expire after 24 hours. Stories must contain media (image or video). Media URLs should be obtained from the upload story media endpoint first.

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "url": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/stories/abc123.jpg",
  "publicId": "user_uploads/user_id/stories/abc123",
  "type": "image",
  "format": "jpg"
}
```

**Fields:**
- `url` (string, required): Media URL from upload endpoint
- `publicId` (string, required): Cloudinary public ID from upload endpoint
- `type` (string, required): "image" or "video"
- `format` (string, optional): File format (e.g., "jpg", "mp4")

**Success Response (201):**
```json
{
  "success": true,
  "message": "Story created successfully",
  "data": {
    "story": {
      "id": "story_id",
      "userId": "user_id",
      "user": {
        "id": "user_id",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "email": "user@example.com",
        "profileImage": "https://..."
      },
      "media": {
        "url": "https://res.cloudinary.com/...",
        "publicId": "user_uploads/user_id/stories/abc123",
        "type": "image",
        "format": "jpg"
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "expiresAt": "2024-01-16T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Missing required fields, invalid media type
- `401`: Not authenticated
- `500`: Failed to create story

**Note:** 
- Stories automatically expire 24 hours after creation (MongoDB TTL index)
- Stories must contain media (image or video)
- Media URLs should come from the `/api/stories/upload-media` endpoint
- Expired stories are automatically deleted by MongoDB

---

### 39. Get User Stories

**Method:** `GET`  
**URL:** `/api/stories/user/:id`  
**Authentication:** Not required

**Description:**  
Retrieve all active (non-expired) stories for a specific user. Only stories that haven't expired (expiresAt > now) are returned.

**URL Parameters:**
- `id` (string, required): User ID (the `_id` field from the user document)

**Example Request:**
```bash
GET /api/stories/user/user_id_123
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User stories retrieved successfully",
  "data": {
    "user": {
      "id": "user_id",
      "name": "John Doe",
      "email": "user@example.com",
      "profileImage": "https://..."
    },
    "stories": [
      {
        "id": "story_id_1",
        "userId": "user_id",
        "user": {
          "id": "user_id",
          "firstName": "John",
          "lastName": "Doe",
          "name": "John Doe",
          "email": "user@example.com",
          "profileImage": "https://..."
        },
        "media": {
          "url": "https://res.cloudinary.com/...",
          "publicId": "user_uploads/user_id/stories/abc123",
          "type": "image",
          "format": "jpg"
        },
        "createdAt": "2024-01-15T10:30:00.000Z",
        "expiresAt": "2024-01-16T10:30:00.000Z"
      }
    ],
    "count": 1
  }
}
```

**Response Fields:**
- `user` (object): User information
- `stories` (array): Array of active story objects
- `count` (number): Number of active stories

**Error Responses:**
- `400`: Invalid user ID
- `404`: User not found
- `500`: Failed to retrieve user stories

**Note:** 
- Only returns active stories (expiresAt > now)
- Results are sorted by creation date (newest first)
- Expired stories are automatically filtered out
- This endpoint is public (no authentication required)

---

### 40. Get All Friends Stories

**Method:** `GET`  
**URL:** `/api/stories/all`  
**Authentication:** Required

**Description:**  
Retrieve all active stories from friends (and your own stories), grouped by user. Stories are grouped by user and sorted by most recent story first, similar to Instagram/Facebook stories. Only active (non-expired) stories are returned.

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Example Request:**
```bash
GET /api/stories/all
Authorization: Bearer YOUR_ACCESS_TOKEN
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Friends stories retrieved successfully",
  "data": {
    "stories": [
      {
        "user": {
          "id": "user_id_1",
          "firstName": "John",
          "lastName": "Doe",
          "name": "John Doe",
          "email": "john@example.com",
          "profileImage": "https://..."
        },
        "stories": [
          {
            "id": "story_id_1",
            "userId": "user_id_1",
            "media": {
              "url": "https://res.cloudinary.com/...",
              "publicId": "user_uploads/user_id_1/stories/abc123",
              "type": "image",
              "format": "jpg"
            },
            "createdAt": "2024-01-15T10:30:00.000Z",
            "expiresAt": "2024-01-16T10:30:00.000Z"
          },
          {
            "id": "story_id_2",
            "userId": "user_id_1",
            "media": {
              "url": "https://res.cloudinary.com/...",
              "publicId": "user_uploads/user_id_1/stories/def456",
              "type": "video",
              "format": "mp4"
            },
            "createdAt": "2024-01-15T09:00:00.000Z",
            "expiresAt": "2024-01-16T09:00:00.000Z"
          }
        ]
      },
      {
        "user": {
          "id": "user_id_2",
          "firstName": "Jane",
          "lastName": "Smith",
          "name": "Jane Smith",
          "email": "jane@example.com",
          "profileImage": "https://..."
        },
        "stories": [
          {
            "id": "story_id_3",
            "userId": "user_id_2",
            "media": {
              "url": "https://res.cloudinary.com/...",
              "publicId": "user_uploads/user_id_2/stories/ghi789",
              "type": "image",
              "format": "png"
            },
            "createdAt": "2024-01-15T08:00:00.000Z",
            "expiresAt": "2024-01-16T08:00:00.000Z"
          }
        ]
      }
    ],
    "count": 2,
    "totalStories": 3
  }
}
```

**Response Fields:**
- `stories` (array): Array of user objects, each containing:
  - `user` (object): User information
  - `stories` (array): Array of active stories for that user
- `count` (number): Number of users with active stories
- `totalStories` (number): Total number of active stories across all friends

**Error Responses:**
- `401`: Not authenticated
- `500`: Failed to retrieve friends stories

**Note:** 
- Returns stories from friends list + your own stories
- Only returns active stories (expiresAt > now)
- Stories are grouped by user
- Users are sorted by most recent story first (Instagram/Facebook style)
- Stories within each user are sorted by creation date (newest first)
- Expired stories are automatically filtered out
- This endpoint requires authentication

---

## 🎞 Reels Management

### Upload Reel Media

**Method:** `POST`  
**URL:** `/api/reels/upload-media`  
**Authentication:** Required  

**Description:** Upload a reel video to Cloudinary. Videos only.

**Content-Type:** `multipart/form-data`  
**Field:** `media` (required, video)

**Success (200):**
```json
{
  "success": true,
  "message": "Reel media uploaded successfully",
  "data": {
    "url": "https://res.cloudinary.com/.../reels/abc123.mp4",
    "publicId": "user_uploads/user_id/reels/abc123",
    "type": "video",
    "format": "mp4",
    "duration": 12.3,
    "width": 1080,
    "height": 1920,
    "fileSize": 12345678
  }
}
```

**Errors:** 400 (no file or not video), 401 (unauthenticated), 500 (upload failed)

---

### Create Reel

**Method:** `POST`  
**URL:** `/api/reels/create`  
**Authentication:** Required  

**Description:** Create a reel. `contentType` is mandatory and defines the logical cluster.

**Request Body:**
```json
{
  "caption": "Quick tip",
  "media": {
    "url": "...",
    "publicId": "...",
    "type": "video",
    "thumbnailUrl": "",
    "format": "mp4",
    "duration": 12.3
  },
  "contentType": "education",
  "visibility": "public"
}
```

**Notes:**
- `contentType` (required): `education` | `fun`
- Media must be a video from the upload endpoint
- Visibility: `public` | `followers` | `private` (default `public`)

**Success (201):** Returns the created reel with user info.  
**Errors:** 400 (invalid contentType/media), 401 (unauthenticated), 500 (create failed)

---

### Get Reels by Content Type

**Method:** `GET`  
**URL:** `/api/reels`  
**Authentication:** Not required  

**Query Params:**
- `contentType` (required): `education` | `fun`
- `sort` (optional): `new` (default) | `engagement`
- `page` (optional): default `1`
- `limit` (optional): default `10`, max `50`

**Description:** Fetch reels for a logical cluster using `contentType`. Pagination and per-cluster caching (Redis key `reels:{contentType}:sort:{sort}:page:{page}:limit:{limit}`).

**Success (200):**
```json
{
  "success": true,
  "message": "Reels retrieved successfully",
  "data": {
    "reels": [
      {
        "id": "reel_id",
        "userId": "user_id",
        "user": { "id": "user_id", "firstName": "John", "lastName": "Doe", "email": "user@example.com", "profileImage": "..." },
        "caption": "Quick tip",
        "media": { "url": "...", "publicId": "...", "thumbnailUrl": "", "type": "video", "format": "mp4", "duration": 12.3 },
        "contentType": "education",
        "visibility": "public",
        "views": 0,
        "likeCount": 0,
        "commentCount": 0,
        "engagementScore": 0,
        "createdAt": "2024-01-01T12:00:00.000Z",
        "updatedAt": "2024-01-01T12:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalReels": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    },
    "cluster": { "contentType": "education" }
  }
}
```

**Errors:** 400 (missing/invalid contentType), 500 (failed to fetch)

**Performance Notes:** Single Reels system with logical clustering via `contentType`; indexed on `contentType` + `createdAt`/`engagementScore`/`views`; cache invalidated per `contentType` on new reel creation.

---

### Get User Reels

**Method:** `GET`  
**URL:** `/api/reels/user/:id`  
**Authentication:** Not required

**Description:**  
Retrieve all reels by a specific user. Results are sorted by newest first and include pagination support.

**URL Parameters:**
- `id` (string, required): User ID (the `_id` field from the user document)

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Number of reels per page (default: 10)

**Example Request:**
```bash
GET /api/reels/user/user_id_123?page=1&limit=10
```

**Example using cURL:**
```bash
curl -X GET "https://api.ulearnandearn.com/api/reels/user/user_id_123?page=1&limit=10"
```

**Example using JavaScript:**
```javascript
const response = await fetch('https://api.ulearnandearn.com/api/reels/user/user_id_123?page=1&limit=10', {
  method: 'GET'
});

const result = await response.json();
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User reels retrieved successfully",
  "data": {
    "user": {
      "id": "user_id",
      "name": "John Doe",
      "email": "user@example.com",
      "profileImage": "https://..."
    },
    "reels": [
      {
        "id": "reel_id_1",
        "userId": "user_id",
        "user": {
          "id": "user_id",
          "firstName": "John",
          "lastName": "Doe",
          "name": "John Doe",
          "email": "user@example.com",
          "profileImage": "https://..."
        },
        "caption": "Quick tip",
        "media": {
          "url": "https://res.cloudinary.com/...",
          "publicId": "user_uploads/user_id/reels/abc123",
          "thumbnailUrl": "",
          "type": "video",
          "format": "mp4",
          "duration": 12.3,
          "dimensions": {
            "width": 1080,
            "height": 1920
          },
          "size": 12345678
        },
        "contentType": "education",
        "visibility": "public",
        "views": 0,
        "likes": [],
        "comments": [],
        "likeCount": 0,
        "commentCount": 0,
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 2,
      "totalReels": 15,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

**Response Fields:**
- `user` (object): User information
- `reels` (array): Array of reel objects, each containing:
  - `id` (string): Reel ID
  - `userId` (string): User ID who created the reel
  - `user` (object): User information (populated)
  - `caption` (string): Reel caption
  - `media` (object): Media object with video details
  - `contentType` (string): Content type - "education" or "fun"
  - `visibility` (string): Visibility setting - "public", "followers", or "private"
  - `views` (number): Number of views
  - `likes` (array): Array of like objects
  - `comments` (array): Array of comment objects
  - `likeCount` (number): Number of likes
  - `commentCount` (number): Number of comments
  - `createdAt` (string): Creation timestamp
  - `updatedAt` (string): Last update timestamp
- `pagination` (object): Pagination metadata
  - `currentPage` (number): Current page number
  - `totalPages` (number): Total number of pages
  - `totalReels` (number): Total number of reels for the user
  - `hasNextPage` (boolean): Whether there are more pages
  - `hasPrevPage` (boolean): Whether there are previous pages

**Error Responses:**
- `400`: Invalid user ID
- `404`: User not found
- `500`: Failed to retrieve user reels

**Note:** 
- Results are sorted by creation date (newest first)
- User information, likes, and comments are automatically populated
- This endpoint is public (no authentication required)
- Returns all reels for the user regardless of visibility setting

---

### Like/Unlike Reel

**Method:** `POST`  
**URL:** `/api/reels/:id/like`  
**Authentication:** Required (Bearer Token)

**Description:**  
Toggle like on a reel. If the user hasn't liked the reel, it adds a like. If the user has already liked the reel, it removes the like (unlike). The like count is automatically updated.

**URL Parameters:**
- `id` (string, required): Reel ID (the `_id` field from the reel document)

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Example using cURL:**
```bash
curl -X POST https://api.ulearnandearn.com/api/reels/reel_id_123/like \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Example using JavaScript:**
```javascript
const response = await fetch('https://api.ulearnandearn.com/api/reels/reel_id_123/like', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const result = await response.json();
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Reel liked successfully",
  "data": {
    "reel": {
      "id": "reel_id_123",
      "userId": "user_id",
      "user": {
        "id": "user_id",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "email": "user@example.com",
        "profileImage": "https://..."
      },
      "caption": "Quick tip",
      "media": {
        "url": "https://res.cloudinary.com/...",
        "publicId": "user_uploads/user_id/reels/abc123",
        "thumbnailUrl": "",
        "type": "video",
        "format": "mp4",
        "duration": 12.3,
        "dimensions": {
          "width": 1080,
          "height": 1920
        },
        "size": 12345678
      },
      "contentType": "education",
      "visibility": "public",
      "views": 0,
      "likes": [
        {
          "userId": {
            "id": "current_user_id",
            "firstName": "Jane",
            "lastName": "Smith",
            "name": "Jane Smith",
            "profileImage": "https://..."
          },
          "createdAt": "2024-01-15T10:35:00.000Z"
        }
      ],
      "comments": [],
      "likeCount": 1,
      "commentCount": 0,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:35:00.000Z"
    },
    "action": "liked",
    "isLiked": true
  }
}
```

**Response Fields:**
- `reel` (object): Updated reel object with current like count
- `action` (string): Action performed - "liked" or "unliked"
- `isLiked` (boolean): Whether the current user has liked the reel after this action

**Error Responses:**
- `400`: Invalid reel ID
- `401`: Not authenticated
- `404`: Reel not found
- `500`: Failed to toggle like on reel

**Note:** 
- This is a toggle endpoint - calling it multiple times will alternate between liked and unliked states
- First call adds a like, second call removes it, third call adds it again, etc.
- The `likeCount` is automatically calculated from the `likes` array length
- User information in likes is automatically populated

---

## 👥 Friend Management

### 41. Send Friend Request

**Method:** `POST`  
**URL:** `/api/friend/send/:receiverId`  
**Authentication:** Required (Bearer Token)

**Description:**  
Send a friend request to another user. The system validates that users are not already friends and prevents duplicate requests.

**URL Parameters:**
- `receiverId` (string, required): User ID of the person you want to send a friend request to

**Example Request:**
```bash
POST /api/friend/send/507f1f77bcf86cd799439011
Authorization: Bearer <your_access_token>
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Friend request sent successfully",
  "data": {
    "_id": "request_id",
    "sender": {
      "_id": "sender_id",
      "firstName": "John",
      "lastName": "Doe",
      "name": "John Doe",
      "email": "john@example.com",
      "profileImage": "https://..."
    },
    "receiver": {
      "_id": "receiver_id",
      "firstName": "Jane",
      "lastName": "Smith",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "profileImage": "https://..."
    },
    "status": "pending",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Error Responses:**
- `400`: Invalid receiver ID, cannot send request to yourself, already friends, duplicate request exists
- `404`: User not found
- `500`: Failed to send friend request

**Note:** 
- You cannot send a friend request to yourself
- System prevents duplicate pending requests in both directions
- If the other user already sent you a request, you must accept/reject it first

---

### 42. Accept Friend Request

**Method:** `POST`  
**URL:** `/api/friend/accept/:requestId`  
**Authentication:** Required (Bearer Token)

**Description:**  
Accept a friend request that was sent to you. Both users are added to each other's friends list.

**URL Parameters:**
- `requestId` (string, required): Friend request ID

**Example Request:**
```bash
POST /api/friend/accept/507f1f77bcf86cd799439011
Authorization: Bearer <your_access_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Friend request accepted successfully",
  "data": {
    "_id": "request_id",
    "sender": {
      "_id": "sender_id",
      "firstName": "John",
      "lastName": "Doe",
      "name": "John Doe",
      "email": "john@example.com",
      "profileImage": "https://..."
    },
    "receiver": {
      "_id": "receiver_id",
      "firstName": "Jane",
      "lastName": "Smith",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "profileImage": "https://..."
    },
    "status": "accepted",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  }
}
```

**Error Responses:**
- `400`: Invalid request ID, request already processed
- `403`: You can only accept requests sent to you
- `404`: Friend request not found
- `500`: Failed to accept friend request

**Note:** 
- Only the receiver can accept a friend request
- Both users are automatically added to each other's friends list
- Request status is updated to "accepted"

---

### 43. Reject Friend Request

**Method:** `POST`  
**URL:** `/api/friend/reject/:requestId`  
**Authentication:** Required (Bearer Token)

**Description:**  
Reject a friend request that was sent to you. The request status is updated to "rejected".

**URL Parameters:**
- `requestId` (string, required): Friend request ID

**Example Request:**
```bash
POST /api/friend/reject/507f1f77bcf86cd799439011
Authorization: Bearer <your_access_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Friend request rejected successfully",
  "data": {
    "_id": "request_id",
    "sender": {
      "_id": "sender_id",
      "firstName": "John",
      "lastName": "Doe",
      "name": "John Doe",
      "email": "john@example.com",
      "profileImage": "https://..."
    },
    "receiver": {
      "_id": "receiver_id",
      "firstName": "Jane",
      "lastName": "Smith",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "profileImage": "https://..."
    },
    "status": "rejected",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z"
  }
}
```

**Error Responses:**
- `400`: Invalid request ID, request already processed
- `403`: You can only reject requests sent to you
- `404`: Friend request not found
- `500`: Failed to reject friend request

**Note:** 
- Only the receiver can reject a friend request
- Request is kept in database with "rejected" status for audit purposes

---

### 44. List Friends

**Method:** `GET`  
**URL:** `/api/friend/list`  
**Authentication:** Required (Bearer Token)

**Description:**  
Get a list of all your confirmed friends with their profile information.

**Example Request:**
```bash
GET /api/friend/list
Authorization: Bearer <your_access_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Friends retrieved successfully",
  "data": {
    "friends": [
      {
        "_id": "friend_id_1",
        "firstName": "Jane",
        "lastName": "Smith",
        "name": "Jane Smith",
        "email": "jane@example.com",
        "profileImage": "https://...",
        "bio": "Software developer",
        "currentCity": "New York",
        "hometown": "Boston"
      },
      {
        "_id": "friend_id_2",
        "firstName": "Bob",
        "lastName": "Johnson",
        "name": "Bob Johnson",
        "email": "bob@example.com",
        "profileImage": "https://...",
        "bio": "",
        "currentCity": "Los Angeles",
        "hometown": ""
      }
    ],
    "count": 2
  }
}
```

**Error Responses:**
- `404`: User not found
- `500`: Failed to retrieve friends

**Note:** 
- Returns all confirmed friends (users who have accepted your friend request)
- Friend details are automatically populated

---

### 45. List Received Friend Requests

**Method:** `GET`  
**URL:** `/api/friend/requests/received`  
**Authentication:** Required (Bearer Token)

**Description:**  
Get a list of all pending friend requests that were sent to you (waiting for your response).

**Example Request:**
```bash
GET /api/friend/requests/received
Authorization: Bearer <your_access_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Received friend requests retrieved successfully",
  "data": {
    "requests": [
      {
        "_id": "request_id",
        "sender": {
          "_id": "sender_id",
          "firstName": "John",
          "lastName": "Doe",
          "name": "John Doe",
          "email": "john@example.com",
          "profileImage": "https://...",
          "bio": "Photographer",
          "currentCity": "San Francisco",
          "hometown": "Seattle"
        },
        "receiver": "receiver_id",
        "status": "pending",
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "count": 1
  }
}
```

**Error Responses:**
- `500`: Failed to retrieve received friend requests

**Note:** 
- Only returns pending requests (not accepted or rejected)
- Results are sorted by newest first
- Use this for notification badges/counts

---

### 46. List Sent Friend Requests

**Method:** `GET`  
**URL:** `/api/friend/requests/sent`  
**Authentication:** Required (Bearer Token)

**Description:**  
Get a list of all pending friend requests that you sent (waiting for their response).

**Example Request:**
```bash
GET /api/friend/requests/sent
Authorization: Bearer <your_access_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Sent friend requests retrieved successfully",
  "data": {
    "requests": [
      {
        "_id": "request_id",
        "sender": "sender_id",
        "receiver": {
          "_id": "receiver_id",
          "firstName": "Jane",
          "lastName": "Smith",
          "name": "Jane Smith",
          "email": "jane@example.com",
          "profileImage": "https://...",
          "bio": "Software developer",
          "currentCity": "New York",
          "hometown": "Boston"
        },
        "status": "pending",
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "count": 1
  }
}
```

**Error Responses:**
- `500`: Failed to retrieve sent friend requests

**Note:** 
- Only returns pending requests (not accepted or rejected)
- Results are sorted by newest first
- Use this to track requests you've sent

---

### 49. Get Friend Suggestions

**Method:** `GET`  
**URL:** `/api/friend/suggestions`  
**Authentication:** Required (Bearer Token)

**Description:**  
Get friend suggestions based on mutual friends. The system finds people who are friends with your friends (but not yet your friends) and ranks them by the number of mutual friends. If you have no friends, it returns random user suggestions.

**Query Parameters:**
- `limit` (number, optional): Maximum number of suggestions to return (default: 10)

**Example Request:**
```bash
GET /api/friend/suggestions?limit=20
Authorization: Bearer <your_access_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Friend suggestions retrieved successfully",
  "data": {
    "suggestions": [
      {
        "user": {
          "_id": "suggested_user_id",
          "firstName": "Alice",
          "lastName": "Johnson",
          "name": "Alice Johnson",
          "email": "alice@example.com",
          "profileImage": "https://...",
          "bio": "Photographer and traveler",
          "currentCity": "San Francisco",
          "hometown": "Seattle"
        },
        "mutualFriendsCount": 3,
        "mutualFriends": [
          {
            "_id": "mutual_friend_1",
            "firstName": "John",
            "lastName": "Doe",
            "name": "John Doe",
            "profileImage": "https://..."
          },
          {
            "_id": "mutual_friend_2",
            "firstName": "Jane",
            "lastName": "Smith",
            "name": "Jane Smith",
            "profileImage": "https://..."
          },
          {
            "_id": "mutual_friend_3",
            "firstName": "Bob",
            "lastName": "Wilson",
            "name": "Bob Wilson",
            "profileImage": "https://..."
          }
        ]
      },
      {
        "user": {
          "_id": "suggested_user_id_2",
          "firstName": "Charlie",
          "lastName": "Brown",
          "name": "Charlie Brown",
          "email": "charlie@example.com",
          "profileImage": "https://...",
          "bio": "",
          "currentCity": "New York",
          "hometown": ""
        },
        "mutualFriendsCount": 2,
        "mutualFriends": [
          {
            "_id": "mutual_friend_1",
            "firstName": "John",
            "lastName": "Doe",
            "name": "John Doe",
            "profileImage": "https://..."
          },
          {
            "_id": "mutual_friend_2",
            "firstName": "Jane",
            "lastName": "Smith",
            "name": "Jane Smith",
            "profileImage": "https://..."
          }
        ]
      }
    ],
    "count": 2
  }
}
```

**Response for Users with No Friends:**
If you have no friends, the API returns random user suggestions:
```json
{
  "success": true,
  "message": "Friend suggestions retrieved successfully",
  "data": {
    "suggestions": [
      {
        "user": {
          "_id": "random_user_id",
          "firstName": "David",
          "lastName": "Lee",
          "name": "David Lee",
          "email": "david@example.com",
          "profileImage": "https://...",
          "bio": "Software developer",
          "currentCity": "Los Angeles",
          "hometown": "Chicago"
        },
        "mutualFriends": 0,
        "mutualFriendsList": []
      }
    ],
    "count": 1
  }
}
```

**Error Responses:**
- `404`: User not found
- `500`: Failed to retrieve friend suggestions

**Note:** 
- Suggestions are sorted by number of mutual friends (most mutual friends first)
- Users with pending friend requests (sent or received) are excluded from suggestions
- Already friends are automatically excluded
- Up to 3 mutual friends are shown per suggestion (sorted by relevance)
- If you have no friends, random users are suggested instead

---

### 47. Unfriend User

**Method:** `DELETE`  
**URL:** `/api/friend/unfriend/:friendId`  
**Authentication:** Required (Bearer Token)

**Description:**  
Remove a user from your friends list. Both users are removed from each other's friends list.

**URL Parameters:**
- `friendId` (string, required): User ID of the friend to unfriend

**Example Request:**
```bash
DELETE /api/friend/unfriend/507f1f77bcf86cd799439011
Authorization: Bearer <your_access_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User unfriended successfully"
}
```

**Error Responses:**
- `400`: Invalid friend ID, cannot unfriend yourself, not friends with this user
- `404`: User not found
- `500`: Failed to unfriend user

**Note:** 
- Removes the friendship bidirectionally (both users' friends lists are updated)
- Any accepted friend requests are updated to "rejected" status

---

### 48. Cancel Sent Friend Request

**Method:** `DELETE`  
**URL:** `/api/friend/cancel/:requestId`  
**Authentication:** Required (Bearer Token)

**Description:**  
Cancel a pending friend request that you sent. The request is deleted from the database.

**URL Parameters:**
- `requestId` (string, required): Friend request ID

**Example Request:**
```bash
DELETE /api/friend/cancel/507f1f77bcf86cd799439011
Authorization: Bearer <your_access_token>
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Friend request cancelled successfully"
}
```

**Error Responses:**
- `400`: Invalid request ID, request already processed
- `403`: You can only cancel requests you sent
- `404`: Friend request not found
- `500`: Failed to cancel friend request

**Note:** 
- Only the sender can cancel their own pending requests
- Request must be in "pending" status to be cancelled

---

## 💬 Chat/Messaging

The chat system provides real-time messaging capabilities using WebSocket (Socket.IO) and REST API endpoints. All chat endpoints require authentication.

**⚠️ Note:** Audio messages are **not supported**. The system only supports text, image, video, and file messages. Attempting to send audio messages will result in a 400 error.

### ⚠️ Important: Protocol Usage

**REST API Endpoints** (for fetching data):
- Use `https://` (or `http://` for local development)
- Example: `https://api.ulearnandearn.com/api/chat/conversations`

**WebSocket Connection** (for real-time messaging):
- Use `wss://` (or `ws://` for local development) - **NO `/api/chat` path**
- Example: `wss://api.ulearnandearn.com` (Socket.IO handles the path automatically)

**Do NOT use `wss://` for REST API endpoints!** Use `https://` instead.

### WebSocket Connection

**Base URL:** `ws://localhost:3100` (local) or `wss://api.ulearnandearn.com` (production)

**Connection:**
```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:3100', {
  auth: {
    token: 'YOUR_JWT_ACCESS_TOKEN'
  },
  transports: ['websocket', 'polling']
});
```

**Note:** WebSocket is the preferred method for real-time messaging. REST API endpoints are available as fallback.

---

### 50. Get All Conversations

**Method:** `GET`  
**URL:** `/api/chat/conversations`  
**Authentication:** Required

**Description:**  
Retrieve all conversations for the authenticated user. Returns conversations sorted by last message time (newest first), with participant information and online status.

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Example Request:**
```bash
GET /api/chat/conversations
```

**Example using cURL:**
```bash
curl -X GET "https://api.ulearnandearn.com/api/chat/conversations" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**⚠️ Note:** Use `https://` (not `wss://`) for REST API endpoints. `wss://` is only for WebSocket connections.

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "conversation_id",
      "participants": [
        {
          "_id": "user_id_1",
          "firstName": "John",
          "lastName": "Doe",
          "name": "John Doe",
          "profileImage": "https://...",
          "isOnline": true,
          "lastSeen": 1704067200000
        },
        {
          "_id": "user_id_2",
          "firstName": "Jane",
          "lastName": "Smith",
          "name": "Jane Smith",
          "profileImage": "https://...",
          "isOnline": false,
          "lastSeen": 1704067000000
        }
      ],
      "lastMessage": {
        "_id": "message_id",
        "text": "Hello!",
        "senderId": {
          "_id": "user_id_1",
          "firstName": "John",
          "lastName": "Doe",
          "name": "John Doe",
          "profileImage": "https://..."
        },
        "status": "read",
        "createdAt": "2024-01-01T12:00:00.000Z"
      },
      "lastMessageAt": "2024-01-01T12:00:00.000Z",
      "isGroup": false,
      "createdAt": "2024-01-01T10:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    }
  ]
}
```

**Response Fields:**
- `participants` (array): Array of user objects with online status
  - `isOnline` (boolean): Whether user is currently online
  - `lastSeen` (number): Timestamp of last seen
- `lastMessage` (object|null): Most recent message in conversation
- `lastMessageAt` (date): Timestamp of last message

**Error Responses:**
- `401`: Not authenticated
- `500`: Failed to fetch conversations

---

### 51. Get or Create Conversation

**Method:** `GET`  
**URL:** `/api/chat/conversation/:participantId`  
**Authentication:** Required

**Description:**  
Get an existing conversation with a specific user, or create a new one if it doesn't exist. This is typically used when starting a new chat.

**Path Parameters:**
- `participantId` (string, required): ID of the user to chat with

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Example Request:**
```bash
GET /api/chat/conversation/507f1f77bcf86cd799439011
```

**Example using cURL:**
```bash
curl -X GET "https://api.ulearnandearn.com/api/chat/conversation/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "conversation_id",
    "participants": [
      {
        "_id": "user_id_1",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "profileImage": "https://...",
        "isOnline": true,
        "lastSeen": 1704067200000
      },
      {
        "_id": "user_id_2",
        "firstName": "Jane",
        "lastName": "Smith",
        "name": "Jane Smith",
        "profileImage": "https://...",
        "isOnline": false,
        "lastSeen": 1704067000000
      }
    ],
    "lastMessage": null,
    "lastMessageAt": "2024-01-01T10:00:00.000Z",
    "isGroup": false,
    "createdAt": "2024-01-01T10:00:00.000Z",
    "updatedAt": "2024-01-01T10:00:00.000Z"
  }
}
```

**Error Responses:**
- `400`: Cannot create conversation with yourself, participant ID required
- `401`: Not authenticated
- `404`: User not found
- `429`: Too many conversation requests (rate limited)
- `500`: Failed to get or create conversation

**Note:** 
- Rate limited to 10 conversations per hour per user
- Cannot create conversation with yourself

---

### 52. Get Messages

**Method:** `GET`  
**URL:** `/api/chat/conversation/:conversationId/messages`  
**Authentication:** Required

**Description:**  
Retrieve messages for a specific conversation with pagination support. Messages are returned in chronological order (oldest first). Messages are automatically marked as read when fetched.

**Path Parameters:**
- `conversationId` (string, required): ID of the conversation

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Number of messages per page (default: 50, max: 100)

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Example Request:**
```bash
GET /api/chat/conversation/507f1f77bcf86cd799439011/messages?page=1&limit=50
```

**Example using cURL:**
```bash
curl -X GET "https://api.ulearnandearn.com/api/chat/conversation/507f1f77bcf86cd799439011/messages?page=1&limit=50" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "_id": "message_id",
      "conversationId": "conversation_id",
      "senderId": {
        "_id": "user_id",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "profileImage": "https://..."
      },
      "text": "Hello!",
      "media": [],
      "messageType": "text",
      "status": "read",
      "replyTo": null,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    },
    {
      "_id": "message_id_2",
      "conversationId": "conversation_id",
      "senderId": {
        "_id": "user_id_2",
        "firstName": "Jane",
        "lastName": "Smith",
        "name": "Jane Smith",
        "profileImage": "https://..."
      },
      "text": "Hi there!",
      "media": [
        {
          "url": "https://example.com/image.jpg",
          "type": "image",
          "filename": "image.jpg",
          "size": 1024000
        }
      ],
      "messageType": "image",
      "status": "read",
      "replyTo": "message_id",
      "createdAt": "2024-01-01T12:05:00.000Z",
      "updatedAt": "2024-01-01T12:05:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 150
  }
}
```

**Response Fields:**
- `data` (array): Array of message objects
  - `text` (string|null): Message text (null if media-only)
  - `media` (array): Array of media objects
    - `url` (string): Media URL
    - `type` (string): "image" | "video" | "file"
    - `filename` (string|null): Original filename
    - `size` (number|null): File size in bytes
  - `messageType` (string): "text" | "image" | "video" | "file"
  - `status` (string): "sent" | "delivered" | "read"
  - `replyTo` (object|null): Message being replied to
- `pagination` (object): Pagination metadata

**Error Responses:**
- `401`: Not authenticated
- `403`: Not authorized to view this conversation
- `404`: Conversation not found
- `500`: Failed to fetch messages

**Note:** 
- Messages are automatically marked as read when fetched
- Deleted messages are excluded from results
- Messages are sorted chronologically (oldest first)

---

### 53. Send Message (REST)

**Method:** `POST`  
**URL:** `/api/chat/message`  
**Authentication:** Required

**Description:**  
Send a message via REST API. **Note:** WebSocket is preferred for real-time messaging. Use this endpoint only when WebSocket is unavailable.

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "conversationId": "conversation_id",
  "text": "Hello!",
  "media": [
    {
      "url": "https://example.com/image.jpg",
      "type": "image",
      "filename": "image.jpg",
      "size": 1024000
    }
  ],
  "messageType": "text",
  "replyTo": "message_id"
}
```

**Fields:**
- `conversationId` (string, required): ID of the conversation
- `text` (string, optional): Message text (required if no media)
- `media` (array, optional): Array of media objects (required if no text)
- `messageType` (string, optional): "text" | "image" | "video" | "file" (default: "text" or inferred from media)

**⚠️ Note:** Audio messages are not supported. Attempting to send audio messages will result in a 400 error.
- `replyTo` (string, optional): ID of message to reply to

**Example Request:**
```bash
POST /api/chat/message
```

**Example using cURL:**
```bash
curl -X POST "https://api.ulearnandearn.com/api/chat/message" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "507f1f77bcf86cd799439011",
    "text": "Hello!",
    "messageType": "text"
  }'
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "_id": "message_id",
    "conversationId": "conversation_id",
    "senderId": {
      "_id": "user_id",
      "firstName": "John",
      "lastName": "Doe",
      "name": "John Doe",
      "profileImage": "https://..."
    },
    "text": "Hello!",
    "media": [],
    "messageType": "text",
    "status": "sent",
    "replyTo": null,
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:00:00.000Z"
  }
}
```

**Error Responses:**
- `400`: Conversation ID required, message text or media required, audio messages are not allowed
- `401`: Not authenticated
- `403`: Not authorized to send message
- `404`: Conversation not found
- `429`: Too many messages (rate limited - 30 messages per minute)
- `500`: Failed to send message

**Note:** 
- Rate limited to 30 messages per minute per user
- Message is also emitted via WebSocket to all participants
- At least one of `text` or `media` must be provided
- **Audio messages are disabled** - attempting to send audio will return a 400 error with message "Audio messages are not allowed"

---

### 54. Delete Message

**Method:** `DELETE`  
**URL:** `/api/chat/message/:messageId`  
**Authentication:** Required

**Description:**  
Delete a message. Can delete for yourself only, or for everyone (if you're the sender).

**Path Parameters:**
- `messageId` (string, required): ID of the message to delete

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "deleteForEveryone": true
}
```

**Fields:**
- `deleteForEveryone` (boolean, optional): If true, deletes for all participants (only sender can do this). If false or omitted, deletes for current user only.

**Example Request:**
```bash
DELETE /api/chat/message/507f1f77bcf86cd799439011
```

**Example using cURL:**
```bash
curl -X DELETE "https://api.ulearnandearn.com/api/chat/message/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deleteForEveryone": false}'
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Message deleted successfully"
}
```

**Error Responses:**
- `401`: Not authenticated
- `403`: Not authorized (can't delete for everyone if not sender)
- `404`: Message not found
- `500`: Failed to delete message

**Note:** 
- Only the sender can delete for everyone
- Any participant can delete for themselves
- Deleted messages are excluded from message lists

---

### 60. Mark Messages as Read

**Method:** `POST`  
**URL:** `/api/chat/messages/read`  
**Authentication:** Required

**Description:**  
Mark messages as read. If `messageIds` is provided, only those messages are marked. Otherwise, all unread messages in the conversation are marked as read.

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "conversationId": "conversation_id",
  "messageIds": ["message_id_1", "message_id_2"]
}
```

**Fields:**
- `conversationId` (string, required): ID of the conversation
- `messageIds` (array, optional): Array of specific message IDs to mark as read. If omitted, all unread messages in the conversation are marked.

**Example Request:**
```bash
POST /api/chat/messages/read
```

**Example using cURL:**
```bash
curl -X POST "https://api.ulearnandearn.com/api/chat/messages/read" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "507f1f77bcf86cd799439011",
    "messageIds": ["message_id_1", "message_id_2"]
  }'
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Messages marked as read",
  "count": 2
}
```

**Response Fields:**
- `count` (number): Number of messages marked as read

**Error Responses:**
- `400`: Conversation ID required
- `401`: Not authenticated
- `403`: Not authorized
- `404`: Conversation not found
- `500`: Failed to mark messages as read

**Note:** 
- Only messages from other users are marked as read (not your own)
- Read receipts are emitted via WebSocket to notify senders

---

### 61. Get Unread Count

**Method:** `GET`  
**URL:** `/api/chat/unread-count`  
**Authentication:** Required

**Description:**  
Get the total count of unread messages across all conversations for the authenticated user.

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Example Request:**
```bash
GET /api/chat/unread-count
```

**Example using cURL:**
```bash
curl -X GET "https://api.ulearnandearn.com/api/chat/unread-count" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "unreadCount": 5
  }
}
```

**Response Fields:**
- `unreadCount` (number): Total number of unread messages

**Error Responses:**
- `401`: Not authenticated
- `500`: Failed to get unread count

**Note:** 
- Counts only messages from other users (not your own)
- Excludes deleted messages

---

### WebSocket Events

#### Client → Server Events

**Connection:**
```javascript
const socket = io('http://localhost:3100', {
  auth: {
    token: 'YOUR_JWT_ACCESS_TOKEN'
  }
});
```

**Join Conversation:**
```javascript
socket.emit('join:conversation', {
  conversationId: 'conversation_id'
});
```

**Leave Conversation:**
```javascript
socket.emit('leave:conversation', {
  conversationId: 'conversation_id'
});
```

**Send Message:**
```javascript
socket.emit('send:message', {
  conversationId: 'conversation_id',
  text: 'Hello!',
  media: [], // Optional
  messageType: 'text', // 'text' | 'image' | 'video' | 'file' (audio not supported)
  replyTo: 'message_id' // Optional
});
```

**Typing Indicator:**
```javascript
// Start typing
socket.emit('typing:start', {
  conversationId: 'conversation_id'
});

// Stop typing
socket.emit('typing:stop', {
  conversationId: 'conversation_id'
});
```

**Mark Messages as Read:**
```javascript
socket.emit('message:read', {
  messageIds: ['message_id_1', 'message_id_2'],
  conversationId: 'conversation_id'
});
```

#### Server → Client Events

**New Message:**
```javascript
socket.on('new:message', (data) => {
  console.log('New message:', data.message);
  // data.message contains full message object
});
```

**Message Sent (Confirmation):**
```javascript
socket.on('message:sent', (data) => {
  console.log('Message sent:', data.messageId);
});
```

**Message Delivered:**
```javascript
socket.on('message:delivered', (data) => {
  console.log('Message delivered:', data.messageId);
});
```

**Messages Read:**
```javascript
socket.on('messages:read', (data) => {
  console.log('Messages read:', data.messageIds);
  console.log('Read by:', data.readBy);
});
```

**Typing Indicator:**
```javascript
socket.on('typing:start', (data) => {
  console.log('User typing:', data.userId);
});

socket.on('typing:stop', (data) => {
  console.log('User stopped typing:', data.userId);
});
```

**User Online/Offline:**
```javascript
socket.on('user:online', (data) => {
  console.log('User online:', data.userId);
});

socket.on('user:offline', (data) => {
  console.log('User offline:', data.userId);
});
```

**Message Deleted:**
```javascript
socket.on('message:deleted', (data) => {
  console.log('Message deleted:', data.messageId);
});
```

**Error:**
```javascript
socket.on('error', (data) => {
  console.error('Socket error:', data.message);
});
```

**Note:** 
- All WebSocket events require authentication via JWT token
- Users can only join conversations they're participants in
- Messages are automatically saved to database
- Status updates: `sent` → `delivered` (if recipient online) → `read` (when viewed)
- **Audio messages are not supported** - attempting to send audio via WebSocket will emit an error event with message "Audio messages are not allowed"

---

## 🐛 Bug Reports

The bug reporting system allows users to report bugs and issues they encounter while using the app. Bug reports are stored in the `bugreports` collection in the same database cluster as other collections (companies, conversations, friendrequests, institutions, media, messages, otps, posts, reels, reports, stories, users). All endpoints require authentication.

### Bug Severity Levels

- `low` - Minor issues that don't significantly impact functionality
- `medium` - Issues that affect some functionality but have workarounds
- `high` - Issues that significantly impact functionality
- `critical` - Issues that prevent core functionality from working

### Bug Status

- `open` - Bug report has been submitted and is awaiting review
- `in_progress` - Bug is being investigated or fixed
- `resolved` - Bug has been fixed
- `closed` - Bug report has been closed (duplicate, invalid, etc.)

---

### 62. Create Bug Report

**Method:** `POST`  
**URL:** `/api/bug-reports`  
**Authentication:** Required

**Description:**  
Submit a new bug report with details about the issue encountered. Users can include device information, steps to reproduce, and attachments (screenshots, videos, etc.).

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "title": "App crashes when uploading video",
  "description": "The app crashes immediately when I try to upload a video longer than 30 seconds. This happens consistently on my iPhone 13 running iOS 17.",
  "severity": "high",
  "deviceInfo": "iPhone 13",
  "browserInfo": "Safari 17.0",
  "osInfo": "iOS 17.2",
  "appVersion": "1.0.0",
  "stepsToReproduce": "1. Open app\n2. Tap on create post\n3. Select video longer than 30 seconds\n4. App crashes",
  "expectedBehavior": "Video should upload successfully",
  "actualBehavior": "App crashes immediately",
  "attachments": [
    {
      "url": "https://cloudinary.com/image.jpg",
      "type": "image"
    }
  ]
}
```

**Required Fields:**
- `title` (string, max 200 characters): Brief title describing the bug
- `description` (string, max 5000 characters): Detailed description of the bug

**Optional Fields:**
- `severity` (string): One of `low`, `medium`, `high`, `critical` (default: `medium`)
- `deviceInfo` (string): Device information (e.g., "iPhone 13", "Samsung Galaxy S21")
- `browserInfo` (string): Browser information (e.g., "Chrome 120", "Safari 17.0")
- `osInfo` (string): Operating system information (e.g., "iOS 17.2", "Android 13")
- `appVersion` (string): App version where the bug was encountered
- `stepsToReproduce` (string, max 2000 characters): Step-by-step instructions to reproduce the bug
- `expectedBehavior` (string, max 1000 characters): What should happen
- `actualBehavior` (string, max 1000 characters): What actually happens
- `attachments` (array): Array of attachment objects
  - `url` (string, required): URL of the attachment
  - `type` (string, required): One of `image`, `video`, `file`

**Example Request:**
```bash
POST /api/bug-reports
```

**Example using cURL:**
```bash
curl -X POST "https://api.ulearnandearn.com/api/bug-reports" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "App crashes when uploading video",
    "description": "The app crashes when uploading videos longer than 30 seconds",
    "severity": "high",
    "deviceInfo": "iPhone 13",
    "osInfo": "iOS 17.2",
    "appVersion": "1.0.0"
  }'
```

**Success Response (201):**
```json
{
  "success": true,
  "message": "Bug report submitted successfully",
  "data": {
    "bugReport": {
      "id": "507f1f77bcf86cd799439011",
      "userId": "507f191e810c19729de860ea",
      "user": {
        "id": "507f191e810c19729de860ea",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "email": "john@example.com",
        "profileImage": "https://..."
      },
      "title": "App crashes when uploading video",
      "description": "The app crashes when uploading videos longer than 30 seconds",
      "severity": "high",
      "status": "open",
      "deviceInfo": "iPhone 13",
      "browserInfo": "Safari 17.0",
      "osInfo": "iOS 17.2",
      "appVersion": "1.0.0",
      "stepsToReproduce": "1. Open app\n2. Tap on create post\n3. Select video longer than 30 seconds\n4. App crashes",
      "expectedBehavior": "Video should upload successfully",
      "actualBehavior": "App crashes immediately",
      "attachments": [
        {
          "url": "https://cloudinary.com/image.jpg",
          "type": "image"
        }
      ],
      "adminResponse": null,
      "resolvedAt": null,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Invalid request (missing required fields, invalid severity, etc.)
- `401`: Not authenticated
- `500`: Failed to submit bug report

**Notes:**
- Bug reports are stored in the `bugreports` collection in the same database cluster
- All bug reports start with status `open`
- Attachments should be uploaded to Cloudinary first, then URLs included in the bug report
- Users can only view their own bug reports

---

### 63. Get My Bug Reports

**Method:** `GET`  
**URL:** `/api/bug-reports/me`  
**Authentication:** Required

**Description:**  
Retrieve all bug reports submitted by the authenticated user. Supports pagination and filtering by status and severity.

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Query Parameters:**
- `page` (number, optional): Page number for pagination (default: 1)
- `limit` (number, optional): Number of results per page (default: 10)
- `status` (string, optional): Filter by status (`open`, `in_progress`, `resolved`, `closed`)
- `severity` (string, optional): Filter by severity (`low`, `medium`, `high`, `critical`)

**Example Request:**
```bash
GET /api/bug-reports/me?page=1&limit=10&status=open&severity=high
```

**Example using cURL:**
```bash
curl -X GET "https://api.ulearnandearn.com/api/bug-reports/me?page=1&limit=10&status=open" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Bug reports retrieved successfully",
  "data": {
    "user": {
      "id": "507f191e810c19729de860ea",
      "firstName": "John",
      "lastName": "Doe",
      "name": "John Doe",
      "email": "john@example.com",
      "profileImage": "https://..."
    },
    "bugReports": [
      {
        "id": "507f1f77bcf86cd799439011",
        "userId": "507f191e810c19729de860ea",
        "user": {
          "id": "507f191e810c19729de860ea",
          "firstName": "John",
          "lastName": "Doe",
          "name": "John Doe",
          "email": "john@example.com",
          "profileImage": "https://..."
        },
        "title": "App crashes when uploading video",
        "description": "The app crashes when uploading videos longer than 30 seconds",
        "severity": "high",
        "status": "open",
        "deviceInfo": "iPhone 13",
        "browserInfo": "Safari 17.0",
        "osInfo": "iOS 17.2",
        "appVersion": "1.0.0",
        "stepsToReproduce": "1. Open app\n2. Tap on create post\n3. Select video longer than 30 seconds\n4. App crashes",
        "expectedBehavior": "Video should upload successfully",
        "actualBehavior": "App crashes immediately",
        "attachments": [],
        "adminResponse": null,
        "resolvedAt": null,
        "createdAt": "2024-01-01T12:00:00.000Z",
        "updatedAt": "2024-01-01T12:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 1,
      "totalReports": 1,
      "hasNextPage": false,
      "hasPrevPage": false
    }
  }
}
```

**Response Fields:**
- `bugReports` (array): Array of bug report objects
- `pagination` (object): Pagination information
  - `currentPage` (number): Current page number
  - `totalPages` (number): Total number of pages
  - `totalReports` (number): Total number of bug reports
  - `hasNextPage` (boolean): Whether there are more pages
  - `hasPrevPage` (boolean): Whether there are previous pages

**Error Responses:**
- `401`: Not authenticated
- `500`: Failed to retrieve bug reports

**Notes:**
- Results are sorted by creation date (newest first)
- Only returns bug reports submitted by the authenticated user
- Filtering by status and severity is optional

---

### 64. Get Bug Report by ID

**Method:** `GET`  
**URL:** `/api/bug-reports/:id`  
**Authentication:** Required

**Description:**  
Retrieve a specific bug report by its ID. Users can only view their own bug reports.

**Path Parameters:**
- `id` (string, required): Bug report ID

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Example Request:**
```bash
GET /api/bug-reports/507f1f77bcf86cd799439011
```

**Example using cURL:**
```bash
curl -X GET "https://api.ulearnandearn.com/api/bug-reports/507f1f77bcf86cd799439011" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Bug report retrieved successfully",
  "data": {
    "bugReport": {
      "id": "507f1f77bcf86cd799439011",
      "userId": "507f191e810c19729de860ea",
      "user": {
        "id": "507f191e810c19729de860ea",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "email": "john@example.com",
        "profileImage": "https://..."
      },
      "title": "App crashes when uploading video",
      "description": "The app crashes when uploading videos longer than 30 seconds",
      "severity": "high",
      "status": "open",
      "deviceInfo": "iPhone 13",
      "browserInfo": "Safari 17.0",
      "osInfo": "iOS 17.2",
      "appVersion": "1.0.0",
      "stepsToReproduce": "1. Open app\n2. Tap on create post\n3. Select video longer than 30 seconds\n4. App crashes",
      "expectedBehavior": "Video should upload successfully",
      "actualBehavior": "App crashes immediately",
      "attachments": [
        {
          "url": "https://cloudinary.com/image.jpg",
          "type": "image"
        }
      ],
      "adminResponse": "Thank you for reporting this issue. We've identified the problem and are working on a fix. Expected resolution: Next update.",
      "resolvedAt": null,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    }
  }
}
```

**Response Fields:**
- `bugReport` (object): Bug report object with all details
  - `adminResponse` (string|null): Response from admin/developer (if available)
  - `resolvedAt` (date|null): Date when bug was resolved (if resolved)

**Error Responses:**
- `400`: Invalid bug report ID
- `401`: Not authenticated
- `403`: You do not have permission to view this bug report (not your bug report)
- `404`: Bug report not found
- `500`: Failed to retrieve bug report

**Notes:**
- Users can only view their own bug reports
- `adminResponse` and `resolvedAt` are populated by administrators/developers
- Bug reports are stored in the `bugreports` collection in the same database cluster

---

## 📧 OTP Verification

### Twilio Phone OTP (Direct Endpoints)

These endpoints are available directly at the root level for phone OTP verification using Twilio Verify service. They are separate from the signup OTP flow and can be used for general phone verification purposes.

#### Send Phone OTP (Twilio)

**Method:** `POST`  
**URL:** `/send-otp`

**Description:**  
Send an OTP code to a phone number using Twilio Verify service. This endpoint uses Twilio's Verify v2 API to send SMS OTP codes.

**Request Body:**
```json
{
  "phone": "+1234567890"
}
```

**Required Fields:**
- `phone` (string): Phone number in E.164 format (e.g., +1234567890). Must start with + followed by country code and subscriber number (10-15 digits total).

**Success Response (200):**
```json
{
  "success": true,
  "sid": "VEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "status": "pending"
}
```

**Response Fields:**
- `sid` (string): Twilio verification SID
- `status` (string): Verification status (typically "pending")

**Error Responses:**
- `400`: Phone number is required, invalid phone number format
- `500`: Twilio is not configured, connection error, authentication failed, service not found, rate limit exceeded

**Note:** 
- Phone number must be in E.164 format: +[country code][subscriber number]
- Requires Twilio configuration: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`
- OTP expires in 10 minutes (Twilio default)
- Rate limited by Twilio service

**Example using cURL:**
```bash
curl -X POST https://api.ulearnandearn.com/send-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+1234567890"}'
```

---

#### Verify Phone OTP (Twilio)

**Method:** `POST`  
**URL:** `/verify-otp`

**Description:**  
Verify an OTP code sent to a phone number using Twilio Verify service. This endpoint verifies the OTP code against the phone number.

**Request Body:**
```json
{
  "phone": "+1234567890",
  "code": "123456"
}
```

**Required Fields:**
- `phone` (string): Phone number in E.164 format (e.g., +1234567890). Must match the phone number used in `/send-otp`
- `code` (string): OTP code (4-8 digits) received via SMS

**Success Response (200):**
```json
{
  "success": true,
  "message": "Phone verified"
}
```

**Error Responses:**
- `400`: Phone and code required, invalid phone number format, invalid OTP code format, invalid or expired code
- `500`: Twilio is not configured, connection error, authentication failed, service not found

**Note:** 
- Phone number must match the one used in `/send-otp`
- OTP code must be 4-8 digits
- OTP expires in 10 minutes (Twilio default)
- Requires Twilio configuration: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`

**Example using cURL:**
```bash
curl -X POST https://api.ulearnandearn.com/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"phone": "+1234567890", "code": "123456"}'
```

---

### 6. Send OTP for Signup (Email)

**Method:** `POST`  
**URL:** `/api/auth/send-otp-signup`

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "OTP sent successfully to your email",
  "data": {
    "email": "user@example.com",
    "expiresAt": "2024-01-01T12:05:00.000Z"
  }
}
```

**Error Responses:**
- `400`: User already exists
- `429`: Rate limited (3 requests per 15 minutes)

**Note:** 
- Rate limited: 3 requests per 15 minutes per email
- OTP expires in 5 minutes
- Email addresses are normalized to lowercase

---

### 7. Verify OTP for Signup (Email)

**Method:** `POST`  
**URL:** `/api/auth/verify-otp-signup`

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "OTP verified successfully. You can now complete signup.",
  "data": {
    "emailVerificationToken": "jwt_verification_token_here",
    "email": "user@example.com"
  }
}
```

**Error Responses:**
- `400`: Invalid OTP, OTP expired, too many attempts
- `429`: Rate limited (5 attempts per 15 minutes)

**Note:** 
- Token expires in 20 minutes
- Maximum 5 attempts per OTP
- Use `emailVerificationToken` in signup endpoint

---

### 8. Send Phone OTP for Signup

**Method:** `POST`  
**URL:** `/api/auth/send-phone-otp-signup`

**Request Body:**
```json
{
  "phone": "+1234567890"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "OTP sent successfully to your phone",
  "data": {
    "phone": "+1234567890",
    "sid": "VEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    "status": "pending"
  }
}
```

**Error Responses:**
- `400`: Phone already registered, missing phone
- `429`: Rate limited (3 requests per 15 minutes)
- `500`: Twilio not configured

**Note:** 
- Phone number must be in E.164 format (e.g., +1234567890)
- OTP expires in 10 minutes (Twilio default)

---

### 9. Verify Phone OTP for Signup

**Method:** `POST`  
**URL:** `/api/auth/verify-phone-otp-signup`

**Request Body:**
```json
{
  "phone": "+1234567890",
  "otp": "123456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Phone OTP verified successfully. You can now complete signup.",
  "data": {
    "phoneVerificationToken": "jwt_verification_token_here",
    "phone": "+1234567890"
  }
}
```

**Error Responses:**
- `400`: Invalid OTP, phone already registered
- `500`: Twilio not configured

**Note:** 
- Token expires in 20 minutes
- Use `phoneVerificationToken` in signup endpoint

---

### 10. Send OTP for Password Reset

**Method:** `POST`  
**URL:** `/api/auth/forgot-password/send-otp`

**Request Body (Email):**
```json
{
  "email": "user@example.com"
}
```

**Request Body (Phone):**
```json
{
  "phone": "+1234567890"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "OTP sent successfully to your email",
  "data": {
    "email": "user@example.com",
    "expiresAt": "2024-01-01T12:05:00.000Z"
  }
}
```

**Error Responses:**
- `400`: Either email or phone required
- `404`: User not found
- `429`: Rate limited (3 requests per 15 minutes)

**Note:** Works for existing users only.

---

### 11. Verify OTP for Password Reset

**Method:** `POST`  
**URL:** `/api/auth/forgot-password/verify-otp`

**Request Body (Email):**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Request Body (Phone):**
```json
{
  "phone": "+1234567890",
  "otp": "123456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "OTP verified successfully. You can now reset your password.",
  "data": {
    "verificationToken": "jwt_verification_token_here",
    "email": "user@example.com"
  }
}
```

**Error Responses:**
- `400`: Invalid OTP, OTP expired, too many attempts
- `404`: User not found
- `429`: Rate limited (5 attempts per 15 minutes)

**Note:** 
- Token expires in 15 minutes
- Use `verificationToken` in reset password endpoint

---

### 12. Reset Password

**Method:** `POST`  
**URL:** `/api/auth/forgot-password/reset`

**Request Body:**
```json
{
  "verificationToken": "verification_token_from_verify_otp",
  "password": "newPassword123",
  "confirmPassword": "newPassword123"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Password reset successfully. You can now login with your new password."
}
```

**Error Responses:**
- `400`: Missing fields, password too short, password mismatch
- `401`: Invalid or expired verification token
- `404`: User not found

---

## 🔵 Google OAuth

### 13. Google OAuth (Web - Redirect Flow)

**Method:** `GET`  
**URL:** `/api/auth/google`

**Response:** Redirects to Google login, then to frontend callback URL with token in query parameters.

**Frontend Callback URL Format:**
```
https://your-frontend.com/auth/callback?token=ACCESS_TOKEN&name=User%20Name&email=user@example.com
```

**Note:** Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` environment variables.

---

### 14. Google OAuth Callback

**Method:** `GET`  
**URL:** `/api/auth/google/callback`

**Note:** This endpoint is called automatically by Google. Do not call it directly.

---

### 15. Google OAuth Mobile (Android/iOS)

**Method:** `POST`  
**URL:** `/api/auth/google/mobile`

**⚠️ IMPORTANT:** This endpoint handles both **signup and login** via Google OAuth for mobile apps. **No OTP verification is required**.

**Request Body:**
```json
{
  "idToken": "google_id_token_from_google_sign_in_sdk"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Google Sign-in successful",
  "data": {
    "accessToken": "jwt_access_token_here",
    "refreshToken": "refresh_token_here",
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "",
      "gender": "Other",
      "name": "John Doe",
      "profileImage": "https://..."
    }
  }
}
```

**Note:**
- `accessToken`: Short-lived JWT token (1 hour) - use for API requests
- `refreshToken`: Never expires - use to refresh access token (only invalidated on explicit logout)
- Automatically creates user account if doesn't exist (signup)
- Logs in existing user if account exists (login)
- Returns access token (1 hour) and refresh token (never expires)
- **Device Limit**: Maximum of 5 devices allowed per user. When logging in on a 6th device, the oldest device is automatically logged out.

**Error Responses:**
- `400`: idToken is required
- `401`: Invalid Google token
- `500`: Server error

**Note:** 
- Requires `GOOGLE_CLIENT_ID` environment variable
- Works with Google Sign-In SDK for Android and iOS
- Automatically links Google account to existing user if email matches

---

### 16. Verify Google Token (Android/iOS/Web)

**Method:** `POST`  
**URL:** `/api/auth/verify-google-token`

**⚠️ IMPORTANT:** This endpoint handles both **signup and login** via Google OAuth. **No OTP verification is required**.

**Request Body:**
```json
{
  "token": "google_id_token_from_google_sign_in_sdk"
}
```

**Success Response (200 - New User):**
```json
{
  "success": true,
  "message": "Signup successful via Google OAuth",
  "data": {
    "accessToken": "jwt_access_token_here",
    "refreshToken": "refresh_token_here",
    "token": "jwt_access_token_here",
    "isNewUser": true,
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "",
      "gender": "Other",
      "name": "John Doe",
      "profileImage": "https://..."
    }
  }
}
```

**Success Response (200 - Existing User):**
```json
{
  "success": true,
  "message": "Login successful via Google OAuth",
  "data": {
    "accessToken": "jwt_access_token_here",
    "refreshToken": "refresh_token_here",
    "token": "jwt_access_token_here",
    "isNewUser": false,
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+1234567890",
      "gender": "Male",
      "name": "John Doe",
      "profileImage": "https://..."
    }
  }
}
```

**Note:**
- `accessToken`: Short-lived JWT token (1 hour) - use for API requests
- `refreshToken`: Never expires - use to refresh access token (only invalidated on explicit logout)
- `token`: Same as `accessToken` (included for backward compatibility)
- For mobile apps requesting JSON: Add `?format=json` to the callback URL or set `Accept: application/json` header

**Error Responses:**
- `400`: Token is required
- `401`: Invalid Google token

**Note:** 
- Supports WEB, Android, and iOS client IDs
- Automatically creates user account if doesn't exist (signup)
- Logs in existing user if account exists (login)
- Returns access token (15 min) and refresh token (90 days)

---

### 18. Check Email Exists

**Method:** `POST`  
**URL:** `/api/auth/check-email`

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "exists": true,
  "data": {
    "email": "user@example.com",
    "hasGoogleAccount": false
  }
}
```

**Note:** Useful for checking if user should sign up or log in.

**Error Responses:**
- `400`: Email is required

---

## 🔄 Authentication Flows

### Signup Flow (Email + Phone OTP)

1. **Send Email OTP:**
   ```bash
   POST /api/auth/send-otp-signup
   Body: { "email": "user@example.com" }
   ```

2. **Verify Email OTP:**
   ```bash
   POST /api/auth/verify-otp-signup
   Body: { "email": "user@example.com", "otp": "123456" }
   ```
   → Returns `emailVerificationToken` (valid 20 min)

3. **Send Phone OTP:**
   ```bash
   POST /api/auth/send-phone-otp-signup
   Body: { "phone": "+1234567890" }
   ```

4. **Verify Phone OTP:**
   ```bash
   POST /api/auth/verify-phone-otp-signup
   Body: { "phone": "+1234567890", "otp": "123456" }
   ```
   → Returns `phoneVerificationToken` (valid 20 min)

5. **Complete Signup:**
   ```bash
   POST /api/auth/signup
   Body: {
     "email": "user@example.com",
     "password": "password123",
     "firstName": "John",
     "lastName": "Doe",
     "phoneNumber": "+1234567890",
     "gender": "Male",
     "emailVerificationToken": "...",
     "phoneVerificationToken": "..."
   }
   ```
   → Returns `accessToken` and `refreshToken`

**Note:** Email and phone verification can be done in any order.

---

### Login Flow

1. **Login:**
   ```bash
   POST /api/auth/login
   Body: { "email": "user@example.com", "password": "password123" }
   ```
   → Returns `accessToken` (1 hour) and `refreshToken` (never expires)

2. **Use access token for API requests:**
   ```bash
   GET /api/auth/profile
   Headers: { "Authorization": "Bearer ACCESS_TOKEN" }
   ```

3. **When access token expires (401), refresh it:**
   ```bash
   POST /api/auth/refresh-token
   Body: { "refreshToken": "REFRESH_TOKEN" }
   ```
   → Returns new `accessToken`

---

### Forgot Password Flow

1. **Send OTP:**
   ```bash
   POST /api/auth/forgot-password/send-otp
   Body: { "email": "user@example.com" }
   ```

2. **Verify OTP:**
   ```bash
   POST /api/auth/forgot-password/verify-otp
   Body: { "email": "user@example.com", "otp": "123456" }
   ```
   → Returns `verificationToken` (valid 15 min)

3. **Reset Password:**
   ```bash
   POST /api/auth/forgot-password/reset
   Body: {
     "verificationToken": "...",
     "password": "newPassword123",
     "confirmPassword": "newPassword123"
   }
   ```

4. **Login with new password**

---

### Google OAuth Flow

**Web:**
1. User clicks "Sign in with Google"
2. Redirect to `GET /api/auth/google`
3. Google redirects to `/api/auth/google/callback`
4. Backend redirects to frontend with token in URL

**Mobile (Android/iOS):**
1. Get Google ID token from Google Sign-In SDK
2. **Option A - Mobile Endpoint (Recommended):**
   ```bash
   POST /api/auth/google/mobile
   Body: { "idToken": "google_id_token" }
   ```
   → Returns `accessToken` and `refreshToken`
3. **Option B - Verify Token Endpoint:**
   ```bash
   POST /api/auth/verify-google-token
   Body: { "token": "google_id_token" }
   ```
   → Returns `accessToken` and `refreshToken`

---

## 🔄 Refresh Token Flow

### Overview

The API uses a **two-token authentication system** for enhanced security:

- **Access Token**: Short-lived (1 hour) - used for API requests
- **Refresh Token**: Never expires - used to get new access tokens (only invalidated on explicit logout)

### How It Works

1. **On Signup/Login:** User receives both `accessToken` and `refreshToken`
2. **Making API Requests:** Use `accessToken` in `Authorization: Bearer <accessToken>` header
3. **Token Expiration:** If access token expires (401 error), call `/api/auth/refresh-token` with `refreshToken`
4. **Logout:** Call `/api/auth/logout` to invalidate refresh token (only way to end session)
5. **Indefinite Login:** Users stay logged in indefinitely - refresh tokens never expire unless user explicitly logs out

### Example

```javascript
// 1. Login
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
const { accessToken, refreshToken } = await loginResponse.json().data;

// 2. Use access token for API requests
const profileResponse = await fetch('/api/auth/profile', {
  headers: { 'Authorization': `Bearer ${accessToken}` }
});

// 3. When access token expires (401), refresh it
if (profileResponse.status === 401) {
  const refreshResponse = await fetch('/api/auth/refresh-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  const { accessToken: newAccessToken } = await refreshResponse.json().data;
  // Use newAccessToken for subsequent requests
}

// 4. Logout
await fetch('/api/auth/logout', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${accessToken}` }
});
```

### Security Benefits

- **Reduced Attack Window:** Short-lived access tokens limit exposure if compromised
- **Automatic Rotation:** Access tokens are refreshed regularly (every hour)
- **Revocable:** Refresh tokens can be invalidated on logout
- **Stateless Access:** Access tokens don't require database lookups
- **User Control:** Users stay logged in indefinitely until they explicitly logout
- **Better UX:** No unexpected logouts - seamless user experience

---

## 📝 Error Handling

### Error Response Format

All endpoints return errors in this format:

```json
{
  "success": false,
  "message": "Error message here",
  "error": "Detailed error message (in development mode only)"
}
```

### Common Status Codes

- `400` - Bad Request (validation errors, invalid input, user already exists)
- `401` - Unauthorized (invalid token, wrong password, expired token)
- `404` - Not Found (user not found, route not found)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

---

## 🔒 Security Features

### Rate Limiting

- **OTP requests:** 3 per 15 minutes per email/phone
- **OTP verification:** 5 attempts per 15 minutes per email/phone

### OTP Security

- OTP expires in 5 minutes (email) or 10 minutes (phone)
  - Maximum 5 verification attempts per OTP
  - OTPs are hashed before storage
- One-time use only

### Token Security

- **Access tokens:** Expire in 1 hour (short-lived for security)
- **Refresh tokens:** Never expire (users stay logged in indefinitely)
- **Verification tokens:** Expire in 15-20 minutes
- Refresh tokens are stored securely in the database
- Refresh tokens are only invalidated on explicit logout
- **User Control:** Users must explicitly logout to end their session
- Passwords are hashed using bcrypt
- Password minimum length: 6 characters

### Email Normalization

  - All email addresses are automatically normalized to lowercase
  - Prevents case-sensitivity issues

---

## 🧪 Testing Examples

### Signup Flow

```bash
# 1. Send email OTP
curl -X POST https://api.ulearnandearn.com/api/auth/send-otp-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# 2. Verify email OTP (use code from email)
curl -X POST https://api.ulearnandearn.com/api/auth/verify-otp-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otp":"123456"}'

# 3. Send phone OTP
curl -X POST https://api.ulearnandearn.com/api/auth/send-phone-otp-signup \
  -H "Content-Type: application/json" \
  -d '{"phone":"+1234567890"}'

# 4. Verify phone OTP (use code from SMS)
curl -X POST https://api.ulearnandearn.com/api/auth/verify-phone-otp-signup \
  -H "Content-Type: application/json" \
  -d '{"phone":"+1234567890","otp":"123456"}'

# 5. Complete signup (use tokens from steps 2 and 4)
curl -X POST https://api.ulearnandearn.com/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email":"test@example.com",
    "password":"MyPassword123",
    "confirmPassword":"MyPassword123",
    "firstName":"Test",
    "lastName":"User",
    "phoneNumber":"+1234567890",
    "gender":"Male",
    "emailVerificationToken":"TOKEN_FROM_STEP_2",
    "phoneVerificationToken":"TOKEN_FROM_STEP_4"
  }'
```

### Login

```bash
# Login with email
curl -X POST https://api.ulearnandearn.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"MyPassword123"}'

# Login with phone
curl -X POST https://api.ulearnandearn.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+1234567890","password":"MyPassword123"}'
```

### Get User Profile

```bash
# 1. Login to get tokens
curl -X POST https://api.ulearnandearn.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"MyPassword123"}'

# 2. Use access token to get profile
curl -X GET https://api.ulearnandearn.com/api/auth/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 3. If token expires (401), refresh it
curl -X POST https://api.ulearnandearn.com/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'

# 4. Use new access token
curl -X GET https://api.ulearnandearn.com/api/auth/profile \
  -H "Authorization: Bearer NEW_ACCESS_TOKEN"
```

### Update User Profile

```bash
# Update basic profile (name, dob, gender)
curl -X PUT https://api.ulearnandearn.com/api/user/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "dob": "1999-01-15",
    "gender": "Male"
  }'

# Update profile with new fields (bio, location, relationship status)
curl -X PUT https://api.ulearnandearn.com/api/user/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bio": "Software developer passionate about building great products",
    "currentCity": "San Francisco, CA",
    "hometown": "New York, NY",
    "relationshipStatus": "Single"
  }'

# Update workplace
curl -X PUT https://api.ulearnandearn.com/api/user/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workplace": [
      {
        "company": "Tech Corp",
        "position": "Senior Software Engineer",
        "startDate": "2020-01-15",
        "endDate": null,
        "isCurrent": true
      }
    ]
  }'

# Update education (example: add education entries)
curl -X PUT https://api.ulearnandearn.com/api/user/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "education": [
      {
        "institution": "Delhi Public School",
        "degree": "B.Tech",
        "field": "Computer Science",
        "startYear": 2020,
        "endYear": 2024,
        "institutionType": "school"
      },
      {
        "institution": "University of Technology",
        "degree": "Master of Science",
        "field": "Data Science",
        "startYear": 2024,
        "endYear": null,
        "institutionType": "university"
      }
    ]
  }'
```

### Update Profile Media (Bio, Cover Photo, Profile Image)

```bash
# Update bio and cover photo
curl -X PUT https://api.ulearnandearn.com/api/user/profile/media \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bio": "Software developer passionate about building great products",
    "coverPhoto": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/cover/cover123.jpg",
    "profileImage": "https://res.cloudinary.com/your-cloud/image/upload/v1234567890/user_uploads/user_id/profile/profile123.jpg"
  }'

# Update only bio
curl -X PUT https://api.ulearnandearn.com/api/user/profile/media \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "bio": "Updated bio text"
  }'
```

### Update Personal Information

```bash
# Update name, gender, and date of birth
curl -X PUT https://api.ulearnandearn.com/api/user/profile/personal-info \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "gender": "Male",
    "dob": "1999-01-15"
  }'

# Update phone numbers (no OTP required via this endpoint)
curl -X PUT https://api.ulearnandearn.com/api/user/profile/personal-info \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+1234567890",
    "alternatePhoneNumber": "+1987654321"
  }'
```

### Update Location and Details

```bash
# Update location, pronouns, and relationship status
curl -X PUT https://api.ulearnandearn.com/api/user/profile/location-details \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentCity": "San Francisco, CA",
    "hometown": "New York, NY",
    "pronouns": "he/him",
    "relationshipStatus": "Single"
  }'

# Update workplace
curl -X PUT https://api.ulearnandearn.com/api/user/profile/location-details \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workplace": [
      {
        "company": "Tech Corp",
        "position": "Senior Software Engineer",
        "startDate": "2020-01-15",
        "endDate": null,
        "isCurrent": true
      }
    ]
  }'

# Update education
curl -X PUT https://api.ulearnandearn.com/api/user/profile/location-details \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "education": [
      {
        "institution": "Delhi Public School",
        "degree": "B.Tech",
        "field": "Computer Science",
        "startYear": 2020,
        "endYear": 2024,
        "institutionType": "school"
      }
    ]
  }'
```

### Update Phone Number

```bash
# 1. Send OTP for phone update
curl -X POST https://api.ulearnandearn.com/api/user/phone/send-otp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890"}'

# 2. Verify OTP and update phone
curl -X POST https://api.ulearnandearn.com/api/user/phone/verify-otp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phoneNumber": "+1234567890",
    "otp": "123456"
  }'
```

### Update Alternate Phone Number

```bash
# 1. Send OTP for alternate phone
curl -X POST https://api.ulearnandearn.com/api/user/alternate-phone/send-otp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"alternatePhoneNumber": "+1987654321"}'

# 2. Verify OTP and update alternate phone
curl -X POST https://api.ulearnandearn.com/api/user/alternate-phone/verify-otp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "alternatePhoneNumber": "+1987654321",
    "otp": "123456"
  }'

# 3. Remove alternate phone (optional)
curl -X DELETE https://api.ulearnandearn.com/api/user/alternate-phone \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Refresh Token

```bash
curl -X POST https://api.ulearnandearn.com/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```

### Logout

```bash
curl -X POST https://api.ulearnandearn.com/api/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Forgot Password

```bash
# 1. Send OTP
curl -X POST https://api.ulearnandearn.com/api/auth/forgot-password/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# 2. Verify OTP
curl -X POST https://api.ulearnandearn.com/api/auth/forgot-password/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otp":"123456"}'

# 3. Reset password
curl -X POST https://api.ulearnandearn.com/api/auth/forgot-password/reset \
  -H "Content-Type: application/json" \
  -d '{
    "verificationToken":"TOKEN_FROM_STEP_2",
    "password":"newPassword123",
    "confirmPassword":"newPassword123"
  }'
```

### Google Token Verification

```bash
curl -X POST https://api.ulearnandearn.com/api/auth/verify-google-token \
  -H "Content-Type: application/json" \
  -d '{"token":"GOOGLE_ID_TOKEN"}'
```

### Search Users

```bash
# Search for users by name
curl -X GET "https://api.ulearnandearn.com/api/user/search?query=John" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Search with pagination
curl -X GET "https://api.ulearnandearn.com/api/user/search?query=John&page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Friend Management

```bash
# 1. Send friend request
curl -X POST https://api.ulearnandearn.com/api/friend/send/RECEIVER_USER_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 2. List received friend requests (requests sent to you)
curl -X GET https://api.ulearnandearn.com/api/friend/requests/received \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 3. Accept friend request
curl -X POST https://api.ulearnandearn.com/api/friend/accept/REQUEST_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 4. Reject friend request (alternative to accept)
curl -X POST https://api.ulearnandearn.com/api/friend/reject/REQUEST_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 5. List sent friend requests (requests you sent)
curl -X GET https://api.ulearnandearn.com/api/friend/requests/sent \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 6. Cancel sent friend request
curl -X DELETE https://api.ulearnandearn.com/api/friend/cancel/REQUEST_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 7. List all friends
curl -X GET https://api.ulearnandearn.com/api/friend/list \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 8. Get friend suggestions
curl -X GET "https://api.ulearnandearn.com/api/friend/suggestions?limit=20" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 9. Unfriend a user
curl -X DELETE https://api.ulearnandearn.com/api/friend/unfriend/FRIEND_USER_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Complete Friend Request Flow:**

```bash
# User A sends friend request to User B
curl -X POST https://api.ulearnandearn.com/api/friend/send/USER_B_ID \
  -H "Authorization: Bearer USER_A_ACCESS_TOKEN"

# User B checks received requests
curl -X GET https://api.ulearnandearn.com/api/friend/requests/received \
  -H "Authorization: Bearer USER_B_ACCESS_TOKEN"

# User B accepts the request
curl -X POST https://api.ulearnandearn.com/api/friend/accept/REQUEST_ID \
  -H "Authorization: Bearer USER_B_ACCESS_TOKEN"

# Both users can now see each other in friends list
curl -X GET https://api.ulearnandearn.com/api/friend/list \
  -H "Authorization: Bearer USER_A_ACCESS_TOKEN"
```

---

## 📸 Media Management Examples

### Upload Profile Image

```bash
# 1. Login to get access token
ACCESS_TOKEN=$(curl -X POST https://api.ulearnandearn.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"MyPassword123"}' \
  | jq -r '.data.accessToken')

# 2. Upload profile image
curl -X POST https://api.ulearnandearn.com/api/media/profile-image \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "profileImage=@/path/to/profile.jpg"
```

**Response:**
```json
{
  "success": true,
  "message": "Profile image uploaded successfully",
  "data": {
    "id": "media_record_id",
    "url": "https://res.cloudinary.com/...",
    "format": "jpg",
    "fileSize": 245678,
    "user": {
      "id": "user_id",
      "email": "test@example.com",
      "profileImage": "https://res.cloudinary.com/..."
    }
  }
}
```

### Upload General Media

```bash
# Upload an image or video file
curl -X POST https://api.ulearnandearn.com/api/media/upload \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "media=@/path/to/your/file.jpg"
```

**Response:**
```json
{
  "success": true,
  "message": "Uploaded successfully",
  "data": {
    "id": "media_record_id",
    "url": "https://res.cloudinary.com/...",
    "format": "jpg",
    "type": "image",
    "fileSize": 245678,
    "uploadedBy": {
      "userId": "user_id",
      "email": "test@example.com",
      "name": "John Doe"
    }
  }
}
```

### Get All User's Media

```bash
# Get list of all uploaded media files
curl -X GET https://api.ulearnandearn.com/api/media/my-media \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Media retrieved successfully",
  "data": {
    "count": 3,
    "media": [
      {
        "id": "media_id_1",
        "url": "https://res.cloudinary.com/...",
        "format": "jpg",
        "type": "image",
        "fileSize": 245678,
        "uploadedAt": "2024-01-15T10:30:00.000Z"
      }
    ]
  }
}
```

### Delete Media

```bash
# Delete a specific media file (use ID from GET /api/media/my-media response)
curl -X DELETE https://api.ulearnandearn.com/api/media/MEDIA_ID \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "message": "Media deleted successfully"
}
```

**Important Notes:**
- All media endpoints require authentication (Bearer token)
- Profile images are automatically optimized to 400x400px with face detection
- General media uploads support both images and videos (max 20MB)
- Users can only access their own media files
- Old profile images are automatically deleted when uploading a new one

### Create Post

```bash
# 1. Upload media for post (optional - can create text-only posts)
ACCESS_TOKEN=$(curl -X POST https://api.ulearnandearn.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"MyPassword123"}' \
  | jq -r '.data.accessToken')

# Upload media
MEDIA_RESPONSE=$(curl -X POST https://api.ulearnandearn.com/api/posts/upload-media \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "media=@/path/to/image.jpg")

# Extract media URL and publicId from response
MEDIA_URL=$(echo $MEDIA_RESPONSE | jq -r '.data.url')
PUBLIC_ID=$(echo $MEDIA_RESPONSE | jq -r '.data.publicId')
MEDIA_TYPE=$(echo $MEDIA_RESPONSE | jq -r '.data.type')

# 2. Create post with media
curl -X POST https://api.ulearnandearn.com/api/posts/create \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"caption\": \"Check out this amazing sunset! 🌅\",
    \"mediaUrls\": [{
      \"url\": \"$MEDIA_URL\",
      \"publicId\": \"$PUBLIC_ID\",
      \"type\": \"$MEDIA_TYPE\"
    }]
  }"

# Or create text-only post
curl -X POST https://api.ulearnandearn.com/api/posts/create \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "caption": "Just a text post!"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Post created successfully",
  "data": {
    "post": {
      "id": "post_id",
      "userId": "user_id",
      "user": {
        "id": "user_id",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "email": "user@example.com",
        "profileImage": "https://..."
      },
      "caption": "Check out this amazing sunset! 🌅",
      "media": [...],
      "likes": [],
      "comments": [],
      "likeCount": 0,
      "commentCount": 0,
      "createdAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

### Get All Posts

```bash
# Get all posts (feed) with pagination
curl -X GET "https://api.ulearnandearn.com/api/posts/all?page=1&limit=10"
```

### Get User Posts

```bash
# Get posts by specific user
curl -X GET "https://api.ulearnandearn.com/api/posts/user/user_id_123?page=1&limit=10"
```

**Important Notes:**
- Post creation requires authentication
- Posts can be text-only, media-only, or both
- Media must be uploaded first using `/api/posts/upload-media`
- Get posts endpoints are public (no authentication required)
- All posts include pagination support

### Get User Reels

```bash
# Get reels by specific user
curl -X GET "https://api.ulearnandearn.com/api/reels/user/user_id_123?page=1&limit=10"
```

**Important Notes:**
- Reel creation requires authentication
- Reels must contain video media
- Media must be uploaded first using `/api/reels/upload-media`
- Get user reels endpoint is public (no authentication required)
- All reels include pagination support
- Returns all reels for the user regardless of visibility setting

### Create Story

```bash
# 1. Upload media for story
ACCESS_TOKEN=$(curl -X POST https://api.ulearnandearn.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"MyPassword123"}' \
  | jq -r '.data.accessToken')

# Upload story media
STORY_MEDIA_RESPONSE=$(curl -X POST https://api.ulearnandearn.com/api/stories/upload-media \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -F "media=@/path/to/image.jpg")

# Extract media URL and publicId from response
STORY_MEDIA_URL=$(echo $STORY_MEDIA_RESPONSE | jq -r '.data.url')
STORY_PUBLIC_ID=$(echo $STORY_MEDIA_RESPONSE | jq -r '.data.publicId')
STORY_MEDIA_TYPE=$(echo $STORY_MEDIA_RESPONSE | jq -r '.data.type')
STORY_FORMAT=$(echo $STORY_MEDIA_RESPONSE | jq -r '.data.format')

# 2. Create story with media
curl -X POST https://api.ulearnandearn.com/api/stories/create \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"url\": \"$STORY_MEDIA_URL\",
    \"publicId\": \"$STORY_PUBLIC_ID\",
    \"type\": \"$STORY_MEDIA_TYPE\",
    \"format\": \"$STORY_FORMAT\"
  }"
```

**Response:**
```json
{
  "success": true,
  "message": "Story created successfully",
  "data": {
    "story": {
      "id": "story_id",
      "userId": "user_id",
      "user": {
        "id": "user_id",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "email": "user@example.com",
        "profileImage": "https://..."
      },
      "media": {
        "url": "https://res.cloudinary.com/...",
        "publicId": "user_uploads/user_id/stories/abc123",
        "type": "image",
        "format": "jpg"
      },
      "createdAt": "2024-01-15T10:30:00.000Z",
      "expiresAt": "2024-01-16T10:30:00.000Z"
    }
  }
}
```

### Get User Stories

```bash
# Get stories for a specific user
curl -X GET "https://api.ulearnandearn.com/api/stories/user/user_id_123"
```

### Get All Friends Stories

```bash
# Get all stories from friends (grouped by user)
curl -X GET https://api.ulearnandearn.com/api/stories/all \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Important Notes:**
- Story creation requires authentication
- Stories must contain media (image or video)
- Media must be uploaded first using `/api/stories/upload-media`
- Stories automatically expire after 24 hours (MongoDB TTL index)
- Get user stories endpoint is public (no authentication required)
- Get all friends stories requires authentication
- Stories are grouped by user (Instagram/Facebook style)
- Only active (non-expired) stories are returned

---


## 📚 Additional Notes

### Debug Endpoints

#### Get All Registered Routes

**Method:** `GET`  
**URL:** `/api/debug/routes`

**Description:**  
Returns a list of all registered API routes. Useful for debugging and discovering available endpoints.

**Example Request:**
```bash
GET /api/debug/routes
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Registered routes",
  "routes": [
    {
      "method": "POST",
      "path": "/api/auth/signup"
    },
    {
      "method": "GET",
      "path": "/api/auth/profile"
    }
  ],
  "total": 50
}
```

**Note:** This endpoint is available for debugging purposes and may be disabled in production.

---

### General

- All timestamps are in ISO 8601 format (UTC)
- Email addresses are case-insensitive (automatically normalized)
- OTP codes are 6 digits
- Phone numbers must be in E.164 format (e.g., +1234567890)

### Token Management

- **Access tokens** expire in 1 hour - use refresh tokens to get new access tokens
- **Refresh tokens** never expire - users stay logged in indefinitely unless they explicitly logout
- Access tokens are used in `Authorization: Bearer <accessToken>` header for API requests
- Refresh tokens are used only with `/api/auth/refresh-token` endpoint
- **Indefinite Login:** Users stay logged in forever - no automatic expiration
- **Explicit Logout:** Only way to end session is by calling `/api/auth/logout`

### OTP Usage

**⚠️ IMPORTANT:** OTP verification is **ONLY** used for:
1. **Signup** (required) - Both email and phone OTP verification are mandatory
2. **Forgot Password** (required) - OTP verification is required before password reset

**OTP is NOT used for regular login.** Login only requires email/phone and password.

### Configuration

- For production, ensure all environment variables are properly configured
- See `OTP_SETUP_GUIDE.md` for email service configuration
- For Twilio phone OTP, configure `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID`
- For Google OAuth, configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_ANDROID_CLIENT_ID`, and `GOOGLE_IOS_CLIENT_ID`
- For Cloudinary media uploads, configure:
  - `CLOUDINARY_CLOUD_NAME`: Your Cloudinary cloud name
  - `CLOUDINARY_API_KEY`: Your Cloudinary API key
  - `CLOUDINARY_API_SECRET`: Your Cloudinary API secret
  - `UPLOAD_PRESET`: Your Cloudinary upload preset name (optional but recommended)

---

## 📝 User Profile Management Flow

### Update Profile Information

1. **Update Basic Info (No Verification Required):**
   ```bash
   PUT /api/user/profile
   Body: { 
     "firstName": "John", 
     "lastName": "Doe",
     "dob": "1999-01-15", 
     "gender": "Male",
     "bio": "Software developer",
     "currentCity": "San Francisco, CA",
     "hometown": "New York, NY",
     "relationshipStatus": "Single"
   }
   ```
   → Updates name, date of birth, gender, bio, location, relationship status immediately

2. **Update Workplace:**
   ```bash
   PUT /api/user/profile
   Body: {
     "workplace": [
       {
         "company": "Tech Corp",
         "position": "Senior Software Engineer",
         "startDate": "2020-01-15",
         "endDate": null,
         "isCurrent": true
       }
     ]
   }
   ```
   → Updates work experience (can include multiple entries for current and past jobs)

3. **Update Education:**
   ```bash
   PUT /api/user/profile
   Body: {
     "education": [
       {
         "institution": "Delhi Public School",
         "degree": "B.Tech",
         "field": "Computer Science",
         "startYear": 2020,
         "endYear": 2024,
         "institutionType": "school"
       },
       {
         "institution": "University of Technology",
         "degree": "Master of Science",
         "field": "Data Science",
         "startYear": 2024,
         "endYear": null,
         "institutionType": "university"
       }
     ]
   }
   ```
   → Updates education details (can add multiple education entries). Institutions are automatically created if they don't exist.

### Alternative Profile Update Endpoints

The following endpoints provide more focused ways to update specific profile information:

1. **Update Profile Media (Bio, Cover Photo, Profile Image):**
   ```bash
   PUT /api/user/profile/media
   Body: { 
     "bio": "Software developer",
     "coverPhoto": "https://...",
     "profileImage": "https://...",
     "coverImage": "https://..."
   }
   ```
   → Updates bio, cover photo, and profile image. Accepts URL strings for images.

2. **Update Personal Information:**
   ```bash
   PUT /api/user/profile/personal-info
   Body: { 
     "firstName": "John", 
     "lastName": "Doe",
     "gender": "Male",
     "dob": "1999-01-15",
     "phoneNumber": "+1234567890",
     "alternatePhoneNumber": "+1987654321"
   }
   ```
   → Updates name, gender, date of birth, and phone numbers. Note: Phone number updates via this endpoint do NOT require OTP verification.

3. **Update Location and Details:**
   ```bash
   PUT /api/user/profile/location-details
   Body: { 
     "currentCity": "San Francisco, CA",
     "hometown": "New York, NY",
     "pronouns": "he/him",
     "relationshipStatus": "Single",
     "workplace": [...],
     "education": [...]
   }
   ```
   → Updates location, pronouns, relationship status, workplace, and education. Handles complex data structures and auto-creates companies/institutions.

### Update Phone Number Flow

1. **Send OTP:**
   ```bash
   POST /api/user/phone/send-otp
   Body: { "phoneNumber": "+1234567890" }
   ```
   → OTP sent to new phone number

2. **Verify OTP and Update:**
   ```bash
   POST /api/user/phone/verify-otp
   Body: { "phoneNumber": "+1234567890", "otp": "123456" }
   ```
   → Phone number updated

### Update Alternate Phone Number Flow

1. **Send OTP:**
   ```bash
   POST /api/user/alternate-phone/send-otp
   Body: { "alternatePhoneNumber": "+1987654321" }
   ```
   → OTP sent to alternate phone number

2. **Verify OTP and Update:**
   ```bash
   POST /api/user/alternate-phone/verify-otp
   Body: { "alternatePhoneNumber": "+1987654321", "otp": "123456" }
   ```
   → Alternate phone number added/updated

3. **Remove Alternate Phone (Optional):**
   ```bash
   DELETE /api/user/alternate-phone
   ```
   → Alternate phone number removed

### Media Management Flow

1. **Upload Profile Image:**
   ```bash
   POST /api/media/profile-image
   Body: multipart/form-data with field "profileImage"
   ```
   → Profile image uploaded and optimized (400x400px, face detection)
   → Old profile image automatically deleted
   → User's profileImage field updated

2. **Upload General Media:**
   ```bash
   POST /api/media/upload
   Body: multipart/form-data with field "media"
   ```
   → File uploaded to Cloudinary
   → Media record created in database
   → Returns secure URL and metadata

3. **View All Media:**
   ```bash
   GET /api/media/my-media
   ```
   → Returns list of all user's uploaded media files

4. **Delete Media:**
   ```bash
   DELETE /api/media/:mediaId
   ```
   → Media deleted from Cloudinary and database
   → If it was profile image, user's profileImage field cleared

**Note:** 
- Phone number updates require OTP verification via Twilio
- Profile updates (name, age, gender) do not require verification
- All endpoints require authentication
- Media files are organized in user-specific folders on Cloudinary

---

**Last Updated:** January 2025

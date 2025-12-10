# Sanora API Documentation

**Base URL:** `https://api.sanoraindia.com`

---

## 📑 Table of Contents

1. [Quick Start](#quick-start)
2. [Authentication](#-authentication)
   - [Signup](#1-signup)
   - [Login](#2-login)
   - [Refresh Token](#3-refresh-access-token)
   - [Logout](#4-logout)
   - [Get User Profile](#5-get-current-user-profile)
3. [User Profile Management](#-user-profile-management)
   - [Update Profile](#17-update-user-profile)
   - [Update Phone Number](#18-update-phone-number)
   - [Update Alternate Phone Number](#19-update-alternate-phone-number)
   - [Remove Alternate Phone Number](#20-remove-alternate-phone-number)
   - [Upload Media](#21-upload-media-to-cloudinary)
   - [Upload Profile Image](#22-upload-profile-image)
   - [Get User's Media](#23-get-users-media)
   - [Delete User's Media](#24-delete-users-media)
4. [OTP Verification](#-otp-verification)
   - [Send OTP for Signup (Email)](#6-send-otp-for-signup-email)
   - [Verify OTP for Signup (Email)](#7-verify-otp-for-signup-email)
   - [Send Phone OTP for Signup](#8-send-phone-otp-for-signup)
   - [Verify Phone OTP for Signup](#9-verify-phone-otp-for-signup)
   - [Send OTP for Password Reset](#10-send-otp-for-password-reset)
   - [Verify OTP for Password Reset](#11-verify-otp-for-password-reset)
   - [Reset Password](#12-reset-password)
5. [Google OAuth](#-google-oauth)
   - [Web OAuth](#13-google-oauth-web-redirect-flow)
   - [OAuth Callback](#14-google-oauth-callback)
   - [Mobile OAuth](#15-google-oauth-mobile-androidios)
   - [Verify Google Token](#16-verify-google-token-androidiosweb)
   - [Check Email](#18-check-email-exists)
6. [Authentication Flows](#-authentication-flows)
7. [Error Handling](#-error-handling)
8. [Security Features](#-security-features)
9. [Testing Examples](#-testing-examples)

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

**Success Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

**Note:** Invalidates the refresh token. User must login again to get new tokens.

---

### 5. Get Current User Profile

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
      "isGoogleOAuth": false,
      "googleId": null,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    }
  }
}
```

**Error Responses:**
- `401`: No token, invalid token, expired token
- `404`: User not found

---

## 👤 User Profile Management

All user profile management endpoints require authentication. Include the access token in the `Authorization` header.

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
  "gender": "Male"
}
```

**Fields:**
- `firstName` (string, optional): User's first name
- `lastName` (string, optional): User's last name
- `name` (string, optional): Full name (auto-updated if firstName/lastName changed)
- `dob` (string, optional): Date of birth in ISO 8601 format (YYYY-MM-DD). Must be a valid date, not in the future, and not more than 150 years ago
- `gender` (string, optional): One of: "Male", "Female", "Other", "Prefer not to say"

**Note:** You can update any combination of these fields. Only provided fields will be updated.

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
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Invalid date of birth (must be valid date, not in future, not more than 150 years ago), invalid gender, empty name fields
- `401`: No token, invalid token, expired token

---

### 18. Update Phone Number

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

### 19. Update Alternate Phone Number

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

### 20. Remove Alternate Phone Number

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

### 21. Upload Media to Cloudinary

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
curl -X POST https://api.sanoraindia.com/api/media/upload \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "media=@/path/to/your/image.jpg"
```

**Example using JavaScript (FormData):**
```javascript
const formData = new FormData();
formData.append('media', fileInput.files[0]);

const response = await fetch('https://api.sanoraindia.com/api/media/upload', {
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

fetch('https://api.sanoraindia.com/api/media/upload', {
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

### 22. Upload Profile Image

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
curl -X POST https://api.sanoraindia.com/api/media/profile-image \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "profileImage=@/path/to/your/profile.jpg"
```

**Example using JavaScript (FormData):**
```javascript
const formData = new FormData();
formData.append('profileImage', fileInput.files[0]);

const response = await fetch('https://api.sanoraindia.com/api/media/profile-image', {
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

### 24. Delete User's Media

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
curl -X DELETE https://api.sanoraindia.com/api/media/media_record_id_123 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Example using JavaScript:**
```javascript
const response = await fetch('https://api.sanoraindia.com/api/media/media_record_id_123', {
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

## 📧 OTP Verification

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
curl -X POST https://api.sanoraindia.com/api/auth/send-otp-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# 2. Verify email OTP (use code from email)
curl -X POST https://api.sanoraindia.com/api/auth/verify-otp-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otp":"123456"}'

# 3. Send phone OTP
curl -X POST https://api.sanoraindia.com/api/auth/send-phone-otp-signup \
  -H "Content-Type: application/json" \
  -d '{"phone":"+1234567890"}'

# 4. Verify phone OTP (use code from SMS)
curl -X POST https://api.sanoraindia.com/api/auth/verify-phone-otp-signup \
  -H "Content-Type: application/json" \
  -d '{"phone":"+1234567890","otp":"123456"}'

# 5. Complete signup (use tokens from steps 2 and 4)
curl -X POST https://api.sanoraindia.com/api/auth/signup \
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
curl -X POST https://api.sanoraindia.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"MyPassword123"}'

# Login with phone
curl -X POST https://api.sanoraindia.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+1234567890","password":"MyPassword123"}'
```

### Get User Profile

```bash
# 1. Login to get tokens
curl -X POST https://api.sanoraindia.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"MyPassword123"}'

# 2. Use access token to get profile
curl -X GET https://api.sanoraindia.com/api/auth/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 3. If token expires (401), refresh it
curl -X POST https://api.sanoraindia.com/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'

# 4. Use new access token
curl -X GET https://api.sanoraindia.com/api/auth/profile \
  -H "Authorization: Bearer NEW_ACCESS_TOKEN"
```

### Update User Profile

```bash
# Update profile (name, dob, gender)
curl -X PUT https://api.sanoraindia.com/api/user/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "John",
    "lastName": "Doe",
    "dob": "1999-01-15",
    "gender": "Male"
  }'
```

### Update Phone Number

```bash
# 1. Send OTP for phone update
curl -X POST https://api.sanoraindia.com/api/user/phone/send-otp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "+1234567890"}'

# 2. Verify OTP and update phone
curl -X POST https://api.sanoraindia.com/api/user/phone/verify-otp \
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
curl -X POST https://api.sanoraindia.com/api/user/alternate-phone/send-otp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"alternatePhoneNumber": "+1987654321"}'

# 2. Verify OTP and update alternate phone
curl -X POST https://api.sanoraindia.com/api/user/alternate-phone/verify-otp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "alternatePhoneNumber": "+1987654321",
    "otp": "123456"
  }'

# 3. Remove alternate phone (optional)
curl -X DELETE https://api.sanoraindia.com/api/user/alternate-phone \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Refresh Token

```bash
curl -X POST https://api.sanoraindia.com/api/auth/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"YOUR_REFRESH_TOKEN"}'
```

### Logout

```bash
curl -X POST https://api.sanoraindia.com/api/auth/logout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### Forgot Password

```bash
# 1. Send OTP
curl -X POST https://api.sanoraindia.com/api/auth/forgot-password/send-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# 2. Verify OTP
curl -X POST https://api.sanoraindia.com/api/auth/forgot-password/verify-otp \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otp":"123456"}'

# 3. Reset password
curl -X POST https://api.sanoraindia.com/api/auth/forgot-password/reset \
  -H "Content-Type: application/json" \
  -d '{
    "verificationToken":"TOKEN_FROM_STEP_2",
    "password":"newPassword123",
    "confirmPassword":"newPassword123"
  }'
```

### Google Token Verification

```bash
curl -X POST https://api.sanoraindia.com/api/auth/verify-google-token \
  -H "Content-Type: application/json" \
  -d '{"token":"GOOGLE_ID_TOKEN"}'
```

---

## 📸 Media Management Examples

### Upload Profile Image

```bash
# 1. Login to get access token
ACCESS_TOKEN=$(curl -X POST https://api.sanoraindia.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"MyPassword123"}' \
  | jq -r '.data.accessToken')

# 2. Upload profile image
curl -X POST https://api.sanoraindia.com/api/media/profile-image \
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
curl -X POST https://api.sanoraindia.com/api/media/upload \
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
curl -X GET https://api.sanoraindia.com/api/media/my-media \
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
curl -X DELETE https://api.sanoraindia.com/api/media/MEDIA_ID \
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

---


## 📚 Additional Notes

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
   Body: { "firstName": "John", "dob": "1999-01-15", "gender": "Male" }
   ```
   → Updates name, date of birth, gender immediately

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

**Last Updated:** 2024

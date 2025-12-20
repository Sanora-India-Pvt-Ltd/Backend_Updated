# Auth API Frontend Guide

This guide describes the current authentication and account APIs for frontend usage.

## Table of Contents
1. [Base URL](#base-url)
2. [Authentication Header](#authentication-header)
3. [Standard Response Shape](#standard-response-shape)
4. [Signup Flow (Email + Phone OTP Required)](#signup-flow-email--phone-otp-required)
5. [Login](#login)
6. [Refresh Access Token](#refresh-access-token)
7. [Logout](#logout)
8. [Devices](#devices)
9. [Password Reset Flow](#password-reset-flow)
10. [Profile and Account](#profile-and-account)
11. [Media Uploads (Profile and User Media)](#media-uploads-profile-and-user-media)
12. [Institutions and Companies](#institutions-and-companies)
13. [Notes for Frontend Integration](#notes-for-frontend-integration)

## Base URL
Use your environment configuration for the API origin.

Example:
```
http://localhost:3100
```

All endpoints below are relative to the base URL.

## Authentication Header
Protected routes require:
```
Authorization: Bearer <access_token>
```

## Standard Response Shape
```
{
  "success": true,
  "message": "Human readable message",
  "data": { }
}
```

Errors follow the same shape with `"success": false`.

## Signup Flow (Email + Phone OTP Required)

### 1) Send Email OTP
POST `/api/auth/send-otp-signup`

Body:
```json
{
  "email": "user@example.com"
}
```

Response includes an expiration time.

Common errors:
- `400` invalid email or already registered
- `429` too many attempts

### 2) Verify Email OTP
POST `/api/auth/verify-otp-signup`

Body:
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "emailVerificationToken": "jwt_token_here"
  }
}
```

Notes:
- The token is required in the final signup request.

### 3) Send Phone OTP
POST `/api/auth/send-phone-otp-signup`

Body:
```json
{
  "phone": "+1234567890"
}
```

Common errors:
- `400` invalid phone
- `429` too many attempts

### 4) Verify Phone OTP
POST `/api/auth/verify-phone-otp-signup`

Body:
```json
{
  "phone": "+1234567890",
  "otp": "123456"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "phoneVerificationToken": "jwt_token_here"
  }
}
```

Notes:
- The token is required in the final signup request.

### 5) Complete Signup
POST `/api/auth/signup`

Body:
```json
{
  "email": "user@example.com",
  "password": "password123",
  "confirmPassword": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "gender": "Male",
  "emailVerificationToken": "jwt_from_verify_email",
  "phoneVerificationToken": "jwt_from_verify_phone"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "accessToken": "jwt_access_token",
    "refreshToken": "refresh_token_string",
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

Notes:
- Email and phone are normalized (trimmed, lowercased for email, and plus-prefixed for phone).
- OTP verification is required for both email and phone before signup.
- On success, tokens are returned and should be stored client-side.

## Login
POST `/api/auth/login`

Body (email login):
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Body (phone login):
```json
{
  "phoneNumber": "+1234567890",
  "password": "password123"
}
```

Response includes `accessToken`, `refreshToken`, and a `user` object.

Success response example:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "jwt_access_token",
    "refreshToken": "refresh_token_string",
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "name": "John Doe"
    }
  }
}
```

Common errors:
- `400` missing credentials
- `401` invalid credentials
- `403` account inactive or blocked

## Refresh Access Token
POST `/api/auth/refresh-token`

Body:
```json
{
  "refreshToken": "refresh_token_string"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "accessToken": "new_access_token"
  }
}
```

Notes:
- Access tokens are short-lived; refresh tokens are per device.

## Logout
POST `/api/auth/logout` (protected)

Body (optional):
```json
{
  "refreshToken": "refresh_token_string"
}
```

Or:
```json
{
  "deviceId": 1
}
```

If no body is provided, all devices are logged out.

Success response:
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## Devices
GET `/api/auth/devices` (protected)

Returns a list of devices and a 1-based `deviceId` for logout calls.

Success response example:
```json
{
  "success": true,
  "data": {
    "devices": [
      {
        "deviceId": 1,
        "device": "Chrome on Windows",
        "createdAt": "2025-01-01T00:00:00.000Z",
        "expiresAt": "2025-02-01T00:00:00.000Z"
      }
    ],
    "count": 1
  }
}
```

## Password Reset Flow

### 1) Send OTP
POST `/api/auth/forgot-password/send-otp`

Body (email):
```json
{
  "email": "user@example.com"
}
```

Body (phone):
```json
{
  "phone": "+1234567890"
}
```

Notes:
- Works for either email or phone.

### 2) Verify OTP
POST `/api/auth/forgot-password/verify-otp`

Body:
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

Response includes `verificationToken`.

### 3) Reset Password
POST `/api/auth/forgot-password/reset`

Body:
```json
{
  "verificationToken": "jwt_verification_token",
  "password": "newpassword123",
  "confirmPassword": "newpassword123"
}
```

Success response:
```json
{
  "success": true,
  "message": "Password reset successful"
}
```

## Profile and Account

### Get Current Profile
GET `/api/auth/profile` (protected)

Returns the full profile object with profile, location, social, professional, content, and account metadata.

Success response example (trimmed):
```json
{
  "success": true,
  "data": {
    "profile": {
      "name": { "full": "John Doe" },
      "email": "user@example.com",
      "profileImage": "https://..."
    },
    "account": {
      "isActive": true,
      "isVerified": false
    },
    "social": {
      "friends": [],
      "blockedUsers": []
    }
  }
}
```

### Update Profile (Full)
PUT `/api/user/profile` (protected)

Body (all optional, arrays replace full arrays):
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "name": "John Doe",
  "gender": "Male",
  "dob": "1990-01-01",
  "bio": "Updated bio",
  "currentCity": "New York",
  "hometown": "Boston",
  "relationshipStatus": "Single",
  "coverPhoto": "https://...",
  "workplace": [
    {
      "company": "company_id_or_name",
      "position": "Software Engineer",
      "startDate": "2020-01-01",
      "endDate": null,
      "isCurrent": true
    }
  ],
  "education": [
    {
      "institution": "institution_id_or_name",
      "degree": "Bachelor's",
      "field": "Computer Science",
      "startYear": 2016,
      "endYear": 2020,
      "institutionType": "university"
    }
  ]
}
```

Notes:
- Arrays replace existing arrays; send the full array each time.
- Use `null` for open-ended dates if supported (e.g., `endDate`).

### Update Profile Visibility
PUT `/api/user/profile/visibility` (protected)

Body:
```json
{
  "visibility": "public"
}
```

Success response:
```json
{
  "success": true,
  "message": "Profile visibility updated successfully"
}
```

### Remove Education Entry
DELETE `/api/user/education/:educationId` (protected)

### Remove Workplace Entry
DELETE `/api/user/workplace/:workplaceId` (protected)

### Update Phone Number (OTP)
POST `/api/user/phone/send-otp` (protected)

Body:
```json
{
  "phoneNumber": "+1234567890"
}
```

POST `/api/user/phone/verify-otp` (protected)

Body:
```json
{
  "phoneNumber": "+1234567890",
  "otp": "123456"
}
```

Success response:
```json
{
  "success": true,
  "message": "Phone number updated successfully"
}
```

## Media Uploads (Profile and User Media)

POST `/api/media/profile-image` (protected, multipart/form-data)
- Field: `profileImage`

POST `/api/media/cover-photo` (protected, multipart/form-data)
- Field: `coverPhoto`

POST `/api/media/upload` (protected, multipart/form-data)
- Field: `media`

GET `/api/media/my-media` (protected)

GET `/api/media/my-images` (protected)

GET `/api/media/user/:id` (public)

DELETE `/api/media/:mediaId` (protected)

Notes:
- Use `multipart/form-data` for all uploads.
- Return payloads include a `url` and `publicId` (Cloudinary).

## Institutions and Companies

GET `/api/institution/search?query=harvard&type=university` (public)

POST `/api/institution` (protected)

Body:
```json
{
  "name": "Custom Institution Name",
  "type": "university",
  "city": "City Name",
  "country": "Country Name",
  "logo": "https://..."
}
```

GET `/api/company/search?query=google` (public)

POST `/api/company` (protected)

Body:
```json
{
  "name": "Custom Company Name"
}
```

## Notes for Frontend Integration
- Access tokens expire; use `/api/auth/refresh-token` to renew.
- Refresh tokens are stored per device (max 5 devices).
- Phone numbers should be sent in `+<country_code><number>` format.
- For profile updates, arrays (`workplace`, `education`) replace existing arrays.
- Store `accessToken` in memory or secure storage; avoid localStorage if possible.
- On 401 from protected endpoints, attempt refresh once, then force logout.

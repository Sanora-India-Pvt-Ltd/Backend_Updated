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
3. [OTP Verification](#-otp-verification)
   - [Signup OTP (Email)](#6-send-otp-for-signup-email)
   - [Signup OTP (Phone)](#7-send-phone-otp-for-signup)
   - [Forgot Password OTP](#8-send-otp-for-password-reset)
4. [Google OAuth](#-google-oauth)
   - [Web OAuth](#9-google-oauth-web-redirect-flow)
   - [Token Verification](#10-verify-google-token)
   - [Check Email](#11-check-email-exists)
5. [Authentication Flows](#-authentication-flows)
6. [Error Handling](#-error-handling)
7. [Security Features](#-security-features)
8. [Testing Examples](#-testing-examples)

---

## Quick Start

### Authentication Overview

The API uses a **two-token authentication system**:
- **Access Token**: Short-lived (15 minutes) - used for API requests
- **Refresh Token**: Long-lived (30 days) - used to get new access tokens

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
- `accessToken`: Short-lived JWT token (15 minutes) - use for API requests
- `refreshToken`: Long-lived token (30 days) - use to refresh access token
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
- `accessToken`: Short-lived JWT token (15 minutes) - use for API requests
- `refreshToken`: Long-lived token (30 days) - use to refresh access token
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

**Note:** Use this endpoint when your access token expires (after 15 minutes). The refresh token remains valid for 30 days.

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
      "gender": "Male",
      "name": "John Doe",
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

### 15. Verify Google Token (Android/iOS/Web)

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
- `accessToken`: Short-lived JWT token (15 minutes) - use for API requests
- `refreshToken`: Long-lived token (30 days) - use to refresh access token
- `token`: Same as `accessToken` (included for backward compatibility)
- For mobile apps requesting JSON: Add `?format=json` to the callback URL or set `Accept: application/json` header

**Error Responses:**
- `400`: Token is required
- `401`: Invalid Google token

**Note:** 
- Supports WEB, Android, and iOS client IDs
- Automatically creates user account if doesn't exist (signup)
- Logs in existing user if account exists (login)
- Returns access token (15 min) and refresh token (30 days)

---

### 16. Check Email Exists

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
   → Returns `accessToken` (15 min) and `refreshToken` (30 days)

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
2. **Verify Token:**
   ```bash
   POST /api/auth/verify-google-token
   Body: { "token": "google_id_token" }
   ```
   → Returns `accessToken` and `refreshToken`

---

## 🔄 Refresh Token Flow

### Overview

The API uses a **two-token authentication system** for enhanced security:

- **Access Token**: Short-lived (15 minutes) - used for API requests
- **Refresh Token**: Long-lived (30 days) - used to get new access tokens

### How It Works

1. **On Signup/Login:** User receives both `accessToken` and `refreshToken`
2. **Making API Requests:** Use `accessToken` in `Authorization: Bearer <accessToken>` header
3. **Token Expiration:** If access token expires (401 error), call `/api/auth/refresh-token` with `refreshToken`
4. **Logout:** Call `/api/auth/logout` to invalidate refresh token

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
- **Automatic Rotation:** Access tokens are refreshed regularly
- **Revocable:** Refresh tokens can be invalidated on logout
- **Stateless Access:** Access tokens don't require database lookups

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

- **Access tokens:** Expire in 15 minutes (short-lived for security)
- **Refresh tokens:** Expire in 30 days (long-lived for convenience)
- **Verification tokens:** Expire in 15-20 minutes
- Refresh tokens are stored securely in the database
- Refresh tokens are invalidated on logout
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

## 📚 Additional Notes

### General

- All timestamps are in ISO 8601 format (UTC)
- Email addresses are case-insensitive (automatically normalized)
- OTP codes are 6 digits
- Phone numbers must be in E.164 format (e.g., +1234567890)

### Token Management

- **Access tokens** expire in 15 minutes - use refresh tokens to get new access tokens
- **Refresh tokens** expire in 30 days - store securely on the client side
- Access tokens are used in `Authorization: Bearer <accessToken>` header for API requests
- Refresh tokens are used only with `/api/auth/refresh-token` endpoint

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

---

**Last Updated:** 2024

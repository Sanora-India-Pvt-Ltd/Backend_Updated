# Sanora API Documentation

Base URL: `http://localhost:3100` (Local) or `https://your-production-url.com` (Production)

---

## 🔐 Authentication Endpoints

### 1. User Signup (OTP Verification Required)

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/signup`

**⚠️ IMPORTANT:** OTP verification is **MANDATORY** for signup. 

**Signup Flow:**
1. User enters email and clicks "Send" → OTP is sent to email
2. User verifies email with OTP code → Gets verification token
3. User fills personal information (First Name, Last Name, Phone Number, Gender, Password)
4. User submits complete signup form with all fields + verification token

The verification token proves the email was already verified and allows the user time to fill the form.

**Request Body (Option 1 - With Verification Token - Recommended):**
```json
{
  "email": "user@example.com",
  "password": "yourPassword123",
  "confirmPassword": "yourPassword123",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "gender": "Male",
  "verificationToken": "token_from_verify_otp_signup_endpoint"
}
```

**Request Body (Option 2 - With OTP directly):**
```json
{
  "email": "user@example.com",
  "password": "yourPassword123",
  "confirmPassword": "yourPassword123",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "gender": "Male",
  "otp": "123456"
}
```

**Required Fields:**
- `email` (string): User's email address (must match the email used for OTP verification)
- `password` (string): User's password (minimum 6 characters)
- `confirmPassword` (string, optional): Password confirmation (must match password if provided)
- `firstName` (string): User's first name
- `lastName` (string): User's last name
- `phoneNumber` (string): User's phone number
- `gender` (string): User's gender - must be one of: "Male", "Female", "Other"
- `verificationToken` (string, optional): Token from OTP verification endpoint (recommended, valid for 20 minutes)
- `otp` (string, optional): OTP code directly (alternative to verificationToken)

**Response (Success - 201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "token": "jwt_token_here",
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

**Response (Error - 400 - Missing fields):**
```json
{
  "success": false,
  "message": "Email, password, first name, last name, phone number, and gender are required"
}
```

**Response (Error - 400 - Invalid gender):**
```json
{
  "success": false,
  "message": "Gender must be one of: Male, Female, Other"
}
```

**Response (Error - 400 - Password too short):**
```json
{
  "success": false,
  "message": "Password must be at least 6 characters long"
}
```

**Response (Error - 400 - Password mismatch):**
```json
{
  "success": false,
  "message": "Password and confirm password do not match"
}
```

**Response (Error - 400 - Missing OTP):**
```json
{
  "success": false,
  "message": "OTP verification is required for signup. Please verify your email first using /api/auth/send-otp-signup and /api/auth/verify-otp-signup"
}
```

**Response (Error - 400 - User exists):**
```json
{
  "success": false,
  "message": "User already exists with this email"
}
```

---

### 2. User Login

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "yourPassword123"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "jwt_token_here",
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

**Response (Error - 400):**
```json
{
  "success": false,
  "message": "Invalid email or password"
}
```

---

## 📧 OTP Endpoints

### 3. Send OTP for Signup (New Users)

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/send-otp-signup`

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (Success - 200):**
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

**Response (Error - 400 - User exists):**
```json
{
  "success": false,
  "message": "User already exists with this email"
}
```

**Response (Error - 429 - Rate limited):**
```json
{
  "success": false,
  "message": "Too many OTP requests. Please wait 15 minutes before trying again."
}
```

**Note:** 
- Rate limited: 3 requests per 15 minutes per email
- Works for new users (doesn't require account to exist)
- **Required before signup** - This is the first step in the signup flow
- OTP expires in 5 minutes (default)
- Email addresses are automatically normalized to lowercase
- After verification, you'll receive a verification token valid for 20 minutes to complete the signup form

---

### 4. Verify OTP for Signup

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/verify-otp-signup`

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "OTP verified successfully. You can now complete signup.",
  "data": {
    "verificationToken": "short_lived_verification_token",
    "email": "user@example.com"
  }
}
```

**Response (Error - 400 - Invalid OTP):**
```json
{
  "success": false,
  "message": "Invalid OTP",
  "remainingAttempts": 4
}
```

**Response (Error - 400 - OTP expired):**
```json
{
  "success": false,
  "message": "OTP expired"
}
```

**Response (Error - 400 - Too many attempts):**
```json
{
  "success": false,
  "message": "Too many attempts. Please request a new OTP"
}
```

**Response (Error - 429 - Rate limited):**
```json
{
  "success": false,
  "message": "Too many verification attempts. Please wait 15 minutes before trying again."
}
```

**Note:** 
- Rate limited: 5 attempts per 15 minutes per email
- Use the `verificationToken` in the signup endpoint
- Token expires in 20 minutes (allows time to fill the signup form)
- Maximum 5 attempts per OTP
- Email addresses are automatically normalized to lowercase

---

### 5. Send OTP (For Existing Users)

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/send-otp`

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "data": {
    "email": "user@example.com",
    "expiresAt": "2024-01-01T12:05:00.000Z"
  }
}
```

**Response (Error - 404):**
```json
{
  "success": false,
  "message": "User not found with this email"
}
```

**Response (Error - 429 - Rate limited):**
```json
{
  "success": false,
  "message": "Too many OTP requests. Please wait 15 minutes before trying again."
}
```

**Note:** 
- Rate limited: 3 requests per 15 minutes per email
- Only works for existing users
- OTP expires in 5 minutes (default)
- Email addresses are automatically normalized to lowercase

---

### 6. Verify OTP (For Existing Users)

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/verify-otp`

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "OTP verified successfully",
  "data": {
    "verificationToken": "short_lived_verification_token",
    "email": "user@example.com"
  }
}
```

**Response (Error - 400):**
```json
{
  "success": false,
  "message": "Invalid OTP",
  "remainingAttempts": 4
}
```

**Response (Error - 429 - Rate limited):**
```json
{
  "success": false,
  "message": "Too many verification attempts. Please wait 15 minutes before trying again."
}
```

**Note:** 
- Rate limited: 5 attempts per 15 minutes per email
- Use the `verificationToken` in the signin endpoint
- Token expires in 10 minutes
- Maximum 5 attempts per OTP
- Email addresses are automatically normalized to lowercase

---

### 7. Sign In (After OTP Verification - For Existing Users)

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/signin`

**Request Body:**
```json
{
  "verificationToken": "verification_token_from_verify_otp",
  "password": "yourPassword123"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Signin successful",
  "data": {
    "token": "jwt_session_token",
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "name": "John Doe"
    }
  }
}
```

**Response (Error - 401):**
```json
{
  "success": false,
  "message": "Invalid or expired verification token"
}
```

**Response (Error - 401 - Wrong password):**
```json
{
  "success": false,
  "message": "Invalid password"
}
```

**Note:** 
- Requires OTP verification first
- Use the `verificationToken` from `/api/auth/verify-otp`
- Token expires in 10 minutes
- Returns JWT session token (valid for 7 days)

---

## 🔵 Google OAuth Endpoints

### 8. Google OAuth (Web - Redirect Flow)

**Method:** `GET`  
**URL:** `http://localhost:3100/api/auth/google`

**Request:** No body required. This redirects to Google OAuth page.

**Response:** Redirects to Google login, then to your frontend callback URL with token in query parameters.

**Frontend Callback URL Format:**
```
https://your-frontend.com/auth/callback?token=JWT_TOKEN&name=User%20Name&email=user@example.com
```

**Note:** 
- Requires `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in environment variables
- Configure callback URL in Google Cloud Console
- Works for web applications only

---

### 9. Google OAuth Callback

**Method:** `GET`  
**URL:** `http://localhost:3100/api/auth/google/callback`

**Request:** No body required. This is called by Google after authentication.

**Response:** Redirects to frontend with token in URL parameters.

**Note:** This endpoint is called automatically by Google. Do not call it directly.

---

### 10. Verify Google Token (Android/iOS/Web) - Signup/Login

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/verify-google-token`

**⚠️ IMPORTANT:** This endpoint handles both **signup and login** via Google OAuth. **No OTP verification is required** because Google already verifies the email address.

**Request Body:**
```json
{
  "token": "google_id_token_from_google_sign_in_sdk"
}
```

**Response (Success - 200 - New User Signup):**
```json
{
  "success": true,
  "message": "Signup successful via Google OAuth",
  "data": {
    "token": "jwt_token_here",
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

**Response (Success - 200 - Existing User Login):**
```json
{
  "success": true,
  "message": "Login successful via Google OAuth",
  "data": {
    "token": "jwt_token_here",
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
- For new Google OAuth users, `firstName` and `lastName` are extracted from Google's display name
- `phoneNumber` defaults to empty string (user can update later)
- `gender` defaults to "Other" (user can update later)

**Response (Error - 400):**
```json
{
  "success": false,
  "message": "Token is required"
}
```

**Response (Error - 401):**
```json
{
  "success": false,
  "message": "Invalid Google token - token does not match any configured client ID"
}
```

**Note:** 
- **No OTP required** - Google already verifies the email
- Supports both WEB and Android client IDs
- Automatically creates user account if doesn't exist (signup)
- Logs in existing user if account exists (login)
- Links Google account to existing email/password account if user exists
- Returns JWT token valid for 7 days
- Works for Android, iOS, and Web applications
- `isNewUser` field indicates if this is a new signup (true) or existing login (false)

---

### 11. Check Email Exists

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/check-email`

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (Success - 200):**
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

**Response (Success - 200 - Email doesn't exist):**
```json
{
  "success": true,
  "exists": false,
  "data": {
    "email": "user@example.com",
    "hasGoogleAccount": false
  }
}
```

**Note:** 
- Useful for checking if user should sign up or log in
- Shows if email has Google OAuth linked

---

## 📊 Root Endpoint

### 12. API Info

**Method:** `GET`  
**URL:** `http://localhost:3100/`

**Request:** No body required

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "🚀 Sanora Backend API is running!",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "endpoints": {
    "signup": "POST /api/auth/signup",
    "login": "POST /api/auth/login",
    "googleAuth": "GET /api/auth/google",
    "verifyGoogleToken": "POST /api/auth/verify-google-token"
  }
}
```

---

## 🔑 Protected Routes

For protected routes, include the JWT token in the Authorization header:

**Header:**
```
Authorization: Bearer your_jwt_token_here
```

**Example:**
```bash
curl -X GET http://localhost:3100/api/protected-route \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 📝 Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "message": "Error message here",
  "error": "Detailed error message (in development mode only)"
}
```

**Common Status Codes:**
- `400` - Bad Request (validation errors, invalid input, user already exists)
- `401` - Unauthorized (invalid token, wrong password, expired token)
- `404` - Not Found (user not found, route not found)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error

---

## 🔄 Authentication Flow Examples

### Standard Signup Flow (Email-First OTP Verification):

**Step 1: Email Verification (OTP)**
1. **Send OTP to Email:**
   ```bash
   POST /api/auth/send-otp-signup
   Body: { "email": "user@example.com" }
   ```
   → OTP sent to email address

2. **Verify OTP:**
   ```bash
   POST /api/auth/verify-otp-signup
   Body: { "email": "user@example.com", "otp": "123456" }
   ```
   → Returns `verificationToken` (valid for 20 minutes)

**Step 2: Complete Signup Form**
3. **Fill and Submit Signup Form:**
   ```bash
   POST /api/auth/signup
   Body: {
     "email": "user@example.com",
     "password": "yourPassword123",
     "confirmPassword": "yourPassword123",
     "firstName": "John",
     "lastName": "Doe",
     "phoneNumber": "+1234567890",
     "gender": "Male",
     "verificationToken": "token_from_step_2"
   }
   ```
   → Returns JWT token and user data

4. **Use token in `Authorization: Bearer <token>` header for protected routes**

**Important Notes:**
- Email verification (Step 1) must be completed before submitting the signup form
- The verification token is valid for 20 minutes to allow time to fill the form
- Password must be at least 6 characters long
- Password and confirmPassword must match (if confirmPassword is provided)

---

### Standard Login Flow:

1. **Login:**
   ```bash
   POST /api/auth/login
   Body: { "email": "user@example.com", "password": "yourPassword123" }
   ```
   → Returns JWT token

2. **Use token in `Authorization: Bearer <token>` header for protected routes**

---

### Google OAuth Web Flow:

1. User clicks "Sign in with Google"
2. Redirect to `GET /api/auth/google`
3. Google redirects to `/api/auth/google/callback`
4. Backend redirects to frontend with token in URL parameters
5. Frontend extracts token and stores it

---

### Google OAuth Android/iOS Flow (Signup/Login - No OTP Required):

1. Android/iOS app gets Google ID token from Google Sign-In SDK
2. **Verify Token (Signup or Login):**
   ```bash
   POST /api/auth/verify-google-token
   Body: { "token": "google_id_token" }
   ```
   → Returns JWT token and user info
   → `isNewUser: true` if new signup, `false` if existing login
   → **No OTP verification needed** (Google already verified email)

3. Use JWT token for authenticated requests

---

### OTP Flow (For Existing Users - Login/Password Reset):

1. **Send OTP:**
   ```bash
   POST /api/auth/send-otp
   Body: { "email": "user@example.com" }
   ```
   → OTP sent to email

2. **Verify OTP:**
   ```bash
   POST /api/auth/verify-otp
   Body: { "email": "user@example.com", "otp": "123456" }
   ```
   → Returns `verificationToken`

3. **Sign In:**
   ```bash
   POST /api/auth/signin
   Body: {
     "verificationToken": "token_from_step_2",
     "password": "yourPassword123"
   }
   ```
   → Returns JWT session token

---

## 🔒 Security Features

- **Rate Limiting:**
  - OTP requests: 3 per 15 minutes per email
  - OTP verification: 5 attempts per 15 minutes per email
  
- **OTP Security:**
  - OTP expires in 5 minutes (configurable via `OTP_EXPIRY_MINUTES`)
  - Maximum 5 verification attempts per OTP
  - OTPs are hashed before storage
  - One-time use only (marked as verified after successful verification)

- **Token Security:**
  - JWT tokens expire in 7 days
  - Verification tokens expire in 20 minutes (allows time to fill signup form)
  - Passwords are hashed using bcrypt
  - Password minimum length: 6 characters

- **Email Normalization:**
  - All email addresses are automatically normalized to lowercase
  - Prevents case-sensitivity issues

---

## 🧪 Testing Examples

### Test Signup Flow with curl:

```bash
# Step 1: Send OTP
curl -X POST http://localhost:3100/api/auth/send-otp-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'

# Step 2: Check email for OTP code (e.g., 123456)

# Step 3: Verify OTP
curl -X POST http://localhost:3100/api/auth/verify-otp-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","otp":"123456"}'

# Step 4: Complete signup (use verificationToken from step 3)
curl -X POST http://localhost:3100/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email":"test@example.com",
    "password":"MyPassword123",
    "confirmPassword":"MyPassword123",
    "firstName":"Test",
    "lastName":"User",
    "phoneNumber":"+1234567890",
    "gender":"Male",
    "verificationToken":"PASTE_TOKEN_HERE"
  }'
```

### Test Login with curl:

```bash
curl -X POST http://localhost:3100/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"MyPassword123"}'
```

### Test Google Token Verification:

```bash
curl -X POST http://localhost:3100/api/auth/verify-google-token \
  -H "Content-Type: application/json" \
  -d '{"token":"GOOGLE_ID_TOKEN_HERE"}'
```

---

## 📚 Additional Notes

- All timestamps are in ISO 8601 format (UTC)
- Email addresses are case-insensitive (automatically normalized)
- OTP codes are 6 digits
- JWT tokens should be stored securely on the client side
- Rate limiting helps prevent abuse and spam
- For production, ensure all environment variables are properly configured
- See `OTP_SETUP_GUIDE.md` for email service configuration

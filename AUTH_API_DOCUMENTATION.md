# Authentication API Documentation

## Base URL
```
/api/auth
```

## Table of Contents
1. [Authentication Overview](#authentication-overview)
2. [Sign Up](#sign-up)
3. [Login](#login)
4. [Get User Details](#get-user-details)
5. [Update User](#update-user)
6. [Access Token & Refresh Token](#access-token--refresh-token)
7. [Institution](#institution)
8. [Workplace/Company](#workplacecompany)
9. [Password Reset](#password-reset)
10. [Device Management](#device-management)

---

## Authentication Overview

### Token Types
- **Access Token**: Short-lived (1 hour), used for API authentication
- **Refresh Token**: Long-lived (effectively never expires), used to obtain new access tokens

### Authentication Header
For protected routes, include the access token in the Authorization header:
```
Authorization: Bearer <access_token>
```

---

## Sign Up

### 1. Send Email OTP for Signup
**Endpoint:** `POST /api/auth/send-otp-signup`

**Description:** Send OTP to email address for signup verification. Email is automatically normalized (trimmed and lowercased) before checking if user already exists.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Note:** 
- Email is automatically trimmed (whitespace removed) and converted to lowercase
- If a user already exists with this email, an error will be returned
- Empty emails after trimming will be rejected

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully to your email",
  "data": {
    "email": "user@example.com",
    "expiresAt": "2024-01-01T12:00:00.000Z"
  }
}
```

**Error Responses:**
- `400`: Email is required, email cannot be empty, user already exists with this email
- `503`: Email service is not configured

---

### 2. Verify Email OTP for Signup
**Endpoint:** `POST /api/auth/verify-otp-signup`

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email verified successfully",
  "data": {
    "emailVerificationToken": "jwt_token_here"
  }
}
```

---

### 3. Send Phone OTP for Signup
**Endpoint:** `POST /api/auth/send-phone-otp-signup`

**Description:** Send OTP to phone number for signup verification. Phone number is automatically normalized (trimmed, spaces/dashes/parentheses removed, and `+` prefix added if missing) before checking if user already exists.

**Request Body:**
```json
{
  "phone": "+1234567890"
}
```

**Note:** 
- Phone number is automatically normalized: whitespace, dashes, and parentheses are removed
- If phone doesn't start with `+`, it's automatically added
- System checks for existing users with both `+prefix` and `prefix` formats
- If a user already exists with this phone number, an error will be returned

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully to your phone",
  "data": {
    "phone": "+1234567890",
    "sid": "verification_sid",
    "status": "pending"
  }
}
```

**Error Responses:**
- `400`: Phone number is required, phone number is already registered
- `500`: Twilio is not configured for phone OTP, invalid phone number format

---

### 4. Verify Phone OTP for Signup
**Endpoint:** `POST /api/auth/verify-phone-otp-signup`

**Description:** Verify phone OTP code for signup. Phone number is normalized the same way as in send-phone-otp-signup.

**Request Body:**
```json
{
  "phone": "+1234567890",
  "otp": "123456"
}
```

**Note:** 
- Phone number normalization matches the send-phone-otp-signup endpoint
- If a user already exists with this phone number, an error will be returned

**Response:**
```json
{
  "success": true,
  "message": "Phone OTP verified successfully. You can now complete signup.",
  "data": {
    "phoneVerificationToken": "jwt_token_here",
    "phone": "+1234567890"
  }
}
```

**Error Responses:**
- `400`: Phone number and OTP code are required, invalid or expired OTP code, phone number is already registered
- `500`: Twilio is not configured, invalid phone number format

---

### 5. Complete Signup
**Endpoint:** `POST /api/auth/signup`

**Description:** Create a new user account. Requires both email and phone verification tokens from steps above.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "confirmPassword": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "gender": "Male",
  "emailVerificationToken": "jwt_token_from_email_verification",
  "phoneVerificationToken": "jwt_token_from_phone_verification"
}
```

**Validation:**
- Email: Valid email format
- Password: Minimum 6 characters
- Gender: One of: `Male`, `Female`, `Other`, `Prefer not to say`
- Both email and phone verification tokens are required

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "accessToken": "jwt_access_token",
    "refreshToken": "refresh_token_string",
    "token": "jwt_access_token",
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

**Error Responses:**
- `400`: Missing required fields, invalid email format, password mismatch, user already exists
- `401`: Invalid or expired verification tokens

---

## Login

### Login
**Endpoint:** `POST /api/auth/login`

**Description:** Authenticate user and receive access/refresh tokens.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**OR**

```json
{
  "phoneNumber": "+1234567890",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "jwt_access_token",
    "refreshToken": "refresh_token_string",
    "token": "jwt_access_token",
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+1234567890",
      "gender": "Male",
      "name": "John Doe",
      "profileImage": "url_to_image"
    }
  }
}
```

**Error Responses:**
- `400`: Missing credentials, invalid email/phone or password

---

## Get User Details

### Get Current User Profile
**Endpoint:** `GET /api/auth/profile`

**Description:** Get detailed profile information of the authenticated user.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "User profile retrieved successfully",
  "data": {
    "user": {
      "id": "user_id",
      "profile": {
        "name": {
          "first": "John",
          "last": "Doe",
          "full": "John Doe"
        },
        "email": "user@example.com",
        "phoneNumbers": {
          "primary": "+1234567890",
          "alternate": null
        },
        "gender": "Male",
        "pronouns": null,
        "dob": "1990-01-01T00:00:00.000Z",
        "bio": "User bio",
        "profileImage": "url_to_image",
        "coverPhoto": "url_to_cover"
      },
      "location": {
        "currentCity": "New York",
        "hometown": "Boston"
      },
      "social": {
        "numberOfFriends": 10,
        "relationshipStatus": "Single"
      },
      "professional": {
        "workplace": [
          {
            "company": {
              "id": "company_id",
              "name": "Company Name",
              "isCustom": false
            },
            "position": "Software Engineer",
            "startDate": "2020-01-01T00:00:00.000Z",
            "endDate": null,
            "isCurrent": true
          }
        ],
        "education": [
          {
            "institution": {
              "id": "institution_id",
              "name": "University Name",
              "type": "university",
              "city": "City",
              "country": "Country",
              "logo": "url_to_logo",
              "verified": true,
              "isCustom": false
            },
            "degree": "Bachelor's",
            "field": "Computer Science",
            "startYear": 2016,
            "endYear": 2020
          }
        ]
      },
      "content": {
        "generalWeightage": 0,
        "professionalWeightage": 0
      },
      "account": {
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z",
        "isActive": true,
        "isVerified": false,
        "lastLogin": "2024-01-01T00:00:00.000Z"
      }
    }
  }
}
```

**Error Responses:**
- `401`: Not authorized (missing or invalid token)
- `404`: User not found

---

## Update User

### Update Profile
**Endpoint:** `PUT /api/auth/profile`

**Description:** Update user profile information.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:** (All fields optional)
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "gender": "Male",
  "dob": "1990-01-01",
  "bio": "Updated bio",
  "currentCity": "New York",
  "hometown": "Boston",
  "relationshipStatus": "Single",
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

**Field Validations:**
- `gender`: One of: `Male`, `Female`, `Other`, `Prefer not to say`
- `relationshipStatus`: One of: `Single`, `In a relationship`, `Engaged`, `Married`, `In a civil partnership`, `In a domestic partnership`, `In an open relationship`, `It's complicated`, `Separated`, `Divorced`, `Widowed`
- `workplace.company`: Can be company ID (ObjectId) or company name (string)
- `education.institution`: Can be institution ID (ObjectId) or institution name (string)
- `education.institutionType`: One of: `school`, `college`, `university`, `others`

**Response:**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user": {
      // Same structure as GET /api/auth/profile
    }
  }
}
```

**Error Responses:**
- `400`: Invalid field values, validation errors
- `401`: Not authorized

---

### Update Profile Media
**Endpoint:** `PUT /api/user/profile/media`

**Description:** Update profile image, cover photo, and bio.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "profileImage": "url_to_image",
  "coverPhoto": "url_to_cover",
  "bio": "Updated bio text"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile media updated successfully",
  "data": {
    "user": {
      // User object with updated media fields
    }
  }
}
```

---

### Update Personal Info
**Endpoint:** `PUT /api/user/profile/personal-info`

**Description:** Update personal information (name, gender, DOB, phone numbers).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "gender": "Male",
  "dob": "1990-01-01",
  "phoneNumber": "+1234567890",
  "alternatePhoneNumber": "+0987654321"
}
```

**Note:** Phone number updates require OTP verification (see Phone Update section).

**Response:**
```json
{
  "success": true,
  "message": "Personal info updated successfully",
  "data": {
    "user": {
      // User object with updated personal info
    }
  }
}
```

---

### Update Location and Details
**Endpoint:** `PUT /api/user/profile/location-details`

**Description:** Update location, workplace, education, pronouns, and relationship status.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "currentCity": "New York",
  "hometown": "Boston",
  "pronouns": "He/Him",
  "relationshipStatus": "Single",
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
      "endYear": 2020
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Location and details updated successfully",
  "data": {
    "user": {
      // User object with updated fields
    }
  }
}
```

---

### Remove Education Entry
**Endpoint:** `DELETE /api/user/education/:index`

**Description:** Remove an education entry by index (0-based).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Education entry removed successfully"
}
```

---

### Remove Workplace Entry
**Endpoint:** `DELETE /api/user/workplace/:index`

**Description:** Remove a workplace entry by index (0-based).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Workplace entry removed successfully"
}
```

---

## Access Token & Refresh Token

### Refresh Access Token
**Endpoint:** `POST /api/auth/refresh-token`

**Description:** Get a new access token using a valid refresh token.

**Request Body:**
```json
{
  "refreshToken": "refresh_token_string"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Access token refreshed successfully",
  "data": {
    "accessToken": "new_jwt_access_token"
  }
}
```

**Error Responses:**
- `400`: Refresh token is required
- `401`: Invalid refresh token

---

### Logout
**Endpoint:** `POST /api/auth/logout`

**Description:** Logout from current device or all devices. Invalidates refresh token(s).

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body (Optional):**
```json
{
  "refreshToken": "refresh_token_to_logout"
}
```

**OR**

```json
{
  "deviceId": 1
}
```

**Response (Single Device):**
```json
{
  "success": true,
  "message": "Logged out successfully from this device",
  "data": {
    "remainingDevices": 2,
    "loggedOutDevice": {
      "deviceName": "Windows - Chrome",
      "deviceType": "Desktop",
      "browser": "Chrome",
      "os": "Windows"
    }
  }
}
```

**Response (All Devices):**
```json
{
  "success": true,
  "message": "Logged out successfully from all devices",
  "data": {
    "remainingDevices": 0
  }
}
```

**Note:** If no `refreshToken` or `deviceId` is provided, logs out from all devices.

---

## Institution

### Search Institutions
**Endpoint:** `GET /api/institution/search`

**Description:** Search for institutions by name. Public endpoint (no authentication required).

**Query Parameters:**
- `query` (required): Search term
- `type` (optional): Filter by type (`school`, `college`, `university`, `others`)

**Example:**
```
GET /api/institution/search?query=Harvard&type=university
```

**Response:**
```json
{
  "success": true,
  "message": "Found 5 institution/institutions",
  "data": {
    "institutions": [
      {
        "id": "institution_id",
        "name": "Harvard University",
        "type": "university",
        "city": "Cambridge",
        "country": "USA",
        "logo": "url_to_logo",
        "verified": true,
        "isCustom": false,
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "canAddCustom": false,
    "suggestedName": null
  }
}
```

**Response (No Results):**
```json
{
  "success": true,
  "message": "No institutions found",
  "data": {
    "institutions": [],
    "canAddCustom": true,
    "suggestedName": "Search Term"
  }
}
```

---

### Create Institution
**Endpoint:** `POST /api/institution`

**Description:** Create a custom institution entry.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "name": "Custom Institution Name",
  "type": "university",
  "city": "City Name",
  "country": "Country Name",
  "logo": "url_to_logo"
}
```

**Field Validations:**
- `name` (required): Institution name
- `type` (optional): One of: `school`, `college`, `university`, `others` (default: `school`)

**Response:**
```json
{
  "success": true,
  "message": "Institution created successfully",
  "data": {
    "institution": {
      "id": "institution_id",
      "name": "Custom Institution Name",
      "type": "university",
      "city": "City Name",
      "country": "Country Name",
      "logo": "url_to_logo",
      "verified": false,
      "isCustom": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Note:** If institution already exists, returns existing institution with `200` status.

---

## Workplace/Company

### Search Companies
**Endpoint:** `GET /api/company/search`

**Description:** Search for companies by name. Public endpoint (no authentication required).

**Query Parameters:**
- `query` (required): Search term

**Example:**
```
GET /api/company/search?query=Google
```

**Response:**
```json
{
  "success": true,
  "message": "Found 3 company/companies",
  "data": {
    "companies": [
      {
        "id": "company_id",
        "name": "Google LLC",
        "isCustom": false,
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ],
    "canAddCustom": false,
    "suggestedName": null
  }
}
```

**Response (No Results):**
```json
{
  "success": true,
  "message": "No companies found",
  "data": {
    "companies": [],
    "canAddCustom": true,
    "suggestedName": "Search Term"
  }
}
```

---

### Create Company
**Endpoint:** `POST /api/company`

**Description:** Create a custom company entry.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body:**
```json
{
  "name": "Custom Company Name"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Company created successfully",
  "data": {
    "company": {
      "id": "company_id",
      "name": "Custom Company Name",
      "isCustom": true,
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Note:** If company already exists, returns existing company with `200` status.

---

## Password Reset

### Send OTP for Password Reset
**Endpoint:** `POST /api/auth/forgot-password/send-otp`

**Description:** Send OTP to email or phone for password reset.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**OR**

```json
{
  "phone": "+1234567890"
}
```

**Response (Email):**
```json
{
  "success": true,
  "message": "OTP sent successfully to your email",
  "data": {
    "email": "user@example.com",
    "expiresAt": "2024-01-01T12:00:00.000Z"
  }
}
```

**Response (Phone):**
```json
{
  "success": true,
  "message": "OTP sent successfully to your phone",
  "data": {
    "phone": "+1234567890",
    "sid": "verification_sid",
    "status": "pending"
  }
}
```

---

### Verify OTP for Password Reset
**Endpoint:** `POST /api/auth/forgot-password/verify-otp`

**Description:** Verify OTP and receive password reset token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "otp": "123456"
}
```

**OR**

```json
{
  "phone": "+1234567890",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP verified successfully. You can now reset your password.",
  "data": {
    "verificationToken": "jwt_verification_token",
    "email": "user@example.com"
  }
}
```

**Note:** Verification token expires in 15 minutes.

---

### Reset Password
**Endpoint:** `POST /api/auth/forgot-password/reset`

**Description:** Reset password using verification token from OTP verification.

**Request Body:**
```json
{
  "verificationToken": "jwt_verification_token",
  "password": "newpassword123",
  "confirmPassword": "newpassword123"
}
```

**Validation:**
- Password: Minimum 6 characters
- Password and confirmPassword must match

**Response:**
```json
{
  "success": true,
  "message": "Password reset successfully. You can now login with your new password."
}
```

**Error Responses:**
- `400`: Invalid password, passwords don't match
- `401`: Invalid or expired verification token

---

## Device Management

### Get All Devices
**Endpoint:** `GET /api/auth/devices`

**Description:** Get list of all devices where user is logged in.

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response:**
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
          "raw": "Mozilla/5.0..."
        },
        "loggedInAt": "2024-01-01T00:00:00.000Z",
        "isCurrentDevice": true,
        "tokenId": "abc123def456..."
      }
    ]
  }
}
```

**Note:** Maximum 5 devices can be logged in simultaneously. Oldest device is automatically logged out when limit is reached.

---

## Error Responses

All endpoints follow a consistent error response format:

```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message (optional)"
}
```

### Common HTTP Status Codes
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation errors, missing fields)
- `401`: Unauthorized (invalid/missing token)
- `404`: Not Found
- `500`: Internal Server Error

---

## Notes

1. **Token Expiration:**
   - Access tokens expire after 1 hour
   - Refresh tokens effectively never expire (only invalidated on logout)

2. **Device Limit:**
   - Maximum 5 devices can be logged in simultaneously
   - When limit is reached, oldest device is automatically logged out

3. **OTP Verification:**
   - Email OTP: Sent via email service
   - Phone OTP: Sent via Twilio (requires configuration)

4. **Company/Institution Creation:**
   - Can be created by providing name (string) or ID (ObjectId)
   - If name doesn't exist, custom entry is automatically created

5. **Email and Phone Number Normalization:**
   - **Email:** Automatically trimmed (whitespace removed) and converted to lowercase before validation
   - **Phone Number:** Automatically normalized:
     - Whitespace, dashes, and parentheses are removed
     - `+` prefix is added if missing
     - System checks for existing users with both `+prefix` and `prefix` formats
   - Format: `+[country_code][number]` (e.g., `+1234567890`)
   - **Important:** OTPs will not be sent if email/phone is already registered to an existing user


# API Data Flow Documentation
## Social, Friends, and Authentication APIs

This document provides detailed information about how data flows (request and response) for all APIs related to authentication, social features, and friends management. **Marketplace APIs are excluded from this documentation.**

---

## Table of Contents

1. [Authentication APIs](#authentication-apis)
2. [User Profile APIs](#user-profile-apis)
3. [Friends Management APIs](#friends-management-apis)
4. [Posts APIs](#posts-apis)
5. [Reels APIs](#reels-apis)
6. [Stories APIs](#stories-apis)
7. [Likes/Reactions APIs](#likesreactions-apis)

---

## Authentication APIs

### Base URL: `/api/auth`

---

### 1. Send OTP for Signup (Email)

**Endpoint:** `POST /api/auth/send-otp-signup`

**Description:** Sends OTP to user's email for signup verification.

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
    "expiresAt": "2024-01-01T12:00:00.000Z"
  }
}
```

**Response (Error - 400):**
```json
{
  "success": false,
  "message": "User already exists with this email"
}
```

---

### 2. Verify OTP for Signup (Email)

**Endpoint:** `POST /api/auth/verify-otp-signup`

**Description:** Verifies email OTP and returns verification token for signup.

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
  "message": "Email OTP verified successfully. You can now complete signup.",
  "data": {
    "emailVerificationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "email": "user@example.com"
  }
}
```

**Response (Error - 400):**
```json
{
  "success": false,
  "message": "Invalid or expired OTP",
  "remainingAttempts": 2
}
```

---

### 3. Send Phone OTP for Signup

**Endpoint:** `POST /api/auth/send-phone-otp-signup`

**Description:** Sends OTP to user's phone number for signup verification.

**Request Body:**
```json
{
  "phone": "+1234567890"
}
```

**Response (Success - 200):**
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

**Response (Error - 400):**
```json
{
  "success": false,
  "message": "Phone number is already registered"
}
```

---

### 4. Verify Phone OTP for Signup

**Endpoint:** `POST /api/auth/verify-phone-otp-signup`

**Description:** Verifies phone OTP and returns verification token for signup.

**Request Body:**
```json
{
  "phone": "+1234567890",
  "otp": "123456"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Phone OTP verified successfully. You can now complete signup.",
  "data": {
    "phoneVerificationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "phone": "+1234567890"
  }
}
```

**Response (Error - 400):**
```json
{
  "success": false,
  "message": "Invalid or expired OTP code"
}
```

---

### 5. User Signup

**Endpoint:** `POST /api/auth/signup`

**Description:** Creates a new user account. Requires both email and phone verification tokens.

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
  "name": "John Doe",
  "emailVerificationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "phoneVerificationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "company": {
    "name": "Tech Corp"
  },
  "institution": {
    "name": "University",
    "type": "university"
  }
}
```

**Response (Success - 201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "507f1f77bcf86cd799439011",
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

**Response (Error - 400):**
```json
{
  "success": false,
  "message": "Email, password, first name, last name, phone number, and gender are required"
}
```

---

### 6. User Login

**Endpoint:** `POST /api/auth/login`

**Description:** Authenticates user and returns access/refresh tokens.

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

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+1234567890",
      "gender": "Male",
      "name": "John Doe",
      "profileImage": "https://cloudinary.com/image.jpg"
    }
  }
}
```

**Response (Error - 400):**
```json
{
  "success": false,
  "message": "Invalid email/phone number or password"
}
```

---

### 7. Forgot Password - Send OTP

**Endpoint:** `POST /api/auth/forgot-password/send-otp`

**Description:** Sends OTP to email or phone for password reset.

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

**Response (Success - 200):**
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

---

### 8. Forgot Password - Verify OTP

**Endpoint:** `POST /api/auth/forgot-password/verify-otp`

**Description:** Verifies OTP and returns password reset verification token.

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

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "OTP verified successfully. You can now reset your password.",
  "data": {
    "verificationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "email": "user@example.com"
  }
}
```

---

### 9. Forgot Password - Reset Password

**Endpoint:** `POST /api/auth/forgot-password/reset`

**Description:** Resets user password using verification token.

**Request Body:**
```json
{
  "verificationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "password": "newpassword123",
  "confirmPassword": "newpassword123"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Password reset successfully. You can now login with your new password."
}
```

---

### 10. Get Current User Profile

**Endpoint:** `GET /api/auth/profile`

**Authentication:** Required (Bearer Token)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "User profile retrieved successfully",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
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
        "bio": "Software developer",
        "profileImage": "https://cloudinary.com/image.jpg",
        "coverPhoto": "https://cloudinary.com/cover.jpg",
        "visibility": "public"
      },
      "location": {
        "currentCity": "New York",
        "hometown": "Boston"
      },
      "social": {
        "numberOfFriends": 25,
        "relationshipStatus": "Single"
      },
      "professional": {
        "workplace": [
          {
            "company": {
              "id": "507f1f77bcf86cd799439012",
              "name": "Tech Corp",
              "isCustom": true
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
              "id": "507f1f77bcf86cd799439013",
              "name": "University",
              "type": "university",
              "city": "Boston",
              "country": "USA",
              "logo": "https://cloudinary.com/logo.jpg",
              "verified": false,
              "isCustom": true
            },
            "degree": "Bachelor of Science",
            "field": "Computer Science",
            "startYear": 2010,
            "endYear": 2014
          }
        ]
      },
      "content": {
        "generalWeightage": 0.6,
        "professionalWeightage": 0.4
      },
      "account": {
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T00:00:00.000Z",
        "isActive": true,
        "isVerified": false,
        "lastLogin": "2024-01-01T12:00:00.000Z"
      }
    }
  }
}
```

---

### 11. Update Current User Profile

**Endpoint:** `PUT /api/auth/profile`

**Authentication:** Required (Bearer Token)

**Request Body (All fields optional):**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "name": "John Doe",
  "phoneNumber": "+1234567890",
  "gender": "Male",
  "dob": "1990-01-01",
  "alternatePhoneNumber": "+0987654321",
  "profileImage": "https://cloudinary.com/image.jpg",
  "age": 34,
  "bio": "Software developer",
  "currentCity": "New York",
  "hometown": "Boston",
  "relationshipStatus": "Single",
  "workplace": [
    {
      "company": "Tech Corp",
      "position": "Software Engineer",
      "startDate": "2020-01-01",
      "endDate": null,
      "isCurrent": true
    }
  ],
  "education": [
    {
      "institution": "University",
      "degree": "Bachelor of Science",
      "field": "Computer Science",
      "startYear": 2010,
      "endYear": 2014
    }
  ]
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
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
        "bio": "Software developer",
        "profileImage": "https://cloudinary.com/image.jpg",
        "coverPhoto": "https://cloudinary.com/cover.jpg",
        "visibility": "public"
      },
      "location": {
        "currentCity": "New York",
        "hometown": "Boston"
      },
      "social": {
        "relationshipStatus": "Single"
      },
      "professional": {
        "workplace": [...],
        "education": [...]
      },
      "account": {
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-01-01T12:00:00.000Z"
      }
    }
  }
}
```

---

### 12. Refresh Access Token

**Endpoint:** `POST /api/auth/refresh-token`

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Access token refreshed successfully",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

---

### 13. Logout

**Endpoint:** `POST /api/auth/logout`

**Authentication:** Required (Bearer Token)

**Request Body (Optional):**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "deviceId": 1
}
```

**Response (Success - 200):**
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

---

### 14. Get All Logged-in Devices

**Endpoint:** `GET /api/auth/devices`

**Authentication:** Required (Bearer Token)

**Response (Success - 200):**
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
        "loggedInAt": "2024-01-01T12:00:00.000Z",
        "isCurrentDevice": true,
        "tokenId": "eyJhbGciOiJIUz"
      }
    ]
  }
}
```

---

## User Profile APIs

### Base URL: `/api/user`

---

### 1. Search Users

**Endpoint:** `GET /api/user/search?query=john&page=1&limit=10`

**Authentication:** Required (Bearer Token)

**Query Parameters:**
- `query` (required): Search term (name)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Results per page (default: 10)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Users found successfully",
  "data": {
    "users": [
      {
        "id": "507f1f77bcf86cd799439011",
        "name": "John Doe",
        "profileImage": "https://cloudinary.com/image.jpg",
        "bio": "Software developer"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalUsers": 50,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

---

### 2. Get User Profile by ID

**Endpoint:** `GET /api/user/:userId/profile`

**Authentication:** Required (Bearer Token)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "User profile retrieved successfully",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "firstName": "John",
      "lastName": "Doe",
      "name": "John Doe",
      "profileImage": "https://cloudinary.com/image.jpg",
      "bio": "Software developer",
      "currentCity": "New York",
      "hometown": "Boston"
    }
  }
}
```

**Response (Error - 403):**
```json
{
  "success": false,
  "message": "This user has a private profile. Only friends can view their profile."
}
```

---

### 3. Update Profile Visibility

**Endpoint:** `PUT /api/user/profile/visibility`

**Authentication:** Required (Bearer Token)

**Request Body:**
```json
{
  "visibility": "private"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Profile visibility updated successfully",
  "data": {
    "visibility": "private"
  }
}
```

---

### 4. Send OTP for Phone Update

**Endpoint:** `POST /api/user/phone/send-otp`

**Authentication:** Required (Bearer Token)

**Request Body:**
```json
{
  "phoneNumber": "+1234567890"
}
```

**Response (Success - 200):**
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

---

### 5. Verify OTP and Update Phone

**Endpoint:** `POST /api/user/phone/verify-otp`

**Authentication:** Required (Bearer Token)

**Request Body:**
```json
{
  "phoneNumber": "+1234567890",
  "otp": "123456"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Phone number updated successfully",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "name": "John Doe",
      "phoneNumber": "+1234567890",
      "gender": "Male",
      "profileImage": "https://cloudinary.com/image.jpg"
    }
  }
}
```

---

### 6. Remove Education Entry

**Endpoint:** `DELETE /api/user/education/:educationId`

**Authentication:** Required (Bearer Token)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Education entry removed successfully"
}
```

---

### 7. Remove Workplace Entry

**Endpoint:** `DELETE /api/user/workplace/:workplaceId`

**Authentication:** Required (Bearer Token)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Workplace entry removed successfully"
}
```

---

### 8. Block User

**Endpoint:** `POST /api/user/block/:blockedUserId`

**Authentication:** Required (Bearer Token)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "User blocked successfully"
}
```

---

### 9. Unblock User

**Endpoint:** `DELETE /api/user/block/:blockedUserId`

**Authentication:** Required (Bearer Token)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "User unblocked successfully"
}
```

---

### 10. List Blocked Users

**Endpoint:** `GET /api/user/blocked`

**Authentication:** Required (Bearer Token)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Blocked users retrieved successfully",
  "data": {
    "blockedUsers": [
      {
        "id": "507f1f77bcf86cd799439011",
        "name": "Blocked User",
        "profileImage": "https://cloudinary.com/image.jpg"
      }
    ],
    "count": 1
  }
}
```

---

## Friends Management APIs

### Base URL: `/api/friend`

**All endpoints require authentication (Bearer Token)**

---

### 1. Send Friend Request

**Endpoint:** `POST /api/friend/send/:receiverId`

**Response (Success - 201):**
```json
{
  "success": true,
  "message": "Friend request sent successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "sender": {
      "_id": "507f1f77bcf86cd799439012",
      "profile": {
        "name": {
          "first": "John",
          "last": "Doe",
          "full": "John Doe"
        },
        "profileImage": "https://cloudinary.com/image.jpg",
        "email": "john@example.com"
      }
    },
    "receiver": {
      "_id": "507f1f77bcf86cd799439013",
      "profile": {
        "name": {
          "first": "Jane",
          "last": "Smith",
          "full": "Jane Smith"
        },
        "profileImage": "https://cloudinary.com/image.jpg",
        "email": "jane@example.com"
      }
    },
    "status": "pending",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:00:00.000Z"
  }
}
```

---

### 2. Accept Friend Request

**Endpoint:** `POST /api/friend/accept/:requestId`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Friend request accepted successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "sender": {...},
    "receiver": {...},
    "status": "accepted",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:30:00.000Z"
  }
}
```

---

### 3. Reject Friend Request

**Endpoint:** `POST /api/friend/reject/:requestId`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Friend request rejected successfully",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "sender": {...},
    "receiver": {...},
    "status": "rejected",
    "createdAt": "2024-01-01T12:00:00.000Z",
    "updatedAt": "2024-01-01T12:30:00.000Z"
  }
}
```

---

### 4. List Friends

**Endpoint:** `GET /api/friend/list`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Friends retrieved successfully",
  "data": {
    "friends": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "name": "Jane Smith",
        "profileImage": "https://cloudinary.com/image.jpg",
        "bio": "Software developer"
      }
    ],
    "count": 1
  }
}
```

---

### 5. List Received Friend Requests

**Endpoint:** `GET /api/friend/requests/received`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Received friend requests retrieved successfully",
  "data": {
    "requests": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "sender": {
          "_id": "507f1f77bcf86cd799439012",
          "profile": {
            "name": {
              "first": "John",
              "last": "Doe",
              "full": "John Doe"
            },
            "profileImage": "https://cloudinary.com/image.jpg",
            "email": "john@example.com",
            "bio": "Software developer"
          },
          "location": {
            "currentCity": "New York",
            "hometown": "Boston"
          }
        },
        "status": "pending",
        "createdAt": "2024-01-01T12:00:00.000Z"
      }
    ],
    "count": 1
  }
}
```

---

### 6. List Sent Friend Requests

**Endpoint:** `GET /api/friend/requests/sent`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Sent friend requests retrieved successfully",
  "data": {
    "requests": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "receiver": {
          "_id": "507f1f77bcf86cd799439012",
          "profile": {
            "name": {
              "first": "Jane",
              "last": "Smith",
              "full": "Jane Smith"
            },
            "profileImage": "https://cloudinary.com/image.jpg",
            "email": "jane@example.com",
            "bio": "Software developer"
          },
          "location": {
            "currentCity": "New York",
            "hometown": "Boston"
          }
        },
        "status": "pending",
        "createdAt": "2024-01-01T12:00:00.000Z"
      }
    ],
    "count": 1
  }
}
```

---

### 7. Get Friend Suggestions

**Endpoint:** `GET /api/friend/suggestions?limit=10`

**Query Parameters:**
- `limit` (optional): Number of suggestions (default: 10)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Friend suggestions retrieved successfully",
  "data": {
    "suggestions": [
      {
        "user": {
          "_id": "507f1f77bcf86cd799439011",
          "name": "Jane Smith",
          "profileImage": "https://cloudinary.com/image.jpg",
          "bio": "Software developer"
        },
        "mutualFriendsCount": 3,
        "mutualFriends": [
          {
            "_id": "507f1f77bcf86cd799439012",
            "name": "Mutual Friend 1",
            "profileImage": "https://cloudinary.com/image.jpg"
          },
          {
            "_id": "507f1f77bcf86cd799439013",
            "name": "Mutual Friend 2",
            "profileImage": "https://cloudinary.com/image.jpg"
          }
        ]
      }
    ],
    "count": 1
  }
}
```

---

### 8. Unfriend User

**Endpoint:** `DELETE /api/friend/unfriend/:friendId`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "User unfriended successfully"
}
```

---

### 9. Cancel Sent Friend Request

**Endpoint:** `DELETE /api/friend/cancel/:requestId`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Friend request cancelled successfully"
}
```

---

## Posts APIs

### Base URL: `/api/posts`

---

### 1. Create Post

**Endpoint:** `POST /api/posts/create`

**Authentication:** Required (Bearer Token)

**Request:** Multipart form data
- `caption` (optional): Post caption text
- `media` (optional): File(s) - images or videos (max 10 files)

**Response (Success - 201):**
```json
{
  "success": true,
  "message": "Post created successfully",
  "data": {
    "post": {
      "id": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439012",
      "user": {
        "id": "507f1f77bcf86cd799439012",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "email": "john@example.com",
        "profileImage": "https://cloudinary.com/image.jpg"
      },
      "caption": "Check out this amazing sunset!",
      "media": [
        {
          "url": "https://cloudinary.com/image.jpg",
          "publicId": "user_uploads/123/posts/abc",
          "type": "image",
          "format": "jpg"
        }
      ],
      "likes": [[], [], [], [], [], []],
      "comments": [],
      "likeCount": 0,
      "commentCount": 0,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    }
  }
}
```

---

### 2. Get All Posts (Feed)

**Endpoint:** `GET /api/posts/all?page=1&limit=10`

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Posts per page (default: 10)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Posts retrieved successfully",
  "data": {
    "posts": [
      {
        "id": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439012",
        "user": {
          "id": "507f1f77bcf86cd799439012",
          "firstName": "John",
          "lastName": "Doe",
          "name": "John Doe",
          "email": "john@example.com",
          "profileImage": "https://cloudinary.com/image.jpg"
        },
        "caption": "Check out this amazing sunset!",
        "media": [...],
        "likes": [[], [], [], [], [], []],
        "comments": [
          {
            "id": "507f1f77bcf86cd799439013",
            "userId": "507f1f77bcf86cd799439014",
            "user": {
              "id": "507f1f77bcf86cd799439014",
              "firstName": "Jane",
              "lastName": "Smith",
              "name": "Jane Smith",
              "profileImage": "https://cloudinary.com/image.jpg"
            },
            "text": "Amazing!",
            "createdAt": "2024-01-01T12:30:00.000Z"
          }
        ],
        "likeCount": 5,
        "commentCount": 1,
        "createdAt": "2024-01-01T12:00:00.000Z",
        "updatedAt": "2024-01-01T12:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 10,
      "totalPosts": 100,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

---

### 3. Get My Posts

**Endpoint:** `GET /api/posts/me?page=1&limit=10`

**Authentication:** Required (Bearer Token)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "My posts retrieved successfully",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439012",
      "name": "John Doe",
      "email": "john@example.com",
      "profileImage": "https://cloudinary.com/image.jpg"
    },
    "posts": [...],
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

---

### 4. Get User Posts

**Endpoint:** `GET /api/posts/user/:id?page=1&limit=10`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "User posts retrieved successfully",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439012",
      "name": "John Doe",
      "email": "john@example.com",
      "profileImage": "https://cloudinary.com/image.jpg"
    },
    "posts": [...],
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

---

### 5. Like/Unlike Post

**Endpoint:** `POST /api/posts/:id/like`

**Authentication:** Required (Bearer Token)

**Request Body:**
```json
{
  "reaction": "like"
}
```

**Reaction Types:** `happy`, `sad`, `angry`, `hug`, `wow`, `like`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Post liked successfully",
  "data": {
    "post": {
      "id": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439012",
      "user": {...},
      "caption": "Check out this amazing sunset!",
      "media": [...],
      "likes": [[], [], [], [], [], ["507f1f77bcf86cd799439014"]],
      "comments": [...],
      "likeCount": 1,
      "commentCount": 0,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    },
    "action": "liked",
    "reaction": "like",
    "isLiked": true
  }
}
```

---

### 6. Add Comment to Post

**Endpoint:** `POST /api/posts/:id/comment`

**Authentication:** Required (Bearer Token)

**Request Body:**
```json
{
  "text": "This is amazing!"
}
```

**Response (Success - 201):**
```json
{
  "success": true,
  "message": "Comment added successfully",
  "data": {
    "comment": {
      "id": "507f1f77bcf86cd799439013",
      "userId": "507f1f77bcf86cd799439014",
      "user": {
        "id": "507f1f77bcf86cd799439014",
        "firstName": "Jane",
        "lastName": "Smith",
        "name": "Jane Smith",
        "profileImage": "https://cloudinary.com/image.jpg"
      },
      "text": "This is amazing!",
      "createdAt": "2024-01-01T12:30:00.000Z"
    },
    "post": {
      "id": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439012",
      "user": {...},
      "caption": "Check out this amazing sunset!",
      "media": [...],
      "likes": [[], [], [], [], [], []],
      "comments": [...],
      "likeCount": 0,
      "commentCount": 1,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:30:00.000Z"
    }
  }
}
```

---

### 7. Delete Comment from Post

**Endpoint:** `DELETE /api/posts/:id/comment/:commentId`

**Authentication:** Required (Bearer Token)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Comment deleted successfully",
  "data": {
    "post": {
      "id": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439012",
      "user": {...},
      "caption": "Check out this amazing sunset!",
      "media": [...],
      "likes": [[], [], [], [], [], []],
      "comments": [],
      "likeCount": 0,
      "commentCount": 0,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:30:00.000Z"
    }
  }
}
```

---

### 8. Report Post

**Endpoint:** `POST /api/posts/:id/report`

**Authentication:** Required (Bearer Token)

**Request Body:**
```json
{
  "reason": "spam"
}
```

**Report Reasons:** `spam`, `harassment`, `inappropriate_content`, `fake_news`, `violence`, `hate_speech`, `other`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Post reported successfully",
  "data": {
    "postDeleted": false
  }
}
```

**Note:** If 2 users report with the same reason, the post is automatically deleted.

---

### 9. Delete Post

**Endpoint:** `DELETE /api/posts/:id`

**Authentication:** Required (Bearer Token)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Post deleted successfully"
}
```

---

## Reels APIs

### Base URL: `/api/reels`

---

### 1. Create Reel (Combined Upload + Create)

**Endpoint:** `POST /api/reels/create`

**Authentication:** Required (Bearer Token)

**Request:** Multipart form data
- `caption` (optional): Reel caption text
- `contentType` (required): `education` or `fun`
- `visibility` (optional): `public` or `private` (default: `public`)
- `media` (required): Video file

**Response (Success - 201):**
```json
{
  "success": true,
  "message": "Reel created successfully",
  "data": {
    "reel": {
      "id": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439012",
      "user": {
        "id": "507f1f77bcf86cd799439012",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "email": "john@example.com",
        "profileImage": "https://cloudinary.com/image.jpg"
      },
      "caption": "Check out this amazing video!",
      "media": {
        "url": "https://cloudinary.com/video.mp4",
        "publicId": "user_uploads/123/reels/abc",
        "thumbnailUrl": "https://cloudinary.com/thumbnail.jpg",
        "type": "video",
        "format": "mp4",
        "duration": 30.5,
        "dimensions": {
          "width": 1920,
          "height": 1080
        },
        "size": 5242880
      },
      "contentType": "education",
      "visibility": "public",
      "views": 0,
      "likes": [[], [], [], [], [], []],
      "comments": [],
      "likeCount": 0,
      "commentCount": 0,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z"
    }
  }
}
```

---

### 2. Get Reels by Content Type

**Endpoint:** `GET /api/reels?contentType=education&page=1&limit=10`

**Query Parameters:**
- `contentType` (required): `education` or `fun`
- `page` (optional): Page number (default: 1)
- `limit` (optional): Reels per page (default: 10)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Reels retrieved successfully",
  "data": {
    "reels": [
      {
        "id": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439012",
        "user": {...},
        "caption": "Check out this amazing video!",
        "media": {...},
        "contentType": "education",
        "visibility": "public",
        "views": 100,
        "likes": [[], [], [], [], [], []],
        "comments": [...],
        "likeCount": 5,
        "commentCount": 2,
        "createdAt": "2024-01-01T12:00:00.000Z",
        "updatedAt": "2024-01-01T12:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 10,
      "totalReels": 100,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

---

### 3. Get User Reels

**Endpoint:** `GET /api/reels/user/:id?page=1&limit=10`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "User reels retrieved successfully",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439012",
      "name": "John Doe",
      "email": "john@example.com",
      "profileImage": "https://cloudinary.com/image.jpg"
    },
    "reels": [...],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalReels": 50,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

---

### 4. Like/Unlike Reel

**Endpoint:** `POST /api/reels/:id/like`

**Authentication:** Required (Bearer Token)

**Request Body:**
```json
{
  "reaction": "like"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Reel liked successfully",
  "data": {
    "reel": {
      "id": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439012",
      "user": {...},
      "caption": "Check out this amazing video!",
      "media": {...},
      "contentType": "education",
      "visibility": "public",
      "views": 100,
      "likes": [[], [], [], [], [], ["507f1f77bcf86cd799439014"]],
      "comments": [...],
      "likeCount": 1,
      "commentCount": 0,
      "createdAt": "2024-01-01T12:00:00.000Z",
      "updatedAt": "2024-01-01T12:00:00.000Z",
      "action": "liked",
      "reaction": "like",
      "isLiked": true
    }
  }
}
```

---

### 5. Add Comment to Reel

**Endpoint:** `POST /api/reels/:id/comment`

**Authentication:** Required (Bearer Token)

**Request Body:**
```json
{
  "text": "Great video!"
}
```

**Response (Success - 201):**
```json
{
  "success": true,
  "message": "Comment added successfully",
  "data": {
    "comment": {
      "id": "507f1f77bcf86cd799439013",
      "userId": "507f1f77bcf86cd799439014",
      "user": {...},
      "text": "Great video!",
      "createdAt": "2024-01-01T12:30:00.000Z"
    },
    "reel": {...}
  }
}
```

---

### 6. Delete Comment from Reel

**Endpoint:** `DELETE /api/reels/:id/comment/:commentId`

**Authentication:** Required (Bearer Token)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Comment deleted successfully",
  "data": {
    "reel": {...}
  }
}
```

---

### 7. Report Reel

**Endpoint:** `POST /api/reels/:id/report`

**Authentication:** Required (Bearer Token)

**Request Body:**
```json
{
  "reason": "spam"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Reel reported successfully",
  "data": {
    "reelDeleted": false
  }
}
```

---

### 8. Delete Reel

**Endpoint:** `DELETE /api/reels/:id`

**Authentication:** Required (Bearer Token)

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Reel deleted successfully"
}
```

---

## Stories APIs

### Base URL: `/api/stories`

**All endpoints require authentication (Bearer Token)**

---

### 1. Upload Story Media

**Endpoint:** `POST /api/stories/upload-media`

**Request:** Multipart form data
- `media` (required): Image or video file

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Story media uploaded successfully",
  "data": {
    "url": "https://cloudinary.com/image.jpg",
    "publicId": "user_uploads/123/stories/abc",
    "type": "image",
    "format": "jpg",
    "fileSize": 524288
  }
}
```

---

### 2. Create Story

**Endpoint:** `POST /api/stories/create`

**Request Body:**
```json
{
  "url": "https://cloudinary.com/image.jpg",
  "publicId": "user_uploads/123/stories/abc",
  "type": "image",
  "format": "jpg"
}
```

**Response (Success - 201):**
```json
{
  "success": true,
  "message": "Story created successfully",
  "data": {
    "story": {
      "id": "507f1f77bcf86cd799439011",
      "userId": "507f1f77bcf86cd799439012",
      "user": {
        "id": "507f1f77bcf86cd799439012",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "email": "john@example.com",
        "profileImage": "https://cloudinary.com/image.jpg"
      },
      "media": {
        "url": "https://cloudinary.com/image.jpg",
        "publicId": "user_uploads/123/stories/abc",
        "type": "image",
        "format": "jpg"
      },
      "createdAt": "2024-01-01T12:00:00.000Z",
      "expiresAt": "2024-01-02T12:00:00.000Z"
    }
  }
}
```

---

### 3. Get All Friends Stories

**Endpoint:** `GET /api/stories/all`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Friends stories retrieved successfully",
  "data": {
    "stories": [
      {
        "user": {
          "id": "507f1f77bcf86cd799439012",
          "firstName": "John",
          "lastName": "Doe",
          "name": "John Doe",
          "email": "john@example.com",
          "profileImage": "https://cloudinary.com/image.jpg"
        },
        "stories": [
          {
            "id": "507f1f77bcf86cd799439011",
            "userId": "507f1f77bcf86cd799439012",
            "media": {
              "url": "https://cloudinary.com/image.jpg",
              "publicId": "user_uploads/123/stories/abc",
              "type": "image",
              "format": "jpg"
            },
            "createdAt": "2024-01-01T12:00:00.000Z",
            "expiresAt": "2024-01-02T12:00:00.000Z"
          }
        ]
      }
    ],
    "count": 1,
    "totalStories": 1
  }
}
```

---

### 4. Get User Stories

**Endpoint:** `GET /api/stories/user/:id`

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "User stories retrieved successfully",
  "data": {
    "user": {
      "id": "507f1f77bcf86cd799439012",
      "name": "John Doe",
      "email": "john@example.com",
      "profileImage": "https://cloudinary.com/image.jpg"
    },
    "stories": [
      {
        "id": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439012",
        "user": {...},
        "media": {
          "url": "https://cloudinary.com/image.jpg",
          "publicId": "user_uploads/123/stories/abc",
          "type": "image",
          "format": "jpg"
        },
        "createdAt": "2024-01-01T12:00:00.000Z",
        "expiresAt": "2024-01-02T12:00:00.000Z"
      }
    ],
    "count": 1
  }
}
```

---

## Likes/Reactions APIs

### Base URL: `/api/likes`

**All endpoints require authentication (Bearer Token)**

---

### 1. Like/Unlike Post

**Endpoint:** `POST /api/likes/post/:id`

**Request Body:**
```json
{
  "reaction": "like"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Post liked successfully",
  "data": {
    "action": "liked",
    "reaction": "like",
    "likeCount": 1,
    "isLiked": true,
    "reactions": [[], [], [], [], [], [{"_id": "...", "profile": {...}}]]
  }
}
```

---

### 2. Like/Unlike Reel

**Endpoint:** `POST /api/likes/reel/:id`

**Request Body:**
```json
{
  "reaction": "happy"
}
```

**Response (Success - 200):**
```json
{
  "success": true,
  "message": "Reel liked successfully",
  "data": {
    "action": "liked",
    "reaction": "happy",
    "likeCount": 1,
    "isLiked": true,
    "reactions": [[{"_id": "...", "profile": {...}}], [], [], [], [], []]
  }
}
```

---

### 3. Get Reactions

**Endpoint:** `GET /api/likes/:content/:contentId`

**URL Parameters:**
- `content`: `post` or `reel`
- `contentId`: ID of the post or reel

**Response (Success - 200):**
```json
{
  "success": true,
  "data": {
    "happy": {
      "count": 5,
      "users": [
        {
          "id": "507f1f77bcf86cd799439011",
          "name": "John Doe",
          "profileImage": "https://cloudinary.com/image.jpg"
        }
      ]
    },
    "like": {
      "count": 10,
      "users": [...]
    }
  }
}
```

---

## Common Response Structures

### Error Response Format

All error responses follow this structure:

```json
{
  "success": false,
  "message": "Error message describing what went wrong",
  "error": "Detailed error message (development only)",
  "hint": "Helpful hint for resolving the issue (optional)"
}
```

### Pagination Structure

All paginated responses include:

```json
{
  "pagination": {
    "currentPage": 1,
    "totalPages": 10,
    "totalItems": 100,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### User Object Structure

User objects in responses typically include:

```json
{
  "id": "507f1f77bcf86cd799439011",
  "firstName": "John",
  "lastName": "Doe",
  "name": "John Doe",
  "email": "user@example.com",
  "profileImage": "https://cloudinary.com/image.jpg",
  "bio": "Software developer"
}
```

### Media Object Structure

Media objects in responses include:

```json
{
  "url": "https://cloudinary.com/image.jpg",
  "publicId": "user_uploads/123/posts/abc",
  "type": "image",
  "format": "jpg"
}
```

For videos:

```json
{
  "url": "https://cloudinary.com/video.mp4",
  "publicId": "user_uploads/123/reels/abc",
  "thumbnailUrl": "https://cloudinary.com/thumbnail.jpg",
  "type": "video",
  "format": "mp4",
  "duration": 30.5,
  "dimensions": {
    "width": 1920,
    "height": 1080
  },
  "size": 5242880
}
```

---

## Authentication

Most endpoints require authentication using a Bearer token in the Authorization header:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## Notes

1. **OTP Verification**: Both email and phone OTP verification are required for signup. The verification tokens must be included in the signup request.

2. **Phone Number Format**: All phone numbers must be in E.164 format (e.g., `+1234567890`).

3. **File Uploads**: For file uploads, use `multipart/form-data` content type.

4. **Reactions**: The likes array structure is `[[happy], [sad], [angry], [hug], [wow], [like]]` where each sub-array contains user IDs who reacted with that type.

5. **Privacy**: Posts and reels respect user profile visibility settings. Private profiles are only visible to friends.

6. **Blocking**: Blocked users cannot interact with each other (send friend requests, view posts, etc.).

7. **Stories Expiration**: Stories automatically expire after 24 hours.

8. **Content Reporting**: If 2 users report the same content with the same reason, it is automatically deleted.

---

## Version

**Document Version:** 1.0  
**Last Updated:** 2024-01-01  
**API Base URL:** `/api`


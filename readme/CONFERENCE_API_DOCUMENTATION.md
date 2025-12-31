# Conference System API Documentation

## Overview

The Conference System has separate authentication for **Host** and **Speaker** roles, with different APIs for each. Regular **Users** can attend conferences and answer questions.

---

## 🔐 Authentication APIs

### Host Authentication (`/api/host/auth`)

Hosts are conference owners who create and manage conferences.

#### 1. Host Signup (with email + phone verification)
**POST** `/api/host/auth/signup`

Host signup **requires email and phone OTP verification first** using the main auth OTP APIs.

**Step 1 – Verify email (main auth APIs):**

1. `POST /api/auth/send-otp-signup` with `{ "email": "host@example.com" }`
2. `POST /api/auth/verify-otp-signup` with `{ "email": "host@example.com", "otp": "123456" }`  
   → returns `emailVerificationToken`

**Step 2 – Verify phone (main auth APIs):**

1. `POST /api/auth/send-phone-otp-signup` with `{ "phone": "+1234567890" }`
2. `POST /api/auth/verify-phone-otp-signup` with `{ "phone": "+1234567890", "otp": "123456" }`  
   → returns `phoneVerificationToken`

**Step 3 – Complete Host signup:**

**Request Body:**
```json
{
  "email": "host@example.com",
  "password": "password123",
  "name": "John Host",
  "bio": "Conference organizer",
  "phone": "+1234567890",
  "emailVerificationToken": "<from verify-otp-signup>",
  "phoneVerificationToken": "<from verify-phone-otp-signup>"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "host": {
      "_id": "host_id",
      "email": "host@example.com",
      "name": "John Host",
      "bio": "Conference organizer",
      "phone": "+1234567890",
      "profileImage": "",
      "isVerified": false,
      "emailVerified": true,
      "phoneVerified": true,
      "createdAt": "2024-01-15T10:00:00Z"
    },
    "accessToken": "jwt_access_token",
    "refreshToken": "refresh_token"
  }
}
```

#### 2. Host Login
**POST** `/api/host/auth/login`

**Request Body:**
```json
{
  "email": "host@example.com",
  "password": "password123"
}
```

**Response:** Same as signup

#### 3. Get Host Profile
**GET** `/api/host/auth/profile`

**Headers:** `Authorization: Bearer <accessToken>`

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "host_id",
    "email": "host@example.com",
    "name": "John Host",
    "bio": "Conference organizer",
    "phone": "+1234567890",
    "profileImage": "",
    "isVerified": false,
    "isActive": true,
    "lastLogin": "2024-01-15T10:00:00Z"
  }
}
```

#### 4. Update Host Profile
**PUT** `/api/host/auth/profile`

**Headers:** `Authorization: Bearer <accessToken>`

**Request Body:**
```json
{
  "name": "Updated Name",
  "bio": "Updated bio",
  "phone": "+1234567890",
  "profileImage": "https://example.com/image.jpg"
}
```

#### 5. Upload Host Profile Image
**POST** `/api/host/auth/profile-image`

**Headers:** `Authorization: Bearer <accessToken>`

**Request Body:** Form-data with field name `profileImage` containing the image file

**Supported Image Formats:** JPEG, JPG, PNG, GIF, WebP

**Response:**
```json
{
  "success": true,
  "message": "Profile image uploaded successfully",
  "data": {
    "url": "https://bucket.s3.region.amazonaws.com/uploads/1234567890-987654321.jpg",
    "host": {
      "_id": "host_id",
      "email": "host@example.com",
      "name": "John Host",
      "profileImage": "https://bucket.s3.region.amazonaws.com/uploads/1234567890-987654321.jpg"
    }
  }
}
```

**Note:** 
- The old profile image (if exists) will be automatically deleted from S3
- Only the authenticated host can upload their own profile image
- Maximum file size depends on your server configuration

#### 6. Refresh Token
**POST** `/api/host/auth/refresh-token`

**Request Body:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

#### 7. Logout
**POST** `/api/host/auth/logout`

**Headers:** `Authorization: Bearer <accessToken>`

**Request Body:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

---

### Speaker Authentication (`/api/speaker/auth`)

Speakers are assigned to conferences and can manage their own content.

#### 1. Speaker Signup (with email + phone verification)
**POST** `/api/speaker/auth/signup`

Speaker signup also **requires email and phone OTP verification first** using the same main auth OTP APIs:

- Email: `send-otp-signup` → `verify-otp-signup` → `emailVerificationToken`
- Phone: `send-phone-otp-signup` → `verify-phone-otp-signup` → `phoneVerificationToken`

**Request Body:**
```json
{
  "email": "speaker@example.com",
  "password": "password123",
  "name": "Jane Speaker",
  "bio": "Expert in technology",
  "phone": "+1234567890",
  "emailVerificationToken": "<from verify-otp-signup>",
  "phoneVerificationToken": "<from verify-phone-otp-signup>"
}
```

**Response:** Same format as Host signup (with `speaker` instead of `host` and `emailVerified` / `phoneVerified` flags)

#### 2. Speaker Login
**POST** `/api/speaker/auth/login`

**Request Body:**
```json
{
  "email": "speaker@example.com",
  "password": "password123"
}
```

#### 3. Get Speaker Profile
**GET** `/api/speaker/auth/profile`

**Headers:** `Authorization: Bearer <accessToken>`

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "speaker_id",
    "email": "speaker@example.com",
    "name": "Jane Speaker",
    "bio": "Expert in technology",
    "phone": "+1234567890",
    "profileImage": "",
    "isVerified": false,
    "isActive": true,
    "lastLogin": "2024-01-15T10:00:00Z"
  }
}
```

#### 4. Update Speaker Profile
**PUT** `/api/speaker/auth/profile`

**Headers:** `Authorization: Bearer <accessToken>`

**Request Body:**
```json
{
  "name": "Updated Name",
  "bio": "Updated bio",
  "phone": "+1234567890",
  "profileImage": "https://example.com/image.jpg"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "speaker_id",
    "email": "speaker@example.com",
    "name": "Updated Name",
    "bio": "Updated bio",
    "phone": "+1234567890",
    "profileImage": "https://example.com/image.jpg",
    "isVerified": false
  }
}
```

#### 5. Upload Speaker Profile Image
**POST** `/api/speaker/auth/profile-image`

**Headers:** `Authorization: Bearer <accessToken>`

**Request Body:** Form-data with field name `profileImage` containing the image file

**Supported Image Formats:** JPEG, JPG, PNG, GIF, WebP

**Response:**
```json
{
  "success": true,
  "message": "Profile image uploaded successfully",
  "data": {
    "url": "https://bucket.s3.region.amazonaws.com/uploads/1234567890-987654321.jpg",
    "speaker": {
      "_id": "speaker_id",
      "email": "speaker@example.com",
      "name": "Jane Speaker",
      "profileImage": "https://bucket.s3.region.amazonaws.com/uploads/1234567890-987654321.jpg"
    }
  }
}
```

**Note:** 
- The old profile image (if exists) will be automatically deleted from S3
- Only the authenticated speaker can upload their own profile image
- Maximum file size depends on your server configuration

#### 6. Refresh Token
**POST** `/api/speaker/auth/refresh-token`

**Request Body:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

#### 7. Logout
**POST** `/api/speaker/auth/logout`

**Headers:** `Authorization: Bearer <accessToken>`

**Request Body:**
```json
{
  "refreshToken": "refresh_token_here"
}
```

---

## 📋 Conference Management APIs (`/api/conference`)

**Note:** Conference APIs support multiple authentication types:
- **Host** authentication (using Host token)
- **Speaker** authentication (using Speaker token)
- **User** authentication (using User token for attendees)

### Conference CRUD

#### 1. Create Conference
**POST** `/api/conference`

**Auth:** HOST, SPEAKER, or SUPER_ADMIN

**Headers:** 
- `Authorization: Bearer <host_accessToken>`  
- `Authorization: Bearer <speaker_accessToken>`  
- or `Authorization: Bearer <super_admin_user_accessToken>`

**Request Body:**
```json
{
  "title": "Tech Conference 2024",
  "description": "Annual technology conference",
  "speakerIds": ["speaker_id_1", "speaker_id_2"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "conference_id",
    "title": "Tech Conference 2024",
    "description": "Annual technology conference",
    "hostId": "host_id",
    "speakers": [...],
    "publicCode": "ABC123",
    "qrCodeImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "status": "DRAFT",
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

**Note:** 
- When a **Speaker** creates a conference using their speaker token, they become the owner (`hostId` points to the speaker account and `ownerModel` is `Speaker`). When a **Host** or **SUPER_ADMIN** user creates a conference, `hostId` and `ownerModel` reflect that host/user instead.
- **QR Code Generation:** A QR code is automatically generated when a conference is created. The QR code contains a URL pointing to `/api/conference/public/{publicCode}` which enables easy access to the conference. The QR code image is stored as a Base64 data URL in the `qrCodeImage` field.

#### 2. Get All Conferences
**GET** `/api/conference`

**Auth:** Any authenticated user

**Query Parameters:**
- `status`: Filter by status (DRAFT, ACTIVE, ENDED)
- `role`: Filter by role (host, speaker)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "conference_id",
      "title": "Tech Conference 2024",
      "status": "ACTIVE",
      "hostId": {...},
      "speakers": [...]
    }
  ]
}
```

#### 3. Get Conference by ID
**GET** `/api/conference/:conferenceId`

**Auth:** Any authenticated user

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "conference_id",
    "title": "Tech Conference 2024",
    "status": "ACTIVE",
    "publicCode": "ABC123",
    "qrCodeImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "userRole": "HOST" // or "SPEAKER", "USER", "SUPER_ADMIN"
  }
}
```

#### 4. Update Conference
**PUT** `/api/conference/:conferenceId`

**Auth:** HOST or SUPER_ADMIN only

**Request Body:**
```json
{
  "title": "Updated Title",
  "description": "Updated description",
  "speakerIds": ["speaker_id_1"]
}
```

#### 5. Activate Conference
**POST** `/api/conference/:conferenceId/activate`

**Auth:** HOST or SUPER_ADMIN only

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "conference_id",
    "status": "ACTIVE"
  }
}
```

#### 6. End Conference
**POST** `/api/conference/:conferenceId/end`

**Auth:** HOST or SUPER_ADMIN only

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "conference_id",
    "status": "ENDED",
    "endedAt": "2024-01-15T12:00:00Z",
    "groupId": "group_conversation_id"
  }
}
```

**Note:** Automatically creates a group conversation for post-conference discussions.

#### 7. Regenerate QR Code
**POST** `/api/conference/:conferenceId/qr-code/regenerate`

**Auth:** HOST, SPEAKER, or SUPER_ADMIN

**Description:** Regenerates the QR code for an existing conference. Useful if the QR code was not generated during creation or needs to be updated. Speakers can regenerate QR codes for conferences they are assigned to.

**Response:**
```json
{
  "success": true,
  "message": "QR code regenerated successfully",
  "data": {
    "_id": "conference_id",
    "title": "Tech Conference 2024",
    "publicCode": "ABC123",
    "qrCodeImage": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
    "status": "DRAFT"
  }
}
```

**Error Response:**
```json
{
  "success": false,
  "message": "Failed to generate QR code",
  "error": "Error details here"
}
```

---

## ❓ Question Management APIs

### 1. Add Question
**POST** `/api/conference/:conferenceId/questions`

**Auth:** HOST or SPEAKER

**Request Body:**
```json
{
  "order": 1,
  "questionText": "What is the capital of France?",
  "options": [
    { "key": "A", "text": "London" },
    { "key": "B", "text": "Paris" },
    { "key": "C", "text": "Berlin" },
    { "key": "D", "text": "Madrid" }
  ],
  "correctOption": "B"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "question_id",
    "conferenceId": "conference_id",
    "order": 1,
    "questionText": "What is the capital of France?",
    "options": [...],
    "correctOption": "B",
    "createdByRole": "HOST", // or "SPEAKER"
    "createdById": "host_id",
    "status": "IDLE",
    "isLive": false
  }
}
```

### 2. Get Questions
**GET** `/api/conference/:conferenceId/questions`

**Auth:** Any authenticated user

**Response:** List of questions (SPEAKER only sees their own)

### 3. Update Question
**PUT** `/api/conference/:conferenceId/questions/:questionId`

**Auth:** HOST (any question) or SPEAKER (only their own)

**Request Body:**
```json
{
  "questionText": "Updated question",
  "options": [...],
  "correctOption": "A"
}
```

### 4. Delete Question
**DELETE** `/api/conference/:conferenceId/questions/:questionId`

**Auth:** HOST (any question) or SPEAKER (only their own)

### 5. Push Question Live
**POST** `/api/conference/:conferenceId/questions/:questionId/live`

**Auth:** HOST (any question) or SPEAKER (only their own)

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "question_id",
    "isLive": true,
    "status": "ACTIVE"
  }
}
```

**Note:** Only one question can be live at a time. Pushing a new question live automatically closes the previous live question.

### 6. Get Live Question
**GET** `/api/conference/:conferenceId/questions/live`

**Auth:** USER (attendees)

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "question_id",
    "questionText": "What is the capital of France?",
    "options": [...],
    "hasAnswered": false
    // correctOption is hidden until user answers
  }
}
```

### 7. Answer Question
**POST** `/api/conference/:conferenceId/questions/:questionId/answer`

**Auth:** USER (attendees)

**Request Body:**
```json
{
  "selectedOption": "B"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "isCorrect": true,
    "correctOption": "B"
  }
}
```

---

## 📁 Media Management APIs

### 1. Add Media
**POST** `/api/conference/:conferenceId/media`

**Auth:** HOST or SPEAKER

**Request Body:**
```json
{
  "mediaId": "media_id_from_upload",
  "type": "PPT" // or "IMAGE"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "conference_media_id",
    "conferenceId": "conference_id",
    "mediaId": {...},
    "type": "PPT",
    "createdByRole": "HOST",
    "createdById": "host_id"
  }
}
```

### 2. Get Media
**GET** `/api/conference/:conferenceId/media`

**Auth:** Any authenticated user (SPEAKER only sees their own)

### 3. Delete Media
**DELETE** `/api/conference/:conferenceId/media/:mediaId`

**Auth:** HOST (any media) or SPEAKER (only their own)

---

## 📊 Analytics APIs

### Get Analytics
**GET** `/api/conference/:conferenceId/analytics`

**Auth:** SUPER_ADMIN (all), HOST (full conference), SPEAKER (only their questions)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "_id": "analytics_id",
      "questionId": {...},
      "totalResponses": 150,
      "optionCounts": {
        "A": 20,
        "B": 100,
        "C": 20,
        "D": 10
      },
      "correctCount": 100,
      "lastUpdated": "2024-01-15T11:00:00Z"
    }
  ]
}
```

---

## 👥 Group Management APIs

### 1. Request Group Join
**POST** `/api/conference/:conferenceId/group/request`

**Auth:** USER (attendees)

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "request_id",
    "groupId": "group_id",
    "userId": "user_id",
    "status": "PENDING"
  }
}
```

### 2. Review Group Join Request
**POST** `/api/conference/group/requests/:requestId/review`

**Auth:** SUPER_ADMIN only

**Request Body:**
```json
{
  "action": "APPROVE" // or "REJECT"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "_id": "request_id",
    "status": "APPROVED",
    "reviewedBy": "super_admin_id",
    "reviewedAt": "2024-01-15T12:00:00Z"
  }
}
```

### 3. Get Conference Materials
**GET** `/api/conference/:conferenceId/materials`

**Auth:** Approved group members, HOST, SPEAKER, SUPER_ADMIN

**Response:**
```json
{
  "success": true,
  "data": {
    "questions": [
      {
        "_id": "question_id",
        "questionText": "...",
        "correctOption": "B", // Revealed for approved members
        "answers": [...]
      }
    ],
    "media": [...]
  }
}
```

---

## 🔄 Authentication Flow

### Host Flow

1. **Verify email + phone, then Signup/Login**
   ```
   # Email OTP
   POST /api/auth/send-otp-signup
   POST /api/auth/verify-otp-signup

   # Phone OTP
   POST /api/auth/send-phone-otp-signup
   POST /api/auth/verify-phone-otp-signup

   # Complete signup
   POST /api/host/auth/signup
   → Receive accessToken + refreshToken
   ```

2. **Use Token**
   ```
   Authorization: Bearer <accessToken>
   ```

3. **Create Conference**
   ```
   POST /api/conference
   Headers: Authorization: Bearer <host_accessToken>
   ```

4. **Manage Conference**
   - Add questions, media
   - Activate/end conference
   - View analytics

5. **Refresh Token** (when accessToken expires)
   ```
   POST /api/host/auth/refresh-token
   Body: { "refreshToken": "..." }
   ```

### Speaker Flow

1. **Verify email + phone, then Signup/Login**
   ```
   # Email OTP
   POST /api/auth/send-otp-signup
   POST /api/auth/verify-otp-signup

   # Phone OTP
   POST /api/auth/send-phone-otp-signup
   POST /api/auth/verify-phone-otp-signup

   # Complete signup
   POST /api/speaker/auth/signup
   → Receive accessToken + refreshToken
   ```

2. **Use Token**
   ```
   Authorization: Bearer <accessToken>
   ```

3. **Access Assigned Conference**
   ```
   GET /api/conference/:conferenceId
   Headers: Authorization: Bearer <speaker_accessToken>
   ```

5. **Manage Own Content**
   - Add questions (only for their session)
   - Add media (only their own)
   - Push questions live (only their own)
   - View analytics (only their questions)

### User (Attendee) Flow

1. **Login** (using regular User auth)
   ```
   POST /api/auth/login
   → Receive accessToken + refreshToken
   ```

2. **Join Conference** (using public code)
   ```
   GET /api/conference?publicCode=ABC123
   Headers: Authorization: Bearer <user_accessToken>
   ```

3. **Answer Questions**
   ```
   GET /api/conference/:conferenceId/questions/live
   POST /api/conference/:conferenceId/questions/:questionId/answer
   ```

4. **Request Group Access** (after conference ends)
   ```
   POST /api/conference/:conferenceId/group/request
   ```

5. **Access Materials** (after approval)
   ```
   GET /api/conference/:conferenceId/materials
   ```

---

## 🔐 Role-Based Permissions Summary

| Action | SUPER_ADMIN | HOST | SPEAKER | USER |
|--------|-------------|------|---------|------|
| Create conference | ✅ | ✅ | ✅ | ❌ |
| Update conference | ✅ | ✅ | ❌ | ❌ |
| Activate/End conference | ✅ | ✅ | ❌ | ❌ |
| Regenerate QR code | ✅ | ✅ | ✅ | ❌ |
| Add question | ✅ | ✅ | ✅ (own only) | ❌ |
| Update question | ✅ | ✅ (any) | ✅ (own only) | ❌ |
| Delete question | ✅ | ✅ (any) | ✅ (own only) | ❌ |
| Push question live | ✅ | ✅ (any) | ✅ (own only) | ❌ |
| Answer question | ❌ | ❌ | ❌ | ✅ |
| Add media | ✅ | ✅ | ✅ (own only) | ❌ |
| Delete media | ✅ | ✅ (any) | ✅ (own only) | ❌ |
| View analytics | ✅ (all) | ✅ (full) | ✅ (own only) | ❌ |
| Request group join | ❌ | ❌ | ❌ | ✅ |
| Approve group join | ✅ | ❌ | ❌ | ❌ |
| View materials | ✅ | ✅ | ✅ | ✅ (approved only) |

---

## 📝 Important Notes

1. **Authentication Types:**
   - Host uses `/api/host/auth/*` endpoints
   - Speaker uses `/api/speaker/auth/*` endpoints
   - User uses `/api/auth/*` endpoints (regular user auth)

2. **Conference APIs:**
   - Accept Host, Speaker, or User tokens
   - Role is determined automatically based on authentication type and conference ownership

3. **Content Ownership:**
   - HOST can manage all content
   - SPEAKER can only manage content they created
   - Ownership is tracked via `createdByRole` and `createdById`

4. **Live Questions:**
   - Only one question can be live at a time
   - HOST can push any question live
   - SPEAKER can only push their own questions live

5. **Group Access:**
   - Created automatically when conference ends
   - Users must request to join
   - SUPER_ADMIN approves/rejects requests
   - Only approved members can access materials

6. **QR Code Management:**
   - QR codes are automatically generated when a conference is created
   - QR code contains URL: `/api/conference/public/{publicCode}`
   - QR code image is stored as Base64 data URL in `qrCodeImage` field
   - HOST, SPEAKER, or SUPER_ADMIN can regenerate QR codes using the regenerate endpoint
   - Speakers can regenerate QR codes for conferences they are assigned to
   - If QR code generation fails during creation, the conference is still created (QR code can be regenerated later)

7. **Token Management:**
   - Access tokens expire in 1 hour
   - Refresh tokens last 100 years (until logout)
   - Maximum 5 devices per account

---

## 🚀 Quick Start Examples

### Host Creating a Conference

```bash
# 1. Verify email + phone, then Signup (see Host Flow above for OTP steps)
curl -X POST http://localhost:3100/api/host/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "host@example.com",
    "password": "password123",
    "name": "John Host",
    "phone": "+1234567890",
    "emailVerificationToken": "<from verify-otp-signup>",
    "phoneVerificationToken": "<from verify-phone-otp-signup>"
  }'

# 2. Create Conference (QR code is automatically generated)
curl -X POST http://localhost:3100/api/conference \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <host_accessToken>" \
  -d '{
    "title": "Tech Conference 2024",
    "description": "Annual tech conference",
    "speakerIds": []
  }'

# Response includes qrCodeImage field with Base64 encoded QR code
```

### Regenerating QR Code for Existing Conference

```bash
# Regenerate QR code (if it wasn't generated or needs to be updated)
curl -X POST http://localhost:3100/api/conference/:conferenceId/qr-code/regenerate \
  -H "Authorization: Bearer <host_accessToken>"
```

### Speaker Creating a Conference

```bash
# 1. Login
curl -X POST http://localhost:3100/api/speaker/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "speaker@example.com",
    "password": "password123"
  }'

# 2. Create Conference
curl -X POST http://localhost:3100/api/conference \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <speaker_accessToken>" \
  -d '{
    "title": "Lecture Series 2025",
    "description": "Mini conference hosted by the speaker",
    "speakerIds": []
  }'
```

### Speaker Adding a Question

```bash
# 1. Login
curl -X POST http://localhost:3100/api/speaker/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "speaker@example.com",
    "password": "password123"
  }'

# 2. Add Question
curl -X POST http://localhost:3100/api/conference/:conferenceId/questions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <speaker_accessToken>" \
  -d '{
    "questionText": "What is React?",
    "options": [
      {"key": "A", "text": "A library"},
      {"key": "B", "text": "A framework"}
    ],
    "correctOption": "A"
  }'
```

### Host/Speaker Uploading Profile Image

```bash
# Host Profile Image Upload
curl -X POST http://localhost:3100/api/host/auth/profile-image \
  -H "Authorization: Bearer <host_accessToken>" \
  -F "profileImage=@/path/to/image.jpg"

# Speaker Profile Image Upload
curl -X POST http://localhost:3100/api/speaker/auth/profile-image \
  -H "Authorization: Bearer <speaker_accessToken>" \
  -F "profileImage=@/path/to/image.jpg"
```

### User Answering a Question

```bash
# 1. Get Live Question
curl -X GET http://localhost:3100/api/conference/:conferenceId/questions/live \
  -H "Authorization: Bearer <user_accessToken>"

# 2. Answer Question
curl -X POST http://localhost:3100/api/conference/:conferenceId/questions/:questionId/answer \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <user_accessToken>" \
  -d '{
    "selectedOption": "A"
  }'
```

---

## 🔗 Base URLs

- **Host Auth:** `/api/host/auth/*`
- **Speaker Auth:** `/api/speaker/auth/*`
- **Conference:** `/api/conference/*`
- **User Auth:** `/api/auth/*` (existing)

---

For more details on specific endpoints, refer to the controller implementations in `src/controllers/conference/`.


# Sanora Social Features API Documentation

**Base URL:** `https://api.ulearnandearn.com`

---

## 📑 Table of Contents

1. [Overview](#overview)
2. [Posts](#posts)
   - [Create Post](#1-create-post)
   - [Get All Posts](#2-get-all-posts)
   - [Get My Posts](#3-get-my-posts)
   - [Get User Posts](#4-get-user-posts)
   - [Add Comment to Post](#6-add-comment-to-post)
   - [Delete Comment from Post](#7-delete-comment-from-post)
   - [Report Post](#8-report-post)
   - [Delete Post](#9-delete-post)
3. [Reels](#reels)
   - [Create Reel with Video Upload](#10-create-reel-with-video-upload) ⭐ Recommended
   - [Upload Reel Media](#11-upload-reel-media) (Legacy)
   - [Create Reel with Pre-uploaded Media](#12-create-reel-with-pre-uploaded-media) (Legacy)
   - [Get Reels by Content Type](#13-get-reels-by-content-type)
   - [Get User Reels](#14-get-user-reels)
   - [Add Comment to Reel](#16-add-comment-to-reel)
   - [Delete Comment from Reel](#17-delete-comment-from-reel)
   - [Report Reel](#18-report-reel)
   - [Delete Reel](#19-delete-reel)
4. [Reactions](#reactions)
   - [Like/Unlike Post](#likeunlike-post)
   - [Like/Unlike Reel](#likeunlike-reel)
   - [Get Reactions](#get-reactions)
4. [Reactions System](#reactions-system)
5. [Comments System](#comments-system)
6. [Blocking System](#blocking-system)
   - [Block a User](#1-block-a-user)
   - [Unblock a User](#2-unblock-a-user)
   - [List Blocked Users](#3-list-blocked-users)
7. [Reporting System](#reporting-system)
8. [Data Models](#data-models)
9. [Error Handling](#error-handling)
10. [Examples](#examples)

---

## Overview

The Social Features API provides endpoints for creating and managing posts, reels, comments, and reactions. All social interactions support rich media content, reactions (happy, sad, angry, hug, wow, like), and comments.

### Key Features:
- **Posts**: Text and/or media content (images/videos) with reactions and comments
- **Reels**: Video content categorized by type (education/fun) with reactions and comments
- **Reactions**: 6 reaction types (happy, sad, angry, hug, wow, like)
- **Comments**: Text-based comments on posts and reels
- **Reporting**: Report inappropriate content with automatic moderation
- **Blocking**: Block users to prevent seeing their content and prevent them from seeing yours
- **Pagination**: All list endpoints support pagination

---

## Posts

### 1. Create Post

**Method:** `POST`  
**URL:** `/api/posts/create`  
**Authentication:** Required

**Description:**  
Create a new post with optional file uploads. This endpoint combines media upload and post creation in a single API call. Posts can have a caption, media (images/videos), or both.

**Content-Type:** `multipart/form-data`

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Request:**
- **Field Name:** `caption` (string, optional): Post caption (max 2200 characters)
- **Field Name:** `media` (file, optional): Can upload multiple files (up to 10 files)
  - **File Types:** Images (JPEG, PNG, GIF, WebP, etc.) and Videos (MP4, MOV, AVI, etc.)
  - **Max File Size:** 20MB per file

**Example using cURL:**
```bash
curl -X POST https://api.ulearnandearn.com/api/posts/create \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "caption=Check out this amazing sunset! 🌅" \
  -F "media=@/path/to/image1.jpg" \
  -F "media=@/path/to/image2.jpg"
```

**Example using JavaScript (FormData):**
```javascript
const formData = new FormData();
formData.append('caption', 'Check out this amazing sunset! 🌅');
formData.append('media', fileInput1.files[0]); // First image
formData.append('media', fileInput2.files[0]); // Second image (optional)

const response = await fetch('https://api.ulearnandearn.com/api/posts/create', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});

const result = await response.json();
```

**Text-Only Post Example:**
```json
{
  "caption": "Just a text post!"
}
```

**Media-Only Post Example (with file upload):**
```javascript
const formData = new FormData();
formData.append('media', fileInput.files[0]);

const response = await fetch('https://api.ulearnandearn.com/api/posts/create', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});
```

**Note:** 
- When uploading files directly, videos are automatically transcoded to H.264 Baseline Profile 3.1 with yuv420p pixel format and faststart enabled for maximum compatibility
- You can upload up to 10 files in a single request
- Files are automatically uploaded to Cloudinary and the post is created in one step

**Success Response (201):**
```json
{
  "success": true,
  "message": "Post created successfully",
  "data": {
    "post": {
      "id": "post_id_123",
      "userId": "user_id_456",
      "user": {
        "id": "user_id_456",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "email": "john@example.com",
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
      "likes": [[], [], [], [], [], []],
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
- At least one of `caption` or media files must be provided
- Upload files directly using `multipart/form-data` - this handles upload and post creation in one step
- Posts support multiple media items (carousel posts) - upload multiple files in a single request (up to 10 files)
- Videos are automatically transcoded to H.264 Baseline Profile 3.1 with yuv420p pixel format and faststart enabled for maximum compatibility

---

### 2. Get All Posts

**Method:** `GET`  
**URL:** `/api/posts/all`  
**Authentication:** Not required

**Description:**  
Retrieve all posts for the feed. Results are sorted by newest first and include pagination support. Each post includes up to 15 most recent comments (sorted by newest first). The `commentCount` field shows the total number of comments.

**Blocking Behavior:**
- If authenticated, posts from users you've blocked are automatically excluded from the feed
- Posts from users who have blocked you are also excluded from the feed
- Unauthenticated users see all posts (no blocking filters applied)

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Number of posts per page (default: 10)

**Example Request:**
```bash
GET /api/posts/all?page=1&limit=10
```

**Example using cURL:**
```bash
curl -X GET "https://api.ulearnandearn.com/api/posts/all?page=1&limit=10"
```

**Example using JavaScript:**
```javascript
const response = await fetch('https://api.ulearnandearn.com/api/posts/all?page=1&limit=10');
const data = await response.json();
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Posts retrieved successfully",
  "data": {
    "posts": [
      {
        "id": "post_id_123",
        "userId": "user_id_456",
        "user": {
          "id": "user_id_456",
          "firstName": "John",
          "lastName": "Doe",
          "name": "John Doe",
          "email": "john@example.com",
          "profileImage": "https://..."
        },
        "caption": "Check out this amazing sunset! 🌅",
        "media": [...],
        "likes": [[], [], [], [], [], []],
        "comments": [...], // Up to 15 most recent comments
        "likeCount": 1,
        "commentCount": 2, // Total comment count (may be more than comments array length)
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

**Error Responses:**
- `500`: Failed to retrieve posts

---

### 3. Get My Posts

**Method:** `GET`  
**URL:** `/api/posts/me`  
**Authentication:** Required

**Description:**  
Get all posts created by the currently authenticated user. Each post includes up to 15 most recent comments (sorted by newest first). The `commentCount` field shows the total number of comments.

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Number of posts per page (default: 10)

**Success Response (200):**
```json
{
  "success": true,
  "message": "My posts retrieved successfully",
  "data": {
    "user": {
      "id": "user_id_456",
      "name": "John Doe",
      "email": "john@example.com",
      "profileImage": "https://..."
    },
    "posts": [...],
    "pagination": {...}
  }
}
```

Same structure as "Get All Posts" but includes a `user` object and only posts from the authenticated user.

**Error Responses:**
- `401`: Not authenticated
- `500`: Failed to retrieve posts

---

### 4. Get User Posts

**Method:** `GET`  
**URL:** `/api/posts/user/:id`  
**Authentication:** Not required

**Description:**  
Get all posts created by a specific user. Each post includes up to 15 most recent comments (sorted by newest first). The `commentCount` field shows the total number of comments.

**Blocking Behavior:**
- If you have blocked the user or they have blocked you, the request will return a `403 Forbidden` error
- You cannot view posts from blocked users or users who have blocked you
- Unauthenticated users can view any user's posts (no blocking checks)

**URL Parameters:**
- `id` (string, required): User ID

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Number of posts per page (default: 10)

**Example Request:**
```bash
GET /api/posts/user/user_id_456?page=1&limit=10
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User posts retrieved successfully",
  "data": {
    "user": {
      "id": "user_id_456",
      "name": "John Doe",
      "email": "john@example.com",
      "profileImage": "https://..."
    },
    "posts": [...],
    "pagination": {...}
  }
}
```

Same structure as "Get All Posts" but includes a `user` object and only posts from the specified user.

**Error Responses:**
- `400`: Invalid user ID
- `403`: You cannot view posts from a blocked user / Content not available
- `404`: User not found
- `500`: Failed to retrieve posts

---

### 5. React to Post

**Method:** `POST`  
**URL:** `/api/posts/:id/like`  
**Authentication:** Required

**Description:**  
Add, update, or remove a reaction on a post. If the user hasn't reacted, it adds a reaction. If the user has reacted with the same reaction type, it removes it. If the user has reacted with a different reaction type, it updates to the new reaction.

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**URL Parameters:**
- `id` (string, required): Post ID

**Request Body:**
```json
{
  "reaction": "happy"
}
```

**Reaction Types:**
- `happy` - Happy reaction 😊
- `sad` - Sad reaction 😢
- `angry` - Angry reaction 😠
- `hug` - Hug reaction 🤗
- `wow` - Wow reaction 😲
- `like` - Like reaction 👍 (default if not specified)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Post liked successfully",
  "data": {
    "post": {
      "id": "post_id_123",
      "userId": "user_id_456",
      "user": {...},
      "caption": "Check out this amazing sunset! 🌅",
      "media": [...],
      "likes": [[], [], [], [], [], []],
      "comments": [...],
      "likeCount": 1,
      "commentCount": 2,
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    "action": "liked",
    "reaction": "happy",
    "isLiked": true
  }
}
```

**Response Fields:**
- `action` (string): Action performed - "liked", "unliked", or "reaction_updated"
- `reaction` (string|null): Current reaction type (null if unliked)
- `isLiked` (boolean): Whether the post is currently liked/reacted by the user

**Behavior:**
- If user hasn't reacted: Adds the reaction → `action: "liked"`
- If user clicks same reaction again: Removes the reaction → `action: "unliked"`
- If user clicks different reaction: Updates to new reaction → `action: "reaction_updated"`

**Error Responses:**
- `400`: Invalid post ID, invalid reaction type
- `401`: Not authenticated
- `404`: Post not found
- `500`: Failed to toggle like on post

**Example using cURL:**
```bash
curl -X POST https://api.ulearnandearn.com/api/posts/post_id_123/like \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reaction": "happy"}'
```

**Example using JavaScript:**
```javascript
const response = await fetch('https://api.ulearnandearn.com/api/posts/post_id_123/like', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ reaction: 'happy' })
});

const data = await response.json();
```

---

### 6. Add Comment to Post

**Method:** `POST`  
**URL:** `/api/posts/:id/comment`  
**Authentication:** Required

**Description:**  
Add a text comment to a post. The response includes the newly added comment and the post with up to 15 most recent comments (sorted by newest first).

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**URL Parameters:**
- `id` (string, required): Post ID

**Request Body:**
```json
{
  "text": "This is an amazing post! Great work! 👏"
}
```

**Fields:**
- `text` (string, required): Comment text (max 1000 characters)

**Success Response (201):**
```json
{
  "success": true,
  "message": "Comment added successfully",
  "data": {
    "comment": {
      "id": "comment_id_789",
      "userId": "user_id_789",
      "user": {
        "id": "user_id_789",
        "firstName": "Jane",
        "lastName": "Smith",
        "name": "Jane Smith",
        "profileImage": "https://..."
      },
      "text": "This is an amazing post! Great work! 👏",
      "createdAt": "2024-01-15T11:30:00.000Z"
    },
    "post": {
      "id": "post_id_123",
      "userId": "user_id_456",
      "user": {...},
      "caption": "Check out this amazing sunset! 🌅",
      "media": [...],
      "likes": [[], [], [], [], [], []],
      "comments": [
        {
          "_id": "comment_id_789",
          "userId": {...},
          "text": "This is an amazing post! Great work! 👏",
          "createdAt": "2024-01-15T11:30:00.000Z"
        }
      ], // Up to 15 most recent comments
      "likeCount": 1,
      "commentCount": 1, // Total comment count (may be more than comments array length)
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T11:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Invalid post ID, comment text is required, comment text too long
- `401`: Not authenticated
- `404`: Post not found
- `500`: Failed to add comment

---

### 7. Delete Comment from Post

**Method:** `DELETE`  
**URL:** `/api/posts/:id/comment/:commentId`  
**Authentication:** Required

**Description:**  
Delete a comment from a post. Only the comment owner or post owner can delete comments.

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**URL Parameters:**
- `id` (string, required): Post ID
- `commentId` (string, required): Comment ID

**Success Response (200):**
```json
{
  "success": true,
  "message": "Comment deleted successfully"
}
```

**Error Responses:**
- `400`: Invalid post ID or comment ID
- `401`: Not authenticated
- `403`: You do not have permission to delete this comment
- `404`: Post not found, comment not found
- `500`: Failed to delete comment

---

### 8. Report Post

**Method:** `POST`  
**URL:** `/api/posts/:id/report`  
**Authentication:** Required

**Description:**  
Report a post for inappropriate content. When a user reports a post, it is immediately removed from their feed. If 2 users report the same post with the same reason, the post is automatically deleted from the database and all associated media is removed from Cloudinary.

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**URL Parameters:**
- `id` (string, required): Post ID

**Request Body:**
```json
{
  "reason": "bullying_harassment_or_abuse"
}
```

**Report Reasons:**
- `problem_involving_someone_under_18` - Problem involving someone under 18
- `bullying_harassment_or_abuse` - Bullying, harassment or abuse
- `suicide_or_self_harm` - Suicide or self-harm
- `violent_hateful_or_disturbing_content` - Violent, hateful or disturbing content
- `adult_content` - Adult content
- `scam_fraud_or_false_information` - Scam, fraud or false information
- `intellectual_property` - Intellectual property
- `political` - Political content
- `i_dont_want_to_see_this` - I don't want to see this

**Success Response (200):**
```json
{
  "success": true,
  "message": "Post reported successfully",
  "data": {
    "postDeleted": false
  }
}
```

**Response when post is deleted (2 reports with same reason):**
```json
{
  "success": true,
  "message": "Post reported and removed due to multiple reports with the same reason",
  "data": {
    "postDeleted": true
  }
}
```

**Behavior:**
- Reported posts are immediately removed from the reporting user's feed
- Users cannot report their own posts
- Users cannot report the same post twice
- When 2 users report with the same reason, the post is permanently deleted
- All Cloudinary media associated with deleted posts is automatically removed

**Error Responses:**
- `400`: Invalid post ID, invalid reason, you cannot report your own post, you have already reported this post
- `401`: Not authenticated
- `404`: Post not found
- `500`: Failed to report post

**Example using cURL:**
```bash
curl -X POST https://api.ulearnandearn.com/api/posts/post_id_123/report \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "bullying_harassment_or_abuse"}'
```

---

### 9. Delete Post

**Method:** `DELETE`  
**URL:** `/api/posts/:id`  
**Authentication:** Required

**Description:**  
Delete a post. Only the post owner can delete their own post. This will also delete all associated media from Cloudinary.

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**URL Parameters:**
- `id` (string, required): Post ID

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
- `403`: You do not have permission to delete this post
- `404`: Post not found
- `500`: Failed to delete post

---

## Reels

### 10. Create Reel with Video Upload ⭐ Recommended

**Method:** `POST`  
**URL:** `/api/reels/create`  
**Authentication:** Required

**Description:**  
Create a new reel with video upload in a single API call. This endpoint combines video upload, transcoding, and reel creation in one step. Videos are automatically transcoded to H.264 Baseline Profile 3.1 with yuv420p pixel format and faststart enabled for maximum Android and cross-platform compatibility.

**Content-Type:** `multipart/form-data`

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Request:**
- **Field Name:** `media` (file, required): Video file
  - **File Types:** MP4, MOV, AVI, and other video formats
  - **Max File Size:** 20MB
- **Field Name:** `caption` (string, optional): Reel caption (max 2200 characters)
- **Field Name:** `contentType` (string, required): Content type - must be "education" or "fun"
- **Field Name:** `visibility` (string, optional): Visibility setting - "public", "followers", or "private" (default: "public")

**Example using cURL:**
```bash
curl -X POST https://api.ulearnandearn.com/api/reels/create \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "media=@/path/to/video.mp4" \
  -F "caption=Check out this amazing tutorial! 🎓" \
  -F "contentType=education" \
  -F "visibility=public"
```

**Example using JavaScript (FormData):**
```javascript
const formData = new FormData();
formData.append('media', videoFileInput.files[0]);
formData.append('caption', 'Check out this amazing tutorial! 🎓');
formData.append('contentType', 'education');
formData.append('visibility', 'public');

const response = await fetch('https://api.ulearnandearn.com/api/reels/create', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});

const result = await response.json();
```

**Note:** 
- Videos are automatically transcoded to H.264 Baseline Profile 3.1 with yuv420p pixel format and faststart enabled for maximum Android and cross-platform compatibility
- The video file is uploaded to Cloudinary, transcoded if needed, and the reel is created in one step
- This is the recommended approach as it simplifies the workflow

**Success Response (201):**
```json
{
  "success": true,
  "message": "Reel created successfully",
  "data": {
    "reel": {
      "id": "reel_id_123",
      "userId": "user_id_456",
      "user": {
        "id": "user_id_456",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "email": "john@example.com",
        "profileImage": "https://..."
      },
      "caption": "Check out this amazing tutorial! 🎓",
      "media": {
        "url": "https://res.cloudinary.com/...",
        "publicId": "user_uploads/user_id/reels/abc123",
        "thumbnailUrl": "https://...",
        "type": "video",
        "format": "mp4",
        "duration": 30.5,
        "dimensions": {
          "width": 1280,
          "height": 720
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
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Video file is required, contentType is required, invalid contentType, invalid file type (not video)
- `401`: Not authenticated
- `500`: Failed to create reel

---

### 11. Upload Reel Media (Legacy)

**Method:** `POST`  
**URL:** `/api/reels/upload-media`  
**Authentication:** Required

**Description:**  
Upload video media for a reel. This is a legacy endpoint that requires a separate call to create the reel. **For new implementations, use the combined endpoint `/api/reels/create` instead.**

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Request Body:**
- **Content-Type:** `multipart/form-data`
- **Field:** `media` (file) - Video file

**Supported Formats:**
- Videos: MP4, MOV, AVI

**Note:** Videos are automatically transcoded to H.264 Baseline Profile 3.1 with yuv420p pixel format and faststart enabled for maximum compatibility across devices and browsers.

**Success Response (200):**
```json
{
  "success": true,
  "message": "Reel media uploaded successfully",
  "data": {
    "url": "https://res.cloudinary.com/your-cloud/video/upload/v1234567890/user_uploads/user_id/reels/abc123.mp4",
    "publicId": "user_uploads/user_id/reels/abc123",
    "type": "video",
    "format": "mp4",
    "duration": 30.5,
    "width": 1920,
    "height": 1080,
    "fileSize": 5242880,
    "mediaId": "media_record_id"
  }
}
```

**Response Fields:**
- `url` (string): Public URL of the uploaded video
- `publicId` (string): Cloudinary public ID
- `type` (string): Always "video"
- `format` (string): Video format (e.g., "mp4")
- `duration` (number): Video duration in seconds
- `width` (number): Video width in pixels
- `height` (number): Video height in pixels
- `fileSize` (number): File size in bytes
- `mediaId` (string): Database record ID

**Note:** Thumbnail URL is not automatically generated during upload. You can generate thumbnails using Cloudinary transformations if needed.

**Error Responses:**
- `400`: No file provided, invalid file type (not video), file too large
- `401`: Not authenticated
- `500`: Upload failed

---

### 12. Create Reel with Pre-uploaded Media (Legacy)

**Method:** `POST`  
**URL:** `/api/reels/create-with-media`  
**Authentication:** Required

**Description:**  
Create a new reel using pre-uploaded media. This is a legacy endpoint that requires media to be uploaded first using `/api/reels/upload-media`. **For new implementations, use the combined endpoint `/api/reels/create` instead.**

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**Request Body:**
```json
{
  "caption": "Check out this amazing tutorial! 🎓",
  "media": {
    "url": "https://res.cloudinary.com/your-cloud/video/upload/v1234567890/user_uploads/user_id/reels/abc123.mp4",
    "publicId": "user_uploads/user_id/reels/abc123",
    "thumbnailUrl": "",
    "type": "video",
    "format": "mp4",
    "duration": 30.5,
    "width": 1920,
    "height": 1080,
    "fileSize": 5242880
  },
  "contentType": "education",
  "visibility": "public"
}
```

**Fields:**
- `caption` (string, optional): Reel caption (max 2200 characters)
- `media` (object, required): Video media object from upload endpoint. Must include:
  - `url` (string, required): Video URL from upload endpoint
  - `publicId` (string, required): Cloudinary public ID from upload endpoint
  - `thumbnailUrl` (string, optional): Thumbnail URL (can be empty string)
  - `type` (string, required): Must be "video"
  - `format` (string, optional): Video format (e.g., "mp4")
  - `duration` (number, optional): Video duration in seconds
  - `width` (number, optional): Video width in pixels
  - `height` (number, optional): Video height in pixels
  - `fileSize` (number, optional): File size in bytes
- `contentType` (string, required): Content type - "education" or "fun"
- `visibility` (string, optional): Visibility setting - "public", "followers", or "private" (default: "public")

**Success Response (201):**
```json
{
  "success": true,
  "message": "Reel created successfully",
  "data": {
    "reel": {
      "id": "reel_id_123",
      "userId": "user_id_456",
      "user": {
        "id": "user_id_456",
        "firstName": "John",
        "lastName": "Doe",
        "name": "John Doe",
        "email": "john@example.com",
        "profileImage": "https://..."
      },
      "caption": "Check out this amazing tutorial! 🎓",
      "media": {
        "url": "https://res.cloudinary.com/...",
        "publicId": "user_uploads/user_id/reels/abc123",
        "thumbnailUrl": "",
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
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

**Error Responses:**
- `400`: Invalid contentType, missing media, invalid media structure, media type must be "video"
- `401`: Not authenticated
- `500`: Failed to create reel

---

### 13. Get Reels by Content Type

**Method:** `GET`  
**URL:** `/api/reels`  
**Authentication:** Not required

**Description:**  
Retrieve reels filtered by contentType. Only public reels are returned. Each reel includes up to 15 most recent comments (sorted by newest first). The `commentCount` field shows the total number of comments.

**Blocking Behavior:**
- If authenticated, reels from users you've blocked are automatically excluded from the feed
- Reels from users who have blocked you are also excluded from the feed
- Unauthenticated users see all public reels (no blocking filters applied)

**Query Parameters:**
- `contentType` (string, required): Content type - "education" or "fun"
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Number of reels per page (default: 10)

**Example Request:**
```bash
GET /api/reels?contentType=education&page=1&limit=10
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Reels retrieved successfully",
  "data": {
    "reels": [
      {
        "id": "reel_id_123",
        "userId": "user_id_456",
        "user": {...},
        "caption": "Check out this amazing tutorial! 🎓",
        "media": {...},
        "contentType": "education",
        "visibility": "public",
        "views": 150,
        "likes": [[], [], [], [], [], []],
        "comments": [...], // Up to 15 most recent comments
        "likeCount": 25,
        "commentCount": 5, // Total comment count (may be more than comments array length)
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 3,
      "totalReels": 30,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

**Error Responses:**
- `400`: Invalid contentType. Must be one of: education, fun
- `500`: Failed to retrieve reels

---

### 14. Get User Reels

**Method:** `GET`  
**URL:** `/api/reels/user/:id`  
**Authentication:** Not required

**Description:**  
Get all reels created by a specific user. Returns all reels regardless of visibility setting. Each reel includes up to 15 most recent comments (sorted by newest first). The `commentCount` field shows the total number of comments.

**Blocking Behavior:**
- If you have blocked the user or they have blocked you, the request will return a `403 Forbidden` error
- You cannot view reels from blocked users or users who have blocked you
- Unauthenticated users can view any user's reels (no blocking checks)

**URL Parameters:**
- `id` (string, required): User ID

**Query Parameters:**
- `page` (number, optional): Page number (default: 1)
- `limit` (number, optional): Number of reels per page (default: 10)

**Example Request:**
```bash
GET /api/reels/user/user_id_456?page=1&limit=10
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User reels retrieved successfully",
  "data": {
    "user": {
      "id": "user_id_456",
      "name": "John Doe",
      "email": "john@example.com",
      "profileImage": "https://..."
    },
    "reels": [...],
    "pagination": {...}
  }
}
```

Same structure as "Get Reels by Content Type" but includes a `user` object and only includes reels from the specified user. Returns all reels regardless of visibility setting.

**Error Responses:**
- `400`: Invalid user ID
- `403`: You cannot view reels from a blocked user / Content not available
- `404`: User not found
- `500`: Failed to retrieve user reels

---

### 15. React to Reel

**Method:** `POST`  
**URL:** `/api/reels/:id/like`  
**Authentication:** Required

**Description:**  
Add, update, or remove a reaction on a reel. Same behavior as post reactions.

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**URL Parameters:**
- `id` (string, required): Reel ID

**Request Body:**
```json
{
  "reaction": "wow"
}
```

**Reaction Types:** Same as posts (happy, sad, angry, hug, wow, like)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Reel liked successfully",
  "data": {
    "reel": {
      "id": "reel_id_123",
      "userId": "user_id_456",
      "user": {...},
      "caption": "Check out this amazing tutorial! 🎓",
      "media": {...},
      "contentType": "education",
      "visibility": "public",
      "views": 150,
      "likes": [[], [], [], [], [], []],
      "comments": [...], // Up to 15 most recent comments
      "likeCount": 1,
      "commentCount": 5, // Total comment count (may be more than comments array length)
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    "action": "liked",
    "reaction": "wow",
    "isLiked": true
  }
}
```

**Error Responses:**
- `400`: Invalid reel ID, invalid reaction type
- `401`: Not authenticated
- `404`: Reel not found
- `500`: Failed to toggle like on reel

---

### 16. Add Comment to Reel

**Method:** `POST`  
**URL:** `/api/reels/:id/comment`  
**Authentication:** Required

**Description:**  
Add a text comment to a reel. The response includes the newly added comment and the reel with up to 15 most recent comments (sorted by newest first).

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**URL Parameters:**
- `id` (string, required): Reel ID

**Request Body:**
```json
{
  "text": "This is an amazing tutorial! Thank you! 🙏"
}
```

**Fields:**
- `text` (string, required): Comment text (max 500 characters)

**Success Response (201):**
Same structure as post comments but for reels.

**Error Responses:**
- `400`: Invalid reel ID, comment text is required, comment text too long
- `401`: Not authenticated
- `404`: Reel not found
- `500`: Failed to add comment

---

### 17. Delete Comment from Reel

**Method:** `DELETE`  
**URL:** `/api/reels/:id/comment/:commentId`  
**Authentication:** Required

**Description:**  
Delete a comment from a reel. Only the comment owner or reel owner can delete comments.

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**URL Parameters:**
- `id` (string, required): Reel ID
- `commentId` (string, required): Comment ID

**Success Response (200):**
```json
{
  "success": true,
  "message": "Comment deleted successfully"
}
```

**Error Responses:**
- `400`: Invalid reel ID or comment ID
- `401`: Not authenticated
- `403`: You do not have permission to delete this comment
- `404`: Reel not found, comment not found
- `500`: Failed to delete comment

---

### 18. Report Reel

**Method:** `POST`  
**URL:** `/api/reels/:id/report`  
**Authentication:** Required

**Description:**  
Report a reel for inappropriate content. When a user reports a reel, it is immediately removed from their feed. If 2 users report the same reel with the same reason, the reel is automatically deleted from the database and all associated media (video and thumbnail) is removed from Cloudinary.

**Headers:**
```
Authorization: Bearer your_access_token_here
Content-Type: application/json
```

**URL Parameters:**
- `id` (string, required): Reel ID

**Request Body:**
```json
{
  "reason": "adult_content"
}
```

**Report Reasons:** Same as posts (see [Report Post](#9-report-post) for full list)

**Success Response (200):**
```json
{
  "success": true,
  "message": "Reel reported successfully",
  "data": {
    "reelDeleted": false
  }
}
```

**Response when reel is deleted (2 reports with same reason):**
```json
{
  "success": true,
  "message": "Reel reported and removed due to multiple reports with the same reason",
  "data": {
    "reelDeleted": true
  }
}
```

**Behavior:**
- Reported reels are immediately removed from the reporting user's feed
- Users cannot report their own reels
- Users cannot report the same reel twice
- When 2 users report with the same reason, the reel is permanently deleted
- All Cloudinary media (video and thumbnail) associated with deleted reels is automatically removed

**Error Responses:**
- `400`: Invalid reel ID, invalid reason, you cannot report your own reel, you have already reported this reel
- `401`: Not authenticated
- `404`: Reel not found
- `500`: Failed to report reel

**Example using cURL:**
```bash
curl -X POST https://api.ulearnandearn.com/api/reels/reel_id_123/report \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "adult_content"}'
```

---

### 19. Delete Reel

**Method:** `DELETE`  
**URL:** `/api/reels/:id`  
**Authentication:** Required

**Description:**  
Delete a reel. Only the reel owner can delete their own reel. This will also delete all associated media (video and thumbnail) from Cloudinary.

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**URL Parameters:**
- `id` (string, required): Reel ID

**Success Response (200):**
```json
{
  "success": true,
  "message": "Reel deleted successfully"
}
```

**Error Responses:**
- `400`: Invalid reel ID
- `401`: Not authenticated
- `403`: You do not have permission to delete this reel
- `404`: Reel not found
- `500`: Failed to delete reel

---

## Reactions System

### Overview

The reactions system allows users to express their feelings about posts and reels using 6 different reaction types. The system now uses a separate `Like` collection for better performance and scalability.

### Available Reactions

1. **happy** 😊 - Express happiness or joy
2. **sad** 😢 - Express sadness or empathy
3. **angry** 😠 - Express anger or frustration
4. **hug** 🤗 - Express support or comfort
5. **wow** 😲 - Express surprise or amazement
6. **like** 👍 - Standard like reaction (default)

### API Endpoints

#### Like/Unlike Post
**URL:** `POST /api/likes/post/:id`  
**Authentication:** Required

**Request Body:**
```json
{
  "reaction": "like"  // Optional, defaults to 'like'
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Post liked successfully",
  "data": {
    "action": "liked",  // or "unliked" or "reaction_updated"
    "reaction": "happy",  // null if unliked
    "likeCount": 42,
    "isLiked": true
  }
}
```

#### Like/Unlike Reel
**URL:** `POST /api/likes/reel/:id`  
**Authentication:** Required

**Request Body:**
```json
{
  "reaction": "happy"  // Optional, defaults to 'like'
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Reel liked successfully",
  "data": {
    "action": "liked",  // or "unliked" or "reaction_updated"
    "reaction": "happy",  // null if unliked
    "likeCount": 24,
    "isLiked": true
  }
}
```

#### Get Reactions
**URL:** `GET /api/likes/:content(post|reel)/:contentId`  
**Authentication:** Optional

**URL Parameters:**
- `content`: Either "post" or "reel"
- `contentId`: ID of the post or reel

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "happy": {
      "count": 5,
      "users": [
        {
          "id": "user_id_1",
          "name": "John Doe",
          "profileImage": "https://..."
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

### Reaction Behavior

- **First Reaction**: When a user reacts for the first time, the reaction is added
- **Same Reaction Again**: If the user clicks the same reaction again, it removes the reaction (unlike)
- **Different Reaction**: If the user clicks a different reaction, it updates to the new reaction
- **One Reaction Per User**: Each user can only have one reaction at a time per post/reel
- **Performance Optimized**: The system maintains a `likeCount` on posts/reels for quick access

### Data Structure

#### Post/Reel Model
```json
{
  "_id": "post_id_123",
  "likeCount": 15,
  "comments": [...],
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updatedAt": "2023-01-01T00:00:00.000Z"
}
```

#### Like Model
```json
{
  "_id": "like_id_123",
  "user": "user_id_1",
  "content": "post",  // or "reel"
  "contentId": "post_id_123",
  "reaction": "happy",
  "createdAt": "2023-01-01T00:00:00.000Z",
  "updatedAt": "2023-01-01T00:00:00.000Z"
}
```

### Migration

A migration script is available to transfer existing likes to the new system:

```bash
node scripts/migrateLikes.js
```

### Best Practices

1. **Client-Side Caching**: Cache the user's reaction state locally to provide immediate feedback
2. **Optimistic Updates**: Update the UI optimistically before the API responds
3. **Error Handling**: Handle cases where the API call fails and revert UI changes if needed
4. **Rate Limiting**: Implement client-side rate limiting to prevent spam
5. **Offline Support**: Queue reactions when offline and sync when back online
                     likes[2].includes(userId) ? 'angry' :
                     likes[3].includes(userId) ? 'hug' :
                     likes[4].includes(userId) ? 'wow' :
                     likes[5].includes(userId) ? 'like' : null;
```

---

## Comments System

### Overview

The comments system allows users to add text-based comments to posts and reels.

### Comment Data Structure

Each comment contains:
```json
{
  "_id": "comment_id_123",
  "userId": {
    "_id": "user_id_456",
    "firstName": "John",
    "lastName": "Doe",
    "name": "John Doe",
    "profileImage": "https://..."
  },
  "text": "This is an amazing post! Great work! 👏",
  "createdAt": "2024-01-15T11:30:00.000Z"
}
```

### Comment Limits

- **Character Limits**:
  - **Posts**: Maximum 1000 characters per comment
  - **Reels**: Maximum 500 characters per comment
- **Fetch Limit**: Only the **15 most recent comments** are returned in API responses. Comments are sorted by `createdAt` in descending order (newest first).
- **Total Count**: The `commentCount` field always reflects the total number of comments, even if more than 15 exist.

**Note:** When a post or reel has more than 15 comments, only the 15 most recent ones are included in the `comments` array. The `commentCount` field will show the actual total, allowing clients to display "View more comments" functionality if needed.

### Comment Permissions

- **Add Comment**: Any authenticated user can add comments
- **Delete Comment**: Only the comment owner or post/reel owner can delete comments

---

## Blocking System

### Overview

The blocking system allows users to block other users, preventing mutual interaction and content visibility. When a user blocks another user:

1. **Content Visibility**: Blocked users' posts, reels, and stories are automatically excluded from feeds
2. **Profile Access**: Blocked users cannot view each other's content when accessing specific user profiles
3. **Bidirectional**: Blocking works both ways - if User A blocks User B, User B also cannot see User A's content
4. **Automatic Cleanup**: When blocking, users are automatically removed from each other's friends list and any pending friend requests are cancelled
5. **Privacy**: Users cannot see who has blocked them - error messages are generic to protect privacy

### Blocking Behavior by Feature

#### Posts
- **Feed (`/api/posts/all`)**: Posts from blocked users are automatically filtered out
- **User Posts (`/api/posts/user/:id`)**: Returns `403 Forbidden` with generic message if either user has blocked the other (users cannot see who blocked them)

#### Reels
- **Feed (`/api/reels`)**: Reels from blocked users are automatically filtered out
- **User Reels (`/api/reels/user/:id`)**: Returns `403 Forbidden` with generic message if either user has blocked the other (users cannot see who blocked them)

#### Stories
- **Friends Stories (`/api/stories/friends`)**: Stories from blocked users are automatically filtered out
- **User Stories (`/api/stories/user/:id`)**: Returns `403 Forbidden` with generic message if either user has blocked the other (users cannot see who blocked them)

#### Friends System
- Blocked users cannot send friend requests to each other
- Blocked users cannot accept friend requests from each other
- Blocked users are automatically removed from each other's friends list when blocking occurs
- Blocked users are excluded from friend suggestions

#### Chat System
- Blocked users cannot create conversations with each other
- Blocked users cannot send messages to each other
- Existing conversations with blocked users are filtered from conversation lists

#### Search
- Blocked users are excluded from search results
- Users who have blocked you are also excluded from your search results (users cannot see who blocked them)

### Blocking Endpoints

#### 1. Block a User

**Method:** `POST`  
**URL:** `/api/user/block/:blockedUserId`  
**Authentication:** Required

**Description:**  
Block a user. When you block a user, they are automatically removed from your friends list (if they were a friend), any pending friend requests between you are cancelled, and you will no longer see their content in feeds. The blocked user will also not be able to see your content.

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**URL Parameters:**
- `blockedUserId` (string, required): ID of the user to block

**Example Request:**
```bash
POST /api/user/block/user_id_123
```

**Example using cURL:**
```bash
curl -X POST https://api.ulearnandearn.com/api/user/block/user_id_123 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Example using JavaScript:**
```javascript
const response = await fetch('https://api.ulearnandearn.com/api/user/block/user_id_123', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const data = await response.json();
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User blocked successfully",
  "data": {
    "blockedUser": {
      "_id": "user_id_123",
      "firstName": "Jane",
      "lastName": "Smith",
      "name": "Jane Smith",
      "profileImage": "https://...",
      "email": "jane@example.com"
    },
    "blockedUsers": [
      {
        "_id": "user_id_123",
        "firstName": "Jane",
        "lastName": "Smith",
        "name": "Jane Smith",
        "profileImage": "https://...",
        "email": "jane@example.com"
      }
    ]
  }
}
```

**Error Responses:**
- `400`: Invalid user ID, you cannot block yourself, user is already blocked
- `401`: Not authenticated
- `404`: User not found
- `500`: Failed to block user

**Note:** 
- Blocking automatically removes the user from your friends list (if they were a friend)
- Any pending friend requests between you and the blocked user are automatically cancelled
- Blocking is bidirectional - the blocked user cannot see your content either

---

#### 2. Unblock a User

**Method:** `DELETE`  
**URL:** `/api/user/block/:blockedUserId`  
**Authentication:** Required

**Description:**  
Unblock a previously blocked user. After unblocking, you will be able to see their content again, and they will be able to see yours. However, you will need to send a new friend request if you want to be friends again.

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**URL Parameters:**
- `blockedUserId` (string, required): ID of the user to unblock

**Example Request:**
```bash
DELETE /api/user/block/user_id_123
```

**Example using cURL:**
```bash
curl -X DELETE https://api.ulearnandearn.com/api/user/block/user_id_123 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Example using JavaScript:**
```javascript
const response = await fetch('https://api.ulearnandearn.com/api/user/block/user_id_123', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const data = await response.json();
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "User unblocked successfully",
  "data": {
    "unblockedUser": {
      "_id": "user_id_123",
      "firstName": "Jane",
      "lastName": "Smith",
      "name": "Jane Smith",
      "profileImage": "https://...",
      "email": "jane@example.com"
    },
    "blockedUsers": []
  }
}
```

**Error Responses:**
- `400`: Invalid user ID, user is not blocked
- `401`: Not authenticated
- `404`: User not found
- `500`: Failed to unblock user

**Note:** 
- Unblocking does not automatically restore the friendship - you'll need to send a new friend request
- After unblocking, both users can see each other's content again

---

#### 3. List Blocked Users

**Method:** `GET`  
**URL:** `/api/user/blocked`  
**Authentication:** Required

**Description:**  
Get a list of all users you have blocked. Returns an array of blocked user objects with their basic information.

**Headers:**
```
Authorization: Bearer your_access_token_here
```

**Example Request:**
```bash
GET /api/user/blocked
```

**Example using cURL:**
```bash
curl -X GET https://api.ulearnandearn.com/api/user/blocked \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Example using JavaScript:**
```javascript
const response = await fetch('https://api.ulearnandearn.com/api/user/blocked', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  }
});

const data = await response.json();
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Blocked users retrieved successfully",
  "data": {
    "blockedUsers": [
      {
        "_id": "user_id_123",
        "firstName": "Jane",
        "lastName": "Smith",
        "name": "Jane Smith",
        "profileImage": "https://...",
        "email": "jane@example.com",
        "bio": "Software developer",
        "currentCity": "San Francisco, CA",
        "hometown": "New York, NY"
      },
      {
        "_id": "user_id_456",
        "firstName": "Bob",
        "lastName": "Johnson",
        "name": "Bob Johnson",
        "profileImage": "https://...",
        "email": "bob@example.com",
        "bio": "",
        "currentCity": "",
        "hometown": ""
      }
    ],
    "count": 2
  }
}
```

**Response Fields:**
- `blockedUsers` (array): Array of blocked user objects
- `count` (number): Total number of blocked users

**Error Responses:**
- `401`: Not authenticated
- `404`: User not found
- `500`: Failed to retrieve blocked users

---

### Important Notes

1. **Bidirectional Blocking**: Blocking is bidirectional - if User A blocks User B, both users cannot see each other's content
2. **Feed Filtering**: Blocked content is automatically filtered from feeds when the user is authenticated
3. **Profile Access**: Attempting to access a blocked user's profile content will return a `403 Forbidden` error with a generic message (users cannot see who blocked them)
4. **Automatic Cleanup**: When blocking, the system automatically:
   - Removes users from each other's friends list
   - Cancels any pending friend requests between them
5. **Unblocking**: Users can unblock each other at any time, which restores normal interaction capabilities

---

## Reporting System

### Overview

The reporting system allows users to report inappropriate posts and reels. The system automatically moderates content based on user reports, removing reported content from user feeds and permanently deleting content when multiple users report with the same reason.

### Report Reasons

Users can report content for the following reasons:

1. **problem_involving_someone_under_18** - Content involving someone under 18
2. **bullying_harassment_or_abuse** - Bullying, harassment or abuse
3. **suicide_or_self_harm** - Suicide or self-harm content
4. **violent_hateful_or_disturbing_content** - Violent, hateful or disturbing content
5. **adult_content** - Adult content
6. **scam_fraud_or_false_information** - Scam, fraud or false information
7. **intellectual_property** - Intellectual property violation
8. **political** - Political content
9. **i_dont_want_to_see_this** - User preference (don't want to see this content)

### Reporting Behavior

#### Immediate Effects
- **Feed Removal**: When a user reports a post or reel, it is immediately removed from their feed
- **One Report Per User**: Each user can only report the same content once
- **Self-Reporting Prevention**: Users cannot report their own content

#### Automatic Moderation
- **Threshold**: When 2 users report the same content with the **same reason**, the content is automatically deleted
- **Permanent Deletion**: Deleted content is permanently removed from the database
- **Media Cleanup**: All associated media (images, videos, thumbnails) is automatically deleted from Cloudinary

### Feed Filtering

Reported content is automatically filtered from user feeds:

- **Get All Posts** (`/api/posts/all`): Excludes posts reported by the authenticated user
- **Get Reels** (`/api/reels`): Excludes reels reported by the authenticated user
- **Get User Posts** (`/api/posts/user/:id`): Excludes posts reported by the viewing user
- **Get User Reels** (`/api/reels/user/:id`): Excludes reels reported by the viewing user

**Note:** Feed filtering only applies when the user is authenticated. Unauthenticated users see all content.

**Combined Filtering:**
- Feeds apply both reporting and blocking filters simultaneously
- Content is excluded if it's either reported by the user OR from a blocked user
- This ensures users only see content they want to see

### Report Data Structure

Each report contains:
```json
{
  "_id": "report_id_123",
  "userId": "user_id_456",
  "contentId": "post_id_789",
  "contentType": "post",
  "reason": "bullying_harassment_or_abuse",
  "createdAt": "2024-01-15T12:00:00.000Z",
  "updatedAt": "2024-01-15T12:00:00.000Z"
}
```

## User Reports

### Report a User

**Endpoint:** `POST /api/reports/users/:userId/report`  
**Authentication:** Required  
**Rate Limit:** 5 reports per minute per user

Report a user for violating community guidelines. Each user can only report another user once.

**Request Body:**
```json
{
  "reason": "bullying_harassment",
  "description": "User is sending abusive messages"
}
```

**Available Report Reasons:**
- `under_18` - Problem involving someone under 18
- `bullying_harassment` - Bullying, harassment or abuse
- `suicide_self_harm` - Suicide or self-harm content
- `violent_content` - Violent, hateful or disturbing content
- `restricted_items` - Selling or promoting restricted items
- `adult_content` - Adult content
- `scam_fraud` - Scam, fraud or false information
- `fake_profile` - Fake profile
- `intellectual_property` - Intellectual property violation
- `other` - Something else

**Success Response (201):**
```json
{
  "success": true,
  "message": "Report submitted successfully",
  "reportId": "report_id_123"
}
```

**Error Responses:**
- `400 Bad Request`: Missing required fields or invalid reason
- `401 Unauthorized`: Not authenticated
- `403 Forbidden`: Cannot report yourself
- `404 Not Found`: User not found
- `409 Conflict`: You have already reported this user
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

**Example Request:**
```bash
curl -X POST https://api.ulearnandearn.com/api/reports/users/123456/report \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "bullying_harassment", "description": "User is sending abusive messages"}'
```

### Best Practices

1. **Report Accuracy**: Users should select the most appropriate reason for reporting
2. **No Self-Reports**: Users cannot report themselves
3. **One Report Per User**: Each user can only report another user once
4. **Provide Details**: Include a description to help with moderation
5. **Rate Limiting**: Be mindful of the rate limit (5 reports per minute)

### Example Workflow

```javascript
// Report a post
async function reportPost(postId, reason) {
  const response = await fetch(`https://api.ulearnandearn.com/api/posts/${postId}/report`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason })
  });
  
  const data = await response.json();
  
  if (data.data.postDeleted) {
    console.log('Post was deleted due to multiple reports');
  } else {
    console.log('Post reported successfully');
  }
  
  return data;
}

// Report a reel
async function reportReel(reelId, reason) {
  const response = await fetch(`https://api.ulearnandearn.com/api/reels/${reelId}/report`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason })
  });
  
  const data = await response.json();
  return data;
}
```

---

## Data Models

### Post Model

```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  caption: String (max 2200),
  media: [{
    url: String,
    publicId: String,
    type: String (enum: ['image', 'video']),
    format: String
  }],
  likes: [[ObjectId]], // Nested array: [happy[], sad[], angry[], hug[], wow[], like[]]
  comments: [{
    userId: ObjectId (ref: User),
    text: String (max 1000),
    createdAt: Date
  }],
  createdAt: Date,
  updatedAt: Date
}
```

### Reel Model

```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  caption: String (max 2200),
  media: {
    url: String,
    publicId: String,
    thumbnailUrl: String,
    type: String (enum: ['video']),
    format: String,
    duration: Number,
    dimensions: {
      width: Number,
      height: Number
    },
    size: Number
  },
  contentType: String (enum: ['education', 'fun']),
  visibility: String (enum: ['public', 'followers', 'private']),
  views: Number,
  likes: [[ObjectId]], // Nested array: [happy[], sad[], angry[], hug[], wow[], like[]]
  comments: [{
    userId: ObjectId (ref: User),
    text: String (max 500),
    createdAt: Date
  }],
  createdAt: Date,
  updatedAt: Date
}
```

### Report Model

```javascript
{
  _id: ObjectId,
  userId: ObjectId (ref: User),
  contentId: ObjectId,
  contentType: String (enum: ['post', 'reel']),
  reason: String (enum: [
    'problem_involving_someone_under_18',
    'bullying_harassment_or_abuse',
    'suicide_or_self_harm',
    'violent_hateful_or_disturbing_content',
    'adult_content',
    'scam_fraud_or_false_information',
    'intellectual_property',
    'political',
    'i_dont_want_to_see_this'
  ]),
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- Unique compound index on `(userId, contentId, contentType)` - prevents duplicate reports
- Compound index on `(contentId, contentType, reason)` - for efficient threshold checking

---

## Error Handling

### Standard Error Response Format

```json
{
  "success": false,
  "message": "Error message describing what went wrong",
  "error": "Detailed error message (in development)"
}
```

### Common HTTP Status Codes

- `200` - Success
- `201` - Created successfully
- `400` - Bad Request (validation errors, invalid parameters)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found (resource doesn't exist)
- `500` - Internal Server Error

---

## Examples

### Complete Workflow: Create Post with Reaction and Comment

#### Step 1: Create Post with File Upload
```bash
curl -X POST https://api.ulearnandearn.com/api/posts/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "caption=Beautiful sunset today!" \
  -F "media=@image.jpg"
```

**JavaScript Example:**
```javascript
const formData = new FormData();
formData.append('caption', 'Beautiful sunset today!');
formData.append('media', fileInput.files[0]);

const response = await fetch('https://api.ulearnandearn.com/api/posts/create', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});

const result = await response.json();
// Post is created with uploaded media in one step!
```

#### Step 2: React to Post
```bash
curl -X POST https://api.ulearnandearn.com/api/posts/POST_ID/like \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reaction": "happy"}'
```

#### Step 3: Add Comment
```bash
curl -X POST https://api.ulearnandearn.com/api/posts/POST_ID/comment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "Amazing photo! 📸"}'
```

### Complete Workflow: Create Reel (Recommended - Single Step)

#### Create Reel with Video Upload (Combined)
```bash
curl -X POST https://api.ulearnandearn.com/api/reels/create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "media=@video.mp4" \
  -F "caption=Tutorial on React hooks!" \
  -F "contentType=education" \
  -F "visibility=public"
```

**JavaScript Example:**
```javascript
const formData = new FormData();
formData.append('media', videoFileInput.files[0]);
formData.append('caption', 'Tutorial on React hooks!');
formData.append('contentType', 'education');
formData.append('visibility', 'public');

const response = await fetch('https://api.ulearnandearn.com/api/reels/create', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  body: formData
});

const result = await response.json();
// Reel is created with uploaded video in one step!
```

### Complete Workflow: Create Reel (Legacy - Two Steps)

#### Step 1: Upload Video
```bash
curl -X POST https://api.ulearnandearn.com/api/reels/upload-media \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "media=@video.mp4"
```

#### Step 2: Create Reel with Pre-uploaded Media
```bash
curl -X POST https://api.ulearnandearn.com/api/reels/create-with-media \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "caption": "Tutorial on React hooks!",
    "media": {
      "url": "https://res.cloudinary.com/...",
      "publicId": "user_uploads/user_id/reels/abc123",
      "thumbnailUrl": "",
      "type": "video",
      "format": "mp4",
      "duration": 30.5,
      "width": 1920,
      "height": 1080,
      "fileSize": 5242880
    },
    "contentType": "education",
    "visibility": "public"
  }'
```

**Note:** The two-step approach is maintained for backward compatibility. New implementations should use the combined endpoint.

### Complete Workflow: Report Content

#### Report a Post
```bash
curl -X POST https://api.ulearnandearn.com/api/posts/POST_ID/report \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "bullying_harassment_or_abuse"}'
```

#### Report a Reel
```bash
curl -X POST https://api.ulearnandearn.com/api/reels/REEL_ID/report \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "adult_content"}'
```

### JavaScript/TypeScript Example

```javascript
// React to a post
async function reactToPost(postId, reaction = 'like') {
  const response = await fetch(`https://api.ulearnandearn.com/api/posts/${postId}/like`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reaction })
  });
  
  const data = await response.json();
  return data;
}

// Add comment to a post
async function addComment(postId, text) {
  const response = await fetch(`https://api.ulearnandearn.com/api/posts/${postId}/comment`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text })
  });
  
  const data = await response.json();
  return data;
}

// Get posts with pagination
async function getPosts(page = 1, limit = 10) {
  const response = await fetch(
    `https://api.ulearnandearn.com/api/posts/all?page=${page}&limit=${limit}`
  );
  
  const data = await response.json();
  return data;
}

// Report a post
async function reportPost(postId, reason) {
  const response = await fetch(`https://api.ulearnandearn.com/api/posts/${postId}/report`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason })
  });
  
  const data = await response.json();
  return data;
}

// Report a reel
async function reportReel(reelId, reason) {
  const response = await fetch(`https://api.ulearnandearn.com/api/reels/${reelId}/report`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason })
  });
  
  const data = await response.json();
  return data;
}
```

---

## Best Practices

1. **Media Upload**: Upload files directly when creating posts using the `/api/posts/create` endpoint with `multipart/form-data` - this combines upload and post creation in one step
2. **Pagination**: Use pagination for large datasets to improve performance
3. **Error Handling**: Always check the `success` field in responses
4. **Reaction Updates**: Handle the three possible actions: "liked", "unliked", "reaction_updated"
5. **Comment Length**: Respect character limits (1000 for posts, 500 for reels)
6. **Comment Display**: Only 15 most recent comments are returned. Use `commentCount` to determine if more comments exist and implement "View more comments" functionality if needed
7. **Reporting**: Select the most appropriate reason when reporting content
8. **Blocking**: Use blocking to prevent seeing unwanted content and to prevent others from seeing your content
9. **Authentication**: Store and refresh access tokens securely
10. **Rate Limiting**: Be mindful of API rate limits when making multiple requests
11. **Feed Filtering**: Remember that both reported and blocked content is automatically filtered from authenticated user feeds
12. **Multiple Files**: You can upload up to 10 files in a single post creation request for carousel posts

---

## Support

For issues or questions, please refer to the main API documentation or contact support.

**Last Updated:** January 2024

---

## Important Notes

### Likes/Reactions Structure

The likes array uses a nested array structure for efficient storage:
- `likes[0]` = happy reactions (array of user IDs)
- `likes[1]` = sad reactions (array of user IDs)
- `likes[2]` = angry reactions (array of user IDs)
- `likes[3]` = hug reactions (array of user IDs)
- `likes[4]` = wow reactions (array of user IDs)
- `likes[5]` = like reactions (array of user IDs)

This structure allows for efficient querying and counting of reactions without needing to store reaction type with each user ID.

### Video Transcoding

All videos uploaded to posts and reels are automatically transcoded to ensure compatibility:
- **Codec:** H.264 Baseline Profile 3.1
- **Pixel Format:** yuv420p
- **Faststart:** Enabled (for progressive playback)

This ensures videos play smoothly across all devices and browsers.

### Media Upload Flow

**For Posts:**
1. **Upload files directly** when creating a post using `/api/posts/create` with `multipart/form-data`
2. **Files are automatically** uploaded to Cloudinary, transcoded (if videos), and the post is created in one API call
3. **Media is stored** in Cloudinary and referenced in the database automatically
4. **Supports multiple files** - upload up to 10 files in a single request for carousel posts

**For Reels:**
1. **Recommended:** Upload video and create reel in one step using `/api/reels/create` with `multipart/form-data`
   - **Files are automatically** uploaded to Cloudinary, transcoded (if needed), and the reel is created in one API call
   - **Media is stored** in Cloudinary and referenced in the database automatically
2. **Legacy:** Two-step process (for backward compatibility)
   - **Upload media first** using `/api/reels/upload-media`
   - **Use the response data** to create the reel with `/api/reels/create-with-media` using the returned `url`, `publicId`, and other metadata

**Note:** The single-step approach for both posts and reels simplifies the workflow and reduces the number of API calls needed. Videos are automatically transcoded to H.264 Baseline Profile 3.1 with yuv420p pixel format and faststart enabled for maximum Android and cross-platform compatibility.

### Content Moderation

The reporting system provides automatic content moderation:
- **User Reports**: Users can report inappropriate content with specific reasons
- **Feed Filtering**: Reported content is immediately removed from the reporting user's feed
- **Automatic Deletion**: Content is permanently deleted when 2 users report with the same reason
- **Media Cleanup**: All associated media is automatically removed from Cloudinary when content is deleted

This ensures a safe and appropriate content environment while maintaining user privacy and preventing abuse of the reporting system.

### Blocking System

The blocking system provides additional content control:

- **User Control**: Users can block other users to prevent mutual interaction
- **Content Filtering**: Blocked users' content is automatically excluded from feeds
- **Bidirectional**: Blocking works both ways for complete privacy
- **Automatic Cleanup**: Blocking automatically removes users from friends lists and cancels pending requests

Combined with the reporting system, users have comprehensive tools to control their social media experience and maintain a safe environment.


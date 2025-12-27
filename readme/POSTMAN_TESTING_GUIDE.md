# Post API Testing Guide for Postman

This guide will help you test all Post API endpoints using Postman.

## Prerequisites

1. **Server Running**: Make sure your server is running on `http://localhost:3100` (or your configured PORT)
2. **Authentication Token**: You'll need an access token for protected endpoints

---

## Step 1: Get Authentication Token

Before testing post creation, you need to authenticate and get an access token.

### Login Request

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/login`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "your-email@example.com",
  "password": "YourPassword123"
}
```

**Response:** Copy the `accessToken` from the response:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "..."
  }
}
```

---

## Step 2: Test Post Endpoints

### 1. Create Post

#### Option A: Text-Only Post

**Method:** `POST`  
**URL:** `http://localhost:3100/api/posts/create`

**Headers:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN_HERE
```

**Body:**
- Select **form-data** (not raw)
- Add a key named `caption`

#### Option B: Post with Media

**Method:** `POST`  
**URL:** `http://localhost:3100/api/posts/create`

**Headers:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN_HERE
```

**Body:**
- Select **form-data** (not raw)
- Add a key named `caption` (optional)
- Add a key named `media` and set type to **File**

#### Option C: Multiple Media (Carousel Post)

**Method:** `POST`  
**URL:** `http://localhost:3100/api/posts/create`

**Headers:**
```
Authorization: Bearer YOUR_ACCESS_TOKEN_HERE
```

**Body:**
- Select **form-data** (not raw)
- Add a key named `caption` (optional)
- Add multiple `media` keys (each set to **File**) to upload up to 10 files


**Expected Response (201):**
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

---

### 2. Get All Posts (Feed)

**Method:** `GET`  
**URL:** `http://localhost:3100/api/posts/all?page=1&limit=10`

**Headers:** None required (public endpoint)

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Posts per page (default: 10)

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Posts retrieved successfully",
  "data": {
    "posts": [
      {
        "id": "post_id_1",
        "userId": "user_id",
        "user": {...},
        "caption": "...",
        "media": [...],
        "likes": [],
        "comments": [],
        "likeCount": 0,
        "commentCount": 0,
        "createdAt": "..."
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

---

### 3. Get User Posts

**Method:** `GET`  
**URL:** `http://localhost:3100/api/posts/user/USER_ID_HERE?page=1&limit=10`

**Headers:** None required (public endpoint)

**Replace `USER_ID_HERE` with an actual user ID from your database**

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Posts per page (default: 10)

**Expected Response (200):**
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
    "posts": [...],
    "pagination": {...}
  }
}
```

---

## Postman Collection Setup Tips

### 1. Create Environment Variables

Create a Postman environment with these variables:
- `base_url`: `http://localhost:3100`
- `access_token`: (will be set after login)
- `user_id`: (your user ID)

### 2. Set Up Pre-request Scripts

For the login request, add this to **Tests** tab to automatically save the token:
```javascript
if (pm.response.code === 200) {
    const jsonData = pm.response.json();
    if (jsonData.data && jsonData.data.accessToken) {
        pm.environment.set("access_token", jsonData.data.accessToken);
        pm.environment.set("user_id", jsonData.data.user.id);
    }
}
```

### 3. Use Variables in Requests

Instead of hardcoding, use:
- URL: `{{base_url}}/api/posts/create`
- Authorization Header: `Bearer {{access_token}}`

---

## Common Issues & Solutions

### Issue: "401 Unauthorized"
**Solution:** Make sure you're using a valid access token in the Authorization header

### Issue: "400 Bad Request - Post must have either caption or media"
**Solution:** Ensure you provide at least a caption or media file(s) (or both)

### Issue: "400 Bad Request - Each media item must have url, publicId, and type"
**Solution:** Make sure you attach files under the `media` key with type set to "File"

### Issue: Media upload fails
**Solution:** 
- Check file size (max 20MB)
- Ensure you're using form-data (not raw JSON) for file uploads
- Make sure the key is named exactly `media` and type is set to "File"

---

## Quick Test Flow

1. **Login** ?+' Get access token
2. **Create Post** ?+' Use caption and/or media files in one request
3. **Get All Posts** ?+' Verify your post appears
4. **Get User Posts** ?+' Verify your post appears in your user's posts

---

## Testing Different Scenarios

### Test Case 1: Text-Only Post
- Create post with only `caption` field
- Should succeed ✅

### Test Case 2: Media-Only Post
- Create post with only media files (no caption)
- Should succeed ?o.

### Test Case 3: Post with Both Caption and Media
- Create post with both `caption` and media files
- Should succeed ?o.

### Test Case 4: Empty Post (Should Fail)
- Try to create post with no caption and no media files
- Should return 400 error ??O

### Test Case 5: Invalid Media Structure (Should Fail)
- Try uploading an unsupported file type or missing media files
- Should return 400 error ??O

---

**Happy Testing! 🚀**

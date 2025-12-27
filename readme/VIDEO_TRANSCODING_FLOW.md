# Video Transcoding Backend Flow Documentation

## High-Level Architecture

```
Client (Flutter/Web)
    ↓
[Upload Endpoint] → Multer (File Upload)
    ↓
[Video Detection] → Check if file is video (mimetype)
    ↓
[FFmpeg Transcoding] → Re-encode to Baseline Profile Level 3.1
    ↓
[Cloudinary Upload] → Upload transcoded file
    ↓
[Database Save] → Save media record
    ↓
[Cleanup] → Delete temporary transcoded file
    ↓
[Response] → Return Cloudinary URL + publicId
```

---

## Upload Endpoints

### 1. Reels Upload
- **Endpoint:** `POST /api/reels/upload-media`
- **Route:** `src/routes/reelRoutes.js`
- **Controller:** `src/controllers/reelController.js` → `uploadReelMedia()`

### 2. Posts Upload
- **Endpoint:** `POST /api/posts/create`
- **Route:** `src/routes/postRoutes.js`
- **Controller:** `src/controllers/postController.js` ?+' `createPost()`
- **Note:** Upload is combined with post creation (multipart/form-data)

### 3. Stories Upload
- **Endpoint:** `POST /api/stories/upload-media`
- **Route:** `src/routes/storyRoutes.js`
- **Controller:** `src/controllers/storyController.js` → `uploadStoryMedia()`

### 4. General Media Upload
- **Endpoint:** `POST /api/media/upload`
- **Route:** `src/routes/uploadRoutes.js`
- **Controller:** `src/controllers/userController.js` → `uploadMedia()`

---

## Detailed Flow (Step-by-Step)

### Step 1: File Reception
```javascript
// Multer middleware handles file upload
// File saved to temp directory (OS temp dir)
req.file = {
    path: '/tmp/upload_abc123.mp4',
    mimetype: 'video/mp4',
    size: 5242880,
    originalname: 'my_video.mp4'
}
```

**Middleware:** `src/middleware/upload.js`
- Uses `multer.diskStorage()` for temporary file storage
- Max file size: 20MB
- Files stored in OS temp directory

---

### Step 2: Video Detection
```javascript
const isVideoFile = isVideo(req.file.mimetype);
// Returns true if mimetype starts with 'video/'
```

**Service:** `src/services/videoTranscoder.js` → `isVideo()`
- Checks if `mimetype.startsWith('video/')`
- Examples: `video/mp4`, `video/mov`, `video/quicktime`

---

### Step 3: Video Transcoding (If Video)

**Service:** `src/services/videoTranscoder.js` → `transcodeVideo()`

#### 3.1. Metadata Extraction
```javascript
ffmpeg.ffprobe(inputPath, (err, metadata) => {
    // Extract: duration, width, height
})
```

#### 3.2. Dimension Scaling (Level 3.1 Compliance)
```javascript
// Level 3.1 constraints:
// - Max resolution: 1280x720 @ 30fps
// - Max bitrate: ~14Mbps

if (width > 1280 || height > 720) {
    // Scale down maintaining aspect ratio
    // Ensure even dimensions (H.264 requirement)
}
```

#### 3.3. FFmpeg Transcoding
```bash
ffmpeg -i input.mp4 \
  -vcodec libx264 \
  -profile:v baseline \
  -level 3.1 \
  -pix_fmt yuv420p \
  -r 30 \
  -movflags +faststart \
  -maxrate 10M \
  -bufsize 20M \
  -acodec aac \
  -b:a 128k \
  output.mp4
```

**Key Parameters:**
- `-profile:v baseline` → Most compatible profile
- `-level 3.1` → Maximum device compatibility
- `-pix_fmt yuv420p` → Required for baseline profile
- `-r 30` → 30fps (Level 3.1 max)
- `-maxrate 10M` → Safe bitrate for Level 3.1
- `-movflags +faststart` → Web optimization (progressive download)

**Output:**
- Transcoded file saved to: `os.tmpdir()/video_transcoding/transcoded_{uuid}.mp4`
- Returns: `{ outputPath, duration, width, height, fileSize }`

---

### Step 4: Cloudinary Upload

```javascript
const result = await cloudinary.uploader.upload(fileToUpload, {
    folder: `user_uploads/${user._id}/reels`,  // or /posts, /stories
    upload_preset: process.env.UPLOAD_PRESET,
    resource_type: 'auto',  // Detects image/video automatically
    quality: '100'
});
```

**What Happens:**
- Uploads **transcoded file** (if video) or **original file** (if image)
- Cloudinary processes and stores the file
- Returns secure URL and public ID

**Response Structure:**
```javascript
{
    secure_url: 'https://res.cloudinary.com/.../video/upload/...',
    public_id: 'user_uploads/user_id/reels/abc123',
    format: 'mp4',
    resource_type: 'video',
    bytes: 3145728,
    duration: 15.5,
    width: 1280,
    height: 720
}
```

---

### Step 5: Database Save

```javascript
const mediaRecord = await Media.create({
    userId: user._id,
    url: result.secure_url,
    public_id: result.public_id,
    format: result.format,
    resource_type: result.resource_type,
    fileSize: result.bytes,
    originalFilename: req.file.originalname,
    folder: result.folder
});
```

**Model:** `src/models/Media.js`
- Stores upload metadata
- Links media to user
- Enables media management

---

### Step 6: Cleanup

```javascript
// Delete transcoded temporary file
if (transcodedPath) {
    await cleanupFile(transcodedPath);
}
// Original file cleaned up by Multer automatically
```

**Why:**
- Saves disk space
- Prevents temp directory from filling up
- Original file auto-deleted by Multer

---

### Step 7: Response to Client

```json
{
    "success": true,
    "message": "Reel media uploaded successfully",
    "data": {
        "url": "https://res.cloudinary.com/.../video/upload/...",
        "publicId": "user_uploads/user_id/reels/abc123",
        "type": "video",
        "format": "mp4",
        "duration": 15.5,
        "width": 1280,
        "height": 720,
        "fileSize": 3145728,
        "mediaId": "media_record_id"
    }
}
```

**Client Uses:**
- `url` → Display video in player
- `publicId` → Delete/update operations
- `mediaId` → Reference in database

---

## Error Handling

### Transcoding Failure
```javascript
try {
    const transcoded = await transcodeVideo(originalPath);
    fileToUpload = transcoded.outputPath;
} catch (transcodeError) {
    console.error('Video transcoding failed:', transcodeError);
    // Fallback: Upload original file
    fileToUpload = originalPath;
    console.warn('Uploading original video without transcoding');
}
```

**Strategy:**
- If transcoding fails → Upload original file
- Log error for debugging
- Don't block user upload

### Cloudinary Upload Failure
```javascript
catch (error) {
    // Cleanup transcoded file
    if (transcodedPath) await cleanupFile(transcodedPath);
    
    return res.status(500).json({
        success: false,
        message: 'Failed to upload media',
        error: error.message
    });
}
```

---

## File Flow Diagram

```
┌─────────────────┐
│  Client Upload  │
│  (MP4, MOV, etc)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Multer Save    │
│  (Temp File)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────────┐
│  Is Video?      │ YES  │  FFmpeg Transcode│
│  (mimetype)     │─────▶│  → Baseline 3.1 │
└────────┬────────┘      └────────┬─────────┘
         │                        │
         │ NO                     │
         │                        ▼
         │              ┌──────────────────┐
         │              │  Transcoded File │
         │              │  (Temp Location) │
         │              └────────┬─────────┘
         │                       │
         └───────────────────────┘
                    │
                    ▼
         ┌──────────────────┐
         │ Cloudinary Upload│
         │  (Transcoded/    │
         │   Original File) │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │  Database Save   │
         │  (Media Record)  │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │  Cleanup Temp    │
         │  (Delete Files)  │
         └────────┬─────────┘
                  │
                  ▼
         ┌──────────────────┐
         │  Return Response │
         │  (URL + publicId)│
         └──────────────────┘
```

---

## Code Structure

```
src/
├── controllers/
│   ├── reelController.js      → uploadReelMedia()
│   ├── postController.js      → createPost()
│   ├── storyController.js     → uploadStoryMedia()
│   └── userController.js      → uploadMedia()
│
├── services/
│   └── videoTranscoder.js     → transcodeVideo(), isVideo(), cleanupFile()
│
├── middleware/
│   └── upload.js              → Multer configuration
│
└── models/
    └── Media.js               → Media schema
```

---

## Environment Variables Required

```env
# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
UPLOAD_PRESET=your_upload_preset
```

---

## Dependencies

```json
{
  "fluent-ffmpeg": "^2.1.3",
  "@ffmpeg-installer/ffmpeg": "^1.1.0",
  "uuid": "^latest",
  "cloudinary": "^2.8.0",
  "multer": "^2.0.2"
}
```

---

## Testing the Flow

### 1. Test Video Upload
```bash
curl -X POST http://localhost:3000/api/reels/upload-media \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "media=@/path/to/video.mp4"
```

### 2. Check Logs
```
Transcoding video for reel...
FFmpeg transcoding started: ffmpeg -i ...
Transcoding progress: 25%
Transcoding progress: 50%
Transcoding progress: 75%
Video transcoding completed successfully
Video transcoded successfully: /tmp/video_transcoding/transcoded_abc123.mp4
Cleaned up temporary file: /tmp/video_transcoding/transcoded_abc123.mp4
```

### 3. Verify Output
- Check response has `url` and `publicId`
- Verify video plays in Flutter app
- Check codec is `avc1.42E01E` (Baseline 3.1) not `avc1.F4001F` (Level 4.0)

---

## Performance Considerations

1. **Transcoding Time:** 
   - Depends on video length and resolution
   - Typically 1-2x video duration
   - Use `-preset fast` for balance

2. **Disk Space:**
   - Temporary files cleaned up immediately
   - OS temp directory used
   - No persistent storage needed

3. **Memory:**
   - FFmpeg processes files in chunks
   - No full file loading in memory

4. **Concurrent Uploads:**
   - Each upload is independent
   - No blocking between requests
   - Consider rate limiting for production

---

## Future Improvements

1. **Background Processing:**
   - Queue transcoding jobs
   - Return immediately with job ID
   - Process asynchronously

2. **Progress Updates:**
   - WebSocket for real-time progress
   - Client polling for status

3. **Multiple Qualities:**
   - Generate 360p, 720p, 1080p versions
   - Adaptive streaming support

4. **Thumbnail Generation:**
   - Extract frame at 1 second
   - Generate poster image

---

## Summary

✅ **Current Implementation:**
- Client uploads original file
- Backend detects video files
- FFmpeg transcodes to Baseline Profile Level 3.1
- Transcoded file uploaded to Cloudinary
- Original/transcoded temp files cleaned up
- Client receives Cloudinary URL + publicId

✅ **Benefits:**
- All videos compatible with Flutter/Android
- No codec compatibility issues
- Automatic optimization
- Clean temporary file management

✅ **Error Handling:**
- Transcoding failures → Fallback to original
- Upload failures → Proper error responses
- Cleanup on all error paths


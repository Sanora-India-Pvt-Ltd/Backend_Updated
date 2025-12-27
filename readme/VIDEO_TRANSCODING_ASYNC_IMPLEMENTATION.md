# Async Video Transcoding Implementation

## Overview

Video transcoding has been moved from **synchronous** (blocking) to **asynchronous** (non-blocking) processing using an in-memory job queue. This allows the API to respond immediately while videos are transcoded in the background.

## What Changed

### Before (Synchronous)
- User uploads video → Server transcodes video (30-60 seconds) → Uploads to Cloudinary → Returns response
- **Problem**: Request blocked for 30-60 seconds, poor user experience, server resources tied up

### After (Asynchronous)
- User uploads video → Server queues transcoding job → Uploads original to Cloudinary → Returns response immediately
- Background worker processes transcoding → Updates Cloudinary with transcoded version → Updates database
- **Benefit**: Response in < 2 seconds, better user experience, server can handle more concurrent requests

## Architecture

```
Client Upload
    ↓
[Upload Endpoint] → Multer (File Upload)
    ↓
[Video Detection] → Check if file is video
    ↓
[Queue Job] → Add to transcoding queue (returns job ID)
    ↓
[Upload Original] → Upload original video to Cloudinary immediately
    ↓
[Create Post/Reel] → Save to database with original URL
    ↓
[Return Response] → Return immediately with job ID
    ↓
[Background Worker] → Process transcoding job
    ↓
[Update Cloudinary] → Upload transcoded version
    ↓
[Update Database] → Update media record with transcoded URL
```

## New Components

### 1. Video Transcoding Queue (`src/services/videoTranscodingQueue.js`)
- In-memory job queue (works without Redis)
- Processes up to 2 videos concurrently
- Tracks job status and progress
- Emits events when jobs complete

### 2. Video Transcoding Job Model (`src/models/VideoTranscodingJob.js`)
- Stores job metadata in database
- Tracks status: `queued` → `processing` → `completed` / `failed`
- Auto-deletes old jobs after 7 days (TTL index)

### 3. Status Endpoints (`src/routes/videoTranscodingRoutes.js`)
- `GET /api/video-transcoding/status/:jobId` - Get job status
- `GET /api/video-transcoding/jobs` - Get user's jobs (protected)
- `GET /api/video-transcoding/stats` - Get queue statistics (protected)

### 4. Updated Controllers
- `postController.js` - Posts now queue video transcoding
- `reelController.js` - Reels now queue video transcoding
- Media model updated with `transcodingJobId`, `isTranscoding`, `transcodingCompleted` fields

## API Changes

### Response Format

**Before:**
```json
{
  "success": true,
  "data": {
    "post": {
      "media": [{
        "url": "https://cloudinary.com/video.mp4",
        "type": "video"
      }]
    }
  }
}
```

**After:**
```json
{
  "success": true,
  "data": {
    "post": {
      "media": [{
        "url": "https://cloudinary.com/video.mp4",
        "type": "video",
        "transcodingJobId": "507f1f77bcf86cd799439011",
        "isTranscoding": true
      }]
    }
  }
}
```

### New Endpoints

#### Get Job Status
```http
GET /api/video-transcoding/status/:jobId
```

**Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "507f1f77bcf86cd799439011",
    "status": "processing",
    "progress": 45,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "startedAt": "2024-01-01T00:00:05.000Z",
    "completedAt": null,
    "error": null
  }
}
```

**Status Values:**
- `queued` - Job is waiting in queue
- `processing` - Job is being transcoded
- `completed` - Transcoding finished successfully
- `failed` - Transcoding failed

#### Get User's Jobs
```http
GET /api/video-transcoding/jobs?status=completed&page=1&limit=20
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "jobs": [...],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "totalPages": 3
    }
  }
}
```

## How It Works

### 1. Video Upload Flow

1. **Client uploads video** to `/api/posts/create` or `/api/reels/upload-media`
2. **Server detects video** and queues transcoding job
3. **Original video uploaded** to Cloudinary immediately
4. **Post/Reel created** with original video URL
5. **Response returned** with `transcodingJobId` and `isTranscoding: true`

### 2. Background Processing

1. **Worker picks up job** from queue
2. **Transcodes video** to H.264 Baseline Profile 3.1
3. **Uploads transcoded version** to Cloudinary
4. **Updates media record** with transcoded URL
5. **Updates post/reel** media array with new URL
6. **Cleans up** temporary transcoded file

### 3. Client Polling (Optional)

Clients can poll the status endpoint to show progress:

```javascript
// Poll job status every 2 seconds
const checkStatus = async (jobId) => {
  const response = await fetch(`/api/video-transcoding/status/${jobId}`);
  const { data } = await response.json();
  
  if (data.status === 'completed') {
    // Transcoding done, refresh post/reel to get updated URL
    refreshPost();
  } else if (data.status === 'failed') {
    // Show error message
    showError(data.error);
  } else {
    // Update progress bar
    updateProgress(data.progress);
    // Poll again in 2 seconds
    setTimeout(() => checkStatus(jobId), 2000);
  }
};
```

## Benefits

### Performance
- ✅ **Faster response times**: < 2 seconds instead of 30-60 seconds
- ✅ **Better concurrency**: Server can handle more requests
- ✅ **Non-blocking**: Other requests not affected by transcoding

### User Experience
- ✅ **Immediate feedback**: Users see their post/reel immediately
- ✅ **Progress tracking**: Optional progress updates via status endpoint
- ✅ **Graceful degradation**: Original video works if transcoding fails

### Scalability
- ✅ **Queue management**: Jobs processed in order
- ✅ **Concurrent processing**: Up to 2 videos at a time (configurable)
- ✅ **Error handling**: Failed jobs don't block the queue

## Configuration

### Queue Settings

In `src/services/videoTranscodingQueue.js`:

```javascript
this.maxConcurrentJobs = 2; // Process 2 videos at a time
```

Adjust based on server resources:
- **Low-end server**: 1-2 concurrent jobs
- **Mid-range server**: 2-4 concurrent jobs
- **High-end server**: 4-8 concurrent jobs

### Job Cleanup

Jobs are automatically deleted after 7 days (TTL index). To change:

```javascript
// In VideoTranscodingJob.js
videoTranscodingJobSchema.index({ createdAt: 1 }, { 
  expireAfterSeconds: 7 * 24 * 60 * 60 // 7 days
});
```

## Monitoring

### Queue Statistics

```http
GET /api/video-transcoding/stats
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "queue": {
      "queueLength": 5,
      "activeJobs": 2,
      "maxConcurrentJobs": 2,
      "isProcessing": true
    },
    "jobCounts": {
      "queued": 3,
      "processing": 2,
      "completed": 150,
      "failed": 5
    }
  }
}
```

## Error Handling

### Transcoding Failures

If transcoding fails:
1. Job status set to `failed`
2. Error message stored in job record
3. Original video remains available
4. Media record `isTranscoding` set to `false`
5. No impact on post/reel (still works with original video)

### Queue Failures

If queue fails to add job:
1. Falls back to original video upload
2. Post/reel created normally
3. No transcoding performed (compatibility may be reduced)

## Future Improvements

### When Redis is Enabled

1. **Upgrade to Bull/BullMQ**: Use Redis-based queue for distributed processing
2. **Multiple Workers**: Run transcoding on separate worker processes
3. **Priority Queue**: Prioritize certain jobs (e.g., paid users)
4. **Retry Logic**: Automatic retry for failed jobs

### Additional Features

1. **WebSocket Updates**: Real-time progress via WebSocket
2. **Thumbnail Generation**: Generate video thumbnails during transcoding
3. **Multiple Qualities**: Generate 360p, 720p, 1080p versions
4. **Progress Callbacks**: HTTP callbacks when transcoding completes

## Testing

### Test Video Upload

```bash
curl -X POST http://localhost:3100/api/posts/create \
  -H "Authorization: Bearer <token>" \
  -F "caption=Test post" \
  -F "media=@video.mp4"
```

### Check Job Status

```bash
curl http://localhost:3100/api/video-transcoding/status/<jobId>
```

### Monitor Queue

```bash
curl http://localhost:3100/api/video-transcoding/stats \
  -H "Authorization: Bearer <token>"
```

## Migration Notes

### Backward Compatibility

- ✅ **API responses unchanged**: Same structure, just added fields
- ✅ **Original videos still work**: If transcoding fails, original is used
- ✅ **No breaking changes**: Existing clients continue to work

### Database Migration

The Media model has new fields:
- `transcodingJobId` (String, optional)
- `isTranscoding` (Boolean, default: false)
- `transcodingCompleted` (Boolean, default: false)

Existing records will have `isTranscoding: false` and `transcodingCompleted: false`.

## Troubleshooting

### Jobs Stuck in Queue

1. Check queue stats: `GET /api/video-transcoding/stats`
2. Check server logs for errors
3. Restart server to clear in-memory queue
4. Check if FFmpeg is installed and working

### Jobs Failing

1. Check job status: `GET /api/video-transcoding/status/:jobId`
2. Review error message in job record
3. Check FFmpeg installation
4. Verify input video format is supported

### Slow Processing

1. Reduce `maxConcurrentJobs` if server is overloaded
2. Check server CPU/memory usage
3. Consider upgrading server resources
4. Monitor queue length

## Summary

✅ **Synchronous transcoding removed** - No more blocking requests  
✅ **Async job queue implemented** - Background processing  
✅ **Status endpoints added** - Track progress  
✅ **Backward compatible** - No breaking changes  
✅ **Better performance** - Faster responses  
✅ **Scalable** - Can handle more concurrent uploads  

The system is now ready for production use and can be upgraded to Redis-based queue when Redis is enabled.


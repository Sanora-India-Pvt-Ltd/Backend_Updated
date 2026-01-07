# Sanora Backend API

A comprehensive Node.js backend API for a social learning platform with real-time conference polling, EdTech features, social networking, and marketplace functionality.

## 1. Project Overview

**Sanora** is a full-stack social learning platform that combines:
- **Social Networking**: Posts, reels, stories, comments, likes, friend requests, and real-time messaging
- **Live Conference Polling**: Real-time Q&A and voting system for conferences (similar to Slido)
- **EdTech Platform**: Course management, video content, playlists, progress tracking, and analytics
- **Marketplace**: Product listings, cart management, order processing, and seller administration

This backend serves:
- **Mobile Applications** (iOS/Android) via REST APIs and Socket.IO
- **Web Applications** via REST APIs and WebSocket connections
- **Admin Dashboards** for content and user management

## 2. Tech Stack

### Core Framework
- **Node.js** v22+ (with IPv4 DNS fixes for network compatibility)
- **Express.js** v4.22.1 - REST API framework
- **Mongoose** v9.0.0 - MongoDB ODM

### Databases & Caching
- **MongoDB** v6.0.0 - Primary database (MongoDB Atlas compatible)
- **Redis** (ioredis v5.8.2) - Optional, for horizontal scaling and real-time state
  - Used for: Conference polling state, presence tracking, Socket.IO adapter
  - Falls back to in-memory storage if `REDIS_URL` is not set

### Real-Time Communication
- **Socket.IO** v4.8.1 - WebSocket server for:
  - Real-time messaging (chat)
  - Conference polling and live question management
  - User presence tracking
  - Live audience count updates

### Authentication & Authorization
- **JWT** (jsonwebtoken v9.0.2) - Access tokens (1 hour) and refresh tokens (indefinite)
- **Passport.js** v0.7.0 - OAuth strategy
- **Google OAuth 2.0** - Web, Android, and iOS client support
- **bcryptjs** v3.0.3 - Password hashing
- **Twilio** v5.11.1 - Phone number verification (OTP via SMS)
- **Nodemailer** v7.0.11 - Email OTP delivery

### Media & Storage
- **AWS S3** (@aws-sdk/client-s3 v3.958.0) - Media file storage
- **FFmpeg** (fluent-ffmpeg v2.1.3, @ffmpeg-installer v1.1.0) - Video transcoding
- **Multer** v2.0.2 + **multer-s3** v3.0.1 - File upload handling
- **Cloudinary** v2.8.0 - Alternative image storage (if configured)

### Background Processing
- **In-Memory Video Transcoding Queue** - Custom queue for video processing
  - Processes 2 videos concurrently
  - Tracks job status in MongoDB (`VideoTranscodingJob` model)
  - Can be upgraded to Bull/BullMQ when Redis is enabled

### Additional Libraries
- **QRCode** v1.5.4 - Conference QR code generation
- **Rate Limiter Flexible** v9.0.0 - API rate limiting
- **CORS** v2.8.5 - Cross-origin resource sharing
- **Express Session** v1.18.2 - Session management

### Development & Deployment
- **Nodemon** v3.1.11 - Development auto-reload
- **PM2** - Production process manager (recommended)
- **Wrangler** - Cloudflare Workers deployment (optional)

## 3. Folder Structure

```
src/
├── config/              # Configuration modules
│   ├── db.js           # MongoDB connection
│   ├── redisConnection.js  # Redis client management (with fallback)
│   ├── redisManager.js     # Redis utility functions
│   ├── redisStub.js        # In-memory Redis fallback
│   └── s3.js               # AWS S3 client configuration
│
├── controllers/         # Request handlers (business logic)
│   ├── authorization/   # User auth (signup, login, OTP, Google OAuth)
│   ├── conference/      # Conference management, polling, results
│   ├── social/          # Posts, reels, stories, comments, likes, friends, chat
│   ├── course/          # Course CRUD, playlists, invites
│   ├── video/           # Video management, checkpoints
│   ├── marketplace/     # Products, cart, orders, inventory, sellers
│   ├── progress/         # User progress tracking
│   ├── review/           # Course reviews
│   └── analytics/        # Course analytics
│
├── models/              # Mongoose schemas
│   ├── authorization/   # User, Company, Institution, OTP
│   ├── conference/      # Conference, ConferenceQuestion, Host, Speaker
│   ├── social/          # Post, Reel, Story, Comment, Like, Message, Conversation
│   ├── course/          # Course, Video, Playlist, Question
│   ├── marketplace/     # Product, Cart, Order, Inventory, SellerApplication
│   ├── progress/        # UserCourseProgress, UserVideoProgress, UserActivity
│   └── review/          # CourseReview
│
├── routes/              # Express route definitions
│   ├── authorization/   # Auth endpoints
│   ├── conference/      # Conference endpoints
│   ├── social/          # Social feature endpoints
│   ├── course/          # Course endpoints
│   ├── marketplace/     # Marketplace endpoints
│   └── ...              # Other feature routes
│
├── middleware/          # Express middleware
│   ├── auth.js          # JWT authentication
│   ├── errorhandler.js  # Global error handler
│   ├── rateLimiter.js   # Rate limiting
│   ├── validation.js    # Request validation
│   ├── s3Upload.js      # S3 file upload
│   ├── hostAuth.js      # Conference host authorization
│   ├── speakerAuth.js   # Conference speaker authorization
│   └── ...              # Other middleware
│
├── services/            # Business logic services
│   ├── emailService.js  # Email OTP sending
│   ├── otpService.js    # OTP generation/verification
│   ├── videoTranscoder.js  # FFmpeg video processing
│   ├── videoTranscodingQueue.js  # Video job queue
│   ├── storage.service.js  # S3 storage operations
│   └── conferenceAuthService.js  # Conference auth logic
│
├── socket/              # Socket.IO handlers
│   ├── socketServer.js  # Main Socket.IO server, conference polling logic
│   └── conferenceHandlers.js  # Conference-specific handlers
│
├── utils/               # Utility functions
│   ├── formatters.js    # Data formatting helpers
│   ├── memoryCache.js   # In-memory caching
│   └── userDataLoader.js  # User data loading utilities
│
└── server.js            # Application entry point
```

## 4. Environment Variables

### Database
- `MONGODB_URI` (required) - MongoDB connection string
  - Format: `mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority`

### Authentication
- `JWT_SECRET` (required) - Secret key for JWT token signing
- `SESSION_SECRET` (optional) - Secret for Express sessions (defaults to 'your-secret-key')

### Google OAuth
- `GOOGLE_CLIENT_ID` (optional) - Web OAuth client ID
- `GOOGLE_ANDROID_CLIENT_ID` (optional) - Android OAuth client ID
- `GOOGLE_IOS_CLIENT_ID` (optional) - iOS OAuth client ID
- `GOOGLE_CLIENT_SECRET` (optional) - OAuth client secret
- `GOOGLE_CALLBACK_URL` (optional) - OAuth callback URL

### Email (OTP)
- `EMAIL_HOST` (optional) - SMTP server hostname
- `EMAIL_PORT` (optional) - SMTP port (default: 587)
- `EMAIL_USER` (optional) - SMTP username
- `EMAIL_PASSWORD` (optional) - SMTP password
- `OTP_EXPIRY_MINUTES` (optional) - OTP expiration time in minutes (default: 5)

### Phone Verification (Twilio)
- `TWILIO_ACCOUNT_SID` (optional) - Twilio account SID
- `TWILIO_AUTH_TOKEN` (optional) - Twilio auth token
- `TWILIO_VERIFY_SERVICE_SID` (optional) - Twilio Verify Service SID

### AWS S3
- `AWS_REGION` (optional) - AWS region (e.g., 'us-east-1')
- `AWS_BUCKET_NAME` (optional) - S3 bucket name
- AWS credentials are auto-detected from:
  - Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
  - IAM role (when running on EC2)

### Redis (Optional - for scaling)
- `REDIS_URL` (optional) - Redis connection URL
  - Format: `redis://username:password@host:port` or `rediss://` for TLS
  - If not set, system uses in-memory storage (single server only)

### Application
- `PORT` (optional) - Server port (default: 3100)
- `NODE_ENV` (optional) - Environment mode ('development' | 'production')
- `CLIENT_URL` (optional) - Frontend URL for CORS (default: '*')
- `FRONTEND_URL` (optional) - Frontend URL for redirects
- `BACKEND_URL` (optional) - Backend URL for OAuth callbacks
- `MOBILE_DEEP_LINK_SCHEME` (optional) - Mobile app deep link scheme

### Performance
- `UV_THREADPOOL_SIZE` (optional) - Node.js thread pool size (default: 12)

## 5. Application Flow

### Request Flow
```
Client Request
    ↓
Express Middleware (CORS, JSON parser, session)
    ↓
Route Handler (from routes/)
    ↓
Authentication Middleware (JWT verification)
    ↓
Controller (from controllers/)
    ↓
Service Layer (from services/) - Business logic
    ↓
Model Layer (Mongoose) - Database operations
    ↓
Response (JSON)
```

### Real-Time Flow (Socket.IO)
```
Client connects with JWT token
    ↓
Socket.IO authentication middleware
    ↓
Socket event handler (in socket/socketServer.js)
    ↓
Redis (if available) or in-memory state
    ↓
Broadcast to room/emit to client
```

### Background Job Flow (Video Transcoding)
```
Upload request → Controller
    ↓
File saved to S3/local
    ↓
Job added to queue (videoTranscodingQueue.js)
    ↓
Queue processor picks up job
    ↓
FFmpeg transcoding (2 concurrent jobs max)
    ↓
Transcoded video uploaded to S3
    ↓
Job status updated in MongoDB
    ↓
Client polls for job status
```

## 6. Authentication & Authorization

### Authentication Methods

1. **Email/Password Signup**
   - User signs up with email, password, name, phone
   - Email OTP verification required
   - Phone OTP verification optional

2. **Phone Number Signup**
   - User signs up with phone number
   - Twilio SMS OTP verification required

3. **Google OAuth**
   - Web: Redirect flow via Passport.js
   - Mobile: Token verification endpoint (`POST /api/auth/verify-google-token`)
   - Supports Web, Android, and iOS client IDs

4. **University Authentication**
   - Separate auth flow for university users
   - Email OTP verification
   - University-specific JWT tokens

### Token Lifecycle

- **Access Token**: JWT, expires in 1 hour
  - Used for API authentication
  - Sent in `Authorization: Bearer <token>` header

- **Refresh Token**: Cryptographically random string, stored in MongoDB
  - Never expires (100-year expiry)
  - Invalidated only on explicit logout
  - Used to generate new access tokens

- **Device Management**: Up to 5 devices per user
  - Oldest device token removed when limit reached

### Role-Based Access Control

1. **User Roles**:
   - `USER` - Regular authenticated user
   - `ADMIN` - Admin user (marketplace, seller management)

2. **Conference Roles**:
   - `HOST` - Conference host (can push questions, view stats)
   - `SPEAKER` - Conference speaker (treated as HOST for polling)
   - `AUDIENCE` - Conference audience (can submit answers)

3. **Course Roles**:
   - `UNIVERSITY` - University user (can create/manage courses)
   - `STUDENT` - Regular user (can enroll in courses)

### Middleware

- `protect` (from `middleware/auth.js`) - JWT authentication
- `hostAuth` - Conference host authorization
- `speakerAuth` - Conference speaker authorization
- `admin` - Admin-only routes
- `multiAuth` - Flexible auth (accepts multiple token types)

## 7. Database Design

### Core Collections

#### User (`User`)
- Profile: name, email, phone, gender, bio, profileImage, coverPhoto
- Auth: password hash, Google OAuth ID, refresh tokens
- Social: friends list, blocked users
- Account: isActive, isVerified, lastLogin
- Location, professional info, content preferences

#### Conference (`Conference`)
- Host information (User/Host/Speaker reference)
- Speakers array
- Public code (unique, uppercase)
- QR code image
- Date, startTime, endTime
- Status: DRAFT, ACTIVE, ENDED
- Group chat reference

#### Conference Question (`ConferenceQuestion`)
- Conference reference
- Question text, options array
- Order number
- Status: DRAFT, ACTIVE, CLOSED
- Results (counts, totalResponses) - stored when closed
- Analytics reference

#### Post (`Post`)
- User reference
- Content: text, media array
- Visibility: public, private
- Likes, comments, shares count
- Timestamps

#### Course (`Course`)
- University reference
- Title, description, thumbnail
- Videos array
- Enrollment settings
- Analytics reference

#### Product (`Product`)
- Seller reference
- Title, description, price
- Images array
- Inventory reference
- Status: ACTIVE, INACTIVE

### Key Relationships

- `User` → `Post` (one-to-many)
- `User` → `Conference` (as host, one-to-many)
- `Conference` → `ConferenceQuestion` (one-to-many)
- `Course` → `Video` (one-to-many)
- `User` → `UserCourseProgress` (one-to-many)
- `Product` → `Order` (one-to-many via cart)

### Indexes

- User: email (unique, sparse), phone (sparse)
- Conference: hostId, publicCode (unique), status
- Post: userId, createdAt
- Course: universityId, createdAt

## 8. API Overview

### Authentication APIs (`/api/auth`)
- `POST /api/auth/signup` - Email/password signup
- `POST /api/auth/login` - Email/password login
- `POST /api/auth/refresh-token` - Refresh access token
- `POST /api/auth/logout` - Logout (invalidate refresh token)
- `POST /api/auth/send-otp-signup` - Send email OTP for signup
- `POST /api/auth/verify-otp-signup` - Verify email OTP
- `POST /api/auth/send-phone-otp-signup` - Send phone OTP (Twilio)
- `POST /api/auth/verify-phone-otp-signup` - Verify phone OTP
- `POST /api/auth/verify-google-token` - Verify Google OAuth token (mobile)
- `GET /api/auth/google` - Google OAuth redirect (web)
- `GET /api/auth/profile` - Get user profile (protected)

### User APIs (`/api/user`)
- `PUT /api/user/profile` - Update profile (protected)
- `POST /api/user/phone/send-otp` - Send OTP for phone update
- `POST /api/user/phone/verify-otp` - Verify OTP and update phone

### Conference APIs (`/api/conference`)
- `GET /api/conference` - List conferences (protected)
- `GET /api/conference/:id` - Get conference details
- `POST /api/conference` - Create conference (host auth)
- `PUT /api/conference/:id` - Update conference (host auth)
- `GET /api/conference/:id/questions` - Get questions
- `POST /api/conference/:id/questions/:questionId/live` - Push question live (host auth)
- `GET /api/conference/:id/questions/:questionId/results` - Get question results (read-only)
- `GET /api/conference/:id/questions/results` - Get all question results (read-only)

### Host/Speaker Auth (`/api/host/auth`, `/api/speaker/auth`)
- `POST /api/host/auth/register` - Register host account
- `POST /api/host/auth/login` - Host login
- `POST /api/speaker/auth/register` - Register speaker account
- `POST /api/speaker/auth/login` - Speaker login

### Social APIs (`/api/posts`, `/api/reels`, `/api/stories`)
- `GET /api/posts/all` - Get all posts (feed)
- `POST /api/posts` - Create post (protected)
- `PUT /api/posts/:id` - Update post (protected)
- `DELETE /api/posts/:id` - Delete post (protected)
- `POST /api/posts/:id/comment` - Add comment (protected)
- `DELETE /api/posts/:id/comment/:commentId` - Delete comment (protected)
- `POST /api/likes` - Like/unlike post/reel (protected)
- `GET /api/friend/requests` - Get friend requests (protected)
- `POST /api/friend/request` - Send friend request (protected)
- `GET /api/chat/conversations` - Get conversations (protected)
- `POST /api/chat/message` - Send message (protected)

### Course APIs (`/api/courses`)
- `GET /api/courses` - List courses (university auth or public)
- `POST /api/courses` - Create course (university auth)
- `GET /api/courses/:id` - Get course details
- `PUT /api/courses/:id` - Update course (university auth)
- `DELETE /api/courses/:id` - Delete course (university auth)

### Marketplace APIs (`/api/marketplace`)
- `GET /api/marketplace/products` - List products
- `POST /api/marketplace/products` - Create product (seller auth)
- `GET /api/marketplace/cart` - Get cart (protected)
- `POST /api/marketplace/cart` - Add to cart (protected)
- `POST /api/marketplace/orders` - Create order (protected)

### Media APIs (`/api/media`)
- `POST /api/media/upload` - Upload media file (protected)
- `GET /api/media/:id` - Get media details

### Video Transcoding APIs (`/api/video-transcoding`)
- `POST /api/video-transcoding/upload` - Upload video for transcoding
- `GET /api/video-transcoding/job/:jobId` - Get transcoding job status

### Twilio OTP (Direct endpoints)
- `POST /send-otp` - Send phone OTP (Twilio)
- `POST /verify-otp` - Verify phone OTP (Twilio)

## 9. Background Jobs & Queues

### Video Transcoding Queue

**Purpose**: Process uploaded videos (posts, reels, stories) using FFmpeg to optimize for web/mobile playback.

**Implementation**: In-memory queue (`src/services/videoTranscodingQueue.js`)
- Custom EventEmitter-based queue
- Processes 2 videos concurrently
- Job status tracked in MongoDB (`VideoTranscodingJob` model)

**Job Lifecycle**:
1. Client uploads video → Controller saves file
2. Job added to queue with status `queued`
3. Queue processor picks up job → Status `processing`
4. FFmpeg transcoding runs (progress updates every 5 seconds)
5. Transcoded video uploaded to S3
6. Job status → `completed` or `failed`

**Job States**: `queued` → `processing` → `completed` / `failed`

**Future Enhancement**: Upgrade to Bull/BullMQ when Redis is enabled for multi-server job processing.

## 10. Media Handling

### Upload Flow

1. **Client Request**: `POST /api/media/upload` with multipart/form-data
2. **Middleware**: `multer` + `multer-s3` (if S3 configured) or local storage
3. **File Processing**:
   - Images: Direct upload to S3
   - Videos: Saved temporarily, added to transcoding queue
4. **Response**: Media URL and metadata

### Storage Mechanism

- **Primary**: AWS S3
  - Region: `AWS_REGION`
  - Bucket: `AWS_BUCKET_NAME`
  - Credentials: Auto-detected from env vars or IAM role

- **Fallback**: Local filesystem (development)

### Video Transcoding

- **Tool**: FFmpeg (via `fluent-ffmpeg`)
- **Process**:
  - Input: Original video file
  - Output: H.264 encoded MP4 (web-optimized)
  - Thumbnail: Generated from first frame
- **Queue**: In-memory (2 concurrent jobs)
- **Status Tracking**: MongoDB `VideoTranscodingJob` collection

## 11. Error Handling Strategy

### Global Error Handler

Located in `src/middleware/errorhandler.js`:
- Catches all unhandled errors
- Returns JSON response with error message
- Includes stack trace in development mode
- Default status code: 500

### Validation

- Request body validation in controllers
- Mongoose schema validation
- Custom error messages for common issues (e.g., invalid phone format)

### Logging

- Console logging for:
  - Request/response (method, path, body)
  - Errors with stack traces
  - Database connection status
  - Redis connection status
  - Socket.IO events

### Error Response Format

```json
{
  "success": false,
  "message": "Error message",
  "stack": "..." // Only in development
}
```

## 12. Scalability & Performance Considerations

### Horizontal Scaling

- **Stateless Design**: JWT tokens, no server-side sessions (except OAuth flow)
- **Redis for State**: Conference polling state, presence tracking
  - Falls back to in-memory if Redis unavailable (single server only)
- **Socket.IO**: In-memory adapter (single server)
  - Can upgrade to Redis adapter when `REDIS_URL` is set

### Database Optimization

- **Indexes**: Strategic indexes on frequently queried fields
- **Population**: Mongoose `.populate()` for related documents
- **Connection Pooling**: Mongoose default connection pooling

### Caching

- **In-Memory Cache**: `node-cache` and `lru-cache` for frequently accessed data
- **Redis Cache**: Optional, for distributed caching

### Rate Limiting

- `rate-limiter-flexible` middleware
- Chat-specific rate limiter (`chatRateLimiter.js`)
- Prevents API abuse

### Performance Optimizations

- **Video Transcoding**: Limited to 2 concurrent jobs to prevent CPU overload
- **File Upload**: Stream-based S3 uploads (no memory buffering)
- **Connection Timeouts**: MongoDB (5s), Redis (10s)

## 13. Local Development Setup

### Prerequisites

- Node.js v22+
- MongoDB (local or Atlas)
- Redis (optional, for scaling features)
- FFmpeg installed (`brew install ffmpeg` on macOS, `apt-get install ffmpeg` on Linux)

### Installation Steps

1. **Clone repository**
   ```bash
   git clone <repository-url>
   cd Subject_mastery_backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create `.env` file**
   ```env
   # Required
   MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/db
   JWT_SECRET=your-super-secret-jwt-key

   # Optional (for full functionality)
   REDIS_URL=redis://localhost:6379
   AWS_REGION=us-east-1
   AWS_BUCKET_NAME=your-bucket
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=your-app-password
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   TWILIO_ACCOUNT_SID=your-twilio-sid
   TWILIO_AUTH_TOKEN=your-twilio-token
   TWILIO_VERIFY_SERVICE_SID=your-service-sid
   PORT=3100
   NODE_ENV=development
   ```

4. **Start MongoDB** (if local)
   ```bash
   mongod
   ```

5. **Start Redis** (optional, if using)
   ```bash
   redis-server
   ```

6. **Run development server**
   ```bash
   npm run dev
   # or
   nodemon src/server.js
   ```

7. **Verify server is running**
   - Visit `http://localhost:3100`
   - Should see API status message

### Development Commands

- `npm start` - Start production server
- `npm run dev` - Start with nodemon (auto-reload)
- `npm run deploy` - Deploy to Cloudflare Workers (if configured)

### Testing Endpoints

- Health check: `GET http://localhost:3100/`
- Debug routes: `GET http://localhost:3100/api/debug/routes`
- Test signup: `POST http://localhost:3100/api/auth/signup`

## 14. Deployment Notes

### Production Considerations

1. **Environment Variables**
   - Set all required variables in production environment
   - Use secure secret management (AWS Secrets Manager, etc.)
   - Never commit `.env` file

2. **Process Management**
   - Use **PM2** for process management:
     ```bash
     pm2 start src/server.js --name sanora-backend
     pm2 save
     pm2 startup
     ```

3. **MongoDB**
   - Use MongoDB Atlas for production
   - Configure IP whitelist
   - Enable connection string authentication

4. **Redis** (Recommended for scaling)
   - Use managed Redis (AWS ElastiCache, Redis Cloud, etc.)
   - Set `REDIS_URL` environment variable
   - Enables horizontal scaling for Socket.IO and conference polling

5. **AWS S3**
   - Create S3 bucket with appropriate CORS policy
   - Configure IAM role or access keys
   - Set bucket lifecycle policies for old files

6. **Security**
   - Use HTTPS (TLS) in production
   - Set `NODE_ENV=production`
   - Use strong `JWT_SECRET`
   - Enable CORS for specific origins only

7. **Monitoring**
   - Monitor server logs: `pm2 logs sanora-backend`
   - Set up error tracking (Sentry, etc.)
   - Monitor MongoDB connection pool
   - Monitor Redis connection status

8. **Graceful Shutdown**
   - Server handles `SIGTERM` and `SIGINT`
   - Closes Redis connections gracefully
   - PM2 handles process restarts

### Logs & Monitoring

- **Console Logs**: All requests, errors, and status updates
- **PM2 Logs**: `pm2 logs sanora-backend`
- **MongoDB Logs**: Check Atlas dashboard
- **Redis Logs**: Check Redis server logs

### Health Checks

- Root endpoint: `GET /` - Returns API status
- Database: Check MongoDB connection on startup
- Redis: Check connection on startup (if configured)

## 15. Known Limitations & Future Improvements

### Current Limitations

1. **Video Transcoding Queue**: In-memory only (not distributed)
   - **Impact**: Cannot scale transcoding across multiple servers
   - **Solution**: Upgrade to Bull/BullMQ when Redis is enabled

2. **Socket.IO Adapter**: In-memory (single server only)
   - **Impact**: WebSocket connections cannot be shared across servers
   - **Solution**: Enable Redis adapter when `REDIS_URL` is set

3. **Conference Polling**: Redis required for multi-server scaling
   - **Impact**: Without Redis, only single-server deployments work
   - **Solution**: Set `REDIS_URL` for horizontal scaling

4. **File Upload**: No automatic cleanup of temporary files
   - **Impact**: Disk space may fill up over time
   - **Solution**: Implement cleanup job for old temporary files

### Future Improvements

1. **Queue System**: Migrate to Bull/BullMQ for distributed job processing
2. **Caching Layer**: Implement Redis caching for frequently accessed data
3. **API Rate Limiting**: Per-user rate limits (currently global)
4. **Webhook Support**: Webhooks for external integrations
5. **GraphQL API**: Add GraphQL endpoint alongside REST
6. **Database Migrations**: Implement migration system for schema changes
7. **Unit Tests**: Add comprehensive test coverage
8. **API Documentation**: Generate OpenAPI/Swagger documentation

---

## Support & Documentation

- **API Documentation**: See `readme/` directory for detailed API docs
- **Conference Flow**: See `readme/CONFERENCE_FLOW_DOCUMENTATION.md`
- **Socket.IO Messaging**: See `readme/SOCKET_MESSAGING_DOCUMENTATION.md`
- **Redis Setup**: See `readme/REDIS_SETUP_GUIDE.md`

---

**Last Updated**: Generated from codebase analysis
**Version**: 1.0.0
**Maintainer**: Backend Team


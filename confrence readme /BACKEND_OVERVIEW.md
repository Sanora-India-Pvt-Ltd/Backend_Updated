# Backend Overview Document
## Subject Mastery Backend (Sanora) - Conference Polling System

**Generated:** 2024  
**Purpose:** Complete analysis of existing backend codebase for live conference polling system (Slido-like)

---

## 1. Project Overview

### What This Backend Is Trying To Do
- **Primary Goal:** Live conference polling/voting system where hosts/speakers create questions, push them live, and audience members answer in real-time
- **Secondary Features:** Social media platform (posts, reels, stories, chat), marketplace, user authentication

### Which Parts Are Implemented
✅ **Fully Implemented:**
- User authentication (email/phone OTP, Google OAuth, JWT tokens)
- Conference CRUD operations (create, read, update, activate, end)
- Question management (add, update, delete, push live)
- Answer submission (users can answer questions)
- Basic analytics (response counts, option counts, correct answers)
- Role-based access control (HOST, SPEAKER, USER, SUPER_ADMIN)
- Public code generation for conference access
- Group chat creation after conference ends
- Media uploads (images, videos with transcoding)
- Social features (posts, reels, stories, comments, likes)
- Real-time chat via Socket.IO (for messaging, NOT for conference updates)

### Which Parts Are Missing or Incomplete
❌ **Critical Missing Features:**
- **No real-time question updates via WebSocket** - Questions pushed live are NOT broadcast to connected clients
- **No automatic question timeout** - No 45-second timer or automatic closing mechanism
- **No QR code generation** - Public codes exist but no QR code endpoint
- **No live result broadcasting** - Analytics are only available via REST API, not pushed in real-time
- **No conference room/namespace in Socket.IO** - Socket.IO only handles chat, not conference events
- **No vote result aggregation in real-time** - Results calculated on-demand, not streamed
- **No question state synchronization** - Multiple hosts/speakers can't see live question state changes
- **No audience count** - No tracking of how many users are viewing/participating in conference

⚠️ **Incomplete Features:**
- Redis is stubbed (in-memory only) - Cannot scale horizontally
- Video transcoding queue is in-memory - Jobs lost on server restart
- Analytics are calculated synchronously - No background processing
- No rate limiting on answer submissions - Vulnerable to spam
- No duplicate vote prevention at database level - Only application-level check

---

## 2. Tech Stack

### Framework
- **Express.js 4.22.1** - Main web framework
- **Hono 4.0.0** - Partial Cloudflare Workers support (not fully implemented)
- **Node.js v22** - Runtime (with DNS/IPv4 fixes)

### Database
- **MongoDB 6.0.0** - Primary database
- **Mongoose 9.0.0** - ODM

### Realtime Layer
- **Socket.IO 4.8.1** - WebSocket server
- **Status:** Only used for chat messaging, NOT for conference polling
- **Adapter:** In-memory (single server only, no Redis adapter)

### Caching Layer
- **Redis:** Stubbed (disabled, using in-memory fallback)
- **Memory Cache:** Custom implementation in `src/utils/memoryCache.js`
- **Presence Tracking:** In-memory Map in `src/config/redisStub.js`

### Deployment Assumptions
- **Primary:** Express server on single Node.js process
- **Alternative:** Cloudflare Workers (partially implemented, not production-ready)
- **Scaling:** NOT designed for horizontal scaling (Redis disabled, in-memory state)

---

## 3. Folder Structure Explanation

```
src/
├── config/              # Configuration files
│   ├── db.js           # MongoDB connection
│   ├── redis.js        # Redis import (points to stub)
│   ├── redisStub.js    # In-memory Redis replacement
│   ├── redisManager.js # Redis-like interface wrapper
│   └── s3.js           # AWS S3 client
│
├── models/             # Mongoose schemas
│   ├── authorization/  # User, Company, Institution, OTP
│   ├── conference/     # Conference, Question, Analytics, Host, Speaker
│   ├── social/         # Post, Reel, Story, Comment, Like, Message, etc.
│   └── marketplace/    # Product, Cart, Inventory, Order
│
├── controllers/        # Business logic handlers
│   ├── authorization/  # Auth, Google OAuth, user management
│   ├── conference/     # Conference CRUD, questions, answers, analytics
│   ├── social/         # Posts, reels, stories, chat, comments
│   └── marketplace/    # Products, cart, orders
│
├── routes/             # Express route definitions
│   ├── authorization/  # Auth endpoints
│   ├── conference/     # Conference endpoints
│   ├── social/         # Social feature endpoints
│   └── marketplace/    # Marketplace endpoints
│
├── middleware/         # Express middleware
│   ├── auth.js         # JWT authentication for Users
│   ├── hostAuth.js     # JWT authentication for Hosts
│   ├── speakerAuth.js  # JWT authentication for Speakers
│   ├── conferenceRoles.js # Role-based access control
│   ├── rateLimiter.js  # OTP rate limiting
│   └── chatRateLimiter.js # Chat rate limiting
│
├── services/           # Business services
│   ├── videoTranscodingQueue.js # In-memory job queue
│   ├── videoTranscoder.js       # FFmpeg wrapper
│   ├── storage.service.js       # S3 upload helper
│   └── conferenceAuthService.js # Shared Host/Speaker auth logic
│
├── socket/             # Socket.IO server
│   └── socketServer.js # Chat WebSocket implementation (NOT conference)
│
└── utils/              # Utility functions
    ├── memoryCache.js  # In-memory cache
    ├── userDataLoader.js # Batch user fetching (N+1 prevention)
    └── formatters.js   # Data formatting helpers
```

### Unclear or Wrongly Named Folders
- ❌ **`services/` at root level** - Contains emailService, otpService, googleOAuth (should be in `src/services/`)
- ⚠️ **`src/socket/`** - Only handles chat, not conference events (misleading for polling use case)
- ⚠️ **`src/services/videoTranscodingQueue.js`** - In-memory queue, not a proper job queue system

---

## 4. Database Design (As Implemented)

### Collections/Tables

#### **users** (User model)
- **Purpose:** Regular user accounts (audience members)
- **Important Fields:**
  - `profile.email`, `profile.phoneNumbers.primary`
  - `auth.password`, `auth.isGoogleOAuth`, `auth.googleId`
  - `auth.tokens.refreshTokens[]` - Array of refresh tokens
  - `account.isActive`, `account.isVerified`, `account.role`
  - `social.friends[]`, `social.blockedUsers[]`
- **Relations:**
  - Referenced by: ConferenceQuestion.answers[].userId
  - References: Company, Institution (for professional data)
- **Problems:**
  - Refresh tokens stored in user document (can grow large)
  - No TTL on refresh tokens (100-year expiry)
  - Email uniqueness not enforced at schema level (only application-level)

#### **conferences** (Conference model)
- **Purpose:** Conference sessions
- **Important Fields:**
  - `title`, `description`
  - `hostId` (refPath to User/Host/Speaker)
  - `ownerModel` ('User', 'Host', 'Speaker')
  - `speakers[]` - Array of Speaker IDs
  - `publicCode` - Unique 6-character code (uppercase alphanumeric)
  - `status` - 'DRAFT', 'ACTIVE', 'ENDED'
  - `endedAt` - Timestamp when ended
  - `groupId` - Chat group created after conference ends
- **Relations:**
  - Referenced by: ConferenceQuestion, ConferenceMedia, ConferenceQuestionAnalytics
- **Problems:**
  - `hostId` can reference 3 different models (polymorphic) - makes queries complex
  - No index on `publicCode` query pattern (though unique index exists)
  - No `startedAt` timestamp (only `endedAt`)

#### **conferencequestions** (ConferenceQuestion model)
- **Purpose:** Polling questions for conferences
- **Important Fields:**
  - `conferenceId` - Reference to Conference
  - `order` - Display order
  - `isLive` - Boolean flag (only one true per conference)
  - `questionText` - Question content
  - `options[]` - Array of {key, text} objects
  - `correctOption` - Correct answer key
  - `status` - 'IDLE', 'ACTIVE', 'CLOSED'
  - `createdByRole` - 'HOST' or 'SPEAKER'
  - `createdById` - Polymorphic reference
  - `answers[]` - **Embedded array** of answer objects
- **Relations:**
  - Referenced by: ConferenceQuestionAnalytics
- **Problems:**
  - **CRITICAL:** Answers stored as embedded array - document grows unbounded
  - **CRITICAL:** No database-level unique constraint on (conferenceId, userId, questionId) for answers
  - Duplicate prevention only at application level (race condition risk)
  - No TTL or archival strategy for old answers
  - `isLive` uniqueness enforced by sparse unique index, but race conditions possible
  - No `activatedAt` or `closedAt` timestamps

#### **conferencequestionanalytics** (ConferenceQuestionAnalytics model)
- **Purpose:** Aggregated analytics for questions
- **Important Fields:**
  - `conferenceId`, `questionId` (unique)
  - `totalResponses` - Count of answers
  - `optionCounts` - Map of option -> count
  - `correctCount` - Number of correct answers
  - `lastUpdated` - Last update timestamp
- **Relations:**
  - One-to-one with ConferenceQuestion
- **Problems:**
  - **CRITICAL:** Analytics updated synchronously on each answer (performance bottleneck)
  - Map type for `optionCounts` - MongoDB Maps are less efficient than embedded objects
  - No historical tracking (only current state)
  - Analytics can become stale if answer submission fails after analytics update

#### **hosts** (Host model - discriminator of ConferenceAccount)
- **Purpose:** Host accounts (conference creators)
- **Important Fields:**
  - `account.email`, `account.phone`, `account.role` ('HOST')
  - `account.status.isActive`, `account.status.isSuspended`
  - `profile.name`, `profile.bio`, `profile.images.avatar`
  - `security.passwordHash`
  - `sessions.refreshTokens[]` - Array of refresh tokens
- **Relations:**
  - Referenced by: Conference.hostId (when ownerModel='Host')
- **Problems:**
  - Separate authentication system from Users (complexity)
  - Refresh tokens in document (same issue as Users)

#### **speakers** (Speaker model - discriminator of ConferenceAccount)
- **Purpose:** Speaker accounts
- **Important Fields:** Same structure as Host
- **Relations:**
  - Referenced by: Conference.speakers[]
- **Problems:** Same as Host

#### **conferencemedias** (ConferenceMedia model)
- **Purpose:** Links media files to conferences
- **Important Fields:**
  - `conferenceId`, `mediaId` (reference to Media)
  - `type` - 'PPT' or 'IMAGE'
  - `createdByRole`, `createdById`, `createdByModel`
- **Relations:**
  - References: Media model
- **Problems:**
  - No validation that mediaId exists before creating link
  - No cleanup if Media is deleted

#### **Other Collections:**
- **medias** - Media file metadata
- **videotranscodingjobs** - Video processing jobs (in-memory queue, persisted to DB)
- **conversations** - Chat conversations (includes conference groups)
- **messages** - Chat messages
- **posts, reels, stories** - Social content
- **comments, likes** - Social interactions
- **groupjoinrequests** - Requests to join conference groups

---

## 5. API Design

### Admin APIs (SUPER_ADMIN role)

**Conference Management:**
- `POST /api/conference` - Create conference (also HOST/SPEAKER)
- `PUT /api/conference/:id` - Update conference (also HOST)
- `POST /api/conference/:id/activate` - Activate conference (also HOST)
- `POST /api/conference/:id/end` - End conference (also HOST)
- `GET /api/conference/:id/analytics` - View all analytics (also HOST/SPEAKER)

**Group Management:**
- `POST /api/conference/group/requests/:id/review` - Approve/reject join requests

**Missing Admin APIs:**
- No bulk operations (activate multiple conferences)
- No system-wide analytics
- No user management endpoints
- No conference deletion (only end)
- No question deletion by admin (only HOST/SPEAKER can delete their own)

### Speaker APIs

**Authentication:**
- `POST /api/speaker/auth/signup` - Signup (requires email + phone OTP verification)
- `POST /api/speaker/auth/login` - Login
- `GET /api/speaker/auth/profile` - Get profile
- `PUT /api/speaker/auth/profile` - Update profile
- `POST /api/speaker/auth/refresh-token` - Refresh access token
- `POST /api/speaker/auth/logout` - Logout

**Conference Access:**
- `GET /api/conference` - List conferences (filtered to assigned ones)
- `GET /api/conference/:id` - Get conference details

**Question Management:**
- `POST /api/conference/:id/questions` - Add question (only their own)
- `PUT /api/conference/:id/questions/:qId` - Update question (only their own)
- `DELETE /api/conference/:id/questions/:qId` - Delete question (only their own)
- `POST /api/conference/:id/questions/:qId/live` - Push question live (only their own)

**Media Management:**
- `POST /api/conference/:id/media` - Add media (only their own)
- `DELETE /api/conference/:id/media/:mediaId` - Delete media (only their own)
- `GET /api/conference/:id/media` - Get media (filtered to their own)

**Analytics:**
- `GET /api/conference/:id/analytics` - Get analytics (only their questions)

**Missing Speaker APIs:**
- No way to see live question status in real-time
- No way to close question automatically after timeout
- No way to see audience count
- No way to see who answered (only aggregated counts)

### Audience (User) APIs

**Authentication:**
- `POST /api/auth/signup` - Signup (requires email + phone OTP)
- `POST /api/auth/login` - Login
- `GET /api/auth/profile` - Get profile
- `PUT /api/auth/profile` - Update profile

**Conference Access:**
- `GET /api/conference?publicCode=ABC123` - Join conference by public code
- `GET /api/conference/:id` - Get conference details

**Question Interaction:**
- `GET /api/conference/:id/questions/live` - Get current live question
- `POST /api/conference/:id/questions/:qId/answer` - Submit answer

**Post-Conference:**
- `POST /api/conference/:id/group/request` - Request to join group
- `GET /api/conference/:id/materials` - Get materials (after approval)

**Missing Audience APIs:**
- No WebSocket endpoint for real-time question updates
- No way to see live results as they come in
- No way to see if question is about to close
- No way to see other participants
- No way to see question history (only live question)

### Duplicated APIs
- `POST /send-otp` and `POST /api/auth/send-phone-otp-signup` - Both use Twilio (different endpoints)
- `POST /verify-otp` and `POST /api/auth/verify-phone-otp-signup` - Duplicate functionality

### API Problems
- **No rate limiting on answer submission** - Users can spam answers (though duplicate check exists)
- **No pagination on answers** - If question has 10k answers, entire array loaded
- **No WebSocket events for conference** - All updates require polling
- **No batch operations** - Cannot answer multiple questions at once
- **No question state machine validation** - Can push question live even if conference is ENDED

---

## 6. Real-Time Flow (Very Important)

### How Sockets Are Currently Used

**Socket.IO Implementation:**
- **Location:** `src/socket/socketServer.js`
- **Purpose:** Chat messaging ONLY
- **Authentication:** JWT token in handshake
- **Rooms:**
  - `user:{userId}` - Personal room for each user
  - `conversation:{conversationId}` - Chat conversation rooms

**Events Emitted:**
- `user:online` - User comes online
- `user:offline` - User goes offline
- `new:message` - New chat message
- `message:sent` - Message sent confirmation
- `message:delivered` - Message delivered status
- `messages:read` - Read receipts
- `typing:start` - Typing indicator start
- `typing:stop` - Typing indicator stop
- `error` - Error messages

**Events Listened To:**
- `join:conversation` - Join a chat room
- `leave:conversation` - Leave a chat room
- `send:message` - Send chat message
- `message:read` - Mark messages as read
- `typing:start` - Start typing
- `typing:stop` - Stop typing

### Problems in Real-Time Flow

**CRITICAL ISSUES:**
1. **No conference WebSocket events** - Questions pushed live are NOT broadcast
2. **No question state synchronization** - Host pushes question live, audience doesn't know until they poll
3. **No real-time result updates** - Results only available via REST API polling
4. **No conference room/namespace** - Socket.IO has no `conference:{conferenceId}` rooms
5. **No live question timeout events** - No automatic closing after 45 seconds
6. **No audience presence** - Cannot see how many users are in conference

**Race Conditions:**
- Multiple hosts can push different questions live simultaneously (only one should be live)
- Answer submission can happen after question is closed (no timestamp validation)
- Analytics update can fail while answer is saved (data inconsistency)

**Scaling Risks:**
- In-memory Socket.IO adapter - Cannot scale to multiple servers
- No Redis pub/sub for cross-server communication
- Presence tracking in memory - Lost on server restart
- No connection pooling or load balancing support

**Missing Real-Time Features:**
- `question:live` - Broadcast when question goes live
- `question:closed` - Broadcast when question closes
- `question:results` - Stream live results
- `conference:status` - Conference activated/ended events
- `audience:count` - Real-time participant count
- `answer:submitted` - Confirmation when answer is recorded

---

## 7. Voting Logic Analysis

### How Votes Are Recorded

**Answer Submission Flow:**
1. User calls `POST /api/conference/:id/questions/:qId/answer`
2. Controller checks:
   - Conference is ACTIVE
   - Question is live (`isLive: true`)
   - Question status is 'ACTIVE'
   - User hasn't already answered (application-level check)
3. Answer added to `question.answers[]` embedded array
4. Question document saved
5. Analytics updated synchronously

**Answer Storage:**
```javascript
{
  userId: ObjectId,
  selectedOption: String (uppercase),
  isCorrect: Boolean,
  answeredAt: Date
}
```

### How Duplicate Votes Are Prevented

**Current Implementation:**
- Application-level check: `question.answers.find(answer => answer.userId === userId)`
- **Problem:** Race condition - two simultaneous requests can both pass check
- **No database-level unique constraint** on (questionId, userId)

**Race Condition Scenario:**
1. User submits answer at time T
2. Two requests arrive simultaneously
3. Both check `existingAnswer` - both return null
4. Both add answer to array
5. Both save - last write wins, but both answers may be in array

### Where Counting Happens

**Analytics Calculation:**
- **Location:** `updateQuestionAnalytics()` in `conferenceController.js`
- **Trigger:** After each answer submission
- **Process:**
  1. Find or create analytics document
  2. Increment `totalResponses`
  3. Update `optionCounts` Map
  4. Increment `correctCount` if correct
  5. Save analytics document

**Problems:**
- **Synchronous update** - Blocks answer submission response
- **No transaction** - Answer can be saved but analytics can fail
- **Race conditions** - Multiple concurrent answers can cause incorrect counts
- **No atomic operations** - Map updates not atomic

### Why This May Fail at Scale

**At 1k Users:**
- 1000 simultaneous answers = 1000 concurrent document saves
- MongoDB write lock contention
- Analytics document becomes hot spot
- Response time increases significantly

**At 10k Users:**
- **Document size limit** - 16MB MongoDB limit
- 10k answers × ~100 bytes = ~1MB per question (acceptable)
- But with metadata, can exceed limit
- Analytics Map updates become bottleneck

**At 1L Users:**
- **Impossible** - Document will exceed 16MB limit
- Analytics updates will timeout
- Database will reject writes
- System will crash

**Additional Issues:**
- No sharding strategy for answers
- No archival of old answers
- No read replicas for analytics queries
- No caching of results

---

## 8. Question Lifecycle

### How Questions Are Activated

**Manual Activation:**
1. Host/Speaker calls `POST /api/conference/:id/questions/:qId/live`
2. Controller:
   - Closes any existing live question (`updateMany` with `isLive: false`)
   - Sets new question `isLive: true`, `status: 'ACTIVE'`
   - Saves question
3. **No WebSocket broadcast** - Audience doesn't know question is live

**Problems:**
- Race condition: Two hosts can push questions simultaneously
- No atomic operation - Closing old and opening new not transactional
- No validation that conference is ACTIVE
- No timestamp recorded (`activatedAt` missing)

### How Only One Question Is Enforced

**Current Implementation:**
- Sparse unique index on `(conferenceId, isLive)` where `isLive: true`
- Application-level: `updateMany` to close existing live questions before opening new

**Problems:**
- **Race condition:** Two requests can both pass unique index check
- Index is sparse (only applies when `isLive: true`)
- MongoDB unique index doesn't prevent race conditions in concurrent writes
- No database-level transaction

### How Timing (45 sec) Is Handled

**CRITICAL: NOT IMPLEMENTED**
- **No automatic timeout mechanism**
- **No 45-second timer**
- **No cron job or scheduled task**
- Questions remain live until manually closed or conference ends

**Missing Features:**
- No `activatedAt` timestamp on question
- No `timeoutSeconds` field
- No background worker to close questions
- No WebSocket event for timeout warning
- No client-side countdown (no server timer to sync with)

### Issues in the Lifecycle

1. **No state machine** - Question can go from IDLE → CLOSED without ACTIVE
2. **No validation** - Can push question live even if conference is ENDED
3. **No cleanup** - Ended conferences still have live questions
4. **No history** - Cannot see when question was activated/closed
5. **No automatic closing** - Questions stay live indefinitely
6. **No synchronization** - Multiple hosts can't see live question state in real-time

---

## 9. Security & Abuse Risks

### Missing Validations

**Input Validation:**
- ✅ Question text validated (not empty)
- ✅ Options validated (min 2 options)
- ✅ Selected option validated (must be in options list)
- ❌ No max length on question text (DoS risk)
- ❌ No max options count (DoS risk)
- ❌ No validation that correctOption exists in options (actually validated)
- ❌ No sanitization of HTML in question text

**Answer Validation:**
- ✅ User must be authenticated
- ✅ Conference must be ACTIVE
- ✅ Question must be live
- ✅ Duplicate check (application-level)
- ❌ No rate limiting on answer submission
- ❌ No IP-based throttling
- ❌ No validation that user is actually in conference (any authenticated user can answer)

### Role Leaks

**Issues Found:**
- `getLiveQuestion` reveals `correctOption` if user has answered (intentional)
- `getConferenceMaterials` reveals all correct answers (only for approved group members)
- Analytics endpoint shows option counts (but not individual answers - good)
- No role escalation - Users cannot become HOST/SPEAKER

**Potential Leaks:**
- Public code is 6 characters (36^6 = 2.1B combinations) - acceptable
- No brute force protection on public code guessing
- Conference details accessible to anyone with public code (intentional for public conferences)

### Vote Manipulation Risks

**Current Protections:**
- ✅ One answer per user per question (application-level)
- ✅ User must be authenticated
- ✅ Question must be live

**Vulnerabilities:**
1. **Race condition** - Multiple simultaneous requests can submit multiple answers
2. **No IP validation** - Same user can create multiple accounts
3. **No device fingerprinting** - Cannot detect bot farms
4. **No CAPTCHA** - Automated voting possible
5. **No time-based validation** - Can answer after question closed (if request in flight)
6. **No answer timestamp validation** - Can submit old answers if question re-opened

### Replay or Spam Risks

**Replay Attacks:**
- ✅ JWT tokens expire (1 hour)
- ✅ Refresh tokens stored server-side
- ❌ No nonce/timestamp validation on answer submission
- ❌ Can replay answer submission if token still valid

**Spam Risks:**
- ❌ No rate limiting on answer submission
- ❌ No rate limiting on question creation
- ❌ No rate limiting on "push live" action
- ✅ Rate limiting on OTP requests (3 per 15 min)
- ✅ Rate limiting on chat messages (30 per minute)

**DoS Risks:**
- Large answer arrays can cause memory issues
- No pagination on answer retrieval
- No max question length
- No max options count
- Analytics updates block answer submission

---

## 10. Scalability Analysis

### What Breaks at 1k Users

**Answer Submission:**
- 1000 simultaneous answers = 1000 concurrent MongoDB writes
- Write lock contention on `conferencequestions` collection
- Analytics document becomes hot spot
- Response time: 500ms - 2s per answer

**Question Push Live:**
- `updateMany` to close existing questions - can be slow with many questions
- No caching of live question - every request queries database

**Analytics Queries:**
- Synchronous analytics update blocks answer submission
- No read replicas - all queries hit primary

**Socket.IO:**
- In-memory adapter - single server only
- 1000 concurrent connections - manageable but not optimal

### What Breaks at 10k Users

**Answer Storage:**
- 10k answers per question = ~1MB document (acceptable)
- But with 10 questions per conference = 10MB total
- Document size approaching 16MB limit

**Analytics Updates:**
- 10k concurrent analytics updates = database overload
- Map updates not atomic - incorrect counts
- Response time: 2s - 10s per answer

**Database Connections:**
- MongoDB connection pool exhausted
- No connection pooling strategy
- Queries start timing out

**Memory:**
- In-memory presence tracking = 10k user entries
- Socket.IO connections = 10k × ~1MB = 10GB memory
- Server will run out of memory

### What Breaks at 1L Users

**CRITICAL FAILURES:**
1. **Document Size Limit** - 16MB MongoDB limit exceeded
2. **Memory Exhaustion** - In-memory state = 100GB+ RAM needed
3. **Database Overload** - 100k concurrent writes = database crash
4. **Analytics Timeout** - Updates take minutes, requests timeout
5. **Socket.IO Crash** - Cannot handle 100k connections on single server

**Impossible to Scale:**
- No horizontal scaling (Redis disabled)
- No sharding strategy
- No read replicas
- No caching layer
- No CDN for static assets
- No load balancing

---

## 11. Overall Assessment

### What Is Done Correctly

✅ **Good Practices:**
- Modular code structure (controllers, routes, models separated)
- Role-based access control implemented
- JWT authentication with refresh tokens
- Input validation on most endpoints
- Error handling middleware
- Mongoose schemas with indexes
- Public code generation for conference access
- Embedded answers (works for small scale)
- Analytics aggregation (concept is correct)

### What Is Fundamentally Wrong

❌ **Architecture Issues:**
1. **No real-time updates** - Core feature missing for polling system
2. **Embedded answers** - Will not scale beyond 10k users
3. **Synchronous analytics** - Blocks answer submission
4. **No horizontal scaling** - Redis disabled, in-memory state
5. **No question timeout** - Manual closing only
6. **No WebSocket for conference** - Only REST API polling

❌ **Data Model Issues:**
1. **Answers in embedded array** - Should be separate collection
2. **No unique constraint on answers** - Race conditions possible
3. **Analytics Map type** - Less efficient than embedded objects
4. **No timestamps on question lifecycle** - Cannot track when activated/closed

❌ **Security Issues:**
1. **No rate limiting on answers** - Spam vulnerability
2. **Race conditions in duplicate prevention** - Multiple votes possible
3. **No transaction wrapping** - Answer and analytics can be inconsistent

### What Must Be Refactored First

**Priority 1 (Critical):**
1. **Move answers to separate collection** - `conferenceanswers` collection
2. **Add unique index** on `(questionId, userId)` for answers
3. **Implement WebSocket events** for conference (question:live, question:closed, question:results)
4. **Add question timeout mechanism** - Background worker or cron job
5. **Wrap answer submission in transaction** - Ensure answer + analytics both save

**Priority 2 (High):**
1. **Enable Redis** - Replace stub with real Redis
2. **Add Redis adapter to Socket.IO** - Enable horizontal scaling
3. **Move analytics to background job** - Don't block answer submission
4. **Add rate limiting** on answer submission
5. **Add database-level constraints** - Unique indexes, foreign keys

**Priority 3 (Medium):**
1. **Add question state machine** - Validate transitions
2. **Add timestamps** - activatedAt, closedAt on questions
3. **Add pagination** - For answers, questions, analytics
4. **Add caching** - Cache live question, analytics results
5. **Add read replicas** - For analytics queries

### What Can Be Reused Safely

✅ **Safe to Reuse:**
- Authentication system (JWT, OTP, Google OAuth)
- Role-based access control middleware
- Conference CRUD operations
- Question CRUD operations (structure is fine, just storage needs change)
- Media upload system
- Public code generation logic
- Analytics calculation logic (just move to background)

✅ **Partially Reusable:**
- Socket.IO setup (add conference events)
- Answer validation logic (add rate limiting, transactions)
- Analytics aggregation (move to background, add caching)

❌ **Must Rewrite:**
- Answer storage (embedded → separate collection)
- Real-time update mechanism (add WebSocket events)
- Question timeout (completely missing)
- Scaling infrastructure (enable Redis, horizontal scaling)

---

## Conclusion

This backend has a **solid foundation** for a conference polling system but is **missing critical real-time features** and **will not scale** beyond 10k users without significant refactoring.

**Key Missing Pieces:**
- Real-time WebSocket updates for conference events
- Automatic question timeout (45 seconds)
- Horizontal scaling infrastructure (Redis)
- Proper answer storage (separate collection)
- Background job processing for analytics

**Immediate Action Items:**
1. Implement WebSocket events for conference polling
2. Move answers to separate collection with proper indexes
3. Add question timeout mechanism
4. Enable Redis for horizontal scaling
5. Add rate limiting and transaction wrapping

The codebase is **production-ready for small-scale use** (hundreds of users) but requires **major refactoring** for enterprise-scale deployments (thousands+ users).


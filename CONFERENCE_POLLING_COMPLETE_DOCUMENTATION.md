# Conference Polling System - Complete Documentation

## 📁 Files Related to Conference Polling

### Core Service Files
1. **`src/services/conferencePollingService.js`** (700 lines)
   - Main polling service with Redis operations
   - In-memory fallback when Redis unavailable
   - Services: `conferenceService`, `questionService`, `votingService`, `audienceService`, `lockService`, `pollStatsService`

2. **`src/socket/conferenceHandlers.js`** (954 lines)
   - Socket.IO event handlers for real-time polling
   - Handles: join/leave, question push/close, voting, poll tracking

3. **`src/config/redisConnection.js`** (122 lines)
   - Redis client initialization and connection management
   - Supports fallback to in-memory mode

### Controller Files
4. **`src/controllers/conference/conferenceController.js`** (1780 lines)
   - HTTP REST API endpoints for conference management
   - Question CRUD operations
   - Live question management
   - Answer submission (legacy MongoDB-based)

5. **`src/controllers/conference/conferenceResultsController.js`** (82 lines)
   - Get question results
   - Get conference results

### Route Files
6. **`src/routes/conference/conferenceRoutes.js`** (146 lines)
   - REST API routes for conferences

7. **`src/routes/conference/conferenceResultsRoutes.js`** (94 lines)
   - REST API routes for results

### Model Files
8. **`src/models/conference/ConferenceQuestion.js`** (139 lines)
   - Question schema with embedded answers array
   - Status: IDLE, ACTIVE, CLOSED

9. **`src/models/conference/Conference.js`** (79 lines)
   - Conference schema

10. **`src/models/conference/ConferenceQuestionAnalytics.js`**
    - Analytics tracking model

### Documentation Files
11. **`confrence readme /LIVE_CONFERENCE_RUNTIME_DESIGN.md`**
    - Complete system design documentation

12. **`confrence readme /POLLING_IMPLEMENTATION_ANALYSIS.md`**
    - Analysis of MongoDB issues and race conditions

13. **`confrence readme /IMPLEMENTATION_SUMMARY.md`**
    - Implementation summary

14. **`confrence readme /TESTING_CONFERENCE_POLLING.md`**
    - Testing documentation

---

## 🔌 REST API Endpoints

### Base URL: `/api/conference`

### Conference Management

#### 1. Create Conference
- **Endpoint:** `POST /api/conference`
- **Auth:** HOST/SUPER_ADMIN (multiAuth)
- **Body:**
  ```json
  {
    "title": "string",
    "description": "string",
    "speakerIds": ["ObjectId"]
  }
  ```
- **Response:** Conference object with QR code

#### 2. Get All Conferences
- **Endpoint:** `GET /api/conference`
- **Auth:** Optional (multiAuth)
- **Query Params:** `?status=DRAFT|ACTIVE|ENDED&role=host|speaker`
- **Response:** Array of conferences

#### 3. Get Conference by ID
- **Endpoint:** `GET /api/conference/:conferenceId`
- **Auth:** Optional (multiAuth)
- **Response:** Conference with userRole

#### 4. Get Conference by Public Code (Public)
- **Endpoint:** `GET /api/conference/public/:publicCode`
- **Auth:** None (public route)
- **Response:** Conference object

#### 5. Update Conference
- **Endpoint:** `PUT /api/conference/:conferenceId`
- **Auth:** HOST/SUPER_ADMIN (multiAuth)
- **Body:**
  ```json
  {
    "title": "string",
    "description": "string",
    "speakerIds": ["ObjectId"]
  }
  ```
- **Response:** Updated conference

#### 6. Activate Conference
- **Endpoint:** `POST /api/conference/:conferenceId/activate`
- **Auth:** HOST/SUPER_ADMIN (multiAuth)
- **Response:** Activated conference (status: ACTIVE)
- **Note:** Syncs status to Redis

#### 7. End Conference
- **Endpoint:** `POST /api/conference/:conferenceId/end`
- **Auth:** HOST/SUPER_ADMIN (multiAuth)
- **Response:** Ended conference (status: ENDED, creates group)
- **Note:** Syncs status to Redis, closes all live questions

#### 8. Regenerate QR Code
- **Endpoint:** `POST /api/conference/:conferenceId/qr-code/regenerate`
- **Auth:** HOST/SPEAKER/SUPER_ADMIN (multiAuth)
- **Response:** Conference with new QR code

### Question Management

#### 9. Add Question
- **Endpoint:** `POST /api/conference/:conferenceId/questions`
- **Auth:** HOST/SPEAKER (multiAuth)
- **Body:**
  ```json
  {
    "order": 1,
    "questionText": "string",
    "options": [
      { "key": "A", "text": "Option A" },
      { "key": "B", "text": "Option B" }
    ],
    "correctOption": "A"
  }
  ```
- **Response:** Created question

#### 10. Get Questions
- **Endpoint:** `GET /api/conference/:conferenceId/questions`
- **Auth:** Optional (multiAuth)
- **Response:** Array of questions (filtered by role)

#### 11. Update Question
- **Endpoint:** `PUT /api/conference/:conferenceId/questions/:questionId`
- **Auth:** HOST/SPEAKER (multiAuth)
- **Body:**
  ```json
  {
    "questionText": "string",
    "options": [...],
    "correctOption": "A",
    "order": 1
  }
  ```
- **Response:** Updated question
- **Note:** SPEAKER can only update their own questions

#### 12. Delete Question
- **Endpoint:** `DELETE /api/conference/:conferenceId/questions/:questionId`
- **Auth:** HOST/SPEAKER (multiAuth)
- **Response:** Success message
- **Note:** SPEAKER can only delete their own questions

#### 13. Push Question Live
- **Endpoint:** `POST /api/conference/:conferenceId/questions/:questionId/live`
- **Auth:** HOST/SPEAKER (multiAuth)
- **Body:**
  ```json
  {
    "duration": 45  // Optional, defaults to 45 seconds
  }
  ```
- **Response:** Question with startedAt/expiresAt
- **Note:** 
  - Sets question live in Redis
  - Emits Socket.IO event `question:live`
  - Starts 45-second timer
  - Only one question live at a time

#### 14. Get Live Question
- **Endpoint:** `GET /api/conference/:conferenceId/questions/live`
- **Auth:** Required (multiAuth)
- **Response:** Live question or null
- **Note:** Hides correctOption if user hasn't answered

#### 15. Answer Question (Legacy - MongoDB-based)
- **Endpoint:** `POST /api/conference/:conferenceId/questions/:questionId/answer`
- **Auth:** Required (multiAuth)
- **Body:**
  ```json
  {
    "selectedOption": "A"
  }
  ```
- **Response:**
  ```json
  {
    "isCorrect": true,
    "correctOption": "A"
  }
  ```
- **Note:** Legacy endpoint, uses MongoDB. Real-time voting uses Socket.IO

### Media Management

#### 16. Add Media
- **Endpoint:** `POST /api/conference/:conferenceId/media`
- **Auth:** HOST/SPEAKER (multiAuth)
- **Body:**
  ```json
  {
    "mediaId": "ObjectId",
    "type": "PPT|IMAGE"
  }
  ```
- **Response:** Conference media object

#### 17. Get Media
- **Endpoint:** `GET /api/conference/:conferenceId/media`
- **Auth:** Optional (multiAuth)
- **Response:** Array of media (filtered by role)

#### 18. Delete Media
- **Endpoint:** `DELETE /api/conference/:conferenceId/media/:mediaId`
- **Auth:** HOST/SPEAKER (multiAuth)
- **Response:** Success message
- **Note:** SPEAKER can only delete their own media

### Analytics

#### 19. Get Analytics
- **Endpoint:** `GET /api/conference/:conferenceId/analytics`
- **Auth:** HOST/SPEAKER/SUPER_ADMIN (multiAuth)
- **Response:** Array of question analytics
- **Note:** USER cannot view analytics

### Group Management

#### 20. Request Group Join
- **Endpoint:** `POST /api/conference/:conferenceId/group/request`
- **Auth:** Required (multiAuth)
- **Response:** Join request object

#### 21. Review Group Join Request
- **Endpoint:** `POST /api/conference/group/requests/:requestId/review`
- **Auth:** SUPER_ADMIN (multiAuth)
- **Body:**
  ```json
  {
    "action": "APPROVE|REJECT"
  }
  ```
- **Response:** Updated join request

### Materials

#### 22. Get Conference Materials
- **Endpoint:** `GET /api/conference/:conferenceId/materials`
- **Auth:** Required (multiAuth)
- **Response:**
  ```json
  {
    "questions": [...],
    "media": [...]
  }
  ```
- **Note:** Requires approved group membership for USER

### Results

#### 23. Get Question Result
- **Endpoint:** `GET /api/conference/:conferenceId/questions/:questionId/results`
- **Auth:** Required (multiAuth)
- **Response:** Question result with counts and percentages

#### 24. Get Conference Results
- **Endpoint:** `GET /api/conference/:conferenceId/questions/results`
- **Auth:** Required (multiAuth)
- **Response:** Array of all closed question results

---

## 🔌 Socket.IO Events

### Client → Server Events

#### 1. `conference:join`
- **Purpose:** Join conference room
- **Auth:** All authenticated users
- **Payload:**
  ```json
  {
    "conferenceId": "string"
  }
  ```
- **Response:** `conference:joined` event

#### 2. `conference:leave`
- **Purpose:** Leave conference room
- **Auth:** All users
- **Payload:**
  ```json
  {
    "conferenceId": "string"
  }
  ```
- **Response:** `conference:left` event

#### 3. `question:push_live`
- **Purpose:** Push question live (HOST only)
- **Auth:** HOST only
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "questionId": "string",
    "duration": 45  // Optional
  }
  ```
- **Response:** `question:live` event broadcast

#### 4. `question:close`
- **Purpose:** Manually close live question (HOST only)
- **Auth:** HOST only
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "questionId": "string"
  }
  ```
- **Response:** `question:closed` and `vote:final_result` events

#### 5. `vote:submit`
- **Purpose:** Submit vote (AUDIENCE only)
- **Auth:** AUDIENCE only (not HOST)
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "questionId": "string",
    "selectedOption": "A"  // Uppercase
  }
  ```
- **Response:** 
  - `vote:accepted` (to sender)
  - `vote:result` (broadcast to all)

#### 6. `poll:join`
- **Purpose:** Track participant joining poll
- **Auth:** All users
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "questionId": "string"
  }
  ```
- **Response:** `poll:live-stats` (to HOST only)

#### 7. `poll:vote`
- **Purpose:** Submit poll vote (AUDIENCE only)
- **Auth:** AUDIENCE only (not HOST)
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "questionId": "string",
    "optionKey": "A"  // Uppercase
  }
  ```
- **Response:**
  - `poll:vote:accepted` (to sender)
  - `poll:live-stats` (to HOST only)

### Server → Client Events

#### 1. `conference:joined`
- **Purpose:** Confirm user joined conference
- **Recipients:** Sender only
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "conferenceStatus": "DRAFT|ACTIVE|ENDED",
    "liveQuestion": {
      "questionId": "string",
      "questionText": "string",
      "options": [...],
      "duration": 45,
      "startedAt": 1234567890,
      "expiresAt": 1234567890
    } | null,
    "audienceCount": 100,
    "role": "HOST|AUDIENCE",
    "timestamp": 1234567890
  }
  ```

#### 2. `conference:left`
- **Purpose:** Confirm user left conference
- **Recipients:** Sender only
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "timestamp": 1234567890
  }
  ```

#### 3. `question:live`
- **Purpose:** Question pushed live
- **Recipients:** All in `conference:{conferenceId}`
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "questionId": "string",
    "questionText": "string",
    "options": [
      { "key": "A", "text": "Option A" }
    ],
    "duration": 45,
    "startedAt": 1234567890,
    "expiresAt": 1234567890
  }
  ```

#### 4. `question:closed`
- **Purpose:** Question closed (manual or timeout)
- **Recipients:** All in `conference:{conferenceId}`
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "questionId": "string",
    "reason": "manual|timeout",
    "closedAt": 1234567890
  }
  ```

#### 5. `question:timer_update`
- **Purpose:** Countdown timer update (every second)
- **Recipients:** All in `conference:{conferenceId}`
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "questionId": "string",
    "timeRemaining": 30,  // Seconds
    "expiresAt": 1234567890
  }
  ```

#### 6. `vote:accepted`
- **Purpose:** Vote successfully recorded
- **Recipients:** Sender only
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "questionId": "string",
    "selectedOption": "A",
    "isCorrect": true,
    "timestamp": 1234567890
  }
  ```

#### 7. `vote:rejected`
- **Purpose:** Vote rejected
- **Recipients:** Sender only
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "questionId": "string",
    "reason": "duplicate|question_closed|invalid_option|not_audience",
    "timestamp": 1234567890
  }
  ```

#### 8. `vote:result`
- **Purpose:** Real-time vote count update (on every vote)
- **Recipients:** All in `conference:{conferenceId}`
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "questionId": "string",
    "totalVotes": 150,
    "optionCounts": {
      "A": 50,
      "B": 70,
      "C": 30
    },
    "timestamp": 1234567890
  }
  ```

#### 9. `vote:final_result`
- **Purpose:** Final results when question closes
- **Recipients:** All in `conference:{conferenceId}`
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "questionId": "string",
    "totalVotes": 150,
    "optionCounts": {
      "A": 50,
      "B": 70,
      "C": 30
    },
    "correctOption": "B",
    "correctCount": 70,
    "percentageBreakdown": {
      "A": 33,
      "B": 47,
      "C": 20
    },
    "closedAt": 1234567890
  }
  ```

#### 10. `poll:vote:accepted`
- **Purpose:** Poll vote accepted
- **Recipients:** Sender only
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "questionId": "string",
    "optionKey": "A",
    "timestamp": 1234567890
  }
  ```

#### 11. `poll:live-stats`
- **Purpose:** Live poll statistics (HOST only)
- **Recipients:** HOST only (in `host:{conferenceId}`)
- **Payload:**
  ```json
  {
    "questionId": "string",
    "participants": 100,
    "totalVotes": 85,
    "results": {
      "A": { "count": 30, "percentage": 35 },
      "B": { "count": 40, "percentage": 47 },
      "C": { "count": 15, "percentage": 18 }
    },
    "timestamp": 1234567890
  }
  ```

#### 12. `audience:joined`
- **Purpose:** New audience member joined
- **Recipients:** HOST only
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "userId": "string",
    "audienceCount": 100,
    "timestamp": 1234567890
  }
  ```

#### 13. `audience:left`
- **Purpose:** Audience member left
- **Recipients:** HOST only
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "userId": "string",
    "audienceCount": 99,
    "timestamp": 1234567890
  }
  ```

#### 14. `audience:count`
- **Purpose:** Current audience count update
- **Recipients:** All in `conference:{conferenceId}`
- **Payload:**
  ```json
  {
    "conferenceId": "string",
    "audienceCount": 100,
    "timestamp": 1234567890
  }
  ```

#### 15. `error`
- **Purpose:** Error occurred
- **Recipients:** Sender only
- **Payload:**
  ```json
  {
    "code": "UNAUTHORIZED|CONFERENCE_NOT_FOUND|QUESTION_NOT_LIVE|...",
    "message": "string",
    "timestamp": 1234567890
  }
  ```

---

## 🔄 Complete Flow

### 1. Conference Setup Flow

```
1. HOST creates conference
   POST /api/conference
   → Conference created (status: DRAFT)
   → Redis: conference:{id}:status = DRAFT
   → Redis: conference:{id}:host = hostId

2. HOST adds questions
   POST /api/conference/:id/questions
   → Questions stored in MongoDB (status: IDLE)

3. HOST activates conference
   POST /api/conference/:id/activate
   → Conference status: ACTIVE
   → Redis: conference:{id}:status = ACTIVE
```

### 2. Real-Time Polling Flow (Socket.IO)

```
1. User joins conference
   Socket: conference:join { conferenceId }
   → Server validates conference exists and is ACTIVE
   → Server determines role (HOST or AUDIENCE)
   → Socket joins room: conference:{conferenceId}
   → If HOST: joins room: host:{conferenceId}
   → Redis: SADD conference:{id}:audience {userId}
   → Server emits: conference:joined (with liveQuestion if any)

2. HOST pushes question live
   Socket: question:push_live { conferenceId, questionId, duration }
   → Server validates HOST authority
   → Server acquires lock: conference:{id}:lock:push_question
   → Server closes existing live question (if any)
   → Server loads question from MongoDB
   → Redis: HSET conference:{id}:live_question { questionId, startedAt, expiresAt, duration }
   → Redis: HSET question:{id}:meta { questionText, options, correctOption }
   → Redis: Initialize vote counts (all options = 0)
   → Server starts timer countdown (45 seconds)
   → Server emits: question:live (to all in conference room)

3. AUDIENCE receives question
   → Client receives: question:live event
   → Client displays question and options
   → Client starts countdown timer

4. AUDIENCE votes
   Socket: poll:vote { conferenceId, questionId, optionKey }
   OR
   Socket: vote:submit { conferenceId, questionId, selectedOption }
   → Server validates AUDIENCE (not HOST)
   → Server checks question is live
   → Server acquires lock: question:{id}:lock:vote:{userId}
   → Server checks duplicate vote: SISMEMBER question:{id}:votes:users {userId}
   → If new vote:
     → Redis: SADD question:{id}:votes:users {userId}
     → Redis: HINCRBY question:{id}:votes:counts {optionKey} 1
     → Redis: HINCRBY question:{id}:votes:counts total 1
     → Server emits: poll:vote:accepted (to sender)
     → Server emits: poll:live-stats (to HOST only)
     → Server emits: vote:result (to all in conference)

5. Timer countdown
   → Server emits: question:timer_update (every second)
   → When timeRemaining = 0:
     → Server closes question automatically

6. Question closes (manual or timeout)
   → Server calculates final results
   → Server emits: question:closed
   → Server emits: vote:final_result (with correctOption revealed)
   → Server saves results to MongoDB (async)
   → Server cleans up Redis keys (after 1 hour delay)
   → Server stops timer countdown
```

### 3. Answer Submission Flow (Legacy - MongoDB)

```
1. USER answers question
   POST /api/conference/:id/questions/:questionId/answer
   Body: { selectedOption: "A" }
   → Server validates conference is ACTIVE
   → Server validates question is live
   → Server checks duplicate answer (in MongoDB)
   → Server adds answer to question.answers[] array
   → Server saves question document (full rewrite)
   → Server updates analytics (separate document)
   → Server returns: { isCorrect: true, correctOption: "A" }
```

**Note:** This is the legacy flow. Real-time polling uses Socket.IO events instead.

### 4. Results Retrieval Flow

```
1. Get question result
   GET /api/conference/:id/questions/:questionId/results
   → Server queries MongoDB for closed question
   → Server returns: { counts, percentages, totalResponses }

2. Get all conference results
   GET /api/conference/:id/questions/results
   → Server queries all closed questions
   → Server returns: Array of question results
```

---

## 🗄️ Redis Key Structure

### Conference State
- `conference:{conferenceId}:status` - Conference status (ACTIVE/ENDED)
- `conference:{conferenceId}:host` - Host user ID
- `conference:{conferenceId}:live_question` - Hash with questionId, startedAt, expiresAt, duration
- `conference:{conferenceId}:audience` - Set of user IDs in conference

### Question State
- `question:{questionId}:meta` - Hash with questionText, options, correctOption
- `question:{questionId}:timer` - Hash with startedAt, expiresAt, duration

### Voting
- `question:{questionId}:votes:counts` - Hash with total and option counts
- `question:{questionId}:votes:users` - Set of user IDs who voted
- `question:{questionId}:votes:correct` - Counter for correct votes

### Poll Statistics
- `conference:{conferenceId}:question:{questionId}:participants` - Set of participant user IDs
- `conference:{conferenceId}:question:{questionId}:votes` - Hash with option vote counts
- `conference:{conferenceId}:question:{questionId}:userVotes` - Hash mapping userId -> optionKey

### Locks
- `conference:{conferenceId}:lock:push_question` - Lock for pushing questions
- `question:{questionId}:lock:vote:{userId}` - Lock for user vote submission

### User Mapping
- `user:{userId}:conferences` - Set of conference IDs user is in

---

## 🔐 Authentication & Authorization

### Multi-Auth Middleware
- Supports three auth types: Host, Speaker, User
- JWT token contains `type` field: `'host'`, `'speaker'`, or default (User)
- Routes to appropriate model based on token type

### Role-Based Access

#### HOST
- ✅ Create/update/delete conferences
- ✅ Activate/end conferences
- ✅ Add/update/delete questions
- ✅ Push questions live
- ✅ Close questions manually
- ✅ View analytics
- ✅ Receive audience join/leave events
- ✅ Receive live poll statistics
- ❌ Cannot vote

#### SPEAKER
- ✅ Add/update/delete own questions
- ✅ Push own questions live
- ✅ View own analytics
- ❌ Cannot vote
- ❌ Cannot manage conference

#### USER/AUDIENCE
- ✅ Join conferences
- ✅ View live questions
- ✅ Submit votes
- ✅ View final results
- ❌ Cannot push questions
- ❌ Cannot view analytics
- ❌ Cannot see correct answer until question closes

#### SUPER_ADMIN
- ✅ All HOST permissions
- ✅ Review group join requests
- ✅ View all analytics

---

## ⚡ Performance Features

### Redis Operations
- Atomic operations: `HINCRBY`, `SADD`, `SET NX`
- Pipeline operations for batch updates
- TTL on temporary keys (auto-cleanup)
- In-memory fallback when Redis unavailable

### Socket.IO Optimization
- Room-based broadcasting (efficient)
- Separate rooms for HOST (private events)
- Event throttling for high-frequency updates
- Timer countdown (1-second intervals)

### Scalability
- Redis for real-time state (horizontal scaling)
- MongoDB for persistence (source of truth)
- Async result saving (non-blocking)
- Lock mechanism prevents race conditions

---

## 🐛 Known Issues (From Analysis)

### MongoDB Issues
1. Embedded answers array (16MB document limit)
2. Full document rewrite on answer save
3. Race conditions in answer submission
4. No atomic operations for analytics
5. N+1 query patterns

### Race Conditions
1. Duplicate answer prevention
2. Question state changes during submission
3. Concurrent analytics updates
4. Multiple live questions possible

### Scalability Blockers
1. Document size limits (~100k answers max)
2. Write amplification
3. Index bloat on embedded arrays
4. Hot document contention
5. No horizontal scaling for MongoDB operations

**Note:** The Socket.IO + Redis implementation addresses most of these issues for real-time polling, but the legacy MongoDB-based answer endpoint still has these problems.

---

## 📊 Data Flow Summary

```
HTTP REST API (MongoDB)
  ↓
Conference Management
  ↓
Socket.IO Connection
  ↓
Redis (Real-time State)
  ↓
Socket.IO Events (Broadcast)
  ↓
MongoDB (Final Results - Async)
```

---

## 🔧 Configuration

### Environment Variables
- `REDIS_URL` - Redis connection URL (optional, falls back to in-memory)
- `JWT_SECRET` - JWT secret for token verification

### Redis Connection
- Lazy connect enabled
- Auto-retry with exponential backoff
- Graceful fallback to in-memory storage
- Separate clients for pub/sub operations

---

## 📝 Notes

1. **Dual Voting Systems:**
   - Socket.IO `poll:vote` / `vote:submit` - Real-time, Redis-based
   - HTTP POST `/answer` - Legacy, MongoDB-based

2. **Question Lifecycle:**
   - IDLE → ACTIVE (when pushed live) → CLOSED (when timer expires or manually closed)

3. **Timer Mechanism:**
   - Server-side timer with 1-second countdown broadcasts
   - Redis TTL as backup auto-close
   - Manual close by HOST

4. **Result Persistence:**
   - Real-time results in Redis
   - Final results saved to MongoDB asynchronously
   - Redis keys kept for 1 hour for recovery

5. **Authority:**
   - HOST and SPEAKER are treated as same entity for conference control
   - Role determined server-side from JWT token
   - Socket.IO rooms separate HOST from AUDIENCE

---

## 🎯 Key Features

✅ Real-time question lifecycle management  
✅ Automatic 45-second timer with countdown  
✅ Atomic vote submission (Redis)  
✅ Duplicate vote prevention  
✅ Real-time result broadcasting  
✅ Audience presence tracking  
✅ Live poll statistics for HOST  
✅ Graceful Redis fallback (in-memory)  
✅ Horizontal scaling support  
✅ Role-based access control  

---

**Last Updated:** Based on codebase analysis  
**Total Endpoints:** 24 REST API + 7 Socket.IO client events + 15 Socket.IO server events


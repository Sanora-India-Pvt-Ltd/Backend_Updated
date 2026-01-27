# Live Conference Runtime System Design
## Socket.IO + Redis Architecture

**Assumption:** HOST and SPEAKER are the same user (unified authority)  
**Constraint:** MongoDB remains unchanged (read-only for this system)

---

## 1. Socket.IO Event Names

### 1.1 Client → Server Events (Incoming)

#### Conference Connection
- **`conference:join`**
  - **Purpose:** User joins a conference room
  - **Authority:** All authenticated users (HOST, AUDIENCE)
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      role: 'HOST' | 'AUDIENCE'  // Determined server-side from JWT
    }
    ```

- **`conference:leave`**
  - **Purpose:** User leaves conference room
  - **Authority:** All users
  - **Payload:**
    ```typescript
    {
      conferenceId: string
    }
    ```

#### Host Control Events
- **`question:push_live`**
  - **Purpose:** Host pushes a question live
  - **Authority:** HOST only
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      questionId: string,
      duration: number  // Optional, defaults to 45 seconds
    }
    ```

- **`question:close`**
  - **Purpose:** Host manually closes live question
  - **Authority:** HOST only
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      questionId: string
    }
    ```

#### Audience Voting Events
- **`vote:submit`**
  - **Purpose:** Audience member submits vote
  - **Authority:** AUDIENCE only (not HOST)
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      questionId: string,
      selectedOption: string  // Uppercase: 'A', 'B', 'C', etc.
    }
    ```

### 1.2 Server → Client Events (Outgoing)

#### Conference State Events
- **`conference:joined`**
  - **Purpose:** Confirm user joined conference
  - **Recipients:** Sender only
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      conferenceStatus: 'DRAFT' | 'ACTIVE' | 'ENDED',
      liveQuestion: LiveQuestion | null,
      audienceCount: number
    }
    ```

- **`conference:left`**
  - **Purpose:** Confirm user left conference
  - **Recipients:** Sender only
  - **Payload:**
    ```typescript
    {
      conferenceId: string
    }
    ```

- **`conference:status_changed`**
  - **Purpose:** Conference status changed (activated/ended)
  - **Recipients:** All in `conference:{conferenceId}`
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      status: 'ACTIVE' | 'ENDED',
      timestamp: number
    }
    ```

#### Question Lifecycle Events
- **`question:live`**
  - **Purpose:** Question pushed live
  - **Recipients:** All in `conference:{conferenceId}`
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      questionId: string,
      questionText: string,
      options: Array<{ key: string, text: string }>,
      duration: number,  // Seconds (45 default)
      startedAt: number,  // Unix timestamp
      expiresAt: number   // Unix timestamp
    }
    ```

- **`question:closed`**
  - **Purpose:** Question closed (manual or timeout)
  - **Recipients:** All in `conference:{conferenceId}`
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      questionId: string,
      reason: 'manual' | 'timeout',
      closedAt: number
    }
    ```

- **`question:timer_update`**
  - **Purpose:** Countdown timer update (every second)
  - **Recipients:** All in `conference:{conferenceId}`
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      questionId: string,
      timeRemaining: number,  // Seconds remaining
      expiresAt: number
    }
    ```

#### Voting Events
- **`vote:accepted`**
  - **Purpose:** Vote successfully recorded
  - **Recipients:** Sender only
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      questionId: string,
      selectedOption: string,
      isCorrect: boolean,
      timestamp: number
    }
    ```

- **`vote:rejected`**
  - **Purpose:** Vote rejected (duplicate, question closed, etc.)
  - **Recipients:** Sender only
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      questionId: string,
      reason: 'duplicate' | 'question_closed' | 'invalid_option' | 'not_audience',
      timestamp: number
    }
    ```

- **`vote:result`**
  - **Purpose:** Real-time vote count update
  - **Recipients:** All in `conference:{conferenceId}` (broadcast on every vote)
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      questionId: string,
      totalVotes: number,
      optionCounts: {
        [optionKey: string]: number  // e.g., { 'A': 150, 'B': 230, 'C': 45 }
      },
      timestamp: number
    }
    ```

- **`vote:final_result`**
  - **Purpose:** Final results when question closes
  - **Recipients:** All in `conference:{conferenceId}`
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      questionId: string,
      totalVotes: number,
      optionCounts: {
        [optionKey: string]: number
      },
      correctOption: string,  // Only revealed after question closes
      correctCount: number,
      percentageBreakdown: {
        [optionKey: string]: number  // Percentage of total votes
      },
      closedAt: number
    }
    ```

#### Audience Presence Events
- **`audience:joined`**
  - **Purpose:** New audience member joined
  - **Recipients:** HOST only (in `host:{conferenceId}`)
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      userId: string,
      audienceCount: number,
      timestamp: number
    }
    ```

- **`audience:left`**
  - **Purpose:** Audience member left
  - **Recipients:** HOST only (in `host:{conferenceId}`)
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      userId: string,
      audienceCount: number,
      timestamp: number
    }
    ```

- **`audience:count`**
  - **Purpose:** Current audience count update
  - **Recipients:** All in `conference:{conferenceId}` (periodic updates)
  - **Payload:**
    ```typescript
    {
      conferenceId: string,
      audienceCount: number,
      timestamp: number
    }
    ```

#### Error Events
- **`error`**
  - **Purpose:** Error occurred
  - **Recipients:** Sender only
  - **Payload:**
    ```typescript
    {
      code: string,  // e.g., 'UNAUTHORIZED', 'QUESTION_NOT_FOUND', 'CONFERENCE_ENDED'
      message: string,
      timestamp: number
    }
    ```

---

## 2. Redis Key Design

### 2.1 Conference State Keys

#### Conference Active Status
- **Key:** `conference:{conferenceId}:status`
- **Type:** String
- **Value:** `'ACTIVE' | 'ENDED'`
- **TTL:** None (persists until conference ends)
- **Operations:**
  - `SET` on conference activation
  - `SET` on conference end
  - `GET` on join/leave

#### Conference Live Question
- **Key:** `conference:{conferenceId}:live_question`
- **Type:** Hash
- **Fields:**
  ```
  questionId: string
  startedAt: number (Unix timestamp)
  expiresAt: number (Unix timestamp)
  duration: number (seconds)
  ```
- **TTL:** Auto-expires when question closes (set to question duration)
- **Operations:**
  - `HSET` when question pushed live
  - `DEL` when question closes
  - `GET` on join/status check

### 2.2 Question State Keys

#### Question Metadata (from MongoDB, cached)
- **Key:** `question:{questionId}:meta`
- **Type:** Hash
- **Fields:**
  ```
  conferenceId: string
  questionText: string
  options: string (JSON array)
  correctOption: string
  status: string
  ```
- **TTL:** 1 hour (cache invalidation)
- **Operations:**
  - `HSET` on question push (cache from MongoDB)
  - `GET` on question display

### 2.3 Voting Keys

#### Vote Counts (Real-time Aggregation)
- **Key:** `question:{questionId}:votes:counts`
- **Type:** Hash
- **Fields:**
  ```
  total: number (total vote count)
  A: number (votes for option A)
  B: number (votes for option B)
  C: number (votes for option C)
  ... (dynamic based on question options)
  ```
- **TTL:** 1 hour (cleanup after question closes)
- **Operations:**
  - `HINCRBY` on vote submission (atomic increment)
  - `HGETALL` on result broadcast
  - `DEL` after final results saved to MongoDB

#### User Vote Tracking (Duplicate Prevention)
- **Key:** `question:{questionId}:votes:users`
- **Type:** Set
- **Members:** User IDs who have voted
- **TTL:** 1 hour (cleanup after question closes)
- **Operations:**
  - `SADD` on vote submission (returns 1 if new, 0 if duplicate)
  - `SISMEMBER` to check if user voted
  - `SCARD` to get total unique voters
  - `DEL` after final results saved

#### Correct Answer Count
- **Key:** `question:{questionId}:votes:correct`
- **Type:** String (counter)
- **Value:** Number of correct votes
- **TTL:** 1 hour
- **Operations:**
  - `INCR` on correct vote (atomic)
  - `GET` on result calculation
  - `DEL` after final results saved

### 2.4 Timer Keys

#### Question Timer State
- **Key:** `question:{questionId}:timer`
- **Type:** Hash
- **Fields:**
  ```
  startedAt: number (Unix timestamp)
  expiresAt: number (Unix timestamp)
  duration: number (seconds)
  ```
- **TTL:** Set to question duration (auto-expires when question should close)
- **Operations:**
  - `HSET` when question pushed live
  - `GET` for timer calculation
  - `DEL` when question closes

### 2.5 Audience Presence Keys

#### Conference Audience Set
- **Key:** `conference:{conferenceId}:audience`
- **Type:** Set
- **Members:** User IDs currently in conference
- **TTL:** None (cleared on conference end)
- **Operations:**
  - `SADD` on join
  - `SREM` on leave
  - `SCARD` for audience count
  - `DEL` on conference end

#### Audience Count Cache
- **Key:** `conference:{conferenceId}:audience:count`
- **Type:** String
- **Value:** Current audience count
- **TTL:** 10 seconds (refreshed periodically)
- **Operations:**
  - `SET` with TTL (periodic update)
  - `GET` for quick count retrieval

#### User Conference Mapping (for cleanup)
- **Key:** `user:{userId}:conferences`
- **Type:** Set
- **Members:** Conference IDs user is currently in
- **TTL:** None (cleared on disconnect)
- **Operations:**
  - `SADD` on join
  - `SREM` on leave
  - `SMEMBERS` on disconnect cleanup

### 2.6 Host Authority Keys

#### Conference Host
- **Key:** `conference:{conferenceId}:host`
- **Type:** String
- **Value:** Host user ID
- **TTL:** None (persists)
- **Operations:**
  - `SET` on conference creation
  - `GET` for authority check

### 2.7 Lock Keys (Prevent Race Conditions)

#### Question Push Lock
- **Key:** `conference:{conferenceId}:lock:push_question`
- **Type:** String (with NX option)
- **Value:** Timestamp
- **TTL:** 5 seconds
- **Operations:**
  - `SET NX` before pushing question (prevents concurrent pushes)
  - `DEL` after push complete

#### Vote Lock (Per User)
- **Key:** `question:{questionId}:lock:vote:{userId}`
- **Type:** String (with NX option)
- **Value:** Timestamp
- **TTL:** 2 seconds
- **Operations:**
  - `SET NX` before processing vote (prevents duplicate vote race condition)
  - `DEL` after vote processed

---

## 3. Authority Rules

### 3.1 Role Determination

**Server-side role check from JWT:**
- Extract `userId` and `type` from JWT token
- Check if user is conference host: `GET conference:{conferenceId}:host`
- If match: Role = `HOST`
- Else: Role = `AUDIENCE`

### 3.2 HOST Authority

**Allowed Actions:**
1. ✅ Join conference room (`conference:join`)
2. ✅ Leave conference room (`conference:leave`)
3. ✅ Push question live (`question:push_live`)
4. ✅ Close question manually (`question:close`)
5. ✅ Receive audience join/leave events
6. ✅ Receive all vote results (real-time and final)
7. ✅ See audience count

**Restricted Actions:**
1. ❌ Cannot vote (`vote:submit` rejected)
2. ❌ Cannot join as audience (joins as host)

**Room Membership:**
- Joins: `conference:{conferenceId}` (all participants)
- Joins: `host:{conferenceId}` (host-only room for control events)

### 3.3 AUDIENCE Authority

**Allowed Actions:**
1. ✅ Join conference room (`conference:join`)
2. ✅ Leave conference room (`conference:leave`)
3. ✅ Submit vote (`vote:submit`)
4. ✅ Receive live question events
5. ✅ Receive vote results (real-time and final)
6. ✅ Receive timer updates
7. ✅ See audience count

**Restricted Actions:**
1. ❌ Cannot push questions live
2. ❌ Cannot close questions
3. ❌ Cannot see individual voter identities
4. ❌ Cannot see correct answer until question closes

**Room Membership:**
- Joins: `conference:{conferenceId}` (all participants)

### 3.4 Authority Validation Flow

**For `question:push_live` event:**
```
1. Extract userId from socket
2. GET conference:{conferenceId}:host from Redis
3. If userId !== hostId → emit error('UNAUTHORIZED')
4. If conference status !== 'ACTIVE' → emit error('CONFERENCE_NOT_ACTIVE')
5. SET NX conference:{conferenceId}:lock:push_question (prevent concurrent)
6. If lock failed → emit error('OPERATION_IN_PROGRESS')
7. Proceed with push live
```

**For `vote:submit` event:**
```
1. Extract userId from socket
2. GET conference:{conferenceId}:host from Redis
3. If userId === hostId → emit vote:rejected('not_audience')
4. GET question:{questionId}:votes:users from Redis
5. If SISMEMBER returns true → emit vote:rejected('duplicate')
6. SET NX question:{questionId}:lock:vote:{userId} (prevent race)
7. If lock failed → emit vote:rejected('duplicate')
8. Proceed with vote processing
```

---

## 4. Live Question Lifecycle

### 4.1 Question Push Live Flow

**Trigger:** HOST emits `question:push_live`

**Server-side Process:**
```
1. Validate authority (HOST check)
2. Acquire lock: SET NX conference:{conferenceId}:lock:push_question
3. Close existing live question (if any):
   - GET conference:{conferenceId}:live_question
   - If exists: DEL question:{oldQuestionId}:* (all related keys)
   - Emit question:closed to all
4. Load question from MongoDB (or cache)
5. Set Redis state:
   - HSET question:{questionId}:meta (cache question data)
   - HSET conference:{conferenceId}:live_question (questionId, startedAt, expiresAt, duration)
   - HSET question:{questionId}:timer (startedAt, expiresAt, duration)
   - SET question:{questionId}:votes:counts (initialize with 0 for all options)
   - SET question:{questionId}:votes:correct = 0
6. Set TTL on timer key (duration seconds)
7. Emit question:live to conference:{conferenceId}
8. Start timer countdown (setInterval, 1 second)
9. Release lock: DEL conference:{conferenceId}:lock:push_question
```

### 4.2 Question Timer Mechanism

**Timer Implementation:**
- **Redis TTL:** Set on `question:{questionId}:timer` key (auto-expires)
- **Node.js setInterval:** Broadcast countdown every second
- **Dual mechanism:** TTL for auto-close, setInterval for UI updates

**Countdown Broadcast:**
```
Every 1 second:
1. GET question:{questionId}:timer
2. Calculate: timeRemaining = expiresAt - now
3. If timeRemaining <= 0:
   - Close question (see 4.3)
   - Clear interval
4. Else:
   - Emit question:timer_update to conference:{conferenceId}
```

**Timer Cleanup:**
- Clear interval on manual close
- Clear interval on timeout close
- Clear interval on conference end

### 4.3 Question Close Flow

**Triggers:**
- Manual: HOST emits `question:close`
- Automatic: Timer expires (TTL or countdown reaches 0)

**Server-side Process:**
```
1. GET conference:{conferenceId}:live_question
2. If questionId doesn't match → return (already closed)
3. Calculate final results:
   - HGETALL question:{questionId}:votes:counts
   - GET question:{questionId}:votes:correct
   - GET question:{questionId}:meta (for correctOption)
   - Calculate percentages
4. Emit question:closed to conference:{conferenceId}
5. Emit vote:final_result to conference:{conferenceId}
6. Cleanup Redis:
   - DEL conference:{conferenceId}:live_question
   - DEL question:{questionId}:timer
   - DEL question:{questionId}:votes:counts
   - DEL question:{questionId}:votes:users
   - DEL question:{questionId}:votes:correct
   - DEL question:{questionId}:meta (optional, keep for cache)
7. Stop timer countdown (clear interval)
8. Save final results to MongoDB (async, non-blocking)
```

---

## 5. Voting During 45 Seconds

### 5.1 Vote Submission Flow

**Trigger:** AUDIENCE emits `vote:submit`

**Server-side Process:**
```
1. Validate authority (not HOST)
2. Check question is live:
   - GET conference:{conferenceId}:live_question
   - If null → emit vote:rejected('question_closed')
3. Check duplicate:
   - SISMEMBER question:{questionId}:votes:users {userId}
   - If true → emit vote:rejected('duplicate')
4. Acquire lock: SET NX question:{questionId}:lock:vote:{userId}
   - If failed → emit vote:rejected('duplicate')
5. Validate option:
   - HGET question:{questionId}:meta options
   - Parse JSON, check if selectedOption exists
   - If invalid → emit vote:rejected('invalid_option'), release lock
6. Record vote (atomic operations):
   - SADD question:{questionId}:votes:users {userId} (returns 1 if new)
   - HINCRBY question:{questionId}:votes:counts total 1
   - HINCRBY question:{questionId}:votes:counts {selectedOption} 1
   - HGET question:{questionId}:meta correctOption
   - If selectedOption === correctOption:
     - INCR question:{questionId}:votes:correct
7. Get updated counts:
   - HGETALL question:{questionId}:votes:counts
8. Emit events:
   - vote:accepted to sender (with isCorrect)
   - vote:result to conference:{conferenceId} (updated counts)
9. Release lock: DEL question:{questionId}:lock:vote:{userId}
```

### 5.2 Vote Result Broadcasting

**Real-time Updates:**
- Emitted on every vote submission
- Broadcast to all in `conference:{conferenceId}`
- Payload includes total votes and per-option counts

**Optimization:**
- Throttle broadcasts if > 10 votes/second (batch updates)
- Use Redis pub/sub for cross-server synchronization (if multiple servers)

### 5.3 Duplicate Vote Prevention

**Mechanisms:**
1. **Redis Set Check:** `SISMEMBER question:{questionId}:votes:users {userId}`
2. **Lock:** `SET NX question:{questionId}:lock:vote:{userId}` (prevents race condition)
3. **Atomic Add:** `SADD` returns 0 if already exists

**Race Condition Prevention:**
- Lock acquired before check
- Lock released after vote recorded
- 2-second TTL on lock (auto-release if process crashes)

---

## 6. Result Broadcast

### 6.1 Real-time Results (During Voting)

**Event:** `vote:result`
**Frequency:** On every vote submission
**Recipients:** All in `conference:{conferenceId}`

**Payload Calculation:**
```
1. HGETALL question:{questionId}:votes:counts
2. Calculate totalVotes from 'total' field
3. Return optionCounts (all options with counts)
```

**Optimization:**
- If vote rate > 10/second: Batch updates (emit every 100ms)
- Use Redis pub/sub for multi-server sync

### 6.2 Final Results (After Question Closes)

**Event:** `vote:final_result`
**Frequency:** Once when question closes
**Recipients:** All in `conference:{conferenceId}`

**Payload Calculation:**
```
1. HGETALL question:{questionId}:votes:counts
2. GET question:{questionId}:votes:correct
3. HGET question:{questionId}:meta correctOption
4. Calculate percentages:
   - For each option: (count / total) * 100
5. Include correctOption (revealed after close)
```

**Data Persistence:**
- Save to MongoDB asynchronously (non-blocking)
- Keep Redis keys for 1 hour (for replay/recovery)
- Delete Redis keys after MongoDB save confirmed

---

## 7. Audience Join/Leave

### 7.1 Join Flow

**Trigger:** User emits `conference:join`

**Server-side Process:**
```
1. Extract userId and role from JWT
2. Validate conference exists and is ACTIVE:
   - GET conference:{conferenceId}:status
   - If 'ENDED' → emit error('CONFERENCE_ENDED')
3. Join Socket.IO rooms:
   - socket.join(`conference:${conferenceId}`)
   - If HOST: socket.join(`host:${conferenceId}`)
4. Update Redis presence:
   - SADD conference:{conferenceId}:audience {userId}
   - SADD user:{userId}:conferences {conferenceId}
5. Get current state:
   - GET conference:{conferenceId}:live_question
   - SCARD conference:{conferenceId}:audience (audience count)
   - GET conference:{conferenceId}:status
6. Emit conference:joined to sender:
   - Include liveQuestion (if any)
   - Include audienceCount
   - Include conferenceStatus
7. If HOST: Emit audience:joined to host room
8. Update audience count cache:
   - SET conference:{conferenceId}:audience:count {count} EX 10
```

### 7.2 Leave Flow

**Trigger:** User emits `conference:leave` OR socket disconnect

**Server-side Process:**
```
1. Extract userId from socket
2. Leave Socket.IO rooms:
   - socket.leave(`conference:${conferenceId}`)
   - socket.leave(`host:${conferenceId}`)
3. Update Redis presence:
   - SREM conference:{conferenceId}:audience {userId}
   - SREM user:{userId}:conferences {conferenceId}
4. Get updated count:
   - SCARD conference:{conferenceId}:audience
5. Emit conference:left to sender
6. If HOST: Emit audience:left to host room
7. Update audience count cache
```

### 7.3 Disconnect Cleanup

**Trigger:** Socket.IO `disconnect` event

**Server-side Process:**
```
1. Get all user's conferences:
   - SMEMBERS user:{userId}:conferences
2. For each conferenceId:
   - SREM conference:{conferenceId}:audience {userId}
   - SCARD conference:{conferenceId}:audience
   - Emit audience:left to host room (if user was audience)
3. DEL user:{userId}:conferences
```

### 7.4 Audience Count Updates

**Periodic Broadcast:**
- Every 5 seconds: Broadcast `audience:count` to all in conference
- Use cached value: `GET conference:{conferenceId}:audience:count`
- If cache miss: `SCARD conference:{conferenceId}:audience` and update cache

**Real-time Updates:**
- On join: Immediate broadcast to all
- On leave: Immediate broadcast to all
- HOST receives individual join/leave events

---

## 8. Redis Key Naming Convention

**Pattern:** `{entity}:{id}:{purpose}:{subpurpose}`

**Examples:**
- `conference:abc123:status`
- `conference:abc123:live_question`
- `conference:abc123:audience`
- `question:xyz789:votes:counts`
- `question:xyz789:votes:users`
- `question:xyz789:lock:vote:user456`

**Benefits:**
- Easy pattern matching for cleanup
- Clear hierarchy
- Redis SCAN friendly

---

## 9. Error Handling

### 9.1 Error Codes

- `UNAUTHORIZED` - User not authorized for action
- `CONFERENCE_NOT_FOUND` - Conference doesn't exist
- `CONFERENCE_ENDED` - Conference is ended
- `CONFERENCE_NOT_ACTIVE` - Conference not active
- `QUESTION_NOT_FOUND` - Question doesn't exist
- `QUESTION_NOT_LIVE` - Question is not live
- `DUPLICATE_VOTE` - User already voted
- `INVALID_OPTION` - Selected option doesn't exist
- `OPERATION_IN_PROGRESS` - Another operation in progress (lock)
- `TIMEOUT` - Operation timed out

### 9.2 Error Event Format

```typescript
{
  code: string,
  message: string,
  timestamp: number,
  context?: {
    conferenceId?: string,
    questionId?: string,
    [key: string]: any
  }
}
```

---

## 10. Performance Considerations

### 10.1 Redis Operations Optimization

**Atomic Operations:**
- Use `HINCRBY` for vote counts (atomic increment)
- Use `SADD` for user tracking (returns 0 if duplicate)
- Use `SET NX` for locks (atomic lock acquisition)

**Batch Operations:**
- Use `MGET` for multiple key reads
- Use `DEL` with multiple keys for cleanup
- Use `HGETALL` for hash retrieval (single operation)

### 10.2 Socket.IO Optimization

**Room Management:**
- Join rooms on connection, not per event
- Leave rooms on disconnect
- Use namespaces only if needed (not required for this design)

**Event Throttling:**
- Throttle `vote:result` broadcasts if > 10/second
- Batch timer updates if needed (but 1/second is acceptable)

### 10.3 Memory Management

**TTL Strategy:**
- Question-related keys: 1 hour TTL (cleanup after question closes)
- Timer keys: Set to question duration (auto-expire)
- Lock keys: 2-5 seconds TTL (auto-release)
- Cache keys: 10 seconds - 1 hour depending on volatility

**Cleanup Strategy:**
- Periodic cleanup job (every hour): Remove expired keys
- On conference end: Delete all conference-related keys
- On question close: Delete question-related keys

---

## 11. Integration Points with MongoDB

**Read Operations (from MongoDB):**
- Conference metadata (on join)
- Question metadata (on push live, cache in Redis)
- User authentication (JWT validation)

**Write Operations (to MongoDB):**
- Final vote results (async, after question closes)
- Conference status changes (async)
- Question state changes (async)

**Note:** MongoDB remains source of truth. Redis is runtime cache/state.

---

## Summary

**Event Names:** 20 events (10 client→server, 10 server→client)  
**Redis Keys:** 15 key patterns (conference state, voting, presence, locks)  
**Authority Rules:** HOST (control), AUDIENCE (voting), strict validation  
**Lifecycle:** Push → Timer (45s) → Close → Results  
**Voting:** Atomic Redis operations, duplicate prevention, real-time broadcast  
**Presence:** Redis Sets for tracking, periodic count updates

This design provides a scalable, real-time polling system using Socket.IO and Redis while keeping MongoDB unchanged.


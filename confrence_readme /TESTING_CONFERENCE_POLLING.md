# Testing Conference Polling System

## Prerequisites

1. **Redis (Optional but Recommended)**
   - Install Redis: `brew install redis` (macOS) or `apt-get install redis` (Linux)
   - Start Redis: `redis-server`
   - Set `REDIS_URL=redis://localhost:6379` in `.env` (optional - falls back to in-memory)

2. **Environment Variables**
   ```env
   REDIS_URL=redis://localhost:6379  # Optional
   JWT_SECRET=your-secret-key
   MONGODB_URI=your-mongodb-uri
   ```

## Test Setup

### 1. Start Server
```bash
npm run dev
```

### 2. Create Test Conference
```bash
# Login as Host/Speaker first to get accessToken
POST /api/host/auth/login
# or
POST /api/speaker/auth/login

# Create conference
POST /api/conference
Headers: Authorization: Bearer <host_accessToken>
Body: {
  "title": "Test Conference",
  "description": "Testing polling system"
}

# Activate conference
POST /api/conference/:conferenceId/activate
Headers: Authorization: Bearer <host_accessToken>
```

### 3. Add Question
```bash
POST /api/conference/:conferenceId/questions
Headers: Authorization: Bearer <host_accessToken>
Body: {
  "questionText": "What is 2+2?",
  "options": [
    { "key": "A", "text": "3" },
    { "key": "B", "text": "4" },
    { "key": "C", "text": "5" }
  ],
  "correctOption": "B"
}
```

## Socket.IO Testing

### Using Socket.IO Client (Node.js)

```javascript
const io = require('socket.io-client');

// Connect as Host
const hostSocket = io('http://localhost:3100', {
  auth: {
    token: 'host_accessToken'
  }
});

// Connect as Audience
const audienceSocket = io('http://localhost:3100', {
  auth: {
    token: 'user_accessToken'
  }
});

// Host: Join conference
hostSocket.emit('conference:join', { conferenceId: 'conferenceId' });

// Host: Push question live
hostSocket.emit('question:push_live', {
  conferenceId: 'conferenceId',
  questionId: 'questionId',
  duration: 45
});

// Host: Listen for events
hostSocket.on('question:live', (data) => {
  console.log('Question is live:', data);
});

hostSocket.on('vote:result', (data) => {
  console.log('Vote results:', data);
});

hostSocket.on('audience:joined', (data) => {
  console.log('Audience joined:', data);
});

// Audience: Join conference
audienceSocket.emit('conference:join', { conferenceId: 'conferenceId' });

// Audience: Listen for live question
audienceSocket.on('question:live', (data) => {
  console.log('Question is live:', data);
  
  // Submit vote
  audienceSocket.emit('vote:submit', {
    conferenceId: 'conferenceId',
    questionId: data.questionId,
    selectedOption: 'B'
  });
});

// Audience: Listen for timer updates
audienceSocket.on('question:timer_update', (data) => {
  console.log('Time remaining:', data.timeRemaining);
});

// Audience: Listen for results
audienceSocket.on('vote:result', (data) => {
  console.log('Current results:', data);
});

audienceSocket.on('vote:final_result', (data) => {
  console.log('Final results:', data);
});
```

### Using Browser Console

```javascript
// Connect to Socket.IO
const socket = io('http://localhost:3100', {
  auth: {
    token: 'your_accessToken'
  }
});

// Join conference
socket.emit('conference:join', { conferenceId: 'yourConferenceId' });

// Listen for events
socket.on('conference:joined', console.log);
socket.on('question:live', console.log);
socket.on('question:timer_update', console.log);
socket.on('vote:result', console.log);
socket.on('vote:final_result', console.log);

// Submit vote (as audience)
socket.emit('vote:submit', {
  conferenceId: 'yourConferenceId',
  questionId: 'yourQuestionId',
  selectedOption: 'A'
});
```

## Test Scenarios

### Scenario 1: Basic Polling Flow
1. Host creates and activates conference
2. Host adds question
3. Host pushes question live via Socket.IO
4. Audience joins conference
5. Audience receives `question:live` event
6. Audience submits vote
7. All participants receive `vote:result` updates
8. After 45 seconds, question auto-closes
9. All participants receive `vote:final_result`

### Scenario 2: Duplicate Vote Prevention
1. Audience submits vote
2. Audience tries to submit vote again immediately
3. Should receive `vote:rejected` with reason 'duplicate'

### Scenario 3: Host Cannot Vote
1. Host joins conference
2. Question is live
3. Host tries to submit vote
4. Should receive `vote:rejected` with reason 'not_audience'

### Scenario 4: Multiple Questions
1. Host pushes question 1 live
2. Host pushes question 2 live (before question 1 closes)
3. Question 1 should auto-close
4. Question 2 should be live
5. Only one question should be live at a time

### Scenario 5: Manual Close
1. Host pushes question live
2. Host manually closes question before timeout
3. All participants receive `question:closed` with reason 'manual'
4. Final results broadcast

### Scenario 6: Audience Join/Leave
1. Multiple audience members join
2. Host should receive `audience:joined` events
3. All participants should receive `audience:count` updates
4. Audience member leaves
5. Host should receive `audience:left` event
6. Count should decrease

## Expected Behavior

### Redis Available
- All state stored in Redis
- Can scale horizontally (multiple servers)
- State persists across server restarts (within TTL)

### Redis Not Available (Fallback)
- State stored in memory
- Single server only
- State lost on server restart
- Still fully functional for single-server deployments

## Debugging

### Check Redis State
```bash
redis-cli

# Check conference status
GET conference:abc123:status

# Check live question
HGETALL conference:abc123:live_question

# Check vote counts
HGETALL question:xyz789:votes:counts

# Check audience
SMEMBERS conference:abc123:audience
SCARD conference:abc123:audience
```

### Server Logs
- Look for: `✅ User {userId} joined conference {conferenceId} as {role}`
- Look for: `📊 Question {questionId} pushed live`
- Look for: `✅ Vote submitted: User {userId} voted {option}`
- Look for: `🔒 Question {questionId} closed`

### Common Issues

1. **"UNAUTHORIZED" error**
   - Check JWT token is valid
   - Check user is conference host

2. **"CONFERENCE_NOT_ACTIVE" error**
   - Conference must be activated via REST API first
   - Check conference status in MongoDB

3. **Votes not updating**
   - Check Redis connection (if using Redis)
   - Check Socket.IO connection
   - Verify question is live

4. **Timer not working**
   - Check server logs for timer errors
   - Verify question duration is set correctly

## Performance Testing

### Load Test (100 concurrent users)
```javascript
// Create 100 socket connections
const sockets = [];
for (let i = 0; i < 100; i++) {
  const socket = io('http://localhost:3100', {
    auth: { token: `user${i}_token` }
  });
  sockets.push(socket);
}

// All join conference
sockets.forEach(socket => {
  socket.emit('conference:join', { conferenceId: 'testConferenceId' });
});

// All submit votes simultaneously
sockets.forEach(socket => {
  socket.emit('vote:submit', {
    conferenceId: 'testConferenceId',
    questionId: 'testQuestionId',
    selectedOption: 'A'
  });
});
```

### Expected Results
- All votes should be accepted (no duplicates)
- Vote counts should be accurate
- Results should broadcast to all participants
- Response time < 100ms per vote


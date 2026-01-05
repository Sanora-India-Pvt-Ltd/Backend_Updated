# 📚 Complete Conference Flow Documentation
## From Login to End - Step by Step Guide

This document explains the **entire flow** of a conference polling system, from when the host logs in until the conference ends. All endpoints and Socket.IO events are explained in simple words.

---

## 🎯 Overview

A conference has two types of users:
- **HOST**: Creates conference, creates questions, pushes questions live, sees results
- **AUDIENCE (Users)**: Join conference, see questions, submit answers

---

## 📋 PART 1: HOST SETUP (Before Conference Starts)

### Step 1: Host Login

**Endpoint:** `POST /api/host/auth/login`

**What it does:** Host logs in with email and password

**Request:**
```json
{
  "email": "host@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "host": {
      "id": "host_id_here",
      "email": "host@example.com"
    }
  }
}
```

**What you get:** A JWT token that you need to use in all future requests (put it in `Authorization: Bearer <token>` header)

---

### Step 2: Create a Conference

**Endpoint:** `POST /api/conference`

**What it does:** Host creates a new conference

**Headers:**
```
Authorization: Bearer <host_token>
```

**Request:**
```json
{
  "title": "My First Conference",
  "description": "This is a test conference",
  "speakerIds": []  // Optional: add speaker IDs if you have speakers
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "conference": {
      "id": "conference_id_123",
      "title": "My First Conference",
      "status": "DRAFT",
      "hostId": "host_id_here",
      "publicCode": "ABC123"  // Users will use this to join
    }
  }
}
```

**Save the `conference_id_123` and `publicCode` - you'll need them!**

---

### Step 3: Create Questions

**Endpoint:** `POST /api/conference/:conferenceId/questions`

**What it does:** Host creates questions for the conference (you can create multiple questions)

**Headers:**
```
Authorization: Bearer <host_token>
```

**Request:**
```json
{
  "questionText": "What is 2 + 2?",
  "options": [
    { "key": "A", "text": "3" },
    { "key": "B", "text": "4" },
    { "key": "C", "text": "5" },
    { "key": "D", "text": "6" }
  ],
  "correctOption": "B",
  "order": 1
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "question": {
      "id": "question_id_456",
      "questionText": "What is 2 + 2?",
      "options": [...],
      "status": "IDLE"
    }
  }
}
```

**Repeat this step to create more questions!**

---

### Step 4: Activate the Conference

**Endpoint:** `POST /api/conference/:conferenceId/activate`

**What it does:** Makes the conference LIVE so users can join

**Headers:**
```
Authorization: Bearer <host_token>
```

**Request:** (No body needed, just the endpoint)

**Response:**
```json
{
  "success": true,
  "message": "Conference activated successfully",
  "data": {
    "conference": {
      "id": "conference_id_123",
      "status": "ACTIVE"
    }
  }
}
```

**Now the conference is LIVE! Users can join.**

---

## 📋 PART 2: REAL-TIME CONNECTION (Socket.IO)

Both HOST and AUDIENCE need to connect via **WebSocket (Socket.IO)** for real-time features.

### Step 5: Connect to Socket.IO

**Connection URL:** `ws://your-server-url` (same as your HTTP server)

**Authentication:**
When connecting, send your JWT token:
```javascript
const socket = io('ws://your-server-url', {
  auth: {
    token: 'your_jwt_token_here'
  }
});
```

**What happens:**
- Server verifies your token
- If valid, you're connected!
- You can now send and receive real-time events

---

### Step 6: Join the Conference (Real-Time)

**Socket Event:** `conference:join`

**Who can do this:** Both HOST and AUDIENCE

**Send:**
```javascript
socket.emit('conference:join', {
  conferenceId: 'conference_id_123'
});
```

**What you receive:**
```javascript
socket.on('conference:joined', (data) => {
  console.log(data);
  // {
  //   conferenceId: 'conference_id_123',
  //   role: 'HOST' or 'AUDIENCE',
  //   audienceCount: 5
  // }
});
```

**Also receive:**
```javascript
socket.on('audience:count', (data) => {
  console.log(data);
  // {
  //   conferenceId: 'conference_id_123',
  //   audienceCount: 6  // Updated count
  // }
});
```

**If a question is already live when you join, you'll also receive:**
```javascript
socket.on('question:live', (data) => {
  console.log(data);
  // {
  //   conferenceId: 'conference_id_123',
  //   questionId: 'question_id_456',
  //   questionText: 'What is 2 + 2?',
  //   options: [...],
  //   startedAt: 1234567890,
  //   expiresAt: 1234567890
  // }
});
```

---

## 📋 PART 3: LIVE POLLING (During Conference)

### Step 7: Host Pushes Question Live

**Socket Event:** `question:push_live`

**Who can do this:** Only HOST

**Send:**
```javascript
socket.emit('question:push_live', {
  conferenceId: 'conference_id_123',
  questionId: 'question_id_456',
  duration: 45  // Optional: seconds (default 45)
});
```

**What HOST receives:**
```javascript
socket.on('question:pushed', (data) => {
  console.log(data);
  // {
  //   conferenceId: 'conference_id_123',
  //   questionId: 'question_id_456',
  //   startedAt: 1234567890,
  //   expiresAt: 1234567890
  // }
});
```

**What EVERYONE receives (HOST + AUDIENCE):**
```javascript
socket.on('question:live', (data) => {
  console.log(data);
  // {
  //   conferenceId: 'conference_id_123',
  //   questionId: 'question_id_456',
  //   questionText: 'What is 2 + 2?',
  //   options: [
  //     { key: 'A', text: '3' },
  //     { key: 'B', text: '4' },
  //     { key: 'C', text: '5' },
  //     { key: 'D', text: '6' }
  //   ],
  //   startedAt: 1234567890,
  //   expiresAt: 1234567890
  // }
});
```

**Now the question is LIVE for 45 seconds!**

---

### Step 8: Audience Submits Answers

**Socket Event:** `answer:submit`

**Who can do this:** Only AUDIENCE (HOST cannot submit answers)

**Send:**
```javascript
socket.emit('answer:submit', {
  conferenceId: 'conference_id_123',
  questionId: 'question_id_456',
  optionKey: 'B'  // The answer they selected
});
```

**What AUDIENCE receives:**
```javascript
socket.on('answer:submitted', (data) => {
  console.log(data);
  // {
  //   conferenceId: 'conference_id_123',
  //   questionId: 'question_id_456',
  //   optionKey: 'B'
  // }
});
```

**What HOST receives (real-time stats):**
```javascript
socket.on('answer:stats', (data) => {
  console.log(data);
  // {
  //   conferenceId: 'conference_id_123',
  //   questionId: 'question_id_456',
  //   counts: {
  //     A: 2,
  //     B: 15,
  //     C: 1,
  //     D: 0
  //   },
  //   totalResponses: 18
  // }
});
```

**Important:** Each user can only submit **once per question**. If they try again, they'll get an error.

---

### Step 9: Question Auto-Closes (After 45 seconds)

**What happens automatically:**
- After 45 seconds (or the duration you set), the question automatically closes
- Server calculates final results
- Results are saved to database

**What EVERYONE receives:**
```javascript
socket.on('question:closed', (data) => {
  console.log(data);
  // {
  //   conferenceId: 'conference_id_123',
  //   questionId: 'question_id_456',
  //   closedAt: 1234567890
  // }
});

socket.on('question:results', (data) => {
  console.log(data);
  // {
  //   conferenceId: 'conference_id_123',
  //   questionId: 'question_id_456',
  //   counts: {
  //     A: 2,
  //     B: 15,
  //     C: 1,
  //     D: 0
  //   },
  //   totalResponses: 18,
  //   closedAt: 1234567890
  // }
});
```

**The question is now CLOSED. No more answers can be submitted.**

---

## 📋 PART 4: VIEWING RESULTS (After Questions Close)

### Step 10: Get Results for a Single Question

**Endpoint:** `GET /api/conference/:conferenceId/questions/:questionId/results`

**What it does:** Get final results for one specific question

**Headers:**
```
Authorization: Bearer <token>  // Can be HOST, SPEAKER, or USER token
```

**Response:**
```json
{
  "success": true,
  "data": {
    "conferenceId": "conference_id_123",
    "questionId": "question_id_456",
    "questionText": "What is 2 + 2?",
    "options": [
      { "key": "A", "text": "3" },
      { "key": "B", "text": "4" },
      { "key": "C", "text": "5" },
      { "key": "D", "text": "6" }
    ],
    "results": {
      "counts": {
        "A": 2,
        "B": 15,
        "C": 1,
        "D": 0
      },
      "totalResponses": 18,
      "closedAt": 1234567890
    }
  }
}
```

---

### Step 11: Get Results for All Questions

**Endpoint:** `GET /api/conference/:conferenceId/questions/results`

**What it does:** Get final results for ALL closed questions in the conference

**Headers:**
```
Authorization: Bearer <token>  // Can be HOST, SPEAKER, or USER token
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "questionId": "question_id_456",
      "questionText": "What is 2 + 2?",
      "results": {
        "counts": { "A": 2, "B": 15, "C": 1, "D": 0 },
        "totalResponses": 18,
        "closedAt": 1234567890
      }
    },
    {
      "questionId": "question_id_789",
      "questionText": "What is 3 + 3?",
      "results": {
        "counts": { "A": 1, "B": 2, "C": 12, "D": 5 },
        "totalResponses": 20,
        "closedAt": 1234567900
      }
    }
  ]
}
```

---

## 📋 PART 5: ENDING THE CONFERENCE

### Step 12: End the Conference

**Endpoint:** `POST /api/conference/:conferenceId/end`

**What it does:** Marks the conference as ENDED (no more questions can be pushed)

**Who can do this:** Only HOST

**Headers:**
```
Authorization: Bearer <host_token>
```

**Request:** (No body needed)

**Response:**
```json
{
  "success": true,
  "message": "Conference ended successfully",
  "data": {
    "conference": {
      "id": "conference_id_123",
      "status": "ENDED"
    }
  }
}
```

**The conference is now ENDED!**

---

## 📋 PART 6: USER (AUDIENCE) FLOW

### How Users Join a Conference

**Step 1: User Login (if not already logged in)**
- Use regular user login endpoint
- Get JWT token

**Step 2: Get Conference by Public Code**
**Endpoint:** `GET /api/conference/public/:publicCode`

**What it does:** Get conference details using the public code (no auth needed)

**Request:** Just the public code in URL (e.g., `ABC123`)

**Response:**
```json
{
  "success": true,
  "data": {
    "conference": {
      "id": "conference_id_123",
      "title": "My First Conference",
      "status": "ACTIVE",
      "publicCode": "ABC123"
    }
  }
}
```

**Step 3: Connect to Socket.IO**
- Same as Step 5 above
- Use user's JWT token

**Step 4: Join Conference**
- Same as Step 6 above
- Send `conference:join` event

**Step 5: Wait for Questions**
- Listen for `question:live` event
- When question appears, show it to user

**Step 6: Submit Answer**
- Same as Step 8 above
- Send `answer:submit` event

**Step 7: See Results**
- Listen for `question:results` event (real-time)
- Or use REST API endpoints (Step 10-11) to get results later

---

## 🔄 Complete Flow Diagram

```
HOST SIDE:
1. Login → Get token
2. Create Conference → Get conferenceId
3. Create Questions → Get questionIds
4. Activate Conference
5. Connect Socket.IO
6. Join Conference (Socket)
7. Push Question Live (Socket)
8. Receive Stats (Socket)
9. Question Auto-Closes (Socket)
10. Get Results (REST API)
11. End Conference (REST API)

USER SIDE:
1. Login → Get token (optional)
2. Get Conference by Public Code (REST API)
3. Connect Socket.IO
4. Join Conference (Socket)
5. Receive Question Live (Socket)
6. Submit Answer (Socket)
7. Receive Results (Socket)
8. Get Results Later (REST API - optional)
```

---

## 📝 Important Notes

1. **Authentication:** Always include `Authorization: Bearer <token>` header in REST API requests

2. **Socket.IO Authentication:** Pass token in connection:
   ```javascript
   const socket = io('ws://server', {
     auth: { token: 'your_token' }
   });
   ```

3. **Question Status:**
   - `IDLE`: Question created but not live
   - `ACTIVE`: Question is currently live
   - `CLOSED`: Question has ended, results are final

4. **Conference Status:**
   - `DRAFT`: Just created, not active
   - `ACTIVE`: Conference is live, users can join
   - `ENDED`: Conference is over

5. **Real-Time vs REST:**
   - **Socket.IO**: For live events (join, questions, answers, results)
   - **REST API**: For setup (create, activate) and viewing results later

6. **One Question at a Time:**
   - Only ONE question can be live at a time
   - If you try to push another question while one is live, you'll get an error

7. **Answer Submission:**
   - Each user can only answer ONCE per question
   - Answers must be submitted while question is live (before it expires)
   - Only AUDIENCE can submit answers (HOST cannot)

---

## 🚨 Error Handling

**Common Errors:**

1. **401 Unauthorized:** Token is missing or invalid
   - Solution: Login again and get a new token

2. **403 Forbidden:** You don't have permission
   - Solution: Check if you're using the correct role (HOST vs AUDIENCE)

3. **404 Not Found:** Conference or question doesn't exist
   - Solution: Check the IDs you're using

4. **QUESTION_ALREADY_LIVE:** Trying to push a question when one is already live
   - Solution: Wait for current question to close first

5. **ALREADY_ANSWERED:** User trying to submit answer twice
   - Solution: Each user can only answer once per question

6. **QUESTION_EXPIRED:** Trying to submit answer after question closed
   - Solution: Submit answers while question is live

---

## ✅ Quick Reference

### REST API Endpoints

| Method | Endpoint | Who | Purpose |
|--------|----------|-----|---------|
| POST | `/api/host/auth/login` | HOST | Login |
| POST | `/api/conference` | HOST | Create conference |
| POST | `/api/conference/:id/questions` | HOST | Create question |
| POST | `/api/conference/:id/activate` | HOST | Activate conference |
| GET | `/api/conference/public/:code` | ANYONE | Get conference by code |
| POST | `/api/conference/:id/end` | HOST | End conference |
| GET | `/api/conference/:id/questions/results` | ANYONE | Get all results |
| GET | `/api/conference/:id/questions/:qid/results` | ANYONE | Get single result |

### Socket.IO Events

| Event | Direction | Who | Purpose |
|-------|-----------|-----|---------|
| `conference:join` | Client → Server | ALL | Join conference |
| `conference:joined` | Server → Client | ALL | Join confirmation |
| `audience:count` | Server → Client | ALL | Updated audience count |
| `question:push_live` | Client → Server | HOST | Push question live |
| `question:live` | Server → Client | ALL | Question is now live |
| `answer:submit` | Client → Server | AUDIENCE | Submit answer |
| `answer:submitted` | Server → Client | AUDIENCE | Answer confirmation |
| `answer:stats` | Server → Client | HOST | Real-time stats |
| `question:closed` | Server → Client | ALL | Question closed |
| `question:results` | Server → Client | ALL | Final results |

---

## 🎉 That's It!

You now know the complete flow from login to conference end. Follow these steps in order, and you'll have a working conference polling system!


/**
 * Simple Test Script for Conference Polling
 * 
 * Usage:
 * 1. Start server: npm run dev
 * 2. Create conference and get tokens (see TESTING_CONFERENCE_POLLING.md)
 * 3. Update tokens below
 * 4. Run: node test-conference-polling.js
 */

const io = require('socket.io-client');

// Update these with your actual tokens
const HOST_TOKEN = 'your_host_access_token';
const AUDIENCE_TOKEN = 'your_user_access_token';
const CONFERENCE_ID = 'your_conference_id';
const QUESTION_ID = 'your_question_id';

const SERVER_URL = 'http://localhost:3100';

console.log('🧪 Testing Conference Polling System\n');

// Test 1: Host Connection
console.log('Test 1: Host connecting...');
const hostSocket = io(SERVER_URL, {
    auth: { token: HOST_TOKEN },
    transports: ['websocket']
});

hostSocket.on('connect', () => {
    console.log('✅ Host connected');
    
    // Join conference
    hostSocket.emit('conference:join', { conferenceId: CONFERENCE_ID });
});

hostSocket.on('conference:joined', (data) => {
    console.log('✅ Host joined conference:', data);
    
    // Push question live
    console.log('\nTest 2: Pushing question live...');
    hostSocket.emit('question:push_live', {
        conferenceId: CONFERENCE_ID,
        questionId: QUESTION_ID,
        duration: 45
    });
});

hostSocket.on('question:live', (data) => {
    console.log('✅ Question is live:', data);
});

hostSocket.on('vote:result', (data) => {
    console.log('📊 Vote results:', data);
});

hostSocket.on('vote:final_result', (data) => {
    console.log('🏁 Final results:', data);
});

hostSocket.on('audience:joined', (data) => {
    console.log('👤 Audience joined:', data);
});

hostSocket.on('error', (error) => {
    console.error('❌ Host error:', error);
});

// Test 3: Audience Connection
console.log('\nTest 3: Audience connecting...');
const audienceSocket = io(SERVER_URL, {
    auth: { token: AUDIENCE_TOKEN },
    transports: ['websocket']
});

audienceSocket.on('connect', () => {
    console.log('✅ Audience connected');
    
    // Join conference
    audienceSocket.emit('conference:join', { conferenceId: CONFERENCE_ID });
});

audienceSocket.on('conference:joined', (data) => {
    console.log('✅ Audience joined conference:', data);
    
    // Wait for question to go live, then vote
    setTimeout(() => {
        console.log('\nTest 4: Submitting vote...');
        audienceSocket.emit('vote:submit', {
            conferenceId: CONFERENCE_ID,
            questionId: QUESTION_ID,
            selectedOption: 'B'
        });
    }, 2000);
});

audienceSocket.on('question:live', (data) => {
    console.log('✅ Audience received live question:', data);
});

audienceSocket.on('question:timer_update', (data) => {
    console.log(`⏱️  Timer: ${data.timeRemaining}s remaining`);
});

audienceSocket.on('vote:accepted', (data) => {
    console.log('✅ Vote accepted:', data);
});

audienceSocket.on('vote:rejected', (data) => {
    console.log('❌ Vote rejected:', data);
});

audienceSocket.on('vote:result', (data) => {
    console.log('📊 Vote results update:', data);
});

audienceSocket.on('vote:final_result', (data) => {
    console.log('🏁 Final results:', data);
    console.log('\n✅ All tests completed!');
    
    // Cleanup
    hostSocket.disconnect();
    audienceSocket.disconnect();
    process.exit(0);
});

audienceSocket.on('error', (error) => {
    console.error('❌ Audience error:', error);
});

// Timeout after 60 seconds
setTimeout(() => {
    console.log('\n⏱️  Test timeout');
    hostSocket.disconnect();
    audienceSocket.disconnect();
    process.exit(1);
}, 60000);


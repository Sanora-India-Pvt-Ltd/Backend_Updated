const express = require('express');
const path = require('path');

const app = express();
const PORT = 5500;

// Serve static files (HTML, CSS, JS)
app.use(express.static(__dirname));

// Serve the test OAuth page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-oauth.html'));
});

// Handle OAuth callback route
app.get('/auth/callback', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-oauth.html'));
});

// Handle login route (for OAuth error redirects)
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'test-oauth.html'));
});

app.listen(PORT, () => {
    console.log(`\n🌐 Test OAuth Server running on http://localhost:${PORT}`);
    console.log(`📝 Open your browser and navigate to: http://localhost:${PORT}`);
    console.log(`\n⚠️  Make sure your backend server is running on port 3100`);
    console.log(`   Backend API URL: http://localhost:3100/api/auth\n`);
});


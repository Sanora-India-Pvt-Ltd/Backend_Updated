require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const passport = require('passport');
// require('./middleware/passport');

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());

// Session configuration
const session = require('express-session');
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/api/students', require('./routes/studentRoutes'));
app.use('/api/doctors', require('./routes/doctorRoutes'));

// Auth routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/auth', require('./routes/googleAuthRoutes'));

// Basic route
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 Sanora Backend API is running!',
        timestamp: new Date().toISOString(),
        endpoints: {
            student: {
                signup: 'POST /api/students/signup',
                login: 'POST /api/students/login'
            },
            doctor: {
                signup: 'POST /api/doctors/signup',
                login: 'POST /api/doctors/login'
            }
        }
    });
});

// Handle undefined routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

const PORT = process.env.PORT || 3100;

app.listen(PORT, () => {
    console.log(`🎯 Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
    console.log(`📊 Database: sanora`);
    console.log(`👨‍🎓 Student routes: http://localhost:${PORT}/api/students`);
    console.log(`👨‍⚕️ Doctor routes: http://localhost:${PORT}/api/doctors`);
    console.log('Environment Variables Check:');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET');
console.log('GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL || 'NOT SET');
});


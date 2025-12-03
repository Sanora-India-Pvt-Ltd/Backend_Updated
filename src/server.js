require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const passport = require('passport');
require('./middleware/passport');

// Add to your server.js after passport initialization
const { OAuth2Client } = require('google-auth-library');
const User = require('./models/User');
const jwt = require('jsonwebtoken');

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors({
    origin: true,
    credentials: true
}));

// Request logging middleware (for debugging)
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        console.log(`📥 ${req.method} ${req.path}`);
        if (Object.keys(req.body || {}).length > 0) {
            console.log(`   Body:`, JSON.stringify(req.body));
        }
    }
    next();
});

// JSON parser
app.use(express.json({ limit: '10mb' }));

// Error handler for JSON parsing errors
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        return res.status(400).json({
            success: false,
            message: 'Invalid JSON format in request body',
            error: 'Please ensure your JSON is valid. Common issues:\n' +
                   '1. Use double quotes (") not single quotes (\')\n' +
                   '2. No trailing commas\n' +
                   '3. All property names must be in quotes\n' +
                   'Example: {"email": "test@example.com", "password": "123456"}'
        });
    }
    next(err);
});

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

// Create Google OAuth client for verification
// Support both WEB and Android client IDs
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID; // WEB client ID
const GOOGLE_ANDROID_CLIENT_ID = process.env.GOOGLE_ANDROID_CLIENT_ID; // Android client ID

// Collect all valid client IDs
const validClientIds = [];
if (GOOGLE_CLIENT_ID) validClientIds.push(GOOGLE_CLIENT_ID);
if (GOOGLE_ANDROID_CLIENT_ID) validClientIds.push(GOOGLE_ANDROID_CLIENT_ID);

const client = validClientIds.length > 0 ? new OAuth2Client() : null;

// Route to verify Google token from Android/iOS/Web
if (client && validClientIds.length > 0) {
    app.post('/api/auth/verify-google-token', async (req, res) => {
        try {
            const { token } = req.body;
            
            if (!token) {
                return res.status(400).json({
                    success: false,
                    message: 'Token is required'
                });
            }
            
            // Verify the Google ID token against all valid client IDs
            // This works for both WEB and Android tokens
            let ticket;
            let payload;
            let verified = false;
            
            for (const clientId of validClientIds) {
                try {
                    ticket = await client.verifyIdToken({
                        idToken: token,
                        audience: clientId
                    });
                    payload = ticket.getPayload();
                    verified = true;
                    break; // Successfully verified, exit loop
                } catch (err) {
                    // Try next client ID
                    continue;
                }
            }
            
            if (!verified) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid Google token - token does not match any configured client ID',
                    error: 'Please ensure you are using the correct Google Sign-In configuration for Android'
                });
            }
            
            // Extract user information from Google token
            const { sub: googleId, email, name, picture } = payload;
            
            // Validate required fields
            if (!email) {
                return res.status(400).json({
                    success: false,
                    message: 'Email not found in Google token',
                    error: 'Google account must have a verified email address'
                });
            }
            
            if (!googleId) {
                return res.status(400).json({
                    success: false,
                    message: 'Google ID not found in token',
                    error: 'Invalid Google token format'
                });
            }
            
            // Find or create user in database
            let user = await User.findOne({ email: email.toLowerCase() });
            let isNewUser = false;
            
            if (!user) {
                // Extract firstName and lastName from name
                const displayName = name || email.split('@')[0] || 'User';
                const nameParts = displayName.trim().split(/\s+/);
                const firstName = nameParts[0] || 'User';
                const lastName = nameParts.slice(1).join(' ') || 'User';
                
                // New user signup - no OTP needed (Google already verified email)
                user = await User.create({
                    email: email.toLowerCase(),
                    firstName,
                    lastName,
                    phoneNumber: '', // Google doesn't provide phone number, user can update later
                    gender: 'Other', // Default gender since Google doesn't provide this
                    name: displayName,
                    googleId,
                    profileImage: picture || '',
                    password: 'google-oauth',
                    isGoogleOAuth: true
                });
                isNewUser = true;
            } else if (!user.googleId) {
                // Existing user linking Google account
                // Update name fields if not already set
                if (!user.firstName || !user.lastName) {
                    const displayName = name || email.split('@')[0] || 'User';
                    const nameParts = displayName.trim().split(/\s+/);
                    user.firstName = user.firstName || nameParts[0] || 'User';
                    user.lastName = user.lastName || nameParts.slice(1).join(' ') || 'User';
                }
                user.googleId = googleId;
                if (picture) user.profileImage = picture;
                if (name) user.name = name;
                user.isGoogleOAuth = true;
                await user.save();
            }
            
            // Generate JWT token for your app
            const jwtToken = jwt.sign(
                {
                    id: user._id,
                    email: user.email,
                    name: user.name,
                    isGoogleOAuth: true
                },
                process.env.JWT_SECRET || 'your-secret-key',
                { expiresIn: '7d' }
            );
            
            res.json({
                success: true,
                message: isNewUser ? 'Signup successful via Google OAuth' : 'Login successful via Google OAuth',
                data: {
                    token: jwtToken,
                    isNewUser: isNewUser,
                    user: {
                        id: user._id,
                        email: user.email,
                        firstName: user.firstName,
                        lastName: user.lastName,
                        phoneNumber: user.phoneNumber,
                        gender: user.gender,
                        name: user.name,
                        profileImage: user.profileImage
                    }
                }
            });
            
        } catch (error) {
            console.error('Google token verification error:', error);
            
            // Provide more specific error messages for Android developers
            let errorMessage = 'Invalid Google token';
            let errorDetails = error.message;
            
            if (error.message && error.message.includes('Token used too early')) {
                errorMessage = 'Token not yet valid - check device time settings';
            } else if (error.message && error.message.includes('Token used too late')) {
                errorMessage = 'Token expired - please sign in again';
            } else if (error.message && error.message.includes('Invalid token signature')) {
                errorMessage = 'Invalid token signature - verify client ID configuration';
            }
            
            res.status(401).json({
                success: false,
                message: errorMessage,
                error: process.env.NODE_ENV === 'development' ? errorDetails : undefined
            });
        }
    });
}

// Auth routes - wrapped in try-catch to ensure server starts even if routes fail to load
try {
    console.log('🔄 Loading auth routes...');
    app.use('/api/auth', require('./routes/authRoutes'));
    console.log('✅ Auth routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading auth routes:', error.message);
    console.error('Stack:', error.stack);
    // Don't crash - create a fallback route
    app.use('/api/auth', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Auth routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

try {
    console.log('🔄 Loading Google auth routes...');
    app.use('/api/auth', require('./routes/googleAuthRoutes'));
    console.log('✅ Google auth routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading Google auth routes:', error.message);
    console.error('Stack:', error.stack);
    // Don't crash - routes will just not be available
}

// Debug route to list all registered routes
app.get('/api/debug/routes', (req, res) => {
    const routes = [];
    
    const extractRoutes = (stack, basePath = '') => {
        stack.forEach((middleware) => {
            if (middleware.route) {
                const methods = Object.keys(middleware.route.methods).map(m => m.toUpperCase()).join(', ');
                routes.push({
                    method: methods,
                    path: basePath + middleware.route.path
                });
            } else if (middleware.name === 'router' || middleware.name === 'bound dispatch') {
                const routerPath = middleware.regexp.source
                    .replace('\\/?', '')
                    .replace('(?=\\/|$)', '')
                    .replace(/\\\//g, '/')
                    .replace(/\^/g, '')
                    .replace(/\$/g, '')
                    .replace(/\\/g, '');
                extractRoutes(middleware.handle.stack || [], basePath + routerPath);
            }
        });
    };
    
    extractRoutes(app._router.stack);
    
    res.json({
        success: true,
        message: 'Registered routes',
        routes: routes,
        total: routes.length
    });
});

// Basic route
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: '🚀 Sanora Backend API is running!',
        timestamp: new Date().toISOString(),
        endpoints: {
            signup: 'POST /api/auth/signup',
            login: 'POST /api/auth/login',
            googleAuth: 'GET /api/auth/google',
            verifyGoogleToken: 'POST /api/auth/verify-google-token',
            sendOTPSignup: 'POST /api/auth/send-otp-signup',
            verifyOTPSignup: 'POST /api/auth/verify-otp-signup'
        }
    });
});

// Handle undefined routes
app.use((req, res) => {
    console.log(`❌ Route not found: ${req.method} ${req.path}`);
    console.log(`   Headers:`, req.headers);
    console.log(`   Body:`, req.body);
    res.status(404).json({
        success: false,
        message: 'Route not found',
        method: req.method,
        path: req.path,
        hint: 'Make sure you are using the correct HTTP method (POST for /api/auth/send-otp-signup) and Content-Type: application/json header'
    });
});

const PORT = process.env.PORT || 3100;

// Log all registered routes before starting server
console.log('\n📋 Verifying route registration...');
const registeredRoutes = [];
app._router.stack.forEach((middleware) => {
    if (middleware.route) {
        const methods = Object.keys(middleware.route.methods).map(m => m.toUpperCase()).join(', ');
        registeredRoutes.push(`${methods} ${middleware.route.path}`);
    } else if (middleware.name === 'router' || middleware.name === 'bound dispatch') {
        const routerPath = middleware.regexp.source
            .replace('\\/?', '')
            .replace('(?=\\/|$)', '')
            .replace(/\\\//g, '/')
            .replace(/\^/g, '')
            .replace(/\$/g, '')
            .replace(/\\/g, '');
        if (middleware.handle && middleware.handle.stack) {
            middleware.handle.stack.forEach((handler) => {
                if (handler.route) {
                    const methods = Object.keys(handler.route.methods).map(m => m.toUpperCase()).join(', ');
                    registeredRoutes.push(`${methods} ${routerPath}${handler.route.path}`);
                }
            });
        }
    }
});
console.log(`✅ Found ${registeredRoutes.length} registered routes`);
if (registeredRoutes.length > 0) {
    console.log('📝 Sample routes:', registeredRoutes.slice(0, 5).join(', '));
}

app.listen(PORT, () => {
    console.log(`\n🎯 Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 Database: sanora`);
    console.log(`🔐 Auth routes: http://localhost:${PORT}/api/auth`);
    console.log('Environment Variables Check:');
    console.log('GOOGLE_CLIENT_ID (WEB):', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET');
    console.log('GOOGLE_ANDROID_CLIENT_ID:', process.env.GOOGLE_ANDROID_CLIENT_ID ? 'SET' : 'NOT SET');
    console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET');
    console.log('GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL || 'NOT SET');
    console.log('\n📧 Email Configuration:');
    console.log('EMAIL_HOST:', process.env.EMAIL_HOST || 'NOT SET');
    console.log('EMAIL_PORT:', process.env.EMAIL_PORT || 'NOT SET');
    console.log('EMAIL_USER:', process.env.EMAIL_USER ? 'SET' : 'NOT SET');
    console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? 'SET' : 'NOT SET');
    console.log('OTP_EXPIRY_MINUTES:', process.env.OTP_EXPIRY_MINUTES || '5 (default)');
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASSWORD) {
        console.log('⚠️  WARNING: Email not configured. OTP emails will not work!');
        console.log('   See OTP_SETUP_GUIDE.md for setup instructions.');
    } else {
        console.log('✅ Email configuration looks good!');
    }
});


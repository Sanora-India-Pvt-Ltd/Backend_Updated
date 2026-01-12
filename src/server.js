// NODE.JS v22 SPECIFIC FIXES
// ===========================

const dns = require('dns');
const tls = require('tls');

console.log('🔧 Applying Node.js v22 network fixes...');

// 1. Use legacy DNS lookup (Node.js v22 may have new resolver bugs)
dns.setDefaultResultOrder('ipv4first');

// 2. Force IPv4 (Twilio sometimes has IPv6 issues)
const { lookup } = require('dns').promises;
const originalLookup = require('dns').lookup;
require('dns').lookup = (hostname, options, callback) => {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options.family = options.family || 4; // Force IPv4
  return originalLookup(hostname, options, callback);
};

// 3. Set reliable DNS servers
dns.setServers(['8.8.8.8', '1.1.1.1', '208.67.222.222']);

// 4. Clear proxy settings
delete process.env.HTTP_PROXY;
delete process.env.HTTPS_PROXY;
delete process.env.http_proxy;
delete process.env.https_proxy;

// 5. Adjust socket timeouts for Node.js v22
if (typeof process.env.UV_THREADPOOL_SIZE === 'undefined') {
  process.env.UV_THREADPOOL_SIZE = '12'; // Increase thread pool for network ops
}

// 6. Force TLS compatibility
if (tls.DEFAULT_MIN_VERSION) {
  tls.DEFAULT_MIN_VERSION = 'TLSv1';
}

// 7. TEST: Verify DNS is working (with timeout to prevent hanging)
console.log('Testing DNS resolution for verify.twilio.com...');
const dnsTestTimeout = setTimeout(() => {
  console.log('⚠️  DNS test timeout - skipping verification');
  console.log('   This is normal in some environments. DNS will work when needed.');
  console.log('🔧 Node.js v22 network fixes applied');
}, 3000);

dns.resolve4('verify.twilio.com', (err, addresses) => {
  clearTimeout(dnsTestTimeout);
  if (err) {
    console.log('⚠️  DNS test failed:', err.code);
    console.log('   This may be a process isolation issue.');
    console.log('   DNS will retry when Twilio API is called.');
    console.log('🔧 Node.js v22 network fixes applied');
  } else {
    console.log('✅ DNS test passed! Found addresses:', addresses);
    console.log('🔧 Node.js v22 network fixes applied');
  }
});



//////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////





require('dotenv').config();

// Debug: Check if MONGODB_URI is loaded (only show first part for security)
if (process.env.MONGODB_URI) {
    const uriPreview = process.env.MONGODB_URI.substring(0, 30) + '...';
    console.log('✅ MONGODB_URI loaded:', uriPreview); // remove this line
} else {
    console.warn('⚠️  MONGODB_URI not found in environment variables');
    console.warn('💡 Make sure you have a .env file in the project root with MONGODB_URI');
}

const express = require('express');
const http = require('http');
const cors = require('cors');
const connectDB = require('./config/db');
const passport = require('passport');
require('./middleware/passport');

// Add to your server.js after passport initialization
const { OAuth2Client } = require('google-auth-library');
const User = require('./models/authorization/User');
const jwt = require('jsonwebtoken');

// Connect to MongoDB
connectDB();

const app = express();

// well-known route for asset links
app.use('/.well-known', express.static('.well-known'));

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

// JSON parser (must be before routes)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

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
// Support WEB, Android, and iOS client IDs
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID; // WEB client ID
const GOOGLE_ANDROID_CLIENT_ID = process.env.GOOGLE_ANDROID_CLIENT_ID; // Android client ID
const GOOGLE_IOS_CLIENT_ID = process.env.GOOGLE_IOS_CLIENT_ID; // iOS client ID

// Collect all valid client IDs
const validClientIds = [];
if (GOOGLE_CLIENT_ID) validClientIds.push(GOOGLE_CLIENT_ID);
if (GOOGLE_ANDROID_CLIENT_ID) validClientIds.push(GOOGLE_ANDROID_CLIENT_ID);
if (GOOGLE_IOS_CLIENT_ID) validClientIds.push(GOOGLE_IOS_CLIENT_ID);

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
            // This works for WEB, Android, and iOS tokens
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
                    error: 'Please ensure you are using the correct Google Sign-In configuration for your platform (Android/iOS/Web)'
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
            
            // Find or create user in database (normalize email)
            const normalizedEmail = email.toLowerCase().trim();
            let user = await User.findOne({ 'profile.email': normalizedEmail });
            let isNewUser = false;
            
            if (!user) {
                // Extract firstName and lastName from name
                const displayName = name || email.split('@')[0] || 'User';
                const nameParts = displayName.trim().split(/\s+/);
                const firstName = nameParts[0] || 'User';
                const lastName = nameParts.slice(1).join(' ') || 'User';
                
                // New user signup - no OTP needed (Google already verified email)
                user = await User.create({
                    profile: {
                        name: {
                            first: firstName,
                            last: lastName,
                            full: displayName
                        },
                        email: normalizedEmail,
                        phoneNumbers: {
                            primary: '' // Google doesn't provide phone number, user can update later
                        },
                        gender: 'Other', // Default gender since Google doesn't provide this
                        profileImage: picture || ''
                    },
                    auth: {
                        password: 'google-oauth',
                        isGoogleOAuth: true,
                        googleId,
                        tokens: {
                            refreshTokens: []
                        }
                    },
                    account: {
                        isActive: true,
                        isVerified: true, // Google verified
                        lastLogin: new Date()
                    },
                    social: {
                        friends: [],
                        blockedUsers: []
                    },
                    location: {},
                    professional: {
                        education: [],
                        workplace: []
                    },
                    content: {
                        generalWeightage: 0,
                        professionalWeightage: 0
                    }
                });
                isNewUser = true;
                console.log(`✅ Created new Google OAuth user: ${normalizedEmail}`);
            } else {
                // User exists - link Google account if not already linked
                if (!user.auth?.googleId) {
                    // Link Google account to existing user (from regular signup)
                    // Update name fields if not already set
                    if (!user.profile?.name?.first || !user.profile?.name?.last) {
                        const displayName = name || email.split('@')[0] || 'User';
                        const nameParts = displayName.trim().split(/\s+/);
                        if (!user.profile) user.profile = {};
                        if (!user.profile.name) user.profile.name = {};
                        user.profile.name.first = user.profile.name.first || nameParts[0] || 'User';
                        user.profile.name.last = user.profile.name.last || nameParts.slice(1).join(' ') || 'User';
                        user.profile.name.full = displayName;
                    }
                    // Update profile image if not set
                    if (!user.profile?.profileImage && picture) {
                        if (!user.profile) user.profile = {};
                        user.profile.profileImage = picture;
                    }
                    // Link Google account
                    if (!user.auth) user.auth = {};
                    user.auth.googleId = googleId;
                    user.auth.isGoogleOAuth = true;
                    await user.save();
                    console.log(`✅ Linked Google account to existing user: ${normalizedEmail}`);
                } else {
                    // User already has Google account linked - just allow login
                    // Update profile image if provided and different
                    if (picture && user.profile?.profileImage !== picture) {
                        if (!user.profile) user.profile = {};
                        user.profile.profileImage = picture;
                        await user.save();
                    }
                    // Update last login
                    if (!user.account) user.account = {};
                    user.account.lastLogin = new Date();
                    await user.save();
                    console.log(`✅ Google OAuth login for existing user: ${normalizedEmail}`);
                }
            }
            
            // Generate JWT token for your app
            // Generate access token and refresh token
            const { generateAccessToken, generateRefreshToken } = require('./middleware/auth');
            const accessToken = generateAccessToken({
                id: user._id,
                email: user.profile.email,
                name: user.profile.name.full,
                isGoogleOAuth: true
            });
            const { token: refreshToken, expiryDate: refreshTokenExpiry } = generateRefreshToken();
            
            // Get device info
            const deviceInfo = req.headers['user-agent'] || 'Unknown Device';
            
            // Initialize auth structure if needed
            if (!user.auth) user.auth = {};
            if (!user.auth.tokens) user.auth.tokens = {};
            if (!user.auth.tokens.refreshTokens) user.auth.tokens.refreshTokens = [];
            
            // Manage device limit
            const MAX_DEVICES = 5;
            if (user.auth.tokens.refreshTokens.length >= MAX_DEVICES) {
                user.auth.tokens.refreshTokens.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                user.auth.tokens.refreshTokens.shift();
            }
            
            // Add new refresh token
            user.auth.tokens.refreshTokens.push({
                token: refreshToken,
                expiresAt: refreshTokenExpiry,
                device: deviceInfo.substring(0, 200),
                createdAt: new Date()
            });
            
            // Keep backward compatibility
            await user.save();
            
            res.json({
                success: true,
                message: isNewUser ? 'Signup successful via Google OAuth' : 'Login successful via Google OAuth',
                data: {
                    accessToken,
                    refreshToken,
                    token: accessToken, // For backward compatibility
                    isNewUser: isNewUser,
                    user: {
                        id: user._id,
                        email: user.profile.email,
                        firstName: user.profile.name.first,
                        lastName: user.profile.name.last,
                        phoneNumber: user.profile.phoneNumbers.primary,
                        gender: user.profile.gender,
                        name: user.profile.name.full,
                        profileImage: user.profile.profileImage
                    }
                }
            });
            
        } catch (error) {
            console.error('Google token verification error:', error);
            
            // Provide more specific error messages for mobile developers (Android/iOS)
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
} else {
    // Google OAuth not configured - provide helpful error message
    app.post('/api/auth/verify-google-token', async (req, res) => {
        console.warn('⚠️  Google OAuth verification attempted but not configured');
        return res.status(503).json({
            success: false,
            message: 'Google OAuth is not configured on the server',
            error: 'Please set GOOGLE_CLIENT_ID (Web), GOOGLE_ANDROID_CLIENT_ID (Android), and/or GOOGLE_IOS_CLIENT_ID (iOS) environment variables',
            help: 'Check your Railway/environment variables and ensure Google OAuth credentials are set'
        });
    });
}

// ==================== EdTech Platform Routes (Register FIRST to avoid conflicts) ====================
// Course routes - register early to avoid conflicts with general /api routes
try {
    console.log('🔄 Loading course routes...');
    const courseRoutes = require('./routes/course/course.routes');
    app.use('/api/courses', courseRoutes);
    console.log('✅ Course routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading course routes:', error.message);
    console.error('Stack:', error.stack);
    // Don't crash - create a fallback route
    app.use('/api/courses', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Course routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Auth routes - wrapped in try-catch to ensure server starts even if routes fail to load
try {
    console.log('🔄 Loading auth routes...');
    app.use('/api/auth', require('./routes/authorization/authRoutes'));
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
    app.use('/api/auth', require('./routes/authorization/googleAuthRoutes'));
    console.log('✅ Google auth routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading Google auth routes:', error.message);
    console.error('Stack:', error.stack);
    // Don't crash - routes will just not be available
}

// User routes - for updating user profile
try {
    console.log('🔄 Loading user routes...');
    app.use('/api/user', require('./routes/authorization/userRoutes'));
    console.log('✅ User routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading user routes:', error.message);
    console.error('Stack:', error.stack);
}

// Media upload routes
try {
    console.log('🔄 Loading media upload routes...');
    app.use('/api/media', require('./routes/uploadRoutes'));
    console.log('✅ Media upload routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading media upload routes:', error.message);
    console.error('Stack:', error.stack);
    // Don't crash - create a fallback route
    app.use('/api/media', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Media routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Upload routes
try {
    console.log('🔄 Loading upload routes...');
    app.use('/api', require('./routes/upload'));
    console.log('✅ Upload routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading upload routes:', error.message);
    console.error('Stack:', error.stack);
    // Don't crash - routes will just not be available
}

// Company routes - for searching and creating companies
try {
    console.log('🔄 Loading company routes...');
    app.use('/api/company', require('./routes/authorization/companyRoutes'));
    console.log('✅ Company routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading company routes:', error.message);
    console.error('Stack:', error.stack);
    // Don't crash - create a fallback route
    app.use('/api/company', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Company routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Institution routes - for searching and creating institutions
try {
    console.log('🔄 Loading institution routes...');
    app.use('/api/institution', require('./routes/authorization/institutionRoutes'));
    console.log('✅ Institution routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading institution routes:', error.message);
    console.error('Stack:', error.stack);
    // Don't crash - create a fallback route
    app.use('/api/institution', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Institution routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Post routes - for creating and fetching posts
try {
    console.log('🔄 Loading post routes...');
    app.use('/api/posts', require('./routes/social/postRoutes'));
    console.log('✅ Post routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading post routes:', error.message);
    console.error('Stack:', error.stack);
    // Don't crash - create a fallback route
    app.use('/api/posts', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Post routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Reel routes - logical clusters via contentType
try {
    console.log('🔄 Loading reel routes...');
    app.use('/api/reels', require('./routes/social/reelRoutes'));
    console.log('✅ Reel routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading reel routes:', error.message);
    console.error('Stack:', error.stack);
    app.use('/api/reels', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Reel routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Comment routes - for comments on posts and reels
try {
    console.log('🔄 Loading comment routes...');
    app.use('/api/comments', require('./routes/social/commentRoutes'));
    console.log('✅ Comment routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading comment routes:', error.message);
    console.error('Stack:', error.stack);
    app.use('/api/comments', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Comment routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// User report routes
try {
    console.log('🔄 Loading user report routes...');
    app.use('/api/reports', require('./routes/social/userReportRoutes'));
    console.log('✅ User report routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading user report routes:', error.message);
    console.error('Stack:', error.stack);
    app.use('/api/reports', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'User report routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Like routes - for post and reel reactions
try {
    console.log('🔄 Loading like routes...');
    app.use('/api/likes', require('./routes/social/likeRoutes'));
    console.log('✅ Like routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading like routes:', error.message);
    console.error('Stack:', error.stack);
    app.use('/api/likes', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Like routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Friend routes - for friend requests and friendships
try {
    console.log('🔄 Loading friend routes...');
    app.use('/api/friend', require('./routes/social/friendRoutes'));
    console.log('✅ Friend routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading friend routes:', error.message);
    console.error('Stack:', error.stack);
    // Don't crash - create a fallback route
    app.use('/api/friend', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Friend routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Story routes - for creating and fetching stories
try {
    console.log('🔄 Loading story routes...');
    app.use('/api/stories', require('./routes/social/storyRoutes'));
    console.log('✅ Story routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading story routes:', error.message);
    console.error('Stack:', error.stack);
    // Don't crash - create a fallback route
    app.use('/api/stories', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Story routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Chat routes - for real-time messaging
try {
    console.log('🔄 Loading chat routes...');
    app.use('/api/chat', require('./routes/social/chatRoutes'));
    console.log('✅ Chat routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading chat routes:', error.message);
    console.error('Stack:', error.stack);
    // Don't crash - create a fallback route
    app.use('/api/chat', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Chat routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Bug Report routes - for reporting bugs
try {
    console.log('🔄 Loading bug report routes...');
    app.use('/api/bug-reports', require('./routes/social/bugReportRoutes'));
    console.log('✅ Bug report routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading bug report routes:', error.message);
    console.error('Stack:', error.stack);
    // Don't crash - create a fallback route
    app.use('/api/bug-reports', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Bug report routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Host Auth routes
try {
    console.log('🔄 Loading host auth routes...');
    app.use('/api/host/auth', require('./routes/conference/hostAuthRoutes'));
    console.log('✅ Host auth routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading host auth routes:', error.message);
    console.error('Stack:', error.stack);
    app.use('/api/host/auth', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Host auth routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Speaker Auth routes
try {
    console.log('🔄 Loading speaker auth routes...');
    app.use('/api/speaker/auth', require('./routes/conference/speakerAuthRoutes'));
    console.log('✅ Speaker auth routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading speaker auth routes:', error.message);
    console.error('Stack:', error.stack);
    app.use('/api/speaker/auth', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Speaker auth routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Conference routes
try {
    console.log('🔄 Loading conference routes...');
    app.use('/api/conference', require('./routes/conference/conferenceRoutes'));
    console.log('✅ Conference routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading conference routes:', error.message);
    console.error('Stack:', error.stack);
    app.use('/api/conference', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Conference routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Conference results routes
try {
    console.log('🔄 Loading conference results routes...');
    app.use('/api/conference', require('./routes/conference/conferenceResultsRoutes'));
    console.log('✅ Conference results routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading conference results routes:', error.message);
    console.error('Stack:', error.stack);
    app.use('/api/conference', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Conference results routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Marketplace seller routes
try {
    console.log('🔄 Loading marketplace seller routes...');
    app.use('/api/marketplace/seller', require('./routes/marketplace/sellerRoutes'));
    console.log('✅ Marketplace seller routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading marketplace seller routes:', error.message);
    console.error('Stack:', error.stack);
    app.use('/api/marketplace/seller', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Marketplace seller routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Marketplace admin seller routes
try {
    console.log('🔄 Loading marketplace admin seller routes...');
    app.use('/api/marketplace/admin/seller', require('./routes/marketplace/adminSellerRoutes'));
    console.log('✅ Marketplace admin seller routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading marketplace admin seller routes:', error.message);
    console.error('Stack:', error.stack);
    app.use('/api/marketplace/admin/seller', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Marketplace admin seller routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Marketplace product routes
try {
    console.log('🔄 Loading marketplace product routes...');
    app.use('/api/marketplace/products', require('./routes/marketplace/productRoutes'));
    console.log('✅ Marketplace product routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading marketplace product routes:', error.message);
    console.error('Stack:', error.stack);
    app.use('/api/marketplace/products', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Marketplace product routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Marketplace inventory routes
try {
    console.log('🔄 Loading marketplace inventory routes...');
    app.use('/api/marketplace/inventory', require('./routes/marketplace/inventoryRoutes'));
    console.log('✅ Marketplace inventory routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading marketplace inventory routes:', error.message);
    console.error('Stack:', error.stack);
    app.use('/api/marketplace/inventory', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Marketplace inventory routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Marketplace cart routes
try {
    console.log('🔄 Loading marketplace cart routes...');
    app.use('/api/marketplace/cart', require('./routes/marketplace/cartRoutes'));
    console.log('✅ Marketplace cart routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading marketplace cart routes:', error.message);
    console.error('Stack:', error.stack);
    app.use('/api/marketplace/cart', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Marketplace cart routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Video transcoding routes
try {
    console.log('🔄 Loading video transcoding routes...');
    app.use('/api/video-transcoding', require('./routes/videoTranscodingRoutes'));
    console.log('✅ Video transcoding routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading video transcoding routes:', error.message);
    console.error('Stack:', error.stack);
    app.use('/api/video-transcoding', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Video transcoding routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// Wallet routes (read-only)
try {
    console.log('🔄 Loading wallet routes...');
    app.use('/api/wallet', require('./routes/wallet/walletRoutes'));
    console.log('✅ Wallet routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading wallet routes:', error.message);
    console.error('Stack:', error.stack);
    app.use('/api/wallet', (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Wallet routes failed to load. Check server logs.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    });
}

// ==================== EdTech Platform Routes ====================

// University Auth routes
try {
    console.log('🔄 Loading university auth routes...');
    app.use('/api/auth/university', require('./routes/auth/university.routes'));
    console.log('✅ University auth routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading university auth routes:', error.message);
    console.error('Stack:', error.stack);
}

// University Course Analytics routes
try {
    console.log('🔄 Loading university course routes...');
    app.use('/api/university', require('./routes/university/universityCourseRoutes'));
    console.log('✅ University course routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading university course routes:', error.message);
    console.error('Stack:', error.stack);
}

// Playlist routes
try {
    console.log('🔄 Loading playlist routes...');
    app.use('/api', require('./routes/course/playlist.routes'));
    console.log('✅ Playlist routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading playlist routes:', error.message);
    console.error('Stack:', error.stack);
}

// Invite routes
try {
    console.log('🔄 Loading invite routes...');
    app.use('/api/invites', require('./routes/course/invite.routes'));
    console.log('✅ Invite routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading invite routes:', error.message);
    console.error('Stack:', error.stack);
}

// Video routes
try {
    console.log('🔄 Loading video routes...');
    app.use('/api/videos', require('./routes/video/video.routes'));
    console.log('✅ Video routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading video routes:', error.message);
    console.error('Stack:', error.stack);
}

// Checkpoint routes
try {
    console.log('🔄 Loading checkpoint routes...');
    app.use('/api', require('./routes/video/checkpoint.routes'));
    console.log('✅ Checkpoint routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading checkpoint routes:', error.message);
    console.error('Stack:', error.stack);
}

// Progress routes
try {
    console.log('🔄 Loading progress routes...');
    app.use('/api/progress', require('./routes/progress/progress.routes'));
    console.log('✅ Progress routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading progress routes:', error.message);
    console.error('Stack:', error.stack);
}

// Analytics routes
try {
    console.log('🔄 Loading analytics routes...');
    app.use('/api/analytics', require('./routes/analytics/analytics.routes'));
    console.log('✅ Analytics routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading analytics routes:', error.message);
    console.error('Stack:', error.stack);
}

// Review routes
try {
    console.log('🔄 Loading review routes...');
    app.use('/api/reviews', require('./routes/review/review.routes'));
    console.log('✅ Review routes loaded successfully');
} catch (error) {
    console.error('❌ Error loading review routes:', error.message);
    console.error('Stack:', error.stack);
}

// Twilio OTP endpoints (phone verification)
try {
    console.log('🔄 Loading Twilio OTP routes...');
    const twilio = require('twilio');
    
    // Initialize Twilio client (only if credentials are available)
    let twilioClient = null;
    const twilioServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    
    // Check if Twilio credentials are configured
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
        try {
            twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
            console.log('✅ Twilio client initialized');
        } catch (err) {
            console.error('❌ Failed to initialize Twilio client:', err.message);
        }
    } else {
        console.warn('⚠️  Twilio credentials not configured. Phone OTP endpoints will not work.');
        console.warn('   Required: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID');
    }
    
    // Helper function to validate and normalize phone number (E.164 format)
    const validatePhoneNumber = (phone) => {
        if (!phone) return { valid: false, error: 'Phone number is required' };
        
        // Remove all spaces, dashes, and parentheses
        let normalized = phone.replace(/[\s\-\(\)]/g, '');
        
        // Ensure it starts with +
        if (!normalized.startsWith('+')) {
            normalized = '+' + normalized;
        }
        
        // E.164 format: + followed by 1-15 digits
        // Pattern: +[country code][subscriber number]
        const e164Pattern = /^\+[1-9]\d{1,14}$/;
        
        if (!e164Pattern.test(normalized)) {
            return { 
                valid: false, 
                error: 'Invalid phone number format. Phone number must be in E.164 format (e.g., +1234567890). It should start with + followed by country code and subscriber number (10-15 digits total).',
                example: 'Example: +1234567890 or +919876543210'
            };
        }
        
        // Check minimum length (country code + at least 7 digits for subscriber)
        if (normalized.length < 10) {
            return { 
                valid: false, 
                error: 'Phone number too short. Must be at least 10 digits including country code.',
                example: 'Example: +1234567890'
            };
        }
        
        // Check maximum length (E.164 max is 15 digits)
        if (normalized.length > 16) { // + plus 15 digits
            return { 
                valid: false, 
                error: 'Phone number too long. Maximum 15 digits after the + sign.',
                example: 'Example: +123456789012345'
            };
        }
        
        return { valid: true, normalized };
    };
    
    // 1) Send OTP via Twilio
    app.post('/send-otp', async (req, res) => {
        try {
            const { phone } = req.body;
            if (!phone) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'phone is required',
                    hint: 'Phone number must be in E.164 format (e.g., +1234567890)'
                });
            }
            
            // Validate and normalize phone number
            const phoneValidation = validatePhoneNumber(phone);
            if (!phoneValidation.valid) {
                return res.status(400).json({ 
                    success: false, 
                    message: phoneValidation.error,
                    example: phoneValidation.example
                });
            }
            
            // Check if Twilio is configured
            if (!twilioClient) {
                return res.status(500).json({ 
                    success: false, 
                    message: 'Twilio is not configured',
                    hint: 'Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables'
                });
            }
            
            if (!twilioServiceSid) {
                return res.status(500).json({ 
                    success: false, 
                    message: 'Twilio Verify Service not configured',
                    hint: 'Please set TWILIO_VERIFY_SERVICE_SID environment variable'
                });
            }
            
            // Create verification via Twilio Verify v2 (channel sms)
            console.log('📱 Using Twilio Verify v2 API to send OTP');
            const verification = await twilioClient.verify.v2.services(twilioServiceSid)
                .verifications
                .create({ to: phoneValidation.normalized, channel: 'sms' });
            
            return res.json({ success: true, sid: verification.sid, status: verification.status });
        } catch (err) {
            console.error('Twilio send OTP error:', err);
            console.error('Error details:', {
                message: err.message,
                code: err.code,
                status: err.status,
                moreInfo: err.moreInfo
            });
            
            // Provide more helpful error messages based on error type
            let errorMessage = err.message || 'Failed to send OTP';
            let hint = '';
            
            // Network/Connection errors
            if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND' || err.message?.includes('ECONNRESET')) {
                errorMessage = 'Connection error: Unable to reach Twilio service';
                hint = 'Please check your internet connection and Twilio service status. If the problem persists, verify your Twilio credentials are correct.';
            }
            // Authentication errors
            else if (err.status === 401 || err.message?.includes('Authentication Error') || err.message?.includes('authenticate')) {
                errorMessage = 'Twilio authentication failed';
                hint = 'Please verify your TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are correct.';
            }
            // Invalid phone number
            else if (err.message && (err.message.includes('Invalid parameter `To`') || err.status === 400)) {
                errorMessage = 'Invalid phone number format';
                hint = 'Phone number must be in E.164 format: +[country code][subscriber number] (e.g., +1234567890)';
            }
            // Service not found
            else if (err.status === 404 || err.message?.includes('not found')) {
                errorMessage = 'Twilio Verify Service not found';
                hint = 'Please verify your TWILIO_VERIFY_SERVICE_SID is correct and the service exists in your Twilio account.';
            }
            // Rate limiting
            else if (err.status === 429) {
                errorMessage = 'Rate limit exceeded';
                hint = 'Too many requests. Please wait a few minutes before trying again.';
            }
            
            return res.status(err.status || 500).json({ 
                success: false, 
                message: errorMessage,
                hint: hint || 'Please check your Twilio configuration and try again.',
                errorCode: err.code || err.status
            });
        }
    });
    
    // 2) Verify OTP via Twilio
    app.post('/verify-otp', async (req, res) => {
        try {
            const { phone, code } = req.body;
            if (!phone || !code) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'phone and code required',
                    hint: 'Phone number must be in E.164 format (e.g., +1234567890)'
                });
            }
            
            // Validate and normalize phone number
            const phoneValidation = validatePhoneNumber(phone);
            if (!phoneValidation.valid) {
                return res.status(400).json({ 
                    success: false, 
                    message: phoneValidation.error,
                    example: phoneValidation.example
                });
            }
            
            // Validate OTP code format (typically 4-8 digits)
            if (!/^\d{4,8}$/.test(code)) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Invalid OTP code format. Code must be 4-8 digits.',
                    example: 'Example: 123456'
                });
            }
            
            // Check if Twilio is configured
            if (!twilioClient) {
                return res.status(500).json({ 
                    success: false, 
                    message: 'Twilio is not configured',
                    hint: 'Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables'
                });
            }
            
            if (!twilioServiceSid) {
                return res.status(500).json({ 
                    success: false, 
                    message: 'Twilio Verify Service not configured',
                    hint: 'Please set TWILIO_VERIFY_SERVICE_SID environment variable'
                });
            }
            
            console.log('✅ Using Twilio Verify v2 API to verify OTP');
            const check = await twilioClient.verify.v2.services(twilioServiceSid)
                .verificationChecks
                .create({ to: phoneValidation.normalized, code: code });
            
            if (check.status === 'approved') {
                // TODO: mark user as verified in DB or issue JWT
                return res.json({ success: true, message: 'Phone verified' });
            }
            
            return res.status(400).json({ success: false, message: 'Invalid or expired code' });
        } catch (err) {
            console.error('Twilio verify OTP error:', err);
            console.error('Error details:', {
                message: err.message,
                code: err.code,
                status: err.status,
                moreInfo: err.moreInfo
            });
            
            // Provide more helpful error messages based on error type
            let errorMessage = err.message || 'Failed to verify OTP';
            let hint = '';
            
            // Network/Connection errors
            if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND' || err.message?.includes('ECONNRESET')) {
                errorMessage = 'Connection error: Unable to reach Twilio service';
                hint = 'Please check your internet connection and Twilio service status. If the problem persists, verify your Twilio credentials are correct.';
            }
            // Authentication errors
            else if (err.status === 401 || err.message?.includes('Authentication Error') || err.message?.includes('authenticate')) {
                errorMessage = 'Twilio authentication failed';
                hint = 'Please verify your TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are correct.';
            }
            // Invalid phone number
            else if (err.message && (err.message.includes('Invalid parameter `To`') || err.status === 400)) {
                errorMessage = 'Invalid phone number format';
                hint = 'Phone number must be in E.164 format: +[country code][subscriber number] (e.g., +1234567890)';
            }
            // Service not found
            else if (err.status === 404 || err.message?.includes('not found')) {
                errorMessage = 'Twilio Verify Service not found';
                hint = 'Please verify your TWILIO_VERIFY_SERVICE_SID is correct and the service exists in your Twilio account.';
            }
            
            return res.status(err.status || 500).json({ 
                success: false, 
                message: errorMessage,
                hint: hint || 'Please check your Twilio configuration and try again.',
                errorCode: err.code || err.status
            });
        }
    });
    
    console.log('✅ Twilio OTP routes loaded successfully');
    console.log('  POST /send-otp (Twilio phone OTP)');
    console.log('  POST /verify-otp (Twilio phone OTP)');
} catch (error) {
    console.error('❌ Error loading Twilio OTP routes:', error.message);
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
            getProfile: 'GET /api/auth/profile (protected)',
            refreshToken: 'POST /api/auth/refresh-token',
            logout: 'POST /api/auth/logout (protected)',
            googleAuth: 'GET /api/auth/google',
            googleAuthMobile: 'POST /api/auth/google/mobile',
            verifyGoogleToken: 'POST /api/auth/verify-google-token',
            sendOTPSignup: 'POST /api/auth/send-otp-signup',
            verifyOTPSignup: 'POST /api/auth/verify-otp-signup',
            sendPhoneOTPSignup: 'POST /api/auth/send-phone-otp-signup',
            verifyPhoneOTPSignup: 'POST /api/auth/verify-phone-otp-signup',
            sendOTPPhone: 'POST /send-otp (Twilio phone OTP)',
            verifyOTPPhone: 'POST /verify-otp (Twilio phone OTP)',
            forgotPasswordSendOTP: 'POST /api/auth/forgot-password/send-otp',
            forgotPasswordVerifyOTP: 'POST /api/auth/forgot-password/verify-otp',
            forgotPasswordReset: 'POST /api/auth/forgot-password/reset',
            updateProfile: 'PUT /api/user/profile (protected)',
            updatePhoneSendOTP: 'POST /api/user/phone/send-otp (protected)',
            updatePhoneVerifyOTP: 'POST /api/user/phone/verify-otp (protected)',
            updateAlternatePhoneSendOTP: 'POST /api/user/alternate-phone/send-otp (protected)',
            updateAlternatePhoneVerifyOTP: 'POST /api/user/alternate-phone/verify-otp (protected)',
            removeAlternatePhone: 'DELETE /api/user/alternate-phone (protected)'
        }
    });
});

// Handle undefined routes
app.use((req, res) => {
    console.log(`❌ Route not found: ${req.method} ${req.path}`);
    console.log(`   Headers:`, req.headers);
    console.log(`   Body:`, req.body);
    
    // Provide helpful hints based on the path
    let hint = 'Make sure you are using the correct HTTP method and path.';
    if (req.path === '/api/auth/profile') {
        hint = 'GET /api/auth/profile requires Authorization header: Authorization: Bearer <accessToken>. Make sure you are authenticated.';
    } else if (req.path.startsWith('/api/auth/')) {
        hint = 'Check the API documentation for the correct HTTP method and endpoint. Common endpoints: POST /api/auth/signup, POST /api/auth/login, GET /api/auth/profile (requires auth)';
    } else if (req.path.startsWith('/api/chat/')) {
        hint = 'Chat routes require authentication. Make sure you include Authorization header: Authorization: Bearer <accessToken>. Available endpoints: GET /api/chat/conversations, GET /api/chat/conversation/:participantId (or /api/chat/conversations/:participantId), GET /api/chat/conversation/:conversationId/messages, POST /api/chat/message';
    } else if (req.path.startsWith('/api/courses')) {
        hint = 'Course routes require university authentication. Make sure you include Authorization header: Authorization: Bearer <universityToken>. Available endpoints: GET /api/courses (university auth), POST /api/courses (university auth), GET /api/courses/:id (user/university auth), PUT /api/courses/:id (university auth), DELETE /api/courses/:id (university auth). If you see this error, the route may not be registered - check server logs for "Loading course routes..."';
    }
    
    res.status(404).json({
        success: false,
        message: 'Route not found',
        method: req.method,
        path: req.path,
        hint: hint,
        availableEndpoints: req.path.startsWith('/api/auth/') ? {
            signup: 'POST /api/auth/signup',
            login: 'POST /api/auth/login',
            getProfile: 'GET /api/auth/profile (requires Authorization: Bearer <token>)',
            refreshToken: 'POST /api/auth/refresh-token',
            sendOTPSignup: 'POST /api/auth/send-otp-signup',
            verifyOTPSignup: 'POST /api/auth/verify-otp-signup',
            universitySendOTP: 'POST /api/auth/university/send-otp',
            universityVerifyOTP: 'POST /api/auth/university/verify-otp',
            universityRegister: 'POST /api/auth/university/register',
            universityLogin: 'POST /api/auth/university/login'
        } : undefined
    });
});

// Error handler middleware (must be last)
const errorHandler = require('./middleware/errorhandler');
app.use(errorHandler);

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

// Create HTTP server for Socket.IO
const httpServer = http.createServer(app);

// Initialize Redis connection for conference polling
const { initRedis } = require('./config/redisConnection');

// Initialize Socket.IO server (must be awaited to ensure Redis connections are ready)
const { initSocketServer } = require('./socket/socketServer');

// Initialize MCQ generation worker
const { startMCQGenerationWorker } = require('./workers/mcqGenerationWorker');

// Start server after Socket.IO is initialized
(async () => {
    try {
        // Initialize Redis (falls back to in-memory if not configured)
        await initRedis();
        
        await initSocketServer(httpServer);
        
        // Start MCQ generation worker (after database connection)
        startMCQGenerationWorker();
        
        // Start server
        httpServer.listen(PORT, () => {
    console.log(`\n🎯 Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📊 Database: sanora`);
    console.log(`🔐 Auth routes: http://localhost:${PORT}/api/auth`);
    console.log(`💬 Chat WebSocket: ws://localhost:${PORT}`);
    console.log('Environment Variables Check:');
    console.log('GOOGLE_CLIENT_ID (WEB):', process.env.GOOGLE_CLIENT_ID ? 'SET' : 'NOT SET');
    console.log('GOOGLE_ANDROID_CLIENT_ID:', process.env.GOOGLE_ANDROID_CLIENT_ID ? 'SET' : 'NOT SET');
    console.log('GOOGLE_IOS_CLIENT_ID:', process.env.GOOGLE_IOS_CLIENT_ID ? 'SET' : 'NOT SET');
    console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'SET' : 'NOT SET');
    console.log('GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL || 'NOT SET');
    console.log('REDIS_URL:', process.env.REDIS_URL ? 'SET' : 'NOT SET (optional, for scaling)');
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
    const { isRedisReady } = require('./config/redisConnection');
    if (isRedisReady()) {
        console.log('✅ Redis enabled - conference polling can scale horizontally');
    } else {
    console.log('ℹ️  Redis disabled - using in-memory cache and presence tracking');
    console.log('   This is suitable for single-server deployments.');
        console.log('   Set REDIS_URL environment variable to enable horizontal scaling.');
    }
    console.log('📊 Conference polling: Real-time voting with Socket.IO');
        });
    } catch (error) {
        console.error('❌ Failed to initialize Socket.IO server:', error);
        process.exit(1);
    }
})();

// ✅ Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    const { closeRedis } = require('./config/redisConnection');
    await closeRedis();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    const { closeRedis } = require('./config/redisConnection');
    await closeRedis();
    process.exit(0);
});

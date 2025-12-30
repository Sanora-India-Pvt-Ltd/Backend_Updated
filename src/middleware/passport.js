const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/authorization/User');

console.log('=== Loading Passport Configuration ===');
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set (defaults to development)');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not Set');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Not Set');

// Determine callback URL
const callbackURL = process.env.GOOGLE_CALLBACK_URL || 
     (process.env.NODE_ENV === 'production' && process.env.BACKEND_URL
       ? `${process.env.BACKEND_URL}/api/auth/google/callback`
       : process.env.NODE_ENV === 'production'
       ? 'http://13.203.123.56:3100/api/auth/google/callback'
       : `http://localhost:${process.env.PORT || 3100}/api/auth/google/callback`);

console.log('GOOGLE_CALLBACK_URL:', callbackURL);

// Warn if misconfigured
if (process.env.NODE_ENV === 'production' && callbackURL.includes('localhost')) {
    console.warn('⚠️  WARNING: NODE_ENV is "production" but using localhost URL!');
    console.warn('   This will cause DNS errors. Set BACKEND_URL or use production domain.');
} else if (!process.env.NODE_ENV && callbackURL.includes('13.203.123.56:3100')) {
    console.warn('⚠️  WARNING: Using production URL without NODE_ENV=production');
    console.warn('   Set NODE_ENV=development for local development');
}

// Only configure Google Strategy if required environment variables are present
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    console.log('Configuring Google OAuth strategy...');
    
    passport.use('google', new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: callbackURL,
        passReqToCallback: true,
        scope: ['profile', 'email']
    }, async (req, accessToken, refreshToken, profile, done) => {
        try {
            const { id, displayName, emails, photos } = profile;
            // Normalize email to lowercase for consistent lookup
            const email = emails[0].value.toLowerCase().trim();
            const photo = photos[0]?.value;
            
            // Check if user exists by email (normalized)
            const user = await User.findOne({ 'profile.email': email });
            
            if (!user) {
                // Extract firstName and lastName from displayName
                const nameParts = displayName ? displayName.trim().split(/\s+/) : ['User'];
                const firstName = nameParts[0] || 'User';
                const lastName = nameParts.slice(1).join(' ') || 'User';
                
                // Create new user with Google OAuth using new nested structure
                // Note: phoneNumber is optional for Google OAuth users
                user = await User.create({
                    profile: {
                        name: {
                            first: firstName,
                            last: lastName,
                            full: displayName || `${firstName} ${lastName}`.trim()
                        },
                        email: email,
                        gender: 'Other', // Default gender since Google doesn't provide this
                        profileImage: photo || ''
                    },
                    auth: {
                        password: 'oauth-user', // Dummy password for OAuth users
                        isGoogleOAuth: true,
                        googleId: id,
                        tokens: {
                            refreshTokens: []
                        }
                    },
                    account: {
                        isActive: true,
                        isVerified: true, // Google OAuth users are verified
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
                console.log(`✅ Created new Google OAuth user: ${email}`);
            } else {
                // User exists - link Google account if not already linked
                const userGoogleId = user.auth?.googleId;
                
                if (!userGoogleId) {
                    // Link Google account to existing user (from regular signup)
                    // Ensure auth structure exists
                    if (!user.auth) user.auth = {};
                    if (!user.auth.tokens) user.auth.tokens = {};
                    if (!user.auth.tokens.refreshTokens) user.auth.tokens.refreshTokens = [];
                    
                    // Update name if not already set
                    if (!user.profile?.name?.first || !user.profile?.name?.last) {
                        const nameParts = displayName ? displayName.trim().split(/\s+/) : ['User'];
                        if (!user.profile.name) user.profile.name = {};
                        user.profile.name.first = user.profile.name.first || nameParts[0] || 'User';
                        user.profile.name.last = user.profile.name.last || nameParts.slice(1).join(' ') || 'User';
                        user.profile.name.full = displayName || `${user.profile.name.first} ${user.profile.name.last}`.trim();
                    }
                    // Update profile image if not set
                    if (!user.profile.profileImage && photo) {
                        user.profile.profileImage = photo;
                    }
                    
                    user.auth.googleId = id;
                    user.auth.isGoogleOAuth = true;
                    await user.save();
                    console.log(`✅ Linked Google account to existing user: ${email}`);
                } else {
                    // User already has Google account linked - just allow login
                    // Update profile image if provided and different
                    if (photo) {
                        if (user.profile.profileImage !== photo) {
                            user.profile.profileImage = photo;
                            await user.save();
                        }
                    }
                    console.log(`✅ Google OAuth login for existing user: ${email}`);
                }
            }
            
            console.log(`Google OAuth successful for ${email}`);
            return done(null, user);
        } catch (error) {
            console.error('Google OAuth error:', error);
            return done(error, null);
        }
    }));
    
    console.log('✅ Google OAuth strategy configured successfully');
} else {
    console.warn('⚠️ Google OAuth is not configured. Missing required environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET');
}

// Serialize/deserialize user
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

module.exports = passport;

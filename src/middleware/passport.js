const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Student = require('../models/Student');
const Doctor = require('../models/Doctor');

console.log('=== Loading Passport Configuration ===');
console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not Set');
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Not Set');
console.log('GOOGLE_CALLBACK_URL:', process.env.GOOGLE_CALLBACK_URL || 'Using default');

// Only configure Google Strategy if required environment variables are present
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    console.log('Configuring Google OAuth strategy...');
    
    passport.use('google', new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 
             (process.env.NODE_ENV === 'production' 
               ? 'https://sanora.onrender.com/api/auth/google/callback'
               : 'http://localhost:3100/api/auth/google/callback'),
        passReqToCallback: true,
        scope: ['profile', 'email']
    }, async (req, accessToken, refreshToken, profile, done) => {
        try {
            const { id, displayName, emails, photos } = profile;
            const email = emails[0].value;
            const photo = photos[0]?.value;
            
            // Determine user type from query parameter
            const userType = req.query.state || 'student'; // Default to student
            
            let user;
            
            if (userType === 'student') {
                // Check if student exists
                user = await Student.findOne({ email });
                
                if (!user) {
                    // Create new student with Google OAuth
                    user = await Student.create({
                        email,
                        name: displayName,
                        googleId: id,
                        profileImage: photo,
                        password: 'oauth-user' // Dummy password for OAuth users
                    });
                } else if (!user.googleId) {
                    // Link Google account to existing student
                    user.googleId = id;
                    user.profileImage = photo;
                    await user.save();
                }
            } else {
                // For doctors
                user = await Doctor.findOne({ email });
                
                if (!user) {
                    user = await Doctor.create({
                        email,
                        name: displayName,
                        googleId: id,
                        profileImage: photo,
                        password: 'oauth-user'
                    });
                } else if (!user.googleId) {
                    user.googleId = id;
                    user.profileImage = photo;
                    await user.save();
                }
            }
            
            console.log(`Google OAuth successful for ${email} (${userType})`);
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
        let user = await Student.findById(id);
        if (!user) {
            user = await Doctor.findById(id);
        }
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

module.exports = passport;
const passport = require('../middleware/passport');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { generateAccessToken, generateRefreshToken } = require('../middleware/auth');

// Generate JWT Token (legacy - now uses access token)
const generateToken = (user) => {
    return generateAccessToken({
        id: user._id,
        email: user.email,
        name: user.name,
        isGoogleOAuth: user.googleId ? true : false
    });
};

// Initiate Google OAuth
const googleAuth = (req, res, next) => {
    // Store platform info in session for callback
    if (req.query.platform === 'mobile' || req.query.mobile === 'true') {
        req.session.platform = 'mobile';
        if (req.query.deepLink) {
            req.session.deepLink = req.query.deepLink;
        }
    } else if (req.headers['x-platform'] === 'mobile') {
        req.session.platform = 'mobile';
    }
    
    passport.authenticate('google', {
        scope: ['profile', 'email']
    })(req, res, next);
};

// Google OAuth Callback
const googleCallback = (req, res, next) => {
    passport.authenticate('google', async (err, user) => {
        // Check if this is a mobile app request
        // Check multiple sources: query params, session, state param, headers
        const stateParam = req.query.state || '';
        const isMobile = req.query.platform === 'mobile' || 
                        req.query.mobile === 'true' ||
                        req.session?.platform === 'mobile' ||
                        stateParam === 'mobile' ||
                        req.headers['user-agent']?.toLowerCase().includes('mobile') ||
                        req.headers['x-platform'] === 'mobile';
        
        if (err || !user) {
            console.error('❌ Google OAuth error:', err?.message || 'User not found');
            
            // For mobile apps, return JSON instead of redirecting
            if (isMobile) {
                return res.status(401).json({
                    success: false,
                    message: 'Google OAuth authentication failed',
                    error: err?.message || 'User not found'
                });
            }
            
            // For web, redirect to error page
            const frontendUrl = process.env.FRONTEND_URL || 
                (process.env.NODE_ENV === 'production' 
                    ? 'https://sanoraindia.com' 
                    : 'http://localhost:5500');
            
            console.log(`🔄 Redirecting to error page: ${frontendUrl}/login?error=auth_failed`);
            return res.redirect(`${frontendUrl}/login?error=auth_failed`);
        }
        
        try {
            // Generate access token and refresh token
            const accessToken = generateAccessToken({
                id: user._id,
                email: user.email,
                name: user.name,
                isGoogleOAuth: user.googleId ? true : false
            });
            const refreshToken = generateRefreshToken();
            
            // Save refresh token to database
            user.refreshToken = refreshToken;
            await user.save();
        
            // For backward compatibility, use accessToken as token
            const token = accessToken;
            
            // Determine if this is a new user
            const isNewUser = !user.createdAt || (Date.now() - new Date(user.createdAt).getTime()) < 5000;
            
            console.log(`✅ Google OAuth successful for ${user.email}`);
            console.log(`📱 Mobile request: ${isMobile ? 'Yes' : 'No'}`);
            
            // Check if JSON response is requested (for API clients)
            const wantsJson = req.query.format === 'json' || 
                            req.headers.accept?.includes('application/json') ||
                            req.query.json === 'true';
            
            // For mobile apps, return JSON response or redirect to deep link
            if (isMobile) {
                // If JSON is requested, return JSON response with both tokens
                if (wantsJson) {
                    return res.status(200).json({
                        success: true,
                        message: isNewUser ? 'Signup successful via Google OAuth' : 'Login successful via Google OAuth',
                        data: {
                            accessToken,
                            refreshToken,
                            token, // For backward compatibility
                            isNewUser,
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
                }
                
                // Check if deep link scheme is provided
                const deepLinkScheme = req.query.deepLink || 
                                     req.session?.deepLink || 
                                     process.env.MOBILE_DEEP_LINK_SCHEME || 
                                     'sanora';
                
                // Clear session data after use
                if (req.session) {
                    delete req.session.platform;
                    delete req.session.deepLink;
                }
                
                // Create deep link URL (include all tokens for consistency)
                const deepLinkUrl = `${deepLinkScheme}://auth/callback?token=${token}&accessToken=${accessToken}&refreshToken=${refreshToken}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name || '')}&isNewUser=${isNewUser}`;
                
                // Return HTML page that automatically opens deep link
                const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Authentication Successful</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #333;
        }
        .container {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            text-align: center;
            max-width: 400px;
            width: 90%;
        }
        .success-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
        h1 {
            margin: 0 0 1rem 0;
            color: #333;
        }
        p {
            color: #666;
            margin: 0.5rem 0;
        }
        .button {
            display: inline-block;
            margin-top: 1.5rem;
            padding: 12px 24px;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            transition: background 0.3s;
        }
        .button:hover {
            background: #5568d3;
        }
        .loading {
            margin-top: 1rem;
            color: #999;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✅</div>
        <h1>Authentication Successful!</h1>
        <p>Redirecting you back to the app...</p>
        <div class="loading" id="status">Opening app...</div>
        <a href="sanjaytube://home" class="button" id="openApp">Open App</a>
    </div>
    <script>
        const deepLink = 'sanjaytube://auth/callback?token=xyz';
        const statusEl = document.getElementById('status');
        
        function openDeepLink() {
            try {
                window.location.href = deepLink;
                statusEl.textContent = 'Opening app...';
                setTimeout(() => {
                    statusEl.textContent = 'If the app didn\\'t open, tap the button below';
                }, 2000);
            } catch (e) {
                statusEl.textContent = 'Please tap the button below to open the app';
            }
        }
        
        window.onload = function() {
            setTimeout(openDeepLink, 500);
        };
        
        document.getElementById('openApp').addEventListener('click', function(e) {
            e.preventDefault();
            openDeepLink();
        });
    </script>
</body>
</html>`;
            
            return res.status(200).send(html);
        }
        
        // For web, redirect to frontend
        let frontendUrl = process.env.FRONTEND_URL || 
            (process.env.NODE_ENV === 'production' 
                ? 'https://sanoraindia.com' 
                : 'http://localhost:5500');
        
        // Prevent redirecting to backend URL
        const backendUrl = process.env.BACKEND_URL || 
            (process.env.NODE_ENV === 'production' 
                ? 'https://api.sanoraindia.com' 
                : `http://localhost:${process.env.PORT || 3100}`);
        
        if (frontendUrl.includes('api.sanoraindia.com') || frontendUrl.includes('localhost:3100')) {
            console.warn('⚠️  WARNING: FRONTEND_URL appears to be pointing to backend URL!');
            console.warn(`   Backend URL: ${backendUrl}`);
            console.warn(`   Frontend URL: ${frontendUrl}`);
            console.warn('   Setting fallback to production frontend or localhost:5500');
            frontendUrl = process.env.NODE_ENV === 'production' 
                ? 'https://sanoraindia.com' 
                : 'http://localhost:5500';
        }
        
        console.log(`🔄 Redirecting to: ${frontendUrl}/auth/callback`);
        console.log(`📍 FRONTEND_URL env var: ${process.env.FRONTEND_URL || 'NOT SET (using fallback)'}`);
        
        // Redirect to frontend with token and user info
        try {
            const redirectUrl = new URL(`${frontendUrl}/auth/callback`);
            // Include all tokens for consistency across all authentication flows
            redirectUrl.searchParams.append('token', token);
            redirectUrl.searchParams.append('accessToken', accessToken);
            redirectUrl.searchParams.append('refreshToken', refreshToken);
            redirectUrl.searchParams.append('name', encodeURIComponent(user.name || ''));
            redirectUrl.searchParams.append('email', user.email);
            redirectUrl.searchParams.append('isNewUser', isNewUser);
            
            res.redirect(redirectUrl.toString());
        } catch (urlError) {
            console.error('❌ Error creating redirect URL:', urlError);
            // Fallback: return JSON response instead of redirecting
            res.status(200).json({
                success: true,
                message: 'Google OAuth successful',
                data: {
                    accessToken,
                    refreshToken,
                    token, // For backward compatibility
                    isNewUser,
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
                },
                redirectUrl: `${frontendUrl}/auth/callback?token=${token}&email=${encodeURIComponent(user.email)}`,
                note: 'Please set FRONTEND_URL environment variable to enable automatic redirect'
            });
        }
        } catch (error) {
            console.error('❌ Error in Google OAuth callback:', error);
            
            // For mobile apps, return JSON error
            if (isMobile) {
                return res.status(500).json({
                    success: false,
                    message: 'An error occurred during authentication',
                    error: error.message
                });
            }
            
            // For web, redirect to error page
            const frontendUrl = process.env.FRONTEND_URL || 
                (process.env.NODE_ENV === 'production' 
                    ? 'https://sanoraindia.com' 
                    : 'http://localhost:5500');
            
            return res.redirect(`${frontendUrl}/login?error=server_error`);
        }
    })(req, res, next);
};

// Check if email exists
const checkEmailExists = async (req, res) => {
    try {
        const { email } = req.body;
        
        const user = await User.findOne({ email });
        
        res.json({
            success: true,
            exists: !!user,
            data: {
                email,
                hasGoogleAccount: !!user?.googleId
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error checking email',
            error: error.message
        });
    }
};

module.exports = {
    googleAuth,
    googleCallback,
    checkEmailExists
};
/**
 * Email (external integration). Full implementation.
 * Replaces legacy services/emailService.js.
 */

const logger = require('../logger');
const nodemailer = require('nodemailer');
const googleOAuthService = require('./googleOAuth');

class EmailService {
    constructor() {
        this.transporter = null;
        this.usingOAuth = false;
        this.initializationPromise = null;
        // Initialize asynchronously without blocking
        this.initializeTransporter().catch(error => {
            // Log error but don't throw - allows server to start even if email isn't configured
            console.warn('⚠️  Email service initialization failed:', error.message);
            console.warn('⚠️  Email functionality will not be available. Routes will still work.');
        });
    }

    async initializeTransporter() {
        // Priority 1: Try Google OAuth (only if tokens are configured)
        if (process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ANDROID_CLIENT_ID) {
            try {
                await this.createGoogleTransporter();
                this.usingOAuth = true;
                return;
            } catch (error) {
                // Silently fall back to SMTP - OAuth not configured is expected
                // Only log if it's an unexpected error
                if (!error.message.includes('not configured') && !error.message.includes('not available')) {
                    console.error('Failed to create Google OAuth transporter:', error.message);
                }
            }
        }

        // Priority 2: Fallback to SMTP with app password
        if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
            try {
                this.transporter = this.createSMTPTransporter();
                console.log('SMTP transporter created successfully');
                return;
            } catch (error) {
                console.error('Failed to create SMTP transporter:', error.message);
            }
        }

        // Priority 3: Create a dummy transporter for development
        if (process.env.NODE_ENV === 'development') {
            this.transporter = this.createDummyTransporter();
            console.log('Dummy transporter created for development');
        } else {
            // Don't throw - just log a warning and allow the service to exist
            console.warn('⚠️  No email transport method configured. Email functionality will not be available.');
            console.warn('⚠️  To enable email, configure EMAIL_USER and EMAIL_PASSWORD, or set up Google OAuth.');
            // Create a no-op transporter that returns false when trying to send
            this.transporter = null;
        }
    }

    async createGoogleTransporter() {
        try {
            // Check if OAuth client is initialized
            if (!googleOAuthService.oAuth2Client) {
                throw new Error('Google OAuth client not initialized');
            }

            // Check if we have refresh token (required for OAuth email sending)
            if (!googleOAuthService.hasRefreshToken()) {
                throw new Error('Google OAuth tokens not configured. Please authenticate first or use SMTP.');
            }

            const accessToken = await googleOAuthService.getValidToken();
            const userEmail = process.env.EMAIL_USER;
            const credentials = googleOAuthService.oAuth2Client.credentials;

            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    type: 'OAuth2',
                    user: userEmail,
                    clientId: process.env.GOOGLE_CLIENT_ID,
                    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
                    refreshToken: credentials.refresh_token,
                    accessToken: accessToken
                }
            });

            // Verify the transporter
            await this.transporter.verify();
            console.log('Google OAuth transporter created and verified successfully');
        } catch (error) {
            // Silently fail - will fall back to SMTP
            throw error;
        }
    }

    createSMTPTransporter() {
        return nodemailer.createTransport({
            host: process.env.EMAIL_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.EMAIL_PORT) || 587,
            secure: process.env.EMAIL_PORT === '465',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD
            },
            tls: {
                rejectUnauthorized: false
            }
        });
    }

    createDummyTransporter() {
        // Development-only transporter that logs emails instead of sending
        return {
            sendMail: async (mailOptions) => {
                console.log('📧 [DEV] Email would be sent:');
                console.log('From:', mailOptions.from);
                console.log('To:', mailOptions.to);
                console.log('Subject:', mailOptions.subject);
                console.log('OTP would be:', mailOptions.html?.match(/>(\d{6})</)?.[1] || 'N/A');

                return {
                    messageId: `dev-${Date.now()}`,
                    response: 'Development mode - email not actually sent'
                };
            },
            verify: async () => {
                return true;
            }
        };
    }

    async sendOTPEmail(to, otp) {
        const fromEmail = process.env.EMAIL_USER || 'noreply@sanora.com';
        const appName = process.env.APP_NAME || 'Sanora';

        const mailOptions = {
            from: `${appName} <${fromEmail}>`,
            to: to,
            subject: `Your ${appName} Verification Code: ${otp}`,
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Verification Code</title>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
                        .otp-code { font-size: 32px; font-weight: bold; text-align: center; margin: 20px 0; padding: 20px; background: white; border-radius: 8px; letter-spacing: 5px; color: #333; }
                        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
                        .note { background: #fff3cd; border: 1px solid #ffeaa7; padding: 10px; border-radius: 5px; margin: 20px 0; }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>${appName}</h1>
                        <h2>Email Verification</h2>
                    </div>
                    <div class="content">
                        <p>Hello,</p>
                        <p>Thank you for registering with ${appName}! Please use the verification code below to complete your registration:</p>

                        <div class="otp-code">${otp}</div>

                        <div class="note">
                            <p><strong>Note:</strong> This code will expire in ${process.env.OTP_EXPIRY_MINUTES || 5} minutes.</p>
                        </div>

                        <p>If you didn't request this code, please ignore this email.</p>

                        <div class="footer">
                            <p>Best regards,<br>The ${appName} Team</p>
                            <p><small>This is an automated message, please do not reply to this email.</small></p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            text: `Your ${appName} verification code is: ${otp}. This code will expire in ${process.env.OTP_EXPIRY_MINUTES || 5} minutes.`
        };

        try {
            // Ensure transporter is ready - wait for initialization if needed
            if (!this.transporter) {
                console.log('📧 Transporter not initialized, initializing now...');
                try {
                    await this.initializeTransporter();
                } catch (initError) {
                    console.warn('📧 ⚠️  Email initialization failed:', initError.message);
                }
            }

            if (!this.transporter) {
                console.error('📧 ❌ ERROR: Transporter failed to initialize');
                console.error('📧 Check your .env file for EMAIL_USER, EMAIL_PASSWORD, EMAIL_HOST, EMAIL_PORT');
                console.error('📧 Email functionality is not available. Please configure email settings.');
                return false;
            }

            console.log('📧 Attempting to send OTP email to:', to);
            console.log('📧 Using transporter type:', this.usingOAuth ? 'Google OAuth' : 'SMTP');

            const info = await this.transporter.sendMail(mailOptions);

            // Log based on environment
            if (process.env.NODE_ENV === 'development' && !this.usingOAuth && this.transporter.sendMail.toString().includes('DEV')) {
                console.log('📧 [DEV] OTP would be sent to:', to);
                console.log('📧 [DEV] OTP Code:', otp);
            } else {
                console.log('📧 ✅ Email sent successfully to:', to, 'Message ID:', info.messageId);
            }

            return true;
        } catch (err) {
            logger.error('Email send failed', err);

            console.error('📧 ❌ Error sending email:', err.message);

            // Provide helpful guidance for Gmail authentication errors
            if (err.code === 'EAUTH' && err.response && err.response.includes('BadCredentials')) {
                console.error('\n🔐 GMAIL AUTHENTICATION ERROR DETECTED');
                console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.error('❌ Gmail rejected your credentials. Common causes:');
                console.error('');
                console.error('1. ❌ Using regular Gmail password instead of App Password');
                console.error('   → Gmail requires an App Password for SMTP access');
                console.error('');
                console.error('2. ❌ 2-Step Verification not enabled');
                console.error('   → App Passwords require 2-Step Verification');
                console.error('');
                console.error('3. ❌ Incorrect email address or App Password');
                console.error('   → Double-check EMAIL_USER and EMAIL_PASSWORD in .env');
                console.error('');
                console.error('📋 QUICK FIX STEPS:');
                console.error('   1. Enable 2-Step Verification: https://myaccount.google.com/security');
                console.error('   2. Generate App Password: https://myaccount.google.com/apppasswords');
                console.error('   3. Select "Mail" and "Other (Custom name)" → Name it "Sanora OTP"');
                console.error('   4. Copy the 16-character password (remove spaces)');
                console.error('   5. Update .env: EMAIL_PASSWORD=your-app-password-without-spaces');
                console.error('   6. Restart your server');
                console.error('');
                console.error('📖 Full guide: See OTP_SETUP_GUIDE.md');
                console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            } else if (err.code === 'EAUTH') {
                console.error('\n🔐 AUTHENTICATION ERROR');
                console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
                console.error('❌ Email authentication failed. Please check:');
                console.error('   • EMAIL_USER in .env matches your email address');
                console.error('   • EMAIL_PASSWORD is correct (use App Password for Gmail)');
                console.error('   • For Gmail: Use App Password, not regular password');
                console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
            }

            // Only log full error details in development
            if (process.env.NODE_ENV === 'development') {
                console.error('📧 Full error:', err);
                console.error('📧 Error details:', {
                    code: err.code,
                    command: err.command,
                    response: err.response,
                    responseCode: err.responseCode
                });
            }

            // Try to reinitialize transporter on error (but skip retry for EAUTH to avoid spam)
            if (err.code === 'ECONNECTION' || err.code === 'ETIMEDOUT') {
                console.log('📧 Attempting to reinitialize email transporter...');
                this.transporter = null; // Reset transporter
                await this.initializeTransporter();

                if (this.transporter) {
                    try {
                        const retryInfo = await this.transporter.sendMail(mailOptions);
                        console.log('📧 ✅ Email sent on retry:', retryInfo.messageId);
                        return true;
                    } catch (retryError) {
                        console.error('📧 ❌ Retry also failed:', retryError.message);
                        console.error('📧 Retry error code:', retryError.code);
                    }
                }
            } else if (err.code === 'EAUTH') {
                // Don't retry authentication errors - they won't succeed without fixing credentials
                console.error('📧 ⚠️  Skipping retry - authentication errors require credential fixes');
            }

            return false;
        }
    }
}

// Export emailService with error handling to prevent module loading crashes
let emailServiceInstance;
try {
    emailServiceInstance = new EmailService();
} catch (error) {
    console.error('❌ Failed to initialize EmailService:', error.message);
    // Create a dummy service that returns false for all operations
    emailServiceInstance = {
        transporter: null,
        usingOAuth: false,
        sendOTPEmail: async () => {
            console.warn('⚠️  Email service not available');
            return false;
        }
    };
}

module.exports = emailServiceInstance;

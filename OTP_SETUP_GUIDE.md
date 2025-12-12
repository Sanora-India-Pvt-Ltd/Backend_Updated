# OTP Email Setup Guide

To get OTP emails working, you need to configure your email service. Here's what you need to do:

## 📧 Step 1: Choose Your Email Provider

You can use any of these email providers:
- **Gmail** (Recommended for testing)
- **Outlook/Hotmail**
- **Yahoo Mail**
- **Custom SMTP** (SendGrid, Mailgun, AWS SES, etc.)

---

## 🔧 Step 2: Configure Environment Variables

Add these variables to your `.env` file:

### For Gmail (Recommended for Development):

```env
# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# Optional: OTP Expiry (default is 5 minutes)
OTP_EXPIRY_MINUTES=5
```

### For Outlook/Hotmail:

```env
EMAIL_HOST=smtp-mail.outlook.com
EMAIL_PORT=587
EMAIL_USER=your-email@outlook.com
EMAIL_PASSWORD=your-password
OTP_EXPIRY_MINUTES=5
```

### For Yahoo:

```env
EMAIL_HOST=smtp.mail.yahoo.com
EMAIL_PORT=587
EMAIL_USER=your-email@yahoo.com
EMAIL_PASSWORD=your-app-password
OTP_EXPIRY_MINUTES=5
```

---

## 🔐 Step 3: Gmail Setup (Most Common)

### Option A: Using Gmail App Password (Recommended)

1. **Enable 2-Step Verification** on your Google Account:
   - Go to [Google Account Security](https://myaccount.google.com/security)
   - Enable "2-Step Verification"

2. **Generate App Password**:
   - Go to [App Passwords](https://myaccount.google.com/apppasswords)
   - Select "Mail" and "Other (Custom name)"
   - Enter "Sanora OTP" as the name
   - Click "Generate"
   - Copy the 16-character password (no spaces)

3. **Add to .env**:
   ```env
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=abcd efgh ijkl mnop  # Use the app password (remove spaces)
   ```

### Option B: Using OAuth2 (Advanced)

For production, consider using OAuth2 instead of app passwords for better security.

---

## 📝 Step 4: Complete .env File Example

Your `.env` file should look like this:

```env
# Server
PORT=3100
NODE_ENV=development

# Database
MONGODB_URI=your-mongodb-connection-string

# JWT
JWT_SECRET=your-super-secret-jwt-key

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
OTP_EXPIRY_MINUTES=5

# Google OAuth
GOOGLE_CLIENT_ID=your-web-client-id
GOOGLE_ANDROID_CLIENT_ID=your-android-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=http://localhost:3100/api/auth/google/callback

# Session
SESSION_SECRET=your-session-secret-key
```

---

## ✅ Step 5: Test Your Setup

1. **Restart your server** after adding environment variables:
   ```bash
   npm start
   # or
   npm run dev
   ```

2. **Test OTP sending**:
   ```bash
   # For signup
   curl -X POST http://localhost:3100/api/auth/send-otp-signup \
     -H "Content-Type: application/json" \
     -d '{"email":"your-test-email@gmail.com"}'
   ```

3. **Check your email** - You should receive an OTP code

4. **Check server logs** - You should see:
   ```
   📧 OTP email sent to your-email@gmail.com: <message-id>
   ```

---

## 🚨 Troubleshooting

### Issue: "Failed to send OTP email"

**Solutions:**
1. **Check environment variables** are set correctly
2. **Verify email credentials** are correct
3. **Check firewall/network** - Port 587 might be blocked
4. **For Gmail**: Make sure you're using App Password, not regular password
5. **Check email service logs** in console for detailed error

### Issue: "Authentication failed"

**Solutions:**
1. **Gmail**: Use App Password, not regular password
2. **Enable "Less secure app access"** (if not using App Password - not recommended)
3. **Check EMAIL_USER** matches your email exactly
4. **Verify EMAIL_PASSWORD** has no extra spaces

### Issue: "Connection timeout"

**Solutions:**
1. **Check EMAIL_HOST** is correct for your provider
2. **Try port 465** with `secure: true` (for SSL)
3. **Check firewall** allows outbound connections on port 587/465

---

## 🔒 Security Best Practices

1. **Never commit `.env` file** to git
2. **Use App Passwords** instead of regular passwords
3. **Rotate passwords** regularly
4. **Use environment-specific** email accounts for production
5. **Consider using** email services like SendGrid/Mailgun for production

---

## 📦 Alternative: Use Email Service Providers

For production, consider these services:

### SendGrid (Free tier: 100 emails/day)
```env
EMAIL_HOST=smtp.sendgrid.net
EMAIL_PORT=587
EMAIL_USER=apikey
EMAIL_PASSWORD=your-sendgrid-api-key
```

### Mailgun (Free tier: 5,000 emails/month)
```env
EMAIL_HOST=smtp.mailgun.org
EMAIL_PORT=587
EMAIL_USER=your-mailgun-username
EMAIL_PASSWORD=your-mailgun-password
```

### AWS SES
```env
EMAIL_HOST=email-smtp.us-east-1.amazonaws.com
EMAIL_PORT=587
EMAIL_USER=your-aws-access-key
EMAIL_PASSWORD=your-aws-secret-key
```

---

## ✅ Checklist

- [ ] Email provider chosen
- [ ] Environment variables added to `.env`
- [ ] App Password generated (for Gmail)
- [ ] Server restarted
- [ ] Test OTP sent successfully
- [ ] OTP received in email
- [ ] OTP verification working

---

## 🎯 Quick Test Command

```bash
# Test OTP for signup
curl -X POST http://localhost:3100/api/auth/send-otp-signup \
  -H "Content-Type: application/json" \
  -d '{"email":"your-email@gmail.com"}'
```

If successful, you'll get:
```json
{
  "success": true,
  "message": "OTP sent successfully to your email",
  "data": {
    "email": "your-email@gmail.com",
    "expiresAt": "2024-01-01T12:05:00.000Z"
  }
}
```

Check your email for the 6-digit OTP code!


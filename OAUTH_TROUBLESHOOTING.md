# Google OAuth Redirect URI Mismatch - Troubleshooting Guide

## Your Current Configuration (from image)

✅ **Authorized JavaScript origins:**
- `http://localhost:5500`
- `http://localhost:3100`

✅ **Authorized redirect URIs:**
- `http://localhost:3100/api/auth/google/callback`
- `https://api.sanoraindia.com/api/auth/google/callback`

## Step-by-Step Troubleshooting

### Step 1: Verify Backend Configuration

Run this command to check what callback URL your backend is using:

```bash
node debug-oauth.js
```

This will show you the exact callback URL your backend expects.

### Step 2: Check Server Logs

When you start your backend server, look for this line in the console:

```
GOOGLE_CALLBACK_URL: [value]
```

**Expected output:**
- If `GOOGLE_CALLBACK_URL` is set in `.env`: It will show that value
- If not set: It will show `Using default` and use `http://localhost:3100/api/auth/google/callback`

### Step 3: Verify Exact Match

The redirect URI in Google Console must match **EXACTLY** (character-for-character):

✅ **Correct:**
```
http://localhost:3100/api/auth/google/callback
```

❌ **Common mistakes:**
- `http://localhost:3100/api/auth/google/callback/` (trailing slash)
- `https://localhost:3100/api/auth/google/callback` (https instead of http)
- `http://127.0.0.1:3100/api/auth/google/callback` (127.0.0.1 instead of localhost)
- `http://localhost:3100/api/auth/Google/callback` (capital G in Google)

### Step 4: Wait for Propagation

After saving changes in Google Console:
- **Wait 1-5 minutes** for changes to propagate
- Google's OAuth settings can take time to update globally

### Step 5: Clear Browser Cache

1. **Chrome/Edge:**
   - Press `Ctrl + Shift + Delete`
   - Select "Cached images and files"
   - Click "Clear data"

2. **Or use Incognito/Private mode:**
   - This bypasses cache issues

### Step 6: Verify OAuth Client ID

Make sure you're using the **correct OAuth Client ID**:

1. In Google Console, check which Client ID you're using
2. Verify your `.env` file has the matching `GOOGLE_CLIENT_ID`
3. The Client ID in your code must match the one in Google Console

### Step 7: Test the Flow Manually

1. **Check the OAuth initiation URL:**
   - When you click "Continue with Google", it should redirect to:
   - `https://accounts.google.com/o/oauth2/v2/auth?...`
   - Check the `redirect_uri` parameter in the URL

2. **Expected redirect_uri in the OAuth URL:**
   - Should be: `http://localhost:3100/api/auth/google/callback`
   - If it's different, that's the problem!

### Step 8: Double-Check Google Console

1. Go to: https://console.cloud.google.com/
2. **APIs & Services** → **Credentials**
3. Click your **OAuth 2.0 Client ID**
4. Scroll to **Authorized redirect URIs**
5. **Verify the exact URI is there:**
   ```
   http://localhost:3100/api/auth/google/callback
   ```
6. **Check for duplicates or typos**
7. **Save** again (even if unchanged) - this can help refresh the settings

## Quick Fix Checklist

- [ ] Backend is running on port 3100
- [ ] `GOOGLE_CALLBACK_URL` in `.env` matches Google Console (or not set, using default)
- [ ] Redirect URI in Google Console is exactly: `http://localhost:3100/api/auth/google/callback`
- [ ] Waited 5 minutes after saving in Google Console
- [ ] Cleared browser cache or using incognito mode
- [ ] Verified the correct OAuth Client ID is being used
- [ ] Restarted backend server after any `.env` changes

## Still Not Working?

### Check the Actual Error Details

When you see the error page, look for:
- **Error details** link (usually at the bottom)
- It will show the exact redirect URI Google received vs. what's authorized

### Common Scenarios

**Scenario 1: Different Port**
If your backend runs on a different port (not 3100):
- Update `GOOGLE_CALLBACK_URL` in `.env` to match
- Update Google Console to match

**Scenario 2: Production vs Development**
If you have different environments:
- Make sure you're using the correct OAuth Client ID for development
- Development should use: `http://localhost:3100/api/auth/google/callback`
- Production should use: `https://api.sanoraindia.com/api/auth/google/callback`

**Scenario 3: Multiple Projects**
If you have multiple Google Cloud projects:
- Make sure you're editing the correct project's OAuth credentials
- Verify the `GOOGLE_CLIENT_ID` in your `.env` matches the project you're editing

## Debug Command

Run this to see your exact configuration:

```bash
node debug-oauth.js
```

This will show:
- What callback URL your backend is using
- What should be in Google Console
- Common issues to check


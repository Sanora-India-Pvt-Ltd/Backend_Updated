# Fix Google OAuth Redirect URI Mismatch Error

## Error: `redirect_uri_mismatch`

This error occurs when the redirect URI in your Google Cloud Console doesn't match what your application is sending.

## Current Configuration

Your application is using:
- **Default callback URL:** `http://localhost:3100/api/auth/google/callback`
- **Or:** The value from `GOOGLE_CALLBACK_URL` environment variable

## Step-by-Step Fix

### 1. Check Your Current Callback URL

Check what your backend is actually using. Look at your server console output when it starts - it should show:
```
GOOGLE_CALLBACK_URL: [your value or 'Using default']
```

Or check your `.env` file for `GOOGLE_CALLBACK_URL`.

### 2. Go to Google Cloud Console

1. Visit: https://console.cloud.google.com/
2. Select your project
3. Navigate to: **APIs & Services** → **Credentials**
4. Click on your **OAuth 2.0 Client ID** (the one you're using)

### 3. Add Authorized Redirect URIs

In the **Authorized redirect URIs** section, add **EXACTLY** these URIs (case-sensitive, must match exactly):

```
http://localhost:3100/api/auth/google/callback
```

**Important Notes:**
- ✅ Use `http://` (not `https://`) for localhost
- ✅ No trailing slash
- ✅ Exact path: `/api/auth/google/callback`
- ✅ Port must be `3100` (or whatever port your backend uses)

### 4. Add Authorized JavaScript Origins (if needed)

Also add to **Authorized JavaScript origins**:

```
http://localhost:3100
http://localhost:5500
```

### 5. Save Changes

Click **Save** and wait a few minutes for changes to propagate (can take 1-5 minutes).

### 6. Restart Your Backend

After saving, restart your backend server:

```bash
npm start
```

### 7. Test Again

Try the Google OAuth login again on your test page at `http://localhost:5500`.

## Common Mistakes

❌ **Wrong:** `http://localhost:3100/api/auth/google/callback/` (trailing slash)
❌ **Wrong:** `https://localhost:3100/api/auth/google/callback` (https instead of http)
❌ **Wrong:** `http://localhost:3000/api/auth/google/callback` (wrong port)
❌ **Wrong:** `http://127.0.0.1:3100/api/auth/google/callback` (127.0.0.1 instead of localhost)

✅ **Correct:** `http://localhost:3100/api/auth/google/callback`

## If You're Using a Custom Port

If your backend runs on a different port (not 3100), update:

1. **Your `.env` file:**
   ```env
   GOOGLE_CALLBACK_URL=http://localhost:YOUR_PORT/api/auth/google/callback
   ```

2. **Google Cloud Console:** Add the URI with your actual port number

## Verify Your Configuration

After making changes, you can verify by:

1. Check server logs when it starts - it should show the callback URL being used
2. Try the OAuth flow - if it still fails, check the exact error message
3. The error message will show what URI Google received vs what's authorized

## Still Having Issues?

1. **Wait 5 minutes** - Google changes can take time to propagate
2. **Clear browser cache** - Sometimes cached OAuth settings cause issues
3. **Check server logs** - Look for the actual callback URL being used
4. **Double-check spelling** - The URI must match character-for-character


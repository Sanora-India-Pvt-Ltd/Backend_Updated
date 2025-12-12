# 🔧 IMMEDIATE FIX for OAuth Redirect URI Mismatch

## The Problem

Your backend is configured to use:
```
https://sanora-b41l.onrender.com/api/auth/google/callback
```

But your Google Console has:
- `http://localhost:3100/api/auth/google/callback` ✅
- `https://api.sanoraindia.com/api/auth/google/callback` ✅
- `https://sanora-b41l.onrender.com/api/auth/google/callback` ❌ **MISSING!**

## Solution: Choose One

### Option 1: Use Localhost for Local Development (Recommended)

**Step 1:** Open your `.env` file

**Step 2:** Change or add this line:
```env
GOOGLE_CALLBACK_URL=http://localhost:3100/api/auth/google/callback
```

**Step 3:** Save the file

**Step 4:** Restart your backend server

**Step 5:** Try OAuth again - it should work now!

---

### Option 2: Add the Render URL to Google Console

If you want to keep using the Render URL:

**Step 1:** Go to Google Cloud Console
- https://console.cloud.google.com/
- Your Project → APIs & Services → Credentials
- Click your OAuth 2.0 Client ID

**Step 2:** Under "Authorized redirect URIs", add:
```
https://sanora-b41l.onrender.com/api/auth/google/callback
```

**Step 3:** Save and wait 1-5 minutes

**Step 4:** Try OAuth again

---

## Quick Fix (Recommended for Testing)

For local testing, use **Option 1** - it's simpler and you already have `http://localhost:3100/api/auth/google/callback` in your Google Console.

Just update your `.env` file:
```env
GOOGLE_CALLBACK_URL=http://localhost:3100/api/auth/google/callback
```

Then restart your backend and try again!


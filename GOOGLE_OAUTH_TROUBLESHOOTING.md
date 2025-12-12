# Google OAuth Troubleshooting Guide

## ⚠️ Flutter Mobile Error: "Google Sign-In is only available on web"

**If you're seeing this error in Flutter**, see **[FLUTTER_MOBILE_GOOGLE_SIGNIN_FIX.md](./FLUTTER_MOBILE_GOOGLE_SIGNIN_FIX.md)** for the complete fix guide.

This error means your Flutter app has a platform check blocking mobile sign-in. The backend fully supports mobile!

---

## Error: "Failed to get Google ID token"

This error typically occurs on the **client side** (frontend/mobile app) when trying to get the Google ID token from Google Sign-In SDK.

---

## 🔍 Common Causes & Solutions

### 1. **Google Client ID Not Configured on Frontend**

**Problem:** The frontend doesn't have the correct Google Client ID configured.

**Solution:**
- **For Web/React:**
  ```javascript
  // Make sure you initialize Google Sign-In with the correct client ID
  window.google.accounts.id.initialize({
    client_id: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
    callback: handleCredentialResponse
  });
  ```

- **For Android:**
  ```xml
  <!-- In your AndroidManifest.xml or build.gradle -->
  <!-- Make sure you're using the correct SHA-1 certificate fingerprint -->
  ```

- **For iOS:**
  ```swift
  // Make sure you configure the correct client ID in your iOS app
  GIDSignIn.sharedInstance.configuration = GIDConfiguration(
    clientID: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com"
  )
  ```

---

### 2. **Backend Environment Variables Missing**

**Problem:** Your backend doesn't have `GOOGLE_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, or `GOOGLE_IOS_CLIENT_ID` set.

**Check:**
1. Go to your Railway dashboard (or wherever you deployed)
2. Check **Variables** tab
3. Verify these are set:
   - `GOOGLE_CLIENT_ID` (for Web)
   - `GOOGLE_ANDROID_CLIENT_ID` (for Android)
   - `GOOGLE_IOS_CLIENT_ID` (for iOS)
   - `GOOGLE_CLIENT_SECRET` (required)

**Solution:**
- Add missing environment variables
- Redeploy your backend
- Make sure the client IDs match what you're using in your frontend

---

### 3. **Client ID Mismatch**

**Problem:** The client ID used in your frontend doesn't match any of the client IDs configured in your backend.

**Solution:**
1. **Check your backend configuration:**
   - In Railway: Settings → Variables
   - Verify `GOOGLE_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`, and `GOOGLE_IOS_CLIENT_ID` values

2. **Check your frontend configuration:**
   - Make sure you're using the same client ID that's configured in backend
   - For Android: Use `GOOGLE_ANDROID_CLIENT_ID`
   - For iOS: Use `GOOGLE_IOS_CLIENT_ID`
   - For Web: Use `GOOGLE_CLIENT_ID`

3. **Verify in Google Cloud Console:**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Navigate to **APIs & Services** → **Credentials**
   - Check that your OAuth 2.0 Client IDs match

---

### 4. **Google Sign-In SDK Not Properly Initialized**

**Problem:** The Google Sign-In SDK isn't initialized before trying to get the token.

**Solution for Web:**
```javascript
// Make sure Google Sign-In script is loaded first
<script src="https://accounts.google.com/gsi/client" async defer></script>

// Then initialize
window.onload = function () {
  google.accounts.id.initialize({
    client_id: 'YOUR_CLIENT_ID.apps.googleusercontent.com',
    callback: handleCredentialResponse
  });
  
  google.accounts.id.renderButton(
    document.getElementById("buttonDiv"),
    { theme: "outline", size: "large" }
  );
};

function handleCredentialResponse(response) {
  // response.credential is the ID token
  if (response.credential) {
    // Send to your backend
    fetch('/api/auth/verify-google-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: response.credential })
    });
  } else {
    console.error('Failed to get Google ID token');
  }
}
```

**Solution for Android:**
```kotlin
// Make sure Google Sign-In is configured in your app
// Check that you've added the dependency and configured it properly

// Example:
val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
    .requestIdToken("YOUR_CLIENT_ID.apps.googleusercontent.com")
    .requestEmail()
    .build()

val googleSignInClient = GoogleSignIn.getClient(this, gso)
```

---

### 5. **Network/CORS Issues**

**Problem:** Network request to Google is failing or being blocked.

**Solution:**
- Check browser console for network errors
- Verify CORS settings on your backend
- Check if you're behind a firewall/proxy
- Try from a different network

---

### 6. **OAuth Consent Screen Not Configured**

**Problem:** Google OAuth consent screen isn't properly configured in Google Cloud Console.

**Solution:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services** → **OAuth consent screen**
3. Make sure:
   - App is in **Testing** or **Production** mode
   - Test users are added (if in Testing mode)
   - Required scopes are added (email, profile)
   - App name and support email are set

---

### 7. **Authorized Redirect URIs Not Set**

**Problem:** Your app's redirect URI isn't authorized in Google Cloud Console.

**Solution:**
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Navigate to **APIs & Services** → **Credentials**
3. Click on your OAuth 2.0 Client ID
4. Add authorized redirect URIs:
   - For Web: `http://localhost:3000` (development) and your production URL
   - For Android: Your app's package name and SHA-1 fingerprint

---

### 8. **SHA-1 Certificate Fingerprint Missing (Android)**

**Problem:** Android app needs SHA-1 certificate fingerprint registered.

**Solution:**
1. **Get your SHA-1 fingerprint:**
   ```bash
   # For debug keystore
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
   
   # For release keystore
   keytool -list -v -keystore your-release-key.keystore -alias your-key-alias
   ```

2. **Add to Google Cloud Console:**
   - Go to your OAuth 2.0 Client ID settings
   - Add the SHA-1 fingerprint under "Android" section

---

## 🔧 Backend Verification

### Check if Backend Route is Registered

Your backend should log on startup:
```
✅ Auth routes loaded successfully
```

If you see errors about Google OAuth, check:
1. Environment variables are set
2. `google-auth-library` package is installed
3. Server logs for any initialization errors

### Test Backend Endpoint Directly

```bash
# Test with a valid Google ID token
curl -X POST https://your-backend-url.com/api/auth/verify-google-token \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_GOOGLE_ID_TOKEN"}'
```

**Expected Response (Success):**
```json
{
  "success": true,
  "message": "Login successful via Google OAuth",
  "data": {
    "token": "jwt_token_here",
    "user": { ... }
  }
}
```

**Expected Response (Error):**
```json
{
  "success": false,
  "message": "Invalid Google token - token does not match any configured client ID"
}
```

---

## 📋 Checklist

- [ ] Google Client ID is configured in frontend
- [ ] `GOOGLE_CLIENT_ID` is set in backend environment variables (for Web)
- [ ] `GOOGLE_ANDROID_CLIENT_ID` is set (for Android apps)
- [ ] `GOOGLE_IOS_CLIENT_ID` is set (for iOS apps)
- [ ] `GOOGLE_CLIENT_SECRET` is set in backend
- [ ] Client IDs match between frontend and backend
- [ ] Google Sign-In SDK is properly initialized
- [ ] OAuth consent screen is configured
- [ ] Authorized redirect URIs are set
- [ ] SHA-1 fingerprint is added (for Android)
- [ ] Network requests are not blocked
- [ ] Backend route `/api/auth/verify-google-token` is accessible

---

## 🐛 Debug Steps

1. **Check Browser/App Console:**
   - Look for JavaScript errors
   - Check network requests to Google
   - Verify token is being generated

2. **Check Backend Logs:**
   - Look for errors in Railway/your hosting platform
   - Check if the route is being hit
   - Verify environment variables are loaded

3. **Test with curl:**
   - Get a Google ID token manually
   - Test the backend endpoint directly
   - This isolates if the issue is frontend or backend

4. **Verify Google Cloud Console:**
   - Check OAuth 2.0 Client IDs are active
   - Verify redirect URIs
   - Check OAuth consent screen status

---

## 🆘 Still Not Working?

1. **Check Railway/Backend Logs:**
   - Look for specific error messages
   - Verify environment variables are set correctly

2. **Test Locally:**
   - Run backend locally with `.env` file
   - Test frontend against local backend
   - This helps isolate deployment vs code issues

3. **Common Mistakes:**
   - Using wrong client ID (Web vs Android vs iOS)
   - Missing `GOOGLE_CLIENT_SECRET` in backend
   - OAuth consent screen in "Testing" mode without test users
   - SHA-1 fingerprint not added for Android
   - Bundle ID not matching for iOS
   - Flutter app blocking mobile platforms (see FLUTTER_MOBILE_GOOGLE_SIGNIN_FIX.md)

---

## 📚 Additional Resources

- [Google Sign-In Documentation](https://developers.google.com/identity/sign-in/web)
- [Google OAuth 2.0 Setup](https://developers.google.com/identity/protocols/oauth2)
- [Android Google Sign-In](https://developers.google.com/identity/sign-in/android)

---

**Need More Help?** Check your backend logs in Railway dashboard for specific error messages!


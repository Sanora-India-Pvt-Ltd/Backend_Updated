# Frontend Developer Setup Guide

This document contains the information your frontend developers need to integrate with the Sanora backend API.

---

## 🔑 Google OAuth Credentials

### ✅ Share These (Public Credentials - Safe to Share):

1. **Google Web Client ID** (for web applications)
   ```
   GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
   ```

2. **Google Android Client ID** (for Android applications)
   ```
   GOOGLE_ANDROID_CLIENT_ID=your-android-client-id.apps.googleusercontent.com
   ```

3. **Backend API URL**
   ```
   Production: https://subjectmastery-production.up.railway.app
   Development: http://localhost:3100 (if testing locally)
   ```

### ❌ DO NOT Share These (Keep Secret):

- `GOOGLE_CLIENT_SECRET` - **NEVER share this!** (Backend only)
- `JWT_SECRET` - **NEVER share this!** (Backend only)
- `MONGODB_URI` - **NEVER share this!** (Backend only)
- Any other secrets or passwords

---

## 📱 Android App Configuration

### Step 1: Add Google Sign-In Dependency

In your `build.gradle` (app level):
```gradle
dependencies {
    implementation 'com.google.android.gms:play-services-auth:20.7.0'
}
```

### Step 2: Configure Google Sign-In

In your Android app code:
```kotlin
// Configure Google Sign-In
val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
    .requestIdToken("YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com") // Use Android Client ID
    .requestEmail()
    .build()

val googleSignInClient = GoogleSignIn.getClient(this, gso)
```

### Step 3: Get ID Token and Send to Backend

```kotlin
// After successful Google Sign-In
val account = GoogleSignIn.getLastSignedInAccount(this)
val idToken = account?.idToken

if (idToken != null) {
    // Send to your backend
    val response = apiService.verifyGoogleToken(idToken)
    // Handle response - you'll get JWT token for your app
}
```

### Step 4: API Call to Backend

```kotlin
// Retrofit interface example
interface ApiService {
    @POST("/api/auth/verify-google-token")
    suspend fun verifyGoogleToken(
        @Body request: GoogleTokenRequest
    ): Response<AuthResponse>
}

data class GoogleTokenRequest(
    val token: String
)
```

---

## 🌐 Web App Configuration

### Step 1: Load Google Sign-In Script

In your HTML:
```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

### Step 2: Initialize Google Sign-In

```javascript
// Initialize with Web Client ID
window.onload = function () {
  google.accounts.id.initialize({
    client_id: 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com', // Use Web Client ID
    callback: handleCredentialResponse
  });
  
  google.accounts.id.renderButton(
    document.getElementById("buttonDiv"),
    { theme: "outline", size: "large" }
  );
};
```

### Step 3: Handle Response and Send to Backend

```javascript
function handleCredentialResponse(response) {
  if (response.credential) {
    // Send ID token to your backend
    fetch('https://subjectmastery-production.up.railway.app/api/auth/verify-google-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: response.credential // This is the Google ID token
      })
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        // Store the JWT token from backend
        localStorage.setItem('token', data.data.token);
        // Redirect or update UI
      } else {
        console.error('Login failed:', data.message);
      }
    })
    .catch(error => {
      console.error('Error:', error);
    });
  }
}
```

---

## 📡 API Endpoints

### Base URL
```
Production: https://subjectmastery-production.up.railway.app
Development: http://localhost:3100
```

### Verify Google Token
**Endpoint:** `POST /api/auth/verify-google-token`

**Request:**
```json
{
  "token": "google_id_token_from_google_sign_in"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Login successful via Google OAuth",
  "data": {
    "token": "jwt_token_for_your_app",
    "isNewUser": false,
    "user": {
      "id": "user_id",
      "email": "user@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+1234567890",
      "gender": "Male",
      "name": "John Doe",
      "profileImage": "https://..."
    }
  }
}
```

**Error Response (401):**
```json
{
  "success": false,
  "message": "Invalid Google token - token does not match any configured client ID",
  "error": "Please ensure you are using the correct Google Sign-In configuration"
}
```

---

## 🔐 Using the JWT Token

After successful Google OAuth, you'll receive a JWT token. Use this for authenticated requests:

**Header:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Example:**
```javascript
fetch('https://subjectmastery-production.up.railway.app/api/protected-route', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  }
})
```

---

## ⚠️ Important Notes

1. **Client ID vs Client Secret:**
   - ✅ Client IDs are **public** - safe to use in frontend code
   - ❌ Client Secret is **private** - backend only, never expose it

2. **Which Client ID to Use:**
   - **Android apps** → Use `GOOGLE_ANDROID_CLIENT_ID`
   - **Web apps** → Use `GOOGLE_CLIENT_ID`
   - **iOS apps** → Use `GOOGLE_CLIENT_ID` (or create iOS-specific client ID)

3. **Token Flow:**
   ```
   User clicks "Sign in with Google"
   → Google Sign-In SDK gets ID token
   → Frontend sends ID token to backend
   → Backend verifies ID token with Google
   → Backend returns JWT token for your app
   → Frontend uses JWT token for authenticated requests
   ```

4. **Error Handling:**
   - If you get "Failed to get Google ID token" → Check Google Sign-In initialization
   - If you get "Invalid Google token" → Check Client ID matches backend configuration
   - If you get 503 error → Backend Google OAuth not configured

---

## 🧪 Testing

### Test with curl:
```bash
# Replace YOUR_GOOGLE_ID_TOKEN with actual token from Google Sign-In
curl -X POST https://subjectmastery-production.up.railway.app/api/auth/verify-google-token \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_GOOGLE_ID_TOKEN"}'
```

---

## 📞 Support

If you encounter issues:
1. Check that you're using the correct Client ID (Android vs Web)
2. Verify the Client ID matches what's configured in backend
3. Check browser/device console for errors
4. Verify Google Sign-In SDK is properly initialized
5. Check backend logs in Railway dashboard

---

## 📋 Quick Checklist for Frontend Developers

- [ ] Google Client ID received from backend team
- [ ] Google Sign-In SDK installed/loaded
- [ ] Google Sign-In initialized with correct Client ID
- [ ] ID token successfully obtained from Google
- [ ] ID token sent to backend `/api/auth/verify-google-token`
- [ ] JWT token received and stored
- [ ] JWT token used in Authorization header for protected routes

---

**Remember:** Only share Client IDs, never share secrets! 🔒


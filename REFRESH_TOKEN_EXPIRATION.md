# Refresh Tokens - Updated: Never Expire!

## ⚠️ IMPORTANT UPDATE

**Refresh tokens now NEVER expire!** Users stay logged in indefinitely unless they explicitly logout.

See `INDEFINITE_LOGIN.md` for details.

---

# What Happens When Refresh Token Expires (OLD - For Reference)

## 🔑 Refresh Token Lifecycle (OLD BEHAVIOR)

### Token Duration (OLD)
- **Refresh Token Lifetime**: ~~90 days~~ → **Now: Never expires**
- **Access Token Lifetime**: **1 hour** (refreshed using refresh token)

---

## ⏰ When Refresh Token Expires

### Timeline Example:
```
Day 0: User logs in
  → Gets: accessToken (1 hour) + refreshToken (90 days)

Day 1-89: User uses app
  → Access tokens expire every hour
  → Refresh token used to get new access tokens
  → User stays logged in seamlessly

Day 90: Refresh token expires
  → User can no longer refresh access tokens
  → User must login again with credentials
```

---

## 🔄 What Happens on the Backend

### When User Tries to Refresh with Expired Token:

1. **User makes API request** → Access token expired (401)
2. **Frontend calls** `/api/auth/refresh-token` with refresh token
3. **Backend checks** if refresh token is expired:
   ```javascript
   if (new Date() > tokenRecord.expiryDate) {
     // Token expired!
   }
   ```
4. **Backend removes** expired token from database
5. **Backend returns** 401 error:
   ```json
   {
     "success": false,
     "message": "Refresh token has expired. Please login again."
   }
   ```
6. **Frontend should** redirect user to login page

---

## 💻 Frontend Handling

### Proper Error Handling:

```javascript
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  
  if (!refreshToken) {
    // No refresh token - redirect to login
    redirectToLogin('Please login to continue');
    return null;
  }

  try {
    const response = await fetch('/api/auth/refresh-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    });

    const result = await response.json();

    if (result.success) {
      // ✅ Token refreshed successfully
      localStorage.setItem('accessToken', result.data.accessToken);
      return result.data.accessToken;
    } else {
      // ❌ Refresh token expired or invalid
      if (result.message.includes('expired')) {
        // Refresh token expired - user needs to login again
        clearAllTokens();
        showMessage('Your session has expired. Please login again.');
        redirectToLogin();
      } else {
        // Other error
        console.error('Token refresh error:', result.message);
        clearAllTokens();
        redirectToLogin();
      }
      return null;
    }
  } catch (error) {
    // Network error
    console.error('Network error during token refresh:', error);
    // Don't logout on network errors - might be temporary
    return null;
  }
}

function clearAllTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
}

function redirectToLogin(message) {
  // Store message to show on login page
  if (message) {
    sessionStorage.setItem('loginMessage', message);
  }
  window.location.href = '/login';
}
```

---

## 🎯 User Experience Flow

### Scenario: Refresh Token Expires

1. **User is using the app** (day 90 after login)
2. **Access token expires** (after 1 hour)
3. **App tries to refresh** automatically
4. **Backend responds**: "Refresh token has expired"
5. **Frontend shows**: Friendly message
   ```
   "Your session has expired. Please login again."
   ```
6. **User redirected** to login page
7. **User logs in** with email/password
8. **User gets** new access token + new refresh token (90 days)

---

## 🔍 Detection: Is Refresh Token Expired?

### Frontend Can Check (Optional):

```javascript
// Check if refresh token is about to expire
function isRefreshTokenExpiringSoon() {
  // Note: Frontend doesn't know exact expiry date
  // But you can track when user last logged in
  const lastLogin = localStorage.getItem('lastLogin');
  if (!lastLogin) return false;
  
  const daysSinceLogin = (Date.now() - parseInt(lastLogin)) / (1000 * 60 * 60 * 24);
  return daysSinceLogin > 85; // Warn if > 85 days
}

// Store login timestamp
function onLogin() {
  localStorage.setItem('lastLogin', Date.now().toString());
}

// Check on app start
function checkTokenStatus() {
  if (isRefreshTokenExpiringSoon()) {
    showMessage('Your session will expire soon. Please login again to continue.');
  }
}
```

**Note:** This is approximate. The backend is the source of truth.

---

## 🛡️ Security Considerations

### Why Refresh Tokens Expire:

1. **Security**: Limits exposure if token is compromised
2. **Account Management**: Forces periodic re-authentication
3. **Access Control**: Revokes access after inactivity period

### What Gets Cleared:

When refresh token expires:
- ✅ Expired token removed from database
- ✅ User must re-authenticate
- ✅ Other devices' tokens remain valid (if not expired)
- ✅ User data is NOT deleted

---

## 📊 Multi-Device Scenario

### Example: User Logged in on 3 Devices

```
Device 1: Logged in 10 days ago
  → Refresh token expires in 80 days ✅ Still valid

Device 2: Logged in 85 days ago  
  → Refresh token expires in 5 days ⚠️ Expiring soon

Device 3: Logged in 90 days ago
  → Refresh token just expired ❌ Must login again
```

**Key Point:** Each device has its own refresh token with its own expiry date.

---

## 🔧 Backend Implementation Details

### Code Flow:

```javascript
// In refreshToken controller
if (new Date() > tokenRecord.expiryDate) {
  // Remove expired token from array
  user.refreshTokens = user.refreshTokens.filter(
    rt => rt.token !== refreshToken
  );
  await user.save();
  
  return res.status(401).json({
    success: false,
    message: 'Refresh token has expired. Please login again.'
  });
}
```

### Automatic Cleanup:

The backend also automatically cleans up expired tokens during login:

```javascript
// Clean up expired tokens (older than 90 days)
const now = new Date();
user.refreshTokens = user.refreshTokens.filter(
  rt => rt.expiryDate > now
);
```

---

## ✅ Best Practices

### For Frontend Developers:

1. **Handle 401 gracefully**
   - Show friendly message
   - Redirect to login
   - Don't show technical errors

2. **Clear tokens on expiration**
   - Remove both accessToken and refreshToken
   - Clear user data
   - Reset app state

3. **Provide clear feedback**
   - "Your session has expired"
   - "Please login again"
   - Not: "401 Unauthorized"

4. **Preserve user data** (optional)
   - Save draft work before logout
   - Remember where user was
   - Restore after re-login

### Example: Graceful Expiration Handling

```javascript
// In your API client interceptor
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refreshToken');
      
      if (refreshToken) {
        // Try to refresh
        const newToken = await refreshAccessToken();
        
        if (newToken) {
          // Retry original request
          error.config.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(error.config);
        } else {
          // Refresh failed - token expired
          // Show message and redirect
          showExpirationMessage();
          return Promise.reject(error);
        }
      } else {
        // No refresh token - redirect to login
        redirectToLogin();
        return Promise.reject(error);
      }
    }
    
    return Promise.reject(error);
  }
);

function showExpirationMessage() {
  // Show toast/notification
  toast.error('Your session has expired. Please login again.');
  
  // Redirect after short delay
  setTimeout(() => {
    window.location.href = '/login?expired=true';
  }, 2000);
}
```

---

## 📋 Summary

### When Refresh Token Expires:

1. ✅ **Backend detects** expiration (checks expiryDate)
2. ✅ **Backend removes** expired token from database
3. ✅ **Backend returns** 401 with friendly message
4. ✅ **Frontend clears** all tokens
5. ✅ **Frontend shows** user-friendly message
6. ✅ **Frontend redirects** to login page
7. ✅ **User logs in** again to get new tokens

### Key Points:

- Refresh tokens expire after **90 days**
- User must **login again** after expiration
- Other devices' tokens are **not affected** (if not expired)
- Expired tokens are **automatically cleaned up**
- Frontend should handle expiration **gracefully**

---

## 🎯 Quick Reference

| Event | Action | Result |
|-------|--------|--------|
| Refresh token expires | Backend returns 401 | User must login |
| Access token expires | Frontend refreshes | New access token |
| User logs in | New tokens issued | 90 days from now |
| User logs out | Token invalidated | Must login again |

---

**Remember:** 90 days is a good balance between security and user convenience. Users stay logged in for 3 months, then must re-authenticate for security.


# Frontend Authentication Guide - Multi-Device Support

This guide explains how to implement authentication in your frontend application with support for **multiple devices** and the **two-token system** (Access Token + Refresh Token).

---

## 🔑 Understanding the Token System

### Two Types of Tokens

1. **Access Token** (JWT)
   - Short-lived: **1 hour** (improved from 15 min for better UX)
   - Used for: All API requests
   - Sent in: `Authorization: Bearer <accessToken>` header
   - Balances security and user experience

2. **Refresh Token** (Random String)
   - **Never expires** - Users stay logged in indefinitely
   - Used for: Getting new access tokens when they expire
   - Stored securely: localStorage, secure storage, or encrypted storage
   - Never sent in API request headers (only to `/api/auth/refresh-token`)
   - Only invalidated when user explicitly logs out

### Why Two Tokens?

- **Security**: Short-lived access tokens limit damage if compromised
- **User Experience**: Users stay logged in **indefinitely** (until they logout)
- **Multi-Device**: Users can be logged in on multiple devices simultaneously
- **Convenience**: No unexpected logouts - users control when to logout

---

## 📦 Step 1: Store Tokens Securely

### Web (React/Vue/Angular/vanilla JS)

```javascript
// Store both tokens after login
localStorage.setItem('accessToken', data.accessToken);
localStorage.setItem('refreshToken', data.refreshToken);

// Or use sessionStorage for session-only storage
sessionStorage.setItem('accessToken', data.accessToken);
sessionStorage.setItem('refreshToken', data.refreshToken);
```

### React Native / Mobile Apps

```javascript
// Use secure storage libraries
import * as SecureStore from 'expo-secure-store'; // Expo
// or
import AsyncStorage from '@react-native-async-storage/async-storage'; // React Native

// Store tokens
await SecureStore.setItemAsync('accessToken', accessToken);
await SecureStore.setItemAsync('refreshToken', refreshToken);
```

### Flutter

```dart
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

final storage = FlutterSecureStorage();

// Store tokens
await storage.write(key: 'accessToken', value: accessToken);
await storage.write(key: 'refreshToken', value: refreshToken);
```

---

## 🔐 Step 2: Implement Login

### Regular Email/Password Login

```javascript
async function login(email, password) {
  try {
    const response = await fetch('https://your-api.com/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json();

    if (result.success) {
      const { accessToken, refreshToken } = result.data;

      // Store both tokens
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);

      // Store user info if needed
      localStorage.setItem('user', JSON.stringify(result.data.user));

      return { success: true, user: result.data.user };
    } else {
      return { success: false, message: result.message };
    }
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, message: 'Network error' };
  }
}
```

### Google OAuth Login (Web)

```javascript
async function handleGoogleSignIn(googleIdToken) {
  try {
    const response = await fetch('https://your-api.com/api/auth/verify-google-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: googleIdToken }),
    });

    const result = await response.json();

    if (result.success) {
      const { accessToken, refreshToken } = result.data;

      // Store both tokens
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(result.data.user));

      return { success: true, user: result.data.user };
    }
  } catch (error) {
    console.error('Google login error:', error);
  }
}
```

---

## 🌐 Step 3: Make Authenticated API Requests

### Basic Request with Access Token

```javascript
async function fetchUserProfile() {
  const accessToken = localStorage.getItem('accessToken');

  if (!accessToken) {
    // User not logged in
    return null;
  }

  try {
    const response = await fetch('https://your-api.com/api/auth/profile', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 401) {
      // Access token expired - refresh it
      const newToken = await refreshAccessToken();
      if (newToken) {
        // Retry request with new token
        return fetchUserProfile();
      }
      return null;
    }

    const result = await response.json();
    return result.data;
  } catch (error) {
    console.error('API error:', error);
    return null;
  }
}
```

---

## 🔄 Step 4: Implement Automatic Token Refresh

### Option A: Reactive Refresh (Simple - Good UX)
Handle token expiration when API returns 401.

### Option B: Proactive Refresh (Recommended - Best UX)
Refresh tokens before they expire to avoid any delays.

### Critical: Handle Token Expiration Automatically

```javascript
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');

  if (!refreshToken) {
    // No refresh token - user needs to login again
    logout();
    return null;
  }

  try {
    const response = await fetch('https://your-api.com/api/auth/refresh-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }),
    });

    const result = await response.json();

    if (result.success) {
      const { accessToken } = result.data;
      
      // Update stored access token
      localStorage.setItem('accessToken', accessToken);
      
      return accessToken;
    } else {
      // Refresh token expired or invalid
      if (result.message && result.message.includes('expired')) {
        // Refresh token expired - show friendly message
        showMessage('Your session has expired. Please login again.');
      }
      logout();
      return null;
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    // Don't logout on network errors - might be temporary
    // Only logout if it's a clear expiration error
    return null;
  }
}

function logout() {
  // Clear all tokens
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  
  // Redirect to login page
  window.location.href = '/login';
}
```

### Proactive Token Refresh (Recommended for Best UX)

Refresh tokens **before** they expire to avoid any user-visible delays:

```javascript
// Proactive refresh - refresh 5 minutes before 1-hour expiration
function setupProactiveTokenRefresh() {
  const REFRESH_INTERVAL = 55 * 60 * 1000; // 55 minutes (refresh before 1 hour expires)
  
  const refreshInterval = setInterval(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    
    if (!refreshToken) {
      clearInterval(refreshInterval);
      return;
    }

    try {
      const response = await fetch('https://your-api.com/api/auth/refresh-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (response.ok) {
        const result = await response.json();
        localStorage.setItem('accessToken', result.data.accessToken);
        console.log('✅ Token refreshed proactively');
      } else {
        // Refresh failed - clear interval and logout
        clearInterval(refreshInterval);
        logout();
      }
    } catch (error) {
      console.error('Proactive refresh error:', error);
      // Don't clear interval on network errors - will retry next cycle
    }
  }, REFRESH_INTERVAL);

  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    clearInterval(refreshInterval);
  });

  return refreshInterval;
}

// Call after successful login
setupProactiveTokenRefresh();
```

**Benefits of Proactive Refresh:**
- ✅ No user-visible delays
- ✅ Seamless experience
- ✅ Tokens always fresh
- ✅ No 401 errors during normal usage

---

## 🛡️ Step 5: Create an API Client with Auto-Refresh

### Complete API Client Example (React/Axios)

```javascript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'https://your-api.com/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - add access token to all requests
apiClient.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle token expiration
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // If 401 and we haven't already tried to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        // Refresh the access token
        const response = await axios.post(
          'https://your-api.com/api/auth/refresh-token',
          { refreshToken }
        );

        const { accessToken } = response.data.data;
        
        // Update stored token
        localStorage.setItem('accessToken', accessToken);

        // Update the original request with new token
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        // Retry the original request
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed - logout user
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
```

### Usage Example

```javascript
// Now all requests automatically include token and handle refresh
import apiClient from './apiClient';

// Get user profile
const profile = await apiClient.get('/auth/profile');

// Update profile
await apiClient.put('/user/profile', { firstName: 'John' });
```

---

## 🚪 Step 6: Implement Logout

### Logout from Current Device Only

```javascript
async function logout() {
  const accessToken = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');

  try {
    // Call logout endpoint to invalidate refresh token
    await fetch('https://your-api.com/api/auth/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken }), // Optional: logout from this device only
    });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Always clear local storage
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    
    // Redirect to login
    window.location.href = '/login';
  }
}
```

### Logout from All Devices

```javascript
async function logoutAllDevices() {
  const accessToken = localStorage.getItem('accessToken');

  try {
    // Don't send refreshToken - this logs out from all devices
    await fetch('https://your-api.com/api/auth/logout', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    localStorage.clear();
    window.location.href = '/login';
  }
}
```

---

## 📱 Step 7: Multi-Device Support

### How It Works

With the updated backend, users can now:
- ✅ Login on Device 1 → Gets tokens
- ✅ Login on Device 2 → Gets new tokens (Device 1 still works!)
- ✅ Both devices can make API requests independently
- ✅ Both devices can refresh their tokens independently

### No Special Frontend Code Needed!

The multi-device support is handled automatically by the backend. Your frontend code doesn't need any changes - just make sure you:

1. Store tokens per device (localStorage is device-specific)
2. Use the refresh token flow when access tokens expire
3. Handle logout properly

---

## 🔍 Step 8: Check Authentication Status

```javascript
function isAuthenticated() {
  const accessToken = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');
  
  // User is authenticated if they have both tokens
  return !!(accessToken && refreshToken);
}

function getStoredUser() {
  const userStr = localStorage.getItem('user');
  return userStr ? JSON.parse(userStr) : null;
}
```

---

## ⚠️ Important Security Notes

1. **Never expose refresh tokens** in URLs, logs, or error messages
2. **Use HTTPS** in production (tokens are sent over the network)
3. **Store tokens securely**:
   - Web: `localStorage` or `sessionStorage` (both are vulnerable to XSS)
   - Mobile: Use secure storage libraries (encrypted)
4. **Clear tokens on logout** - always remove tokens from storage
5. **Handle token expiration gracefully** - redirect to login if refresh fails

## 🔄 Refresh Tokens Never Expire!

### Refresh Token Lifetime
- **Duration**: **Never expires** - Users stay logged in indefinitely
- **Invalidation**: Only when user explicitly logs out
- **User Control**: Users logout when they want to

### What This Means:

1. **Users stay logged in forever** (until they logout)
2. **No unexpected logouts** - seamless experience
3. **User controls logout** - they decide when to logout
4. **Access tokens still expire** every hour (security maintained)

### When Refresh Token Fails:

The only time refresh token will fail is if:
- User explicitly logged out
- Token was manually invalidated
- User account was deleted

In these cases, frontend should:
- Clear all tokens from storage
- Show message: "Please login to continue"
- Redirect to login page

### Example: Handling Expiration

```javascript
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('refreshToken');
  
  if (!refreshToken) {
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
      // ✅ Success - update access token
      localStorage.setItem('accessToken', result.data.accessToken);
      return result.data.accessToken;
    } else {
      // ❌ Refresh token expired or invalid
      if (result.message?.includes('expired')) {
        // Show friendly expiration message
        showMessage('Your session has expired. Please login again.');
      }
      clearTokensAndRedirect();
      return null;
    }
  } catch (error) {
    // Network error - don't logout, might be temporary
    console.error('Token refresh network error:', error);
    return null;
  }
}

function clearTokensAndRedirect() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('user');
  window.location.href = '/login?expired=true';
}
```

**Key Points:**
- Refresh tokens expire after **90 days**
- User must **re-authenticate** after expiration
- Other devices' tokens are **not affected** (if not expired)
- Always show **user-friendly messages**, not technical errors

---

## 📋 Complete Example: React Hook

```javascript
import { useState, useEffect } from 'react';

function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const storedUser = localStorage.getItem('user');
    const accessToken = localStorage.getItem('accessToken');

    if (storedUser && accessToken) {
      try {
        // Verify token is still valid
        const response = await fetch('https://your-api.com/api/auth/profile', {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (response.ok) {
          const result = await response.json();
          setUser(result.data.user);
        } else if (response.status === 401) {
          // Token expired - try to refresh
          const newToken = await refreshAccessToken();
          if (newToken) {
            checkAuth(); // Retry
          } else {
            logout();
          }
        } else {
          logout();
        }
      } catch (error) {
        console.error('Auth check error:', error);
        logout();
      }
    } else {
      logout();
    }
    setLoading(false);
  }

  async function login(email, password) {
    // ... login implementation from Step 2
  }

  async function logout() {
    // ... logout implementation from Step 6
  }

  return { user, loading, login, logout, isAuthenticated: !!user };
}
```

---

## 🎯 Quick Checklist

- [ ] Store both `accessToken` and `refreshToken` after login
- [ ] Add `Authorization: Bearer <accessToken>` header to all API requests
- [ ] Implement automatic token refresh on 401 errors
- [ ] Clear tokens on logout
- [ ] Handle token expiration gracefully
- [ ] Use secure storage for mobile apps
- [ ] Test login on multiple devices/browsers

---

## 🆘 Troubleshooting

### "Token expired" errors
- ✅ Implement automatic refresh (Step 4)
- ✅ Check that refresh token is stored correctly

### "Invalid token" errors
- ✅ Verify you're using `accessToken` (not `refreshToken`) in headers
- ✅ Check token format: `Bearer <token>` (with space)

### Can't login on multiple devices
- ✅ This should work automatically with the updated backend
- ✅ Each device stores its own tokens in localStorage
- ✅ Backend now supports multiple refresh tokens per user

---

## 📞 Need Help?

If you encounter issues:
1. Check browser console for errors
2. Verify tokens are being stored correctly
3. Test the refresh token endpoint manually
4. Check that you're using the correct API base URL

---

**Remember**: Users can now stay logged in on multiple devices simultaneously! 🎉


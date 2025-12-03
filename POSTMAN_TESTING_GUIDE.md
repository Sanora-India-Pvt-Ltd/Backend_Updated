# Postman Testing Guide for Updated Signup API

## Base URL
```
http://localhost:3100
```

---

## Test Flow 1: Complete Signup with OTP (Recommended)

### Step 1: Send OTP for Signup

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/send-otp-signup`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "test@example.com"
}
```

**Expected Response (200):**
```json
{
  "success": true,
  "message": "OTP sent successfully to your email",
  "data": {
    "email": "test@example.com",
    "expiresAt": "2024-01-01T12:05:00.000Z"
  }
}
```

---

### Step 2: Verify OTP

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/verify-otp-signup`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "test@example.com",
  "otp": "123456"
}
```

**Expected Response (200):**
```json
{
  "success": true,
  "message": "OTP verified successfully. You can now complete signup.",
  "data": {
    "verificationToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "email": "test@example.com"
  }
}
```

**⚠️ Copy the `verificationToken` from the response!**

---

### Step 3: Complete Signup (With All New Fields)

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/signup`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "test@example.com",
  "password": "TestPassword123",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "gender": "Male",
  "verificationToken": "PASTE_VERIFICATION_TOKEN_HERE"
}
```

**Expected Response (201):**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "email": "test@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+1234567890",
      "gender": "Male",
      "name": "John Doe"
    }
  }
}
```

---

## Test Flow 2: Test Validation Errors

### Test Missing Required Fields

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/signup`

**Body (raw JSON) - Missing firstName:**
```json
{
  "email": "test@example.com",
  "password": "TestPassword123",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "gender": "Male",
  "verificationToken": "some_token"
}
```

**Expected Response (400):**
```json
{
  "success": false,
  "message": "Email, password, first name, last name, phone number, and gender are required"
}
```

---

### Test Invalid Gender

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/signup`

**Body (raw JSON) - Invalid gender:**
```json
{
  "email": "test@example.com",
  "password": "TestPassword123",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "gender": "InvalidGender",
  "verificationToken": "some_token"
}
```

**Expected Response (400):**
```json
{
  "success": false,
  "message": "Gender must be one of: Male, Female, Other"
}
```

---

### Test Missing OTP Verification

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/signup`

**Body (raw JSON) - No verificationToken or OTP:**
```json
{
  "email": "test@example.com",
  "password": "TestPassword123",
  "firstName": "John",
  "lastName": "Doe",
  "phoneNumber": "+1234567890",
  "gender": "Male"
}
```

**Expected Response (400):**
```json
{
  "success": false,
  "message": "OTP verification is required for signup. Please verify your email first using /api/auth/send-otp-signup and /api/auth/verify-otp-signup"
}
```

---

## Test Flow 3: Login with New User

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/login`

**Headers:**
```
Content-Type: application/json
```

**Body (raw JSON):**
```json
{
  "email": "test@example.com",
  "password": "TestPassword123"
}
```

**Expected Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "65a1b2c3d4e5f6g7h8i9j0k1",
      "email": "test@example.com",
      "firstName": "John",
      "lastName": "Doe",
      "phoneNumber": "+1234567890",
      "gender": "Male",
      "name": "John Doe",
      "profileImage": ""
    }
  }
}
```

---

## Test Flow 4: Test All Gender Options

### Test with Gender: Female

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/signup`

**Body (raw JSON):**
```json
{
  "email": "jane@example.com",
  "password": "TestPassword123",
  "firstName": "Jane",
  "lastName": "Smith",
  "phoneNumber": "+1987654321",
  "gender": "Female",
  "verificationToken": "PASTE_VERIFICATION_TOKEN_HERE"
}
```

---

### Test with Gender: Other

**Method:** `POST`  
**URL:** `http://localhost:3100/api/auth/signup`

**Body (raw JSON):**
```json
{
  "email": "alex@example.com",
  "password": "TestPassword123",
  "firstName": "Alex",
  "lastName": "Johnson",
  "phoneNumber": "+1555555555",
  "gender": "Other",
  "verificationToken": "PASTE_VERIFICATION_TOKEN_HERE"
}
```

---

## Postman Collection Setup Tips

1. **Create a Collection:** Create a new collection called "Sanora API Tests"

2. **Set Collection Variables:**
   - `base_url`: `http://localhost:3100`
   - `email`: `test@example.com`
   - `verificationToken`: (will be set automatically via tests)

3. **Use Tests Tab to Extract Token:**
   For the "Verify OTP" request, add this in the Tests tab:
   ```javascript
   if (pm.response.code === 200) {
       const jsonData = pm.response.json();
       if (jsonData.data && jsonData.data.verificationToken) {
           pm.collectionVariables.set("verificationToken", jsonData.data.verificationToken);
       }
   }
   ```

4. **Use Variables in Signup Request:**
   In the signup request body, use:
   ```json
   {
     "email": "{{email}}",
     "password": "TestPassword123",
     "firstName": "John",
     "lastName": "Doe",
     "phoneNumber": "+1234567890",
     "gender": "Male",
     "verificationToken": "{{verificationToken}}"
   }
   ```

---

## Quick Test Checklist

- [ ] Send OTP for signup
- [ ] Verify OTP and get verification token
- [ ] Complete signup with all required fields (Male)
- [ ] Complete signup with gender "Female"
- [ ] Complete signup with gender "Other"
- [ ] Test missing firstName validation
- [ ] Test missing lastName validation
- [ ] Test missing phoneNumber validation
- [ ] Test missing gender validation
- [ ] Test invalid gender value
- [ ] Test missing OTP verification
- [ ] Test login with new user credentials
- [ ] Verify all user fields are returned in responses

---

## Example Postman Environment Variables

Create a Postman Environment with:
```
base_url: http://localhost:3100
email: test@example.com
verificationToken: (auto-set by tests)
jwt_token: (auto-set after login/signup)
```


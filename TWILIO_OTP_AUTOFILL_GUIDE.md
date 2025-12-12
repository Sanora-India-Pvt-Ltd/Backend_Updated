# Twilio OTP Autofill with Hash Codes

## Overview

Twilio supports OTP autofill on mobile devices using hash codes. This enables automatic detection and filling of OTP codes on both iOS and Android devices.

## Current Implementation

Your codebase currently uses **Twilio Verify v2 API**, which automatically formats messages for autofill. However, you can customize the message template to include explicit hash codes for better Android support.

## How It Works

### Android SMS Retriever API Format

The format you showed (`<#> Your Subject Mastery OTP is {#var#} KRkY+kXZhTh`) is the Android SMS Retriever API format:

- `<#>` - Prefix indicating the message is for app verification
- `{#var#}` or `{code}` - Placeholder for the OTP code
- `KRkY+kXZhTh` - Your app's unique 11-character hash string

### iOS Autofill

iOS automatically detects OTP codes from SMS messages when they follow certain patterns. Twilio Verify API handles this automatically.

## Configuration Options

### Option 1: Configure in Twilio Console (Recommended)

**Step-by-Step Instructions:**

1. **Go to Twilio Console** → Verify → Services → Your Verify Service (Service SID: `VAf9968a858f3f16b267a00251be5fe976`)

2. **Scroll down to "Message template configuration" section**

3. **Under "Pre-Approved or Custom Templates (For SMS/Voice only)"**, find the **"Message body"** field

4. **Enter this template** (replace `KRkY+kXZhTh` with your actual app hash):

   ```
   <#> Your Subject Mastery OTP is {code}
   KRkY+kXZhTh
   ```

   **Important:**
   - `{code}` is automatically replaced by Twilio with the OTP (DO NOT change this)
   - `KRkY+kXZhTh` should be replaced with YOUR app's hash code (see below for how to generate)
   - The `<#>` prefix is required for Android SMS Retriever API
   - Keep it under 500 characters

5. **Click "Save"** at the bottom of the page

**Visual Guide:**
```
┌─────────────────────────────────────────┐
│ Message template configuration          │
├─────────────────────────────────────────┤
│ Pre-Approved or Custom Templates        │
│                                         │
│ Message body:                           │
│ ┌─────────────────────────────────────┐ │
│ │ <#> Your Subject Mastery OTP is    │ │
│ │ {code}                              │ │
│ │ KRkY+kXZhTh                         │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Save]                                  │
└─────────────────────────────────────────┘
```

### Option 2: Generate Hash Code Programmatically

The hash code is generated from your Android app's:
- Package name (e.g., `com.yourcompany.yourapp`)
- Signing certificate (SHA-256 fingerprint)

**To generate the hash:**

1. **On Android side**, use the SMS Retriever API utility:

   ```kotlin
   import com.google.android.gms.auth.api.phone.SmsRetriever
   import com.google.android.gms.tasks.Task
   
   val client = SmsRetriever.getClient(context)
   val task: Task<Void> = client.startSmsRetriever()
   task.addOnSuccessListener {
       // Hash will be logged or available via callback
   }
   ```

2. **Or use the command line tool** (requires Java):

   ```bash
   # Get your app's hash
   java -jar sms-retriever-hash-generator.jar \
     --package com.yourcompany.yourapp \
     --keystore path/to/keystore.jks
   ```

3. **Or use online tools** (less secure):
   - Google provides hash generation tools
   - Enter your package name and certificate fingerprint

### Option 3: Use Environment Variable for Hash

You can store your app hash in environment variables and use it in custom message templates:

```env
TWILIO_APP_HASH=KRkY+kXZhTh
```

## Implementation in Your Codebase

### Current Setup (Twilio Verify API)

Your current implementation uses Twilio Verify v2, which handles autofill automatically:

```javascript
const verification = await twilioClient.verify.v2.services(twilioServiceSid)
    .verifications
    .create({ to: phoneNumber, channel: 'sms' });
```

**This already supports autofill** - no code changes needed if you configure the template in Twilio Console.

### Custom Message Template (If Needed)

If you want to use a completely custom message format, you can configure it in the Twilio Console under your Verify Service settings. The template should be:

```
<#> Your Subject Mastery OTP is {code}
{APP_HASH}
```

Where `{code}` is automatically replaced by Twilio, and `{APP_HASH}` should be your actual hash string.

## Benefits of Using Hash Codes

1. **Android Autofill**: Enables automatic OTP detection via SMS Retriever API
2. **No SMS Permissions**: Users don't need to grant SMS read permissions
3. **Better UX**: Seamless autofill experience
4. **Security**: Hash ensures only your app can read the OTP

## Testing

1. **Test on Android device** with your app installed
2. **Send OTP** using your current endpoint
3. **Verify autofill** appears automatically in the OTP input field
4. **Check SMS format** - should include `<#>` prefix and hash code

## Important Notes

- **Hash is app-specific**: Each Android app has a unique hash based on package name and signing certificate
- **Hash changes**: If you change your app's signing certificate, you need to regenerate the hash
- **Multiple apps**: If you have multiple Android apps, you may need different hashes
- **iOS doesn't need hash**: iOS autofill works automatically with Twilio Verify API

## Resources

- [Twilio SMS App Verification Guide](https://www.twilio.com/docs/sms/app-verification)
- [Android SMS Retriever API](https://developers.google.com/identity/sms-retriever/overview)
- [Twilio Verify API Documentation](https://www.twilio.com/docs/verify/api)

## Next Steps

1. ✅ Your current Twilio Verify implementation already supports autofill
2. 🔧 Configure custom message template in Twilio Console (optional)
3. 📱 Generate your Android app hash code
4. 🧪 Test autofill on Android and iOS devices


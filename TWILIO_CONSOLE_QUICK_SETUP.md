# Twilio Console - OTP Autofill Quick Setup

## Exact Steps for Your Twilio Verify Service

**Service SID:** `VAf9968a858f3f16b267a00251be5fe976`  
**Service Name:** Sanora India

### Where to Configure

1. **Location:** Twilio Console → Verify → Services → "Sanora India"

2. **Section:** Scroll down to **"Message template configuration"**

3. **Field:** Under **"Pre-Approved or Custom Templates (For SMS/Voice only)"** → **"Message body"**

### What to Enter

**Option 1: Short Template (Recommended - Fits in 1 segment for all languages)**

In the **"Message body"** field, paste this shorter template:

```
<#> Sanora OTP: {code}
KRkY+kXZhTh
```

**Option 2: Longer Template (May cost more for Chinese - 2 segments)**

If you prefer a longer message:

```
<#> Your Subject Mastery OTP is {code}
KRkY+kXZhTh
```

**⚠️ Warning:** The longer template will result in 2 SMS segments for Chinese locales, increasing costs.

**Replace `KRkY+kXZhTh` with your actual Android app hash code.**

### Template Breakdown

- `<#>` - Required prefix for Android SMS Retriever API
- `Your Subject Mastery OTP is` - Your custom message (you can change this)
- `{code}` - **DO NOT CHANGE** - Twilio automatically replaces this with the OTP
- `KRkY+kXZhTh` - **REPLACE THIS** with your app's hash code (11 characters)

### How to Get Your App Hash

The hash code `KRkY+kXZhTh` is unique to your Android app. You need to:

1. **Generate it from your Android app:**
   - Package name (e.g., `com.sanora.app`)
   - Signing certificate (SHA-256 fingerprint)

2. **Methods to generate:**
   - Use Android SMS Retriever API in your app
   - Use command-line tools with your keystore
   - Use online hash generators (less secure)

3. **Once you have the hash**, replace `KRkY+kXZhTh` in the template above

### Example with Different Message

You can customize the message part:

```
<#> Welcome to Sanora! Your verification code is {code}
KRkY+kXZhTh
```

Or:

```
<#> Sanora OTP: {code}
KRkY+kXZhTh
```

**Just remember:**
- Keep `<#>` at the start
- Keep `{code}` as is (Twilio replaces it)
- Add your hash code on a new line at the end
- Total length must be under 500 characters

### SMS Segment Cost Warning

**Important:** If you see a warning about multiple segments for Chinese locales:

- **Short template** (`<#> Sanora OTP: {code}`) = 1 segment for all languages ✅
- **Long template** (`<#> Your Subject Mastery OTP is {code}`) = 2 segments for Chinese ⚠️

**Recommendation:** Use the shorter template to keep costs down. The hash code and autofill will work the same regardless of message length.

### After Configuration

1. **Click "Save"** at the bottom (or "Continue" if you see the cost warning)
2. **Test** by sending an OTP to your phone
3. **Verify** the SMS contains the hash code
4. **Check** that Android autofill works in your app

### Notes Section

You can add notes in the "Notes" field (500 characters max) for your reference:
```
OTP autofill enabled with Android SMS Retriever API hash.
Hash: KRkY+kXZhTh (replace with actual hash)
```

---

## Quick Checklist

- [ ] Navigate to Verify → Services → "Sanora India"
- [ ] Find "Message template configuration" section
- [ ] Locate "Message body" field under "Pre-Approved or Custom Templates"
- [ ] Enter template with `<#>` prefix and `{code}` placeholder
- [ ] Replace `KRkY+kXZhTh` with your actual app hash
- [ ] Click "Save"
- [ ] Test OTP sending
- [ ] Verify SMS format includes hash code
- [ ] Test autofill on Android device


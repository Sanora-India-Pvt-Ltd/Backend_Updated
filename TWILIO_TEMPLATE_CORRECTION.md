# Twilio Template Format Correction

## ❌ Current (Incorrect) Format

You currently have:
```
# Your Sanora India verification code is {code} KRkY+kXZhTh
```

## ✅ Correct Format

Replace it with this (copy exactly):

```
<#> Your Sanora India verification code is {code}
KRkY+kXZhTh
```

## Key Changes

1. **`#` → `<#>`** - Must use `<#>` (with angle brackets) for Android SMS Retriever API
2. **Hash on new line** - The hash code `KRkY+kXZhTh` must be on a separate line

## Why This Matters

- `<#>` (with brackets) is required by Android's SMS Retriever API for autofill
- `#` (without brackets) will NOT work for autofill
- Hash code on a new line ensures proper parsing by Android

## Alternative Shorter Version (Recommended)

To avoid the 2-segment warning for Chinese:

```
<#> Sanora OTP: {code}
KRkY+kXZhTh
``` n      

This is shorter and will fit in 1 segment for all languages.

## Steps to Fix

1. **Clear the current "Message body" field**
2. **Paste the correct format** (either version above)
3. **Make sure:**
   - Starts with `<#>` (not just `#`)
   - Hash code is on a new line
   - `{code}` remains unchanged
4. **Click "Save"**

## Visual Comparison

**Wrong:**
```
# Your Sanora India verification code is {code} KRkY+kXZhTh
```

**Correct:**
```
<#> Your Sanora India verification code is {code}
KRkY+kXZhTh
```

Notice:
- `<#>` instead of `#`
- Hash code on separate line
- Proper spacing


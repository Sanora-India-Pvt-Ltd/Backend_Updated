# Twilio SMS Segment Optimization Guide

## Understanding SMS Segments

### Character Limits
- **GSM-7 (Latin characters):** 160 characters per segment
- **Unicode (Chinese, emojis, etc.):** 70 characters per segment

### Cost Impact
- **1 segment:** Standard SMS cost
- **2+ segments:** Multiple SMS costs (2x, 3x, etc.)

## Your Current Warning

Twilio is warning that your template will result in **2 segments for Chinese locales**:
- Chinese - zh: 2 segments
- Chinese (Mandarin) - zh-cn: 2 segments

This means Chinese users will pay **2x the SMS cost**.

## Solutions

### Solution 1: Shorten the Template (Recommended)

**Current (Long) Template:**
```
<#> Your Subject Mastery OTP is {code}
KRkY+kXZhTh
```

**Optimized (Short) Template:**
```
<#> Sanora OTP: {code}
KRkY+kXZhTh
```

**Benefits:**
- ✅ Fits in 1 segment for all languages
- ✅ Lower cost
- ✅ Same autofill functionality
- ✅ Hash code still works

### Solution 2: Ultra-Short Template

For maximum cost savings:

```
<#> OTP: {code}
KRkY+kXZhTh
```

### Solution 3: Accept Higher Cost

If you need the longer message:
1. Click "Continue" on the warning
2. Accept that Chinese users will pay 2x
3. Monitor your SMS costs

### Solution 4: Locale-Specific Templates (Advanced)

If Twilio supports it, you can create separate templates for different locales:
- English: `<#> Your Subject Mastery OTP is {code}`
- Chinese: `<#> 验证码: {code}` (shorter Chinese message)

## Character Count Analysis

### Long Template Breakdown:
```
<#> Your Subject Mastery OTP is {code}
KRkY+kXZhTh
```

- `<#> ` = 4 chars
- `Your Subject Mastery OTP is ` = 30 chars
- `{code}` = 6 chars (replaced with 6-digit OTP)
- Newline = 1 char
- `KRkY+kXZhTh` = 11 chars
- **Total: ~52 characters** (Latin)

When translated to Chinese, the message part becomes longer, exceeding 70 characters.

### Short Template Breakdown:
```
<#> Sanora OTP: {code}
KRkY+kXZhTh
```

- `<#> ` = 4 chars
- `Sanora OTP: ` = 12 chars
- `{code}` = 6 chars (replaced with 6-digit OTP)
- Newline = 1 char
- `KRkY+kXZhTh` = 11 chars
- **Total: ~34 characters** (Latin)

This fits comfortably in 1 segment even when translated.

## Recommended Action

**Use the short template:**
```
<#> Sanora OTP: {code}
KRkY+kXZhTh
```

This provides:
- ✅ Autofill support (hash code included)
- ✅ 1 segment for all languages
- ✅ Lower costs
- ✅ Professional appearance

## Testing

After saving the template:
1. Send OTP to a Chinese phone number (if available)
2. Check SMS length - should be 1 segment
3. Verify autofill still works
4. Monitor Twilio costs

## Cost Comparison

Assuming $0.0075 per SMS segment:

- **Long template (Chinese):** $0.015 per OTP (2 segments)
- **Short template (Chinese):** $0.0075 per OTP (1 segment)
- **Savings:** 50% reduction for Chinese users

If 10% of your users are Chinese and you send 10,000 OTPs/month:
- Long template: $75 + $15 (Chinese) = $90/month
- Short template: $75 + $7.50 (Chinese) = $82.50/month
- **Monthly savings: $7.50**

## Next Steps

1. ✅ Use the shorter template: `<#> Sanora OTP: {code}`
2. ✅ Replace `KRkY+kXZhTh` with your actual hash
3. ✅ Click "Save" or "Continue" (if warning appears)
4. ✅ Test with different locales
5. ✅ Monitor SMS costs in Twilio Console


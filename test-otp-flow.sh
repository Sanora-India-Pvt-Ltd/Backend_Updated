#!/bin/bash

# Test OTP Flow Script
# Usage: ./test-otp-flow.sh your-email@example.com

EMAIL=$1

if [ -z "$EMAIL" ]; then
    echo "Usage: ./test-otp-flow.sh your-email@example.com"
    exit 1
fi

echo "📧 Step 1: Sending OTP to $EMAIL..."
RESPONSE=$(curl -s -X POST http://localhost:3100/api/auth/send-otp-signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\"}")

echo "$RESPONSE" | python -m json.tool 2>/dev/null || echo "$RESPONSE"

SUCCESS=$(echo "$RESPONSE" | grep -o '"success":true' || echo "")
if [ -z "$SUCCESS" ]; then
    echo "❌ Failed to send OTP. Check your email configuration."
    exit 1
fi

echo ""
echo "✅ OTP sent! Check your email for the 6-digit code."
echo ""
read -p "Enter the OTP code from your email: " OTP_CODE

echo ""
echo "🔐 Step 2: Verifying OTP..."
VERIFY_RESPONSE=$(curl -s -X POST http://localhost:3100/api/auth/verify-otp-signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"otp\":\"$OTP_CODE\"}")

echo "$VERIFY_RESPONSE" | python -m json.tool 2>/dev/null || echo "$VERIFY_RESPONSE"

VERIFY_SUCCESS=$(echo "$VERIFY_RESPONSE" | grep -o '"success":true' || echo "")
if [ -z "$VERIFY_SUCCESS" ]; then
    echo "❌ OTP verification failed. Please try again."
    exit 1
fi

# Extract verification token (simple extraction)
VERIFICATION_TOKEN=$(echo "$VERIFY_RESPONSE" | grep -o '"verificationToken":"[^"]*' | cut -d'"' -f4)

if [ -z "$VERIFICATION_TOKEN" ]; then
    echo "❌ Could not extract verification token from response."
    exit 1
fi

echo ""
echo "✅ OTP verified! Verification token received."
echo ""
read -p "Enter password for signup: " PASSWORD
read -p "Enter your name (optional): " NAME

echo ""
echo "📝 Step 3: Completing signup..."
SIGNUP_RESPONSE=$(curl -s -X POST http://localhost:3100/api/auth/signup \
  -H "Content-Type: application/json" \
  -d "{
    \"email\":\"$EMAIL\",
    \"password\":\"$PASSWORD\",
    \"name\":\"$NAME\",
    \"verificationToken\":\"$VERIFICATION_TOKEN\"
  }")

echo "$SIGNUP_RESPONSE" | python -m json.tool 2>/dev/null || echo "$SIGNUP_RESPONSE"

SIGNUP_SUCCESS=$(echo "$SIGNUP_RESPONSE" | grep -o '"success":true' || echo "")
if [ -z "$SIGNUP_SUCCESS" ]; then
    echo "❌ Signup failed."
    exit 1
fi

echo ""
echo "🎉 Signup completed successfully!"


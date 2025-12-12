# Railway Deployment Guide

This guide will help you deploy your Sanora backend to Railway.

## 🚀 Quick Deployment Steps

### Step 1: Create Railway Account & Project

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your `sanora` repository
6. Select the branch you want to deploy (e.g., `backend-branch`)

### Step 2: Configure Environment Variables

Railway will automatically detect your Node.js app. Now you need to add environment variables:

1. In your Railway project, go to **Variables** tab
2. Add the following **required** environment variables:

#### Required Variables:

```env
# Server
PORT=3100
NODE_ENV=production

# Database (MongoDB Atlas connection string)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname

# JWT Secret (generate a strong random string)
JWT_SECRET=your-super-secret-jwt-key-min-32-characters-long

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_ANDROID_CLIENT_ID=your-android-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=https://subjectmastery-production.up.railway.app/api/auth/google/callback

# Email Configuration (for OTP)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
OTP_EXPIRY_MINUTES=5

# Session Secret
SESSION_SECRET=your-session-secret-key
```

#### How to Get Values:

1. **MONGODB_URI**: 
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - Create a cluster (free tier available)
   - Get connection string
   - Replace `<password>` with your password
   - Add your Railway IP to network access (or use `0.0.0.0/0` for development)

2. **JWT_SECRET**: Generate a random string:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

3. **GOOGLE_CLIENT_ID & SECRET**: 
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create OAuth 2.0 credentials
   - Add authorized redirect URI: `https://subjectmastery-production.up.railway.app/api/auth/google/callback`

4. **EMAIL_PASSWORD**: 
   - For Gmail, use App Password (see OTP_SETUP_GUIDE.md)
   - Enable 2-Step Verification first
   - Generate App Password from Google Account settings

### Step 3: Deploy

1. Railway will automatically deploy when you push to your branch
2. Or click **Deploy** button in Railway dashboard
3. Wait for build to complete
4. Check **Deployments** tab for logs

### Step 4: Check Deployment Status

1. Go to **Deployments** tab
2. Click on the latest deployment
3. Check **Logs** tab for any errors

## 🔍 Troubleshooting "Train Has Not Arrived" Error

This error means your service isn't running. Check these:

### 1. Check Build Logs

In Railway dashboard:
- Go to **Deployments** → Latest deployment → **Logs**
- Look for errors like:
  - `MongoDB connection failed`
  - `Missing environment variable`
  - `Port already in use`
  - Build errors

### 2. Verify Environment Variables

Make sure ALL required variables are set:
- ✅ `MONGODB_URI` (most common issue!)
- ✅ `JWT_SECRET`
- ✅ `PORT` (Railway sets this automatically, but you can set it manually)

### 3. Check Service Status

In Railway dashboard:
- Go to **Settings** → **Service**
- Check if service is **Running**
- If it shows **Stopped** or **Crashed**, check logs

### 4. Common Issues & Fixes

#### Issue: MongoDB Connection Failed
```
❌ MongoDB connection failed: ...
```
**Fix:**
- Verify `MONGODB_URI` is correct
- Check MongoDB Atlas network access (allow Railway IPs)
- Ensure MongoDB Atlas cluster is running

#### Issue: Missing Environment Variables
```
ReferenceError: process.env.MONGODB_URI is not defined
```
**Fix:**
- Add all required environment variables in Railway dashboard
- Redeploy after adding variables

#### Issue: Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::3100
```
**Fix:**
- Remove `PORT=3100` from environment variables
- Railway automatically sets `PORT` environment variable
- Your code already handles this: `const PORT = process.env.PORT || 3100;`

#### Issue: Build Failed
```
npm ERR! ...
```
**Fix:**
- Check `package.json` is valid
- Ensure all dependencies are listed
- Check Node.js version compatibility

### 5. Verify Service is Running

1. In Railway dashboard, go to your service
2. Check **Metrics** tab - should show CPU/Memory usage
3. Check **Logs** tab - should show:
   ```
   🎯 Server running on port 3100
   ✅ MongoDB Connected to database: sanora
   ```

### 6. Test Your Deployment

Once deployed, test your API:

```bash
# Test root endpoint
curl https://subjectmastery-production.up.railway.app/

# Test health check (if you have one)
curl https://subjectmastery-production.up.railway.app/api/health
```

## 📝 Railway Configuration File

The `railway.json` file in your project root configures:
- Build system: NIXPACKS (auto-detects Node.js)
- Start command: `npm start`
- Restart policy: Auto-restart on failure

## 🔄 Updating Your Deployment

1. Push changes to your GitHub branch
2. Railway automatically detects and redeploys
3. Or manually trigger deployment in Railway dashboard

## 🌐 Custom Domain (Optional)

1. In Railway dashboard, go to **Settings** → **Networking**
2. Click **Generate Domain** or add custom domain
3. Update `GOOGLE_CALLBACK_URL` to match your domain

## 📊 Monitoring

- **Logs**: Real-time logs in Railway dashboard
- **Metrics**: CPU, Memory, Network usage
- **Deployments**: History of all deployments

## 🆘 Still Not Working?

1. **Check Railway Status**: [status.railway.app](https://status.railway.app)
2. **Check Logs**: Most errors are visible in deployment logs
3. **Verify Environment Variables**: Double-check all are set correctly
4. **Test Locally First**: Make sure app works locally with same env vars

## ✅ Success Checklist

- [ ] All environment variables set in Railway
- [ ] MongoDB Atlas cluster is running and accessible
- [ ] Build completed successfully
- [ ] Service shows as "Running" in Railway dashboard
- [ ] Logs show "Server running on port..."
- [ ] Logs show "MongoDB Connected"
- [ ] API responds to test requests

---

**Need Help?** Check Railway's [documentation](https://docs.railway.app) or your deployment logs.


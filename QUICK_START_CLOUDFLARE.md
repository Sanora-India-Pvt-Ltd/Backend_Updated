# Quick Start: Deploy to Cloudflare Workers

## ⚠️ Important Note

Your current Express.js + MongoDB setup requires significant refactoring to work on Cloudflare Workers. This guide provides two paths:

1. **Quick Path**: Deploy to a Node.js-friendly platform (Railway, Render, etc.) - **Recommended**
2. **Cloudflare Path**: Refactor to use Hono + MongoDB HTTP API - **More work required**

## 🚀 Quick Deployment (Recommended)

### Option 1: Railway (Easiest)

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Add environment variables in Railway dashboard
6. Deploy! 🎉

### Option 2: Render

1. Go to [render.com](https://render.com)
2. Sign up
3. Click "New" → "Web Service"
4. Connect your GitHub repo
5. Set build command: `npm install`
6. Set start command: `npm start`
7. Add environment variables
8. Deploy! 🎉

## ☁️ Cloudflare Workers Deployment (Advanced)

If you want to use Cloudflare Workers, follow these steps:

### Step 1: Install Dependencies

```bash
npm install hono mongodb
```

### Step 2: Login to Cloudflare

```bash
wrangler login
```

### Step 3: Set Environment Variables

```bash
# Set each secret (you'll be prompted for the value)
wrangler secret put MONGODB_URI
wrangler secret put JWT_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_ANDROID_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put EMAIL_HOST
wrangler secret put EMAIL_PORT
wrangler secret put EMAIL_USER
wrangler secret put EMAIL_PASSWORD
wrangler secret put SESSION_SECRET
```

### Step 4: Update wrangler.toml

Update the `main` field in `wrangler.toml` to point to your worker:

```toml
main = "src/worker-hono.js"  # Use Hono version
```

### Step 5: Refactor Your Code

You'll need to:
1. Convert Express routes to Hono routes
2. Replace Mongoose with MongoDB native driver
3. Remove express-session (use JWT only)
4. Update email service to work in Workers

### Step 6: Test Locally

```bash
npm run dev:worker
```

### Step 7: Deploy

```bash
npm run deploy
```

## 📋 Environment Variables Needed

Make sure you have these in your `.env` file (for local) or Cloudflare secrets (for production):

```
MONGODB_URI=mongodb+srv://...
JWT_SECRET=your-secret-key
GOOGLE_CLIENT_ID=...
GOOGLE_ANDROID_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
SESSION_SECRET=your-session-secret
```

## 🎯 Recommendation

**For your current setup, I recommend Railway or Render** because:
- ✅ No code changes needed
- ✅ Full Node.js support
- ✅ MongoDB works out of the box
- ✅ Express.js works perfectly
- ✅ Free tier available
- ✅ Easy deployment

**Use Cloudflare Workers if:**
- You want edge computing benefits
- You're willing to refactor your code
- You need global distribution
- You want to use Cloudflare's ecosystem

## 🆘 Need Help?

If you want me to:
1. **Refactor your code for Cloudflare Workers** - I can help convert Express routes to Hono
2. **Set up Railway deployment** - I can create a railway.json config
3. **Set up Render deployment** - I can create a render.yaml config

Let me know which path you'd like to take!


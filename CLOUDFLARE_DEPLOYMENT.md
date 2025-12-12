# Cloudflare Workers Deployment Guide

This guide will help you deploy your Sanora backend to Cloudflare Workers.

## ⚠️ Important Limitations

Cloudflare Workers has some limitations compared to traditional Node.js servers:

1. **No Full Node.js Runtime**: Workers use V8 isolates, not full Node.js
2. **Express.js**: Doesn't work directly - needs adaptation
3. **Mongoose**: Won't work - need to use MongoDB HTTP API or Cloudflare D1
4. **Sessions**: `express-session` won't work - use JWT tokens instead
5. **File System**: No file system access
6. **Long-running connections**: Not supported (MongoDB connections need to be HTTP-based)

## 🎯 Deployment Options

### Option 1: Cloudflare Workers (Recommended for API-only)

This requires refactoring your Express app to work with Workers. See the implementation below.

### Option 2: Cloudflare Pages Functions

Better for full-stack apps, but still has limitations.

### Option 3: Alternative Platforms (Easier)

For a full Express.js + MongoDB app, consider:
- **Railway** (railway.app) - Easy deployment, supports Node.js
- **Render** (render.com) - Free tier available
- **Fly.io** (fly.io) - Good performance
- **Heroku** (heroku.com) - Classic choice

## 📋 Prerequisites

1. **Cloudflare Account**: Sign up at [cloudflare.com](https://cloudflare.com)
2. **Wrangler CLI**: Already installed (`npm install -g wrangler`)
3. **MongoDB Atlas**: Use MongoDB Atlas (cloud) since Workers can't maintain persistent connections

## 🚀 Step-by-Step Deployment

### Step 1: Set Up MongoDB Atlas

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Get your connection string (format: `mongodb+srv://username:password@cluster.mongodb.net/dbname`)
4. Whitelist Cloudflare IPs or use `0.0.0.0/0` for development

### Step 2: Install Dependencies

```bash
npm install @cloudflare/workers-express mongodb
```

### Step 3: Configure Environment Variables

Set secrets in Cloudflare:

```bash
# Login to Cloudflare
wrangler login

# Set environment variables
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

### Step 4: Deploy

```bash
# Deploy to production
wrangler deploy

# Or deploy to staging
wrangler deploy --env staging
```

### Step 5: Get Your Worker URL

After deployment, you'll get a URL like:
```
https://sanora-backend.your-subdomain.workers.dev
```

## 🔧 Required Code Changes

Since Express.js doesn't work directly in Workers, you have two options:

### Option A: Use Hono Framework (Recommended)

Hono is a lightweight framework designed for Cloudflare Workers:

```bash
npm install hono
```

### Option B: Use @cloudflare/workers-express

This is a compatibility layer that makes Express work in Workers:

```bash
npm install @cloudflare/workers-express
```

## 📝 MongoDB Connection in Workers

Since Mongoose won't work, you need to use the native MongoDB driver with HTTP connections:

```javascript
import { MongoClient } from 'mongodb';

// Use MongoDB Atlas connection string
const client = new MongoClient(env.MONGODB_URI);
```

## 🧪 Testing Locally

```bash
# Start local development server
wrangler dev

# Test your endpoints
curl http://localhost:8787/
```

## 🔍 Troubleshooting

### Issue: "Module not found" errors
- Some npm packages don't work in Workers
- Use Workers-compatible alternatives

### Issue: MongoDB connection fails
- Ensure MongoDB Atlas allows connections from Cloudflare IPs
- Use MongoDB Atlas (cloud), not self-hosted

### Issue: Express middleware doesn't work
- Refactor to use Workers-compatible middleware
- Consider using Hono instead of Express

## 📚 Resources

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [Hono Framework](https://hono.dev/)
- [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)

## 💡 Recommendation

For your current Express.js + MongoDB setup, I recommend:

1. **Short term**: Deploy to Railway or Render (easier, no code changes)
2. **Long term**: Refactor to use Hono + MongoDB HTTP API for Cloudflare Workers

Would you like me to:
1. Create a Workers-compatible version using Hono?
2. Help you deploy to Railway/Render instead?
3. Set up a hybrid approach?


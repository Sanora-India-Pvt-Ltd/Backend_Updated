# Redis Setup Guide

This guide will help you get a `REDIS_URL` for your application.

## 🎯 Quick Answer

**REDIS_URL** is a connection string that tells your app how to connect to a Redis server. You can get it from:
1. **Free cloud Redis services** (easiest - recommended)
2. **Local Redis installation** (for development)

---

## Option 1: Free Cloud Redis (Recommended) ⭐

### A. Upstash (Easiest - Free Tier Available)

1. **Sign up**: Go to [https://upstash.com](https://upstash.com)
2. **Create Database**:
   - Click "Create Database"
   - Choose "Redis" as the database type
   - Select a region close to you
   - Choose "Free" tier
   - Click "Create"
3. **Get Connection String**:
   - After creation, you'll see your database details
   - Look for "REST URL" or "Redis URL"
   - It will look like: `redis://default:YOUR_PASSWORD@YOUR_ENDPOINT:6379`
   - **Copy this entire URL** - this is your `REDIS_URL`

**Example REDIS_URL from Upstash:**
```
redis://default:AbCdEf123456@usw1-xyz-redis.upstash.io:6379
```

### B. Redis Cloud (Free Tier Available)

1. **Sign up**: Go to [https://redis.com/try-free/](https://redis.com/try-free/)
2. **Create Database**:
   - Click "Create Database"
   - Choose "Free" tier
   - Select a cloud provider and region
   - Click "Create"
3. **Get Connection String**:
   - Go to your database dashboard
   - Click on "Connect" or "Configuration"
   - Copy the "Redis URL" or "Connection String"
   - It will look like: `redis://default:YOUR_PASSWORD@YOUR_ENDPOINT:PORT`

**Example REDIS_URL from Redis Cloud:**
```
redis://default:AbCdEf123456@redis-12345.c1.us-east-1-1.ec2.cloud.redislabs.com:12345
```

### C. Railway (If you're already using Railway)

1. **Add Redis Service**:
   - In your Railway project, click "+ New"
   - Select "Database" → "Add Redis"
2. **Get Connection String**:
   - Click on the Redis service
   - Go to "Variables" tab
   - Copy the `REDIS_URL` value (Railway provides it automatically)

---

## Option 2: Local Redis (For Development)

### Windows

1. **Download Redis**:
   - Go to [https://github.com/microsoftarchive/redis/releases](https://github.com/microsoftarchive/redis/releases)
   - Download the latest Windows release
   - Or use WSL (Windows Subsystem for Linux) and follow Linux instructions

2. **Install & Start**:
   ```bash
   # Extract and run redis-server.exe
   redis-server.exe
   ```

3. **REDIS_URL**:
   ```
   redis://localhost:6379
   ```

### macOS

1. **Install using Homebrew**:
   ```bash
   brew install redis
   ```

2. **Start Redis**:
   ```bash
   brew services start redis
   # Or run manually:
   redis-server
   ```

3. **REDIS_URL**:
   ```
   redis://localhost:6379
   ```

### Linux (Ubuntu/Debian)

1. **Install Redis**:
   ```bash
   sudo apt-get update
   sudo apt-get install redis-server
   ```

2. **Start Redis**:
   ```bash
   sudo systemctl start redis-server
   # Enable auto-start on boot:
   sudo systemctl enable redis-server
   ```

3. **REDIS_URL**:
   ```
   redis://localhost:6379
   ```

---

## 🔧 How to Add REDIS_URL to Your Project

### Step 1: Create/Edit `.env` File

In your project root directory, create or edit the `.env` file:

```env
# Add this line with your Redis URL
REDIS_URL=redis://default:YOUR_PASSWORD@YOUR_ENDPOINT:6379
```

### Step 2: Replace with Your Actual URL

Replace the example URL with the one you got from:
- Upstash dashboard
- Redis Cloud dashboard
- Or use `redis://localhost:6379` for local Redis

### Step 3: Restart Your Server

After adding `REDIS_URL` to your `.env` file:

```bash
# Stop your server (Ctrl+C)
# Then restart:
npm start
```

### Step 4: Verify It's Working

You should see in your server logs:
```
✅ Redis client connected
✅ Redis subscriber connected
✅ Redis publisher connected
✅ Socket.IO Redis adapter initialized
```

---

## 📝 REDIS_URL Format Examples

### Standard Format:
```
redis://[username]:[password]@[host]:[port]
```

### Common Examples:

**Local Redis (no password):**
```
redis://localhost:6379
```

**Local Redis (with password):**
```
redis://:mypassword@localhost:6379
```

**Cloud Redis (Upstash):**
```
redis://default:AbCdEf123456@usw1-xyz-redis.upstash.io:6379
```

**Cloud Redis (Redis Cloud):**
```
redis://default:AbCdEf123456@redis-12345.c1.us-east-1-1.ec2.cloud.redislabs.com:12345
```

**Redis with TLS/SSL:**
```
rediss://default:password@host:port
```
(Note: `rediss://` with double 's' for secure connection)

---

## ✅ Quick Setup Checklist

- [ ] Choose a Redis provider (Upstash recommended for free tier)
- [ ] Create a Redis database
- [ ] Copy the connection URL
- [ ] Add `REDIS_URL=your_url_here` to your `.env` file
- [ ] Restart your server
- [ ] Verify connection in server logs

---

## 🆘 Troubleshooting

### Issue: "Connection refused" or "ECONNREFUSED"

**Possible causes:**
1. Redis server is not running (if using local Redis)
2. Wrong host/port in REDIS_URL
3. Firewall blocking connection (for cloud Redis)

**Solutions:**
- For local: Make sure `redis-server` is running
- For cloud: Check that you copied the entire URL correctly
- For cloud: Verify your IP is whitelisted (if required)

### Issue: "Authentication failed"

**Solution:**
- Check that password in REDIS_URL is correct
- Some providers use "default" as username
- Make sure special characters in password are URL-encoded

### Issue: "REDIS_URL not set" message still appears

**Solution:**
- Make sure `.env` file is in project root
- Make sure `.env` file has `REDIS_URL=...` (no spaces around `=`)
- Restart your server after adding to `.env`
- Check that `dotenv` package is installed and loaded

---

## 💡 Why Do I Need Redis?

Redis is **optional** but recommended for:
- ✅ **Multi-server scaling**: If you run multiple backend servers
- ✅ **Better presence tracking**: Online/offline status across servers
- ✅ **Performance**: Faster than in-memory storage for large apps

**Without Redis:**
- ✅ App still works fine (single server)
- ✅ Real-time messaging works
- ✅ Presence tracking uses in-memory fallback
- ❌ Won't scale across multiple servers

---

## 🎯 Recommended: Start with Upstash

**Why Upstash?**
- ✅ Free tier available (10,000 commands/day)
- ✅ Easy setup (5 minutes)
- ✅ No credit card required
- ✅ Good for development and small production apps

**Steps:**
1. Go to [upstash.com](https://upstash.com)
2. Sign up (free)
3. Create Redis database
4. Copy REDIS_URL
5. Add to `.env` file
6. Done! 🎉

---

**Need Help?** Check your server logs for specific error messages, or refer to your Redis provider's documentation.


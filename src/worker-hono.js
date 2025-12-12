/**
 * Cloudflare Workers Entry Point using Hono Framework
 * 
 * This is a better approach - using Hono which is designed for Workers.
 * You'll need to refactor your Express routes to use Hono.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

// Note: You'll need to install: npm install hono
// And refactor your Express routes to use Hono

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/', (c) => {
  return c.json({
    success: true,
    message: '🚀 Sanora Backend API is running on Cloudflare Workers!',
    timestamp: new Date().toISOString(),
    endpoints: {
      signup: 'POST /api/auth/signup',
      login: 'POST /api/auth/login',
      googleAuth: 'GET /api/auth/google',
      googleAuthMobile: 'POST /api/auth/google/mobile',
      verifyGoogleToken: 'POST /api/auth/verify-google-token',
      sendOTPSignup: 'POST /api/auth/send-otp-signup',
      verifyOTPSignup: 'POST /api/auth/verify-otp-signup'
    }
  });
});

// Auth routes placeholder
// You'll need to refactor your Express routes from:
// - src/routes/authRoutes.js
// - src/controllers/authController.js
// To use Hono instead

app.get('/api', (c) => {
  return c.json({
    success: true,
    message: 'API is running',
    version: '1.0.0'
  });
});

// Example auth route structure (you'll need to implement these)
const authRoutes = new Hono();

authRoutes.post('/signup', async (c) => {
  // Refactor your signup logic here
  // Instead of req.body, use: const body = await c.req.json()
  // Instead of res.json(), use: return c.json()
  return c.json({ message: 'Signup endpoint - needs implementation' }, 501);
});

authRoutes.post('/login', async (c) => {
  return c.json({ message: 'Login endpoint - needs implementation' }, 501);
});

app.route('/api/auth', authRoutes);

// 404 handler
app.notFound((c) => {
  return c.json({
    success: false,
    message: 'Route not found',
    path: c.req.path
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Error:', err);
  return c.json({
    success: false,
    message: 'Internal server error',
    error: err.message
  }, 500);
});

export default app;


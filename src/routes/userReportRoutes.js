const express = require('express');
const router = express.Router();

// Import controller
let userReportController;
try {
  userReportController = require('../controllers/userReportController');
  console.log('✅ User report controller loaded');
} catch (error) {
  console.error('❌ Failed to load user report controller:', error.message);
  userReportController = { reportUser: null };
}

// Import auth middleware
let auth;
try {
  auth = require('../middleware/auth');
  console.log('✅ Auth middleware loaded');
  console.log('   Auth type:', typeof auth);
  console.log('   Auth is function?', typeof auth === 'function');
} catch (error) {
  console.error('❌ Failed to load auth middleware:', error.message);
  // Fallback: create a dummy auth middleware
  auth = (req, res, next) => {
    console.warn('⚠️  Auth middleware not loaded, using fallback');
    next();
  };
}

// Validate that auth is a function
if (typeof auth !== 'function') {
  console.warn('⚠️  Auth middleware is not a function, type:', typeof auth);
  console.warn('   Auth object:', auth);
  
  // If auth is an object with properties, try to find a function
  if (typeof auth === 'object' && auth !== null) {
    // Try common property names
    if (typeof auth.default === 'function') {
      auth = auth.default;
      console.log('✅ Using auth.default');
    } else if (typeof auth.protect === 'function') {
      auth = auth.protect;
      console.log('✅ Using auth.protect');
    } else if (typeof auth.authenticate === 'function') {
      auth = auth.authenticate;
      console.log('✅ Using auth.authenticate');
    } else {
      // Use first function property found
      for (const key in auth) {
        if (typeof auth[key] === 'function') {
          console.log(`✅ Using auth.${key}`);
          auth = auth[key];
          break;
        }
      }
    }
  }
}

// Validate controller function exists
if (!userReportController.reportUser) {
  console.error('❌ reportUser function not found in controller');
}

// Report a user (authenticated users only)
// Full endpoint: POST /api/reports/users/:userId/report
if (typeof auth === 'function' && typeof userReportController.reportUser === 'function') {
  router.post('/users/:userId/report', auth, userReportController.reportUser);
  console.log('✅ User report route registered: POST /users/:userId/report');
} else {
  console.error('❌ Cannot register route - missing auth or controller function');
}

module.exports = router;
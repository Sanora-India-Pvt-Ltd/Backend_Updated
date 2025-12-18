// Async handler wrapper to catch errors in async route handlers
// This ensures that errors in async functions are properly passed to Express error handler
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

module.exports = asyncHandler;


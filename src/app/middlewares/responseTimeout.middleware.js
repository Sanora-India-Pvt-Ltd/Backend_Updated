/**
 * Global response timeout middleware.
 * Aborts the request with 503 if the response is not sent within the configured time.
 */

const DEFAULT_MS = 30 * 1000; // 30s fail-safe

/**
 * @param {number} [ms] - Timeout in milliseconds (default 30s)
 * @returns {function} Express middleware
 */
function responseTimeoutMiddleware(ms = DEFAULT_MS) {
    return function (req, res, next) {
        const timer = setTimeout(() => {
            if (!res.headersSent) {
                res.status(503).json({
                    success: false,
                    message: 'Request timeout',
                    hint: `Response did not complete within ${ms / 1000}s`
                });
            }
        }, ms);

        res.on('finish', () => clearTimeout(timer));
        next();
    };
}

module.exports = responseTimeoutMiddleware;

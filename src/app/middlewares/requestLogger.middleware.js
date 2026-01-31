/**
 * Request logger middleware.
 * Adds request id, logs route and duration.
 */

const logger = require('../../core/logger');
const metrics = require('../../core/metrics');
const crypto = require('crypto');

const REQUEST_ID_HEADER = 'x-request-id';
const REQUEST_ID_RES_HEADER = 'x-request-id';

function generateRequestId() {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Attach request id to req, log request start, and on finish log duration and status.
 */
function requestLoggerMiddleware(req, res, next) {
    const requestId = req.headers[REQUEST_ID_HEADER] || generateRequestId();
    req.requestId = requestId;
    res.setHeader(REQUEST_ID_RES_HEADER, requestId);

    const start = Date.now();
    const route = `${req.method} ${req.originalUrl || req.path}`;

    res.on('finish', () => {
        const durationMs = Date.now() - start;
        const meta = { requestId, route, durationMs, statusCode: res.statusCode };
        metrics.recordRequest(route, res.statusCode, durationMs);
        if (durationMs > 800) {
            logger.warn('Slow request detected', {
                method: req.method,
                route: req.originalUrl || req.path,
                duration_ms: durationMs
            });
        }
        if (res.statusCode >= 500) {
            logger.error(`${route} ${res.statusCode} ${durationMs}ms`, meta);
        } else if (res.statusCode >= 400) {
            logger.warn(`${route} ${res.statusCode} ${durationMs}ms`, meta);
        } else {
            logger.info(`${route} ${res.statusCode} ${durationMs}ms`, meta);
        }
    });

    next();
}

module.exports = requestLoggerMiddleware;

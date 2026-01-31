/**
 * Custom application error for operational (expected) errors.
 * Used by validation, auth, and business rules — allows central handler to treat differently from programming errors.
 *
 * @param {string} message - User-facing or log message
 * @param {number} statusCode - HTTP status code (default 500)
 * @param {boolean} isOperational - If true, error is expected (e.g. validation); if false, treat as bug
 */
class AppError extends Error {
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = isOperational;

        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;

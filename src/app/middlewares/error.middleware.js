/**
 * Centralized error middleware.
 * - Handles AppError (operational) with its statusCode and message.
 * - Handles unknown errors with 500 and safe message.
 * - Never leaks stack in production.
 * - Keeps existing response shape: { success: false, message: "...", error?: "..." }
 *
 * DO NOT remove old error handler (middleware/errorhandler.js) until routes are migrated.
 */

const AppError = require('../../core/errors/AppError');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const errorMiddleware = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    if (err instanceof AppError) {
        const payload = {
            success: false,
            message: err.message
        };
        if (!isProduction && err.message) {
            payload.error = err.message;
        }
        if (err.hint !== undefined) payload.hint = err.hint;
        if (err.suggestion !== undefined) payload.suggestion = err.suggestion;
        if (err.remainingAttempts !== undefined) payload.remainingAttempts = err.remainingAttempts;
        if (err.transactionAborted === true) payload.transactionAborted = true;
        if (err.technicalDetails !== undefined) payload.technicalDetails = err.technicalDetails;
        return res.status(err.statusCode).json(payload);
    }

    // Unknown / programming errors
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    if (!isProduction) {
        console.error(err.stack);
    }

    const payload = {
        success: false,
        message: isProduction ? 'Internal Server Error' : message
    };
    if (!isProduction && err.stack) {
        payload.error = err.message;
        payload.stack = err.stack;
    }

    res.status(statusCode).json(payload);
};

module.exports = errorMiddleware;

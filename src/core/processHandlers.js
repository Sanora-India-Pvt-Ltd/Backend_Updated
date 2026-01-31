/**
 * Process-level error handlers.
 * Register unhandledRejection and uncaughtException to log and optionally exit.
 * Require this early in server.js (e.g. after dotenv, before app).
 */

const logger = require('./logger');

let registered = false;

function registerProcessHandlers() {
    if (registered) return;
    registered = true;

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection', {
            reason: reason instanceof Error ? reason.message : String(reason),
            stack: reason instanceof Error ? reason.stack : undefined
        });
        if (reason instanceof Error && reason.stack) {
            console.error(reason.stack);
        }
    });

    process.on('uncaughtException', (err) => {
        logger.error('Uncaught Exception', {
            message: err.message,
            stack: err.stack
        });
        console.error(err.stack);
        process.exit(1);
    });
}

module.exports = { registerProcessHandlers };

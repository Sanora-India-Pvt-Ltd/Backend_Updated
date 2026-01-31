/**
 * Central logger wrapper.
 * Provides info, warn, error with optional requestId and structured meta.
 * Can be swapped for pino/winston later without changing call sites.
 */

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

function shouldLog(level) {
    const current = LEVELS[level] ?? 2;
    const min = LEVELS[LOG_LEVEL] ?? 2;
    return current <= min;
}

function formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
}

function info(message, meta = {}) {
    if (shouldLog('info')) {
        console.log(formatMessage('info', message, meta));
    }
}

function warn(message, meta = {}) {
    if (shouldLog('warn')) {
        console.warn(formatMessage('warn', message, meta));
    }
}

function error(message, metaOrError = {}) {
    if (!shouldLog('error')) return;
    const meta = metaOrError instanceof Error
        ? { error: metaOrError.message, stack: metaOrError.stack }
        : metaOrError;
    console.error(formatMessage('error', message, meta));
}

function debug(message, meta = {}) {
    if (shouldLog('debug')) {
        console.debug(formatMessage('debug', message, meta));
    }
}

module.exports = {
    info,
    warn,
    error,
    debug
};

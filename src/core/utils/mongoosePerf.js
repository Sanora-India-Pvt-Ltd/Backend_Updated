/**
 * Mongoose query performance logging.
 * Only enabled when process.env.LOG_LEVEL === 'debug'.
 * Import and call enableMongooseDebug() after DB connection (e.g. in server.js).
 */

const mongoose = require('mongoose');
const logger = require('../logger');

/**
 * Enable Mongoose debug logging. Logs collection name and method for each query.
 * No-op unless LOG_LEVEL === 'debug'.
 */
function enableMongooseDebug() {
    if (process.env.LOG_LEVEL !== 'debug') {
        return;
    }
    mongoose.set('debug', function (collectionName, method, query, doc, options) {
        logger.debug('Mongoose query', { collectionName, method });
    });
}

module.exports = {
    enableMongooseDebug
};

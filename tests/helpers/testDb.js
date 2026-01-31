/**
 * Test database config: in-memory MongoDB via mongodb-memory-server.
 * Use connectTestDb() in tests that need a real DB; disconnect after.
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

/**
 * Start in-memory MongoDB and connect Mongoose.
 * @returns {Promise<string>} MongoDB URI used
 */
async function connectTestDb() {
    if (mongoServer) {
        return mongoServer.getUri();
    }
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    return uri;
}

/**
 * Disconnect Mongoose and stop in-memory MongoDB.
 */
async function disconnectTestDb() {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
    }
    if (mongoServer) {
        await mongoServer.stop();
        mongoServer = null;
    }
}

/**
 * Clear all collections (keeps DB connected). Use between tests to isolate data.
 */
async function clearDb() {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
        await collections[key].deleteMany({});
    }
}

module.exports = {
    connectTestDb,
    disconnectTestDb,
    clearDb
};

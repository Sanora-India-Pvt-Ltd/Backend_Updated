/**
 * Realtime (Socket.IO) abstraction.
 * Only place that requires socket.io (infra lockdown).
 * Services use getIO/getQuestionTimers/initSocketServer; socketServer uses Server.
 */

const { Server } = require('socket.io');
const logger = require('../logger');

function getSocketIO() {
    try {
        const { getIO } = require('../../socket/socketServer');
        return getIO();
    } catch (err) {
        logger.error('Realtime getIO failed', { error: err.message });
        throw err;
    }
}

function getQuestionTimers() {
    try {
        const { questionTimers } = require('../../socket/socketServer');
        return questionTimers;
    } catch (err) {
        logger.error('Realtime getQuestionTimers failed', { error: err.message });
        throw err;
    }
}

function initSocketServer(httpServer) {
    try {
        const { initSocketServer: init } = require('../../socket/socketServer');
        return init(httpServer);
    } catch (err) {
        logger.error('Realtime initSocketServer failed', { error: err.message });
        throw err;
    }
}

module.exports = {
    Server,
    getIO: getSocketIO,
    getQuestionTimers,
    initSocketServer
};

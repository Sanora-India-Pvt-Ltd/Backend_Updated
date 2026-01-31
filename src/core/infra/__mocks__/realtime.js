/**
 * Mock for core/infra/realtime (Socket.IO).
 * Use in tests: realtime.getIO.mockReturnValue(...), realtime.getQuestionTimers.mockReturnValue(...).
 */

const questionTimersMap = new Map();

const mockIO = {
    to: jest.fn(() => ({ emit: jest.fn() })),
    emit: jest.fn()
};

const getIO = jest.fn(() => mockIO);
const getQuestionTimers = jest.fn(() => questionTimersMap);

function clearQuestionTimers() {
    questionTimersMap.clear();
}

module.exports = {
    getIO,
    getQuestionTimers,
    __mock: { mockIO, questionTimersMap, clearQuestionTimers }
};

/**
 * Mock for core/infra/cache (Redis).
 * Use in tests: jest.mock('../../../core/infra/cache'); then cache.getClient.mockReturnValue(mockRedis) or mockReturnValue(null).
 */

const mockStore = new Map();

const mockRedis = {
    get: jest.fn((key) => Promise.resolve(mockStore.get(key) ?? null)),
    set: jest.fn((key, value, ...args) => {
        mockStore.set(key, value);
        return Promise.resolve('OK');
    }),
    setex: jest.fn((key, ttl, value) => {
        mockStore.set(key, value);
        return Promise.resolve('OK');
    }),
    expire: jest.fn((key, ttl) => Promise.resolve(1)),
    del: jest.fn((key) => {
        mockStore.delete(key);
        return Promise.resolve(1);
    }),
    ping: jest.fn(() => Promise.resolve('PONG'))
};

const getClient = jest.fn(() => mockRedis);

function clearMockStore() {
    mockStore.clear();
}

module.exports = {
    getClient,
    __mock: { mockRedis, mockStore, clearMockStore }
};

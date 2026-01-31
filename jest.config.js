/** @type {import('jest').Config} */
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__tests__/**/*.test.js', '**/*.test.js'],
    collectCoverageFrom: [
        'src/app/services/**/*.js',
        '!src/app/services/**/*.test.js',
        '!**/node_modules/**'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    modulePathIgnorePatterns: ['<rootDir>/node_modules/'],
    testTimeout: 15000,
    verbose: true
};

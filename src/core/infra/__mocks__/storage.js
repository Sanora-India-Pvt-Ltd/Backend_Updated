/**
 * Mock for core/infra/storage (S3/storage service).
 */

const uploadFromPath = jest.fn((filePath, key = null) =>
    Promise.resolve({
        url: `https://mock-bucket.s3.mock/${key || filePath}`,
        key: key || `mock/${filePath}`,
        provider: 'mock'
    })
);

const uploadFromRequest = jest.fn((file) =>
    Promise.resolve({
        url: file?.location || 'https://mock-bucket.s3.mock/mock-key',
        key: file?.key || 'mock-key',
        provider: 'mock'
    })
);

const deleteObject = jest.fn(() => Promise.resolve());

module.exports = {
    uploadFromPath,
    uploadFromRequest,
    delete: deleteObject
};

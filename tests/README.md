# Testing Infrastructure

## Setup

- **Jest** is used for unit tests (`npm test`).
- **Test DB**: `tests/helpers/testDb.js` provides in-memory MongoDB via `mongodb-memory-server` for integration-style tests. Use `connectTestDb()` / `disconnectTestDb()` / `clearDb()` when needed.
- **Infra mocks**: `src/core/infra/__mocks__/` contains manual mocks for:
  - **cache** (Redis): `getClient` is a Jest mock; use `cache.getClient.mockReturnValue(null)` or `mockReturnValue(mockRedis)` in tests.
  - **eventBus** (transcoding queue): `addTranscodingJob`, `getTranscodingJobStatus`, etc. are Jest mocks.
  - **storage** (S3): `uploadFromPath`, `uploadFromRequest`, `delete` are Jest mocks.
  - **realtime** (Socket.IO): `getIO`, `getQuestionTimers` are Jest mocks; use `realtime.getIO.mockReturnValue(...)` in tests.

## Running tests

```bash
npm test              # run all tests
npm run test:watch    # watch mode
npm run test:coverage # with coverage
```

## Service unit tests

- **auth.service** (`src/app/services/__tests__/auth.service.test.js`): signup (validation, existing user, valid flow), login (missing creds, user not found, wrong password, valid), resetPassword (missing/invalid token, short password, valid update). Mocks: User, tokenService, deviceService, otpService, emailService, bcrypt, mongoose.
- **post.service** (`src/app/services/__tests__/post.service.test.js`): toggleLikePost (invalid ID, invalid reaction, like, unlike), addComment (invalid ID, empty text, post not found, success). Mocks: storage, eventBus, Post, Like, Comment, User.
- **conference.service** (`src/app/services/__tests__/conference.service.test.js`): updateConference (permission: non-HOST throws, HOST updates), addQuestion (permission, empty text, valid create), pushQuestionLive (Redis required, success with cache + realtime mocks). Mocks: cache, realtime, Conference, ConferenceQuestion, Speaker.

## Using infra mocks

In a test file that uses a service depending on infra:

```js
jest.mock('../../../core/infra/cache');
jest.mock('../../../core/infra/eventBus');
// then e.g. cache.getClient.mockReturnValue(null) or a fake Redis object
```

Manual mocks live in `src/core/infra/__mocks__/`; Jest uses them when you call `jest.mock('...path/to/infra/...')` from the test.

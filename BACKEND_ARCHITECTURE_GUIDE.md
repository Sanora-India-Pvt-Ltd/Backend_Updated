# Backend Architecture Guide

**Purpose:** This document defines the **final backend architecture** after refactoring. It serves as the authoritative reference to prevent future developers (including AI) from breaking structure, layering, or design rules.

This is **not** API documentation.  
This is **not** feature documentation.  
This is **system architecture law.**

---

## Section 1 — System Overview

This backend follows **Layered Clean Architecture**. Request flow is strictly unidirectional:

```
Route → Controller → App Service → Core/Infra → Models/DB
```

- **Route** — Binds HTTP path + method to a controller handler and middleware. No business or DB logic.
- **Controller** — Reads `req`, calls one or more app services, sends HTTP response. No models, no infra, no DB access.
- **App Service** — Holds business logic, orchestrates workflows, and is the only layer that uses models and core/infra.
- **Core/Infra** — Wraps external systems (Redis, S3, Socket.IO, FFmpeg, email, push, etc.). No app services, controllers, or routes.
- **Models/DB** — Data definitions and persistence. Used only by app services and, where allowed, by core/infra.

---

## Section 2 — Folder Responsibilities

### `src/routes`

- **Does:** Registers HTTP routes, applies middleware (auth, validation), and wires URLs to controller functions. Routing and wiring only.
- **Must not:** Import models, mongoose, Redis, infra, or any DB logic. No business logic. No direct use of S3, Socket.IO, or queues.

### `src/controllers`

- **Does:** Extracts data from `req` (params, body, query, user), calls app service methods, and sends `res.status(...).json(...)` with the service result. Thin HTTP adapter only.
- **Must not:** Import models, mongoose, Redis, socket.io, AWS SDK, queues, or core/infra (except in rare, explicit passthrough cases). No business or DB logic.

### `src/app/services`

- **Does:** Implements business logic, validation rules, and workflows. Calls models for persistence and core/infra for external systems (storage, notifications, realtime, etc.). Returns structured results (e.g. `{ statusCode, json }`) for controllers.
- **Must not:** Import controllers or routes. Must not contain HTTP-specific code (e.g. setting cookies or headers directly); that belongs in controllers.

### `src/core/infra`

- **Does:** Abstracts external systems (Redis, S3, Socket.IO, FFmpeg, email, OTP, push, etc.). Exposes stable, provider-agnostic APIs used by app services. May use config, logger, and models only where necessary for the integration (e.g. DB for notifications).
- **Must not:** Import app services, controllers, or routes. Must not hold business rules; it is integration-only.

### `src/models`

- **Does:** Defines Mongoose schemas and data structures. Pure data layer.
- **Must not:** Import controllers, routes, app services, or infra. No HTTP, no business logic.

### `src/middleware`

- **Does:** Provides cross-cutting concerns: auth, validation, error handling, and request augmentation (e.g. attaching user or role). May use models and infra only where required for auth/validation.
- **Must not:** Contain feature-level business logic. Must not replace app services for domain behavior.

### `src/config`

- **Does:** Exposes configuration (env, feature flags, connection options). Used by infra and, where appropriate, app bootstrap.
- **Must not:** Contain business logic, routes, or controllers.

---

## Section 3 — Layer Rules (Strict)

| LAYER         | CAN IMPORT                                                                 | MUST NOT IMPORT                                                                 |
|---------------|----------------------------------------------------------------------------|----------------------------------------------------------------------------------|
| **Controllers** | App services, middleware, express, (minimal) validation/utils             | Models, mongoose, redis, socket.io, AWS SDK, queues, core/infra (except rare passthrough), fluent-ffmpeg, ioredis |
| **App Services** | Models, mongoose, core/infra, config, logger, utils, third-party libs (e.g. Twilio) | Controllers, routes                                                              |
| **Core/Infra**  | Node stdlib, logger, config, models (only when needed for integration), queue libs, AWS SDK, ioredis, socket.io, fluent-ffmpeg | App services, controllers, routes                                                |
| **Routes**    | Express, router, controllers, middleware                                   | Models, mongoose, redis, infra, DB logic, business logic                         |
| **Models**    | mongoose, schema dependencies                                              | Controllers, routes, app services, infra, HTTP, business logic                    |

**Explicit technology rules:**

- **mongoose** — Only in app services and, where necessary, in core/infra or middleware (e.g. auth).
- **redis / ioredis** — Only in core/infra (e.g. `cache.js`) and config that infra uses. App code uses `core/infra/cache`, not Redis directly.
- **socket.io** — Only in `src/core/infra/realtime.js`. Socket server and app code use the infra wrapper, not `require('socket.io')` elsewhere.
- **AWS SDK (@aws-sdk/*)** — Only in core/infra (e.g. storage, videoUpload) and config used by infra.
- **fluent-ffmpeg** — Only in core/infra (e.g. videoTranscoder).

---

## Section 4 — Infra Abstraction

All external systems **must** be accessed through `src/core/infra`. No direct provider usage in controllers or app services.

**Infra modules (conceptual):**

- **cache** — Redis (get/set, pub/sub, readiness). Used by app via `core/infra/cache`.
- **storage** — S3 (upload, delete, signed URLs). Used for file/media storage.
- **realtime** — Socket.IO (Server, getIO, initSocketServer, getQuestionTimers). Only place that requires `socket.io`.
- **videoTranscoder** — FFmpeg (transcode, cleanup). Used for video processing.
- **notificationEmitter** — In-app and push notification emission (queue-backed).
- **pushNotification** — FCM/push delivery.
- **email** — Email sending (e.g. SMTP).
- **otp** — OTP generation and verification (e.g. Twilio, or internal).
- **qr** — QR code generation.

**Why this design:**

- **Swap providers without touching business logic** — Replace Redis, S3, or email provider by changing only infra; app services keep the same API.
- **Single place for integration concerns** — Logging, retries, and error handling for external systems live in infra.
- **Testability** — App services can be unit-tested with mocked infra modules.

---

## Section 5 — How to Add a New Feature

Follow this workflow so new code respects layers:

1. **Add route** — In the appropriate file under `src/routes`, register method and path, attach auth/validation middleware, and bind to a controller function. No logic in the route file.
2. **Create controller (thin)** — In `src/controllers`, add a handler that reads `req` (user, params, body, query), calls one or more app service methods, and sends `res.status(result.statusCode).json(result.json)`. No models, no infra, no DB.
3. **Add app service (business logic)** — In `src/app/services` (or a domain subfolder), implement the use case: validation, orchestration, model access, and calls to core/infra where needed. Return a consistent shape (e.g. `{ statusCode, json }`) for the controller.
4. **Use core/infra if an external system is needed** — If the feature needs storage, email, push, realtime, or another external system, use or extend the appropriate module under `src/core/infra`. Do not require the provider (S3, Redis, etc.) directly in the app service.
5. **Use models only inside app service** — All DB reads/writes for this feature go in the app service (or in infra only when the integration explicitly needs DB, e.g. notification persistence).
6. **Never bypass layers** — Controllers do not call models or infra directly. Routes do not hold business or DB logic. Infra does not call app services or controllers.

---

## Section 6 — Anti-Patterns (Do Not Do)

| Action | Why it is dangerous |
|--------|----------------------|
| **Import models in controllers** | Couples HTTP to data layer; makes testing and reuse hard; breaks single responsibility. |
| **Use Redis directly in services** | Bypasses infra; makes swapping or mocking Redis difficult; duplicates connection/error handling. |
| **Call S3 from controllers** | Mixes HTTP with external I/O; prevents consistent error handling and testing. |
| **Put business logic in middleware** | Middleware becomes fat and domain-coupled; logic is not reusable and is hard to test. |
| **Use socket.io outside infra** | Only `core/infra/realtime` should require `socket.io`; elsewhere it breaks infra abstraction and lockdown. |
| **Re-create a legacy "services" layer** | The old `src/services/` as a mix of infra and business is retired; app logic lives in `app/services`, infra in `core/infra`. Reintroducing a parallel layer causes confusion and inconsistency. |
| **Put HTTP or response logic in app services** | App services must stay transport-agnostic (return data/status); controllers own `res.status().json()`. |
| **Import app services or controllers from core/infra** | Infra must not depend on app or HTTP layers; it is the bottom of the stack for external systems. |

---

## Section 7 — Testing Strategy

- **Controllers** — Light integration tests: given a request shape, assert that the correct app service is called and the response status/body match. Mock app services.
- **App services** — Unit tests: test business rules, validation, and workflows. Mock models and core/infra (e.g. storage, notificationEmitter, cache).
- **Core/infra** — Test with real or test doubles of the external system where useful; in app/service tests, **infra is mocked** so that tests are fast and stable and do not depend on Redis, S3, or Socket.IO.

---

## Section 8 — Future Expansion Rule

**Any new integration** (queue, email provider, payment gateway, AI service, etc.) **must** be implemented inside `src/core/infra` and exposed through a clear wrapper (e.g. a single module or a small set of functions). Business logic in app services must **not** depend on the concrete provider (e.g. Stripe, SendGrid, BullMQ) directly. The app service calls the infra wrapper; infra hides the provider and handles errors, retries, and logging.

---

## Section 9 — Architecture Status

Current state after refactoring:

- **Controllers are thin** — They only read `req`, call app services, and send responses.
- **Services contain business logic** — Domain and use-case logic live in `src/app/services`.
- **Infra is isolated** — External systems are accessed only via `src/core/infra`; socket.io, AWS SDK, ioredis, and fluent-ffmpeg are confined to infra (and config used by infra).
- **Legacy services layer removed** — No active dependency on the old `src/services/` for business or infra; app uses `app/services` and `core/infra`.
- **Clean layering enforced** — Route → Controller → App Service → Core/Infra → Models/DB is the rule.

**Warning:** If this structure is violated—e.g. models or infra in controllers, or business logic in routes or middleware—the system becomes harder to maintain, test, and scale. New features and changes must follow this guide.















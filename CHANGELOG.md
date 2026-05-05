# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.4] - 2026-05-05

### Added

- **Browser entry point** (`@featctrl/typescript/browser`) — exports `SseClient`, `FlagStore`,
  `createBrowserClient`, and all public types with zero Node.js dependencies.
- `createBrowserClient(config)` factory — creates a wired-up `SseClient` + `FlagStore` pair
  for browser environments. The caller supplies the SDK key explicitly (e.g. from
  `import.meta.env.VITE_FEATCTRL_SDK_KEY`).
- `SseClient.isReady` — boolean getter that is `true` once the first `flags.snapshot` has been
  received. Never resets to `false`.
- `SseClient.ready()` — returns a `Promise<void>` that resolves as soon as the first snapshot
  arrives, or resolves immediately (next microtask) if the snapshot has already been received.
- `SseClient.onFlagChanged(key, fn)` — per-flag subscription that fires only when the specific
  flag key is created or updated. Returns a unique `symbol` subscription token.
- `SseClient.unsubscribe(token)` — removes a listener previously registered with `onFlagChanged`.
  Designed for use in framework cleanup callbacks (e.g. `useEffect` teardown).

## [0.1.3] - 2026-04-29

### Added

- Automatic `.env` file loading: when `FEATCTRL_SDK_KEY` is absent from `process.env`, the SDK
  now reads `.env.local` then `.env` from the project root (`process.cwd()`) using the Node.js
  built-in `process.loadEnvFile()`. File-not-found and IO errors are silently swallowed.
  Compatible with the Vite / Next.js `.env` convention.

## [0.1.2] - 2026-04-29

### Changed

- `FlagStore.isEnabled(key)` now returns `undefined` (instead of `false`) when the key is not
  present in the store. Callers can use the `??` operator to supply a default:
  `flagStore.isEnabled('my-flag') ?? false`.
- `FlagStore.getConfig(key)` now returns `undefined` (instead of `null`) when the key is absent.

## [0.1.1] - 2026-04-27

### Added

- **Heartbeat watchdog**: reconnects automatically when no `heartbeat` event is received within
  the configured timeout. Configurable via `FEATCTRL_HEARTBEAT_WATCHDOG_SECS` (default: `120`).
- `SseClient.onWatchdogTimeout(fn)` listener — called when the watchdog fires before the client
  reconnects.
- **Snapshot mode**: set `FEATCTRL_MODE=snapshot` to disconnect automatically after the first
  `flags.snapshot` event. Useful for short-lived processes or batch jobs. The default mode
  `livestreaming` maintains a persistent SSE connection.
- **403 Forbidden handling**: when the server returns `403`, the client permanently disables
  retries and serves default flag values indefinitely.
- `SseClient.onForbidden(fn)` listener — called when a `403` response is received.
- `autoConnect` option on `SseClientConfig` — pass `false` to prevent the client from opening a
  connection on construction (useful in tests).
- `reconnect` SSE event handling — on graceful backend restarts, the client reconnects immediately
  and forwards the previous `connection_uuid` so the server can acknowledge the transfer.
- `FeatCtrlClient` and `FeatCtrlFlagStore` public TypeScript interfaces — the `sseClient` and
  `flagStore` singletons are now typed with these interfaces rather than their concrete classes.
- Migrated test suite from `node:test` to [Vitest](https://vitest.dev).

### Changed

- Node.js engine requirement tightened to `>=22 <25`.
- `SseClient._connect()` is now private; the connection is triggered automatically by the
  constructor (controlled by `autoConnect`).
- CI matrix restricted to the supported Node.js versions (22, 24).

### Fixed

- Reconnect timer is now properly cancelled before a new connection attempt, preventing duplicate
  reconnect loops.
- Watchdog timer is cleared in the `reconnect` event handler to prevent overlapping connection
  attempts.
- Mode log message (`[FeatCtrl] Running in X mode`) is now emitted only after the SDK key
  presence check, avoiding misleading output when the key is absent.
- Integration test: client is disconnected in a `finally` block to prevent timer leaks on timeout.

## [0.1.0] - 2026-04-27

### Added

- `SseClient` — SSE client for Node.js 22+. Uses the native `fetch` API with
  `response.body.getReader()` to consume the event stream. Supports exponential reconnect backoff
  (3 s → 30 s). Fluent `on*()` listener API with support for multiple subscribers:
  `onConnected`, `onDisconnected`, `onSnapshot`, `onFlagChanged`, `onFlagDeleted`.
- `FlagStore` — in-memory store updated by the SSE event stream. Methods: `isEnabled`,
  `getConfig`, `getAll`, `setSnapshot`, `applyChange`, `applyDelete`.
- `createDefaultClient(env?, autoConnect?)` factory — creates a `FlagStore` and, when
  `FEATCTRL_SDK_KEY` is present, a connected `SseClient` that keeps the store up to date.
- `flagStore` and `sseClient` module-level singletons, auto-started on import when
  `FEATCTRL_SDK_KEY` is set.
- `FEATCTRL_SDK_KEY` — required environment variable for the SDK key.
- `FEATCTRL_URL` — optional override for the FeatCtrl backend URL
  (default: `https://sdk.featctrl.com`).
- Graceful `disconnect()` — aborts the in-flight `fetch` and notifies the backend via
  `DELETE /disconnect`.
- Heartbeat acknowledgment — responds to `heartbeat` SSE events with `POST /heartbeat`.
- Integration test suite covering TSSDK-001 to TSSDK-006 (SSE connection, snapshot, store
  operations).
- CI workflow for automated testing on Node.js 22+.

[Unreleased]: https://github.com/featctrl/sdk-typescript/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/featctrl/sdk-typescript/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/featctrl/sdk-typescript/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/featctrl/sdk-typescript/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/featctrl/sdk-typescript/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/featctrl/sdk-typescript/releases/tag/v0.1.0


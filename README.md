# @featctrl/typescript

[![CI](https://github.com/featctrl/sdk-typescript/actions/workflows/ci.yml/badge.svg)](https://github.com/featctrl/sdk-typescript/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@featctrl/typescript)](https://www.npmjs.com/package/@featctrl/typescript)

Based on the common specifications [FeatCtrl SDK Specifications](https://github.com/featctrl/sdk-spec/).

Server-side TypeScript SDK for [FeatCtrl](https://www.featctrl.com) — feature flag management.

This package provides an **SSE client** that connects to `https://sdk.featctrl.com` and keeps an in-memory
flag store up to date in real time. It is framework-agnostic: use it standalone in any Node.js
process, pair it with other `@featctrl/*` plugins, or use it directly in the browser via the
`@featctrl/typescript/browser` entry point.

> **Node.js entry point** (`@featctrl/typescript`) — auto-starts from environment variables,
> loads `.env` files, and provides ready-to-use `flagStore` / `sseClient` singletons. Requires **Node.js ≥ 22**.
>
> **Browser entry point** (`@featctrl/typescript/browser`) — exports `SseClient` and `FlagStore`
> as plain classes with zero Node.js dependencies. You instantiate them yourself and supply the SDK key
> explicitly. **Never expose your SDK key in client-side code unless it is intended to be public.**

---

## Installation

```bash
npm install @featctrl/typescript
```

Requires **Node.js ≥ 22**.

---

## Quick start

```typescript
import { flagStore } from '@featctrl/typescript';

// The SDK auto-starts on import when FEATCTRL_SDK_KEY is set.
if (flagStore.isEnabled('new-checkout')) {
  // render new checkout flow
}
```

Environment variables used by the auto-start client:

| Variable                          | Required | Default                        | Description                                                                             |
|-----------------------------------|----------|--------------------------------|-----------------------------------------------------------------------------------------|
| `FEATCTRL_SDK_KEY`                | ✅ yes   | —                              | SDK key issued by FeatCtrl                                                              |
| `FEATCTRL_URL`                    | no       | `https://sdk.featctrl.com`     | Override the FeatCtrl backend URL                                                       |
| `FEATCTRL_MODE`                   | no       | `livestreaming`                | `livestreaming` (persistent SSE) or `snapshot` (connect once, then disconnect)          |
| `FEATCTRL_HEARTBEAT_WATCHDOG_SECS`| no       | `120`                          | Seconds without a heartbeat before the client reconnects automatically. Must be &gt; 0. |

### Automatic `.env` loading (Vite and similar frameworks)

When the SDK is imported, it checks whether `FEATCTRL_SDK_KEY` is already present in
`process.env`. If it is not, it automatically attempts to read the following files from the
**project root** (`process.cwd()`), in order of priority:

1. `.env.local` — local overrides, not committed to version control
2. `.env` — base configuration

This matches the Vite / Next.js convention. If neither file exists, or if they cannot be read,
the SDK silently continues — no error is thrown.

> **Vite server usage**: place your `FEATCTRL_SDK_KEY` (and any other `FEATCTRL_*` variables)
> in a `.env` or `.env.local` file at your Vite project root. The SDK will load them
> automatically before starting the SSE connection.

---

## Lifecycle hooks

Register listeners on `sseClient` to react to connection events and flag changes.
All `on*()` methods are chainable and support multiple listeners.

```typescript
import { sseClient } from '@featctrl/typescript';

sseClient
  ?.onConnected((connUuid, instUuid) => {
    console.log(`[FeatCtrl] connected conn=${connUuid} inst=${instUuid}`);
  })
  .onDisconnected(() => {
    console.log('[FeatCtrl] disconnected');
  })
  .onSnapshot((flags) => {
    console.log(`[FeatCtrl] snapshot — ${flags.size} flag(s)`);
  })
  .onFlagChanged((flag) => {
    console.log(`[FeatCtrl] flag updated: ${flag.key}`);
  })
  .onFlagDeleted((key) => {
    console.log(`[FeatCtrl] flag deleted: ${key}`);
  })
  .onWatchdogTimeout(() => {
    console.warn('[FeatCtrl] heartbeat watchdog timed out — reconnecting');
  })
  .onForbidden(() => {
    console.error('[FeatCtrl] 403 Forbidden — SDK key rejected, retries disabled');
  });

// On process shutdown:
process.on('SIGTERM', () => sseClient?.disconnect());
```

### Waiting for the first snapshot

`SseClient` exposes two readiness APIs:

| API | Type | Description |
|---|---|---|
| `client.isReady` | `boolean` | `true` once the first `flags.snapshot` has been received. Never resets to `false`. |
| `client.ready()` | `Promise<void>` | Resolves as soon as the first snapshot arrives. Resolves immediately (next microtask) if already ready. |

**`await` pattern** — useful at application startup to block until flags are available:

```typescript
import { sseClient, flagStore } from '@featctrl/typescript';

await sseClient?.ready();
// flagStore is now populated with the initial snapshot
const enabled = flagStore.isEnabled('new-checkout') ?? false;
```

**Boolean guard** — useful for synchronous checks deeper in your code:

```typescript
if (sseClient?.isReady) {
  // flags are available right now
}
```

> `ready()` is safe to call before auto-connect fires. It simply waits for the first
> `flags.snapshot` event regardless of when the connection is established.

---

## API reference

### `flagStore`

Always available, even when `FEATCTRL_SDK_KEY` is not set (returns safe defaults until connected).

| Method         | Signature                                 | Description                                              |
|----------------|-------------------------------------------|----------------------------------------------------------|
| `isEnabled`    | `(key: string) => boolean`                | Returns `true` if the flag is enabled, `false` otherwise |
| `getConfig<T>` | `(key: string) => T \| null`              | Returns the typed flag config or `null`                  |
| `getAll`       | `() => ReadonlyMap<string, FeatCtrlFlag>` | Read-only view of all flags                              |

### `sseClient`

`null` when `FEATCTRL_SDK_KEY` is not set. All `on*()` methods return `this` for chaining.

| Method              | Signature                                                      | Description                                                                              |
|---------------------|----------------------------------------------------------------|------------------------------------------------------------------------------------------|
| `onConnected`       | `(fn: (connUuid: string, instUuid: string) => void) => this`   | SSE connection established                                                               |
| `onDisconnected`    | `(fn: () => void) => this`                                     | Client disconnected                                                                      |
| `onSnapshot`        | `(fn: (flags: Map<string, FeatCtrlFlag>) => void) => this`     | Full flag snapshot received on connect                                                   |
| `onFlagChanged`     | `(fn: (flag: FeatCtrlFlag) => void) => this`                   | A flag was created or updated                                                            |
| `onFlagDeleted`     | `(fn: (key: string) => void) => this`                          | A flag was deleted                                                                       |
| `onWatchdogTimeout` | `(fn: () => void) => this`                                     | Heartbeat watchdog expired — the client is reconnecting                                  |
| `onForbidden`       | `(fn: () => void) => this`                                     | Server returned 403 — SDK key rejected, retries permanently disabled                     |
| `disconnect`        | `() => void`                                                   | Abort the connection and notify the backend                                              |
| `isReady`           | `boolean` (getter)                                             | `true` once the first flag snapshot has been received                                    |
| `ready`             | `() => Promise<void>`                                          | Resolves when the first snapshot arrives; resolves immediately if already ready          |

### `FeatCtrlFlag`

```typescript
interface FeatCtrlFlag {
  key: string;
  name: string;
  flag_type: 'boolean';
  enabled: boolean;
  config: Record<string, unknown> | null;
}
```

---

## Building

```bash
npm run build      # compile TypeScript → dist/
npm run typecheck  # type-check without emitting
```

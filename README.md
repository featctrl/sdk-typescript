# @featctrl/typescript

Based on the common specifications [FeatCtrl SDK Specifications](https://github.com/featctrl/sdk-spec/).

Server-side TypeScript SDK for [FeatCtrl](https://www.featctrl.com) — feature flag management.

This package provides a **Node.js SSE client** that connects to `https://sdk.featctrl.com` and keeps an in-memory
flag store up to date in real time. It is framework-agnostic: use it standalone in any Node.js
process, or pair it with other `@featctrl/*` plugins to expose flags to a TypeScript based application.

> **Important** — this package is designed for **Node.js server-side code only**.
> It uses the native Node.js 18+ `fetch` API with streaming and does **not** use
> the browser-only `EventSource` API. The SDK key must never be exposed to the browser.

---

## Installation

```bash
npm install @featctrl/typescript
```

Requires **Node.js ≥ 18**.

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

- `FEATCTRL_SDK_KEY` (required)
- `FEATCTRL_URL` (optional, defaults to `https://sdk.featctrl.com`)

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
  });

// On process shutdown:
process.on('SIGTERM', () => sseClient?.disconnect());
```

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

| Method           | Signature                                                      | Description                                |
|------------------|----------------------------------------------------------------|--------------------------------------------|
| `onConnected`    | `(fn: (connUuid: string, instUuid: string) => void) => this`   | SSE connection established                 |
| `onDisconnected` | `(fn: () => void) => this`                                     | Client disconnected                        |
| `onSnapshot`     | `(fn: (flags: Map<string, FeatCtrlFlag>) => void) => this`     | Full flag snapshot received on connect     |
| `onFlagChanged`  | `(fn: (flag: FeatCtrlFlag) => void) => this`                   | A flag was created or updated              |
| `onFlagDeleted`  | `(fn: (key: string) => void) => this`                          | A flag was deleted                         |
| `disconnect`     | `() => void`                                                   | Abort the connection and notify the backend|

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

import { SseClient } from '../client.js';
import { FlagStore } from '../store.js';

export interface BrowserClientConfig {
  /** SDK key for the target environment. Required. */
  sdkKey: string;
  /** Override the default SDK API URL. @default "https://sdk.featctrl.com" */
  sdkApiUrl?: string;
  /**
   * When `true` (default), the client connects automatically upon construction.
   * Pass `false` to delay connection (e.g. in tests).
   * @default true
   */
  autoConnect?: boolean;
  /**
   * Number of seconds to wait for a heartbeat before reconnecting.
   * @default 120
   */
  watchdogSecs?: number;
}

export interface BrowserClient {
  readonly client: SseClient;
  readonly store: FlagStore;
}

/**
 * Creates a wired-up `SseClient` + `FlagStore` pair for use in browser environments.
 *
 * The `SseClient` is configured in livestreaming mode and automatically keeps
 * the `FlagStore` up to date as flags are created, updated, or deleted.
 *
 * No `process.env` reading, no singletons, no `.env` file loading — the caller
 * is responsible for providing the SDK key (e.g. from `import.meta.env.VITE_FEATCTRL_SDK_KEY`).
 *
 * @example
 * ```typescript
 * import { createBrowserClient } from '@featctrl/typescript/browser';
 *
 * const { client, store } = createBrowserClient({
 *   sdkKey: import.meta.env.VITE_FEATCTRL_SDK_KEY,
 * });
 *
 * await client.ready();
 * console.log(store.isEnabled('my-flag'));
 * ```
 */
export function createBrowserClient(config: BrowserClientConfig): BrowserClient {
  const store = new FlagStore();
  const client = new SseClient({
    sdkKey: config.sdkKey,
    sdkApiUrl: config.sdkApiUrl,
    autoConnect: config.autoConnect,
    watchdogSecs: config.watchdogSecs,
    snapshotMode: false,
  });

  client
    .onSnapshot((flags) => store.setSnapshot(flags))
    .onFlagChanged((flag) => store.applyChange(flag))
    .onFlagDeleted((key) => store.applyDelete(key));

  return { client, store };
}


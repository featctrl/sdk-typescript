import { SseClient } from './client.js';
import { FlagStore } from './store.js';

const DEFAULT_SDK_API_URL = 'https://sdk.featctrl.com';

export type RuntimeEnv = Record<string, string | undefined>;

/**
 * Creates a FlagStore and, when `FEATCTRL_SDK_KEY` is present in `env`, a
 * connected SseClient that keeps the store up to date.
 *
 * Exported as a factory so it can be called in unit tests with a custom env
 * object without any ESM module-cache tricks.
 *
 * @param env - Key/value environment map (defaults to `process.env`).
 * @param autoConnect - When `true` (default) the client's `connect()` is called
 *                      immediately. Pass `false` in tests to avoid real network
 *                      activity.
 */
export function createDefaultClient(
  env: RuntimeEnv = (globalThis as { process?: { env?: RuntimeEnv } }).process?.env ?? {},
  autoConnect = true,
): { flagStore: FlagStore; sseClient: SseClient | null } {
  const sdkKey = env.FEATCTRL_SDK_KEY?.trim();
  const sdkApiUrl = env.FEATCTRL_URL?.trim() || DEFAULT_SDK_API_URL;

  const flagStore = new FlagStore();

  if (!sdkKey) {
    console.warn(
      '[FeatCtrl] WARNING: FEATCTRL_SDK_KEY is not set. ' +
      'The default SSE client will not start. ' +
      'Set the FEATCTRL_SDK_KEY environment variable.',
    );
    return { flagStore, sseClient: null };
  }

  const sseClient = new SseClient({ sdkApiUrl, sdkKey });
  sseClient
    .onSnapshot((flags) => flagStore.setSnapshot(flags))
    .onFlagChanged((flag) => flagStore.applyChange(flag))
    .onFlagDeleted((key) => flagStore.applyDelete(key));

  if (autoConnect) {
    void sseClient.connect().catch(() => undefined);
  }

  return { flagStore, sseClient };
}

// ── Module-level singleton ────────────────────────────────────────────────────

const { flagStore: _flagStore, sseClient: _sseClient } = createDefaultClient();

/** Shared in-memory flag store, kept up to date automatically when FEATCTRL_SDK_KEY is set. */
export const flagStore: FlagStore = _flagStore;

/**
 * SSE client started automatically when FEATCTRL_SDK_KEY is available.
 * It is `null` when the SDK key is not configured.
 */
export const sseClient: SseClient | null = _sseClient;

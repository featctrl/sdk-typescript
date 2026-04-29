/**
 * Unit tests for SseClient — 403 Forbidden handling.
 *
 * Uses Vitest with fake timers to avoid real waits.
 * Network activity is suppressed via vi.stubGlobal('fetch', ...).
 *
 * Run with:
 *   npm run test:unit
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SseClient } from '../../src/client.js';
import { FlagStore } from '../../src/store.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Return a minimal fetch stub that always resolves with the given status. */
function fetchReturning(status: number): typeof globalThis.fetch {
  return vi.fn(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      body: null,
    } as unknown as Response),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SseClient — 403 Forbidden handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('fires onForbidden listener when server returns 403', async () => {
    vi.stubGlobal('fetch', fetchReturning(403));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    let forbiddenCalled = false;
    const client = new SseClient({ sdkKey: 'sk_test_dummy' });
    client.onForbidden(() => { forbiddenCalled = true; });

    // Flush the floating _connect() promise (fetch resolves as a microtask).
    await vi.runAllTimersAsync();

    expect(forbiddenCalled).toBe(true);
  });

  it('logs a warning mentioning 403 Forbidden', async () => {
    vi.stubGlobal('fetch', fetchReturning(403));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const client = new SseClient({ sdkKey: 'sk_test_dummy' });
    client.onForbidden(() => {});

    await vi.runAllTimersAsync();

    const allWarnings = warnSpy.mock.calls.map((args) => args.join(' '));
    expect(allWarnings.some((w) => w.includes('403 Forbidden'))).toBe(true);
  });

  it('does not schedule a reconnect after 403', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({ ok: false, status: 403, statusText: '403', body: null } as unknown as Response),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    new SseClient({ sdkKey: 'sk_test_dummy' });

    // Flush the initial _connect(), then advance past the MAX_BACKOFF_MS to confirm
    // no reconnect timer was ever scheduled (fetch must be called exactly once).
    await vi.runAllTimersAsync();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

<<<<<<< release/0.1.2
  it('flagStore.isEnabled() returns undefined (key absent) after a 403', async () => {
=======
  it('flagStore.isEnabled() returns false (default) after a 403', async () => {
>>>>>>> main
    vi.stubGlobal('fetch', fetchReturning(403));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const flagStore = new FlagStore();
    const client = new SseClient({ sdkKey: 'sk_test_dummy' });
    client.onSnapshot((flags) => flagStore.setSnapshot(flags));

    await vi.runAllTimersAsync();

<<<<<<< release/0.1.2
    expect(flagStore.isEnabled('any-flag')).toBeUndefined();
=======
    expect(flagStore.isEnabled('any-flag')).toBe(false);
>>>>>>> main
  });

  it('disconnect() after 403 does not throw (silent no-op)', async () => {
    vi.stubGlobal('fetch', fetchReturning(403));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const client = new SseClient({ sdkKey: 'sk_test_dummy' });
    await vi.runAllTimersAsync();

    expect(() => {
      client.disconnect();
      client.disconnect();
    }).not.toThrow();
  });

  it('onForbidden supports multiple listeners', async () => {
    vi.stubGlobal('fetch', fetchReturning(403));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    let count = 0;
    const client = new SseClient({ sdkKey: 'sk_test_dummy' });
    client.onForbidden(() => { count++; });
    client.onForbidden(() => { count++; });

    await vi.runAllTimersAsync();

    expect(count).toBe(2);
  });
});


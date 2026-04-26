/**
 * Unit tests for SseClient — 403 Forbidden handling.
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies.
 * Network activity is suppressed by monkey-patching globalThis.fetch.
 *
 * Run with:
 *   node --import tsx/esm --test tests/unit/client.test.ts
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SseClient } from '../../src/client.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Replace globalThis.fetch with a stub for the duration of `fn`, then restore. */
async function withFetchStub(
  stub: typeof globalThis.fetch,
  fn: () => Promise<void>,
): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    await fn();
  } finally {
    globalThis.fetch = original;
  }
}

/** Return a minimal fetch stub that always resolves with the given status. */
function fetchReturning(status: number): typeof globalThis.fetch {
  return () =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      body: null,
    } as unknown as Response);
}

/** Suppress both console.warn and console.log during a block. */
async function suppressConsole(fn: () => Promise<void>): Promise<void> {
  const noop = () => {};
  const origWarn = console.warn;
  const origLog = console.log;
  console.warn = noop;
  console.log = noop;
  try {
    await fn();
  } finally {
    console.warn = origWarn;
    console.log = origLog;
  }
}

/** Capture console.warn calls during a block, then restore. */
async function captureWarnings(fn: () => Promise<void>): Promise<string[]> {
  const captured: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => captured.push(args.map(String).join(' '));
  try {
    await fn();
  } finally {
    console.warn = original;
  }
  return captured;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SseClient — 403 Forbidden handling', () => {
  it('fires onForbidden listener when server returns 403', async () => {
    let forbiddenCalled = false;

    await suppressConsole(async () => {
      await withFetchStub(fetchReturning(403), async () => {
        const client = new SseClient({ sdkKey: 'sk_test_dummy' });
        client.onForbidden(() => { forbiddenCalled = true; });
        // Yield to the event loop so the in-flight _connect() can complete.
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      });
    });

    assert.strictEqual(forbiddenCalled, true);
  });

  it('logs a warning mentioning 403 Forbidden', async () => {
    let warnings: string[] = [];

    await withFetchStub(fetchReturning(403), async () => {
      warnings = await captureWarnings(async () => {
        const client = new SseClient({ sdkKey: 'sk_test_dummy' });
        // Register a no-op listener to silence unused-variable lint hints.
        client.onForbidden(() => {});
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      });
    });

    assert.ok(
      warnings.some((w) => w.includes('403 Forbidden')),
      `Expected a warning about 403 Forbidden, got: ${JSON.stringify(warnings)}`,
    );
  });

  it('does not schedule a reconnect after 403', async () => {
    let connectCallCount = 0;

    await suppressConsole(async () => {
      await withFetchStub(() => {
        connectCallCount++;
        return Promise.resolve({
          ok: false,
          status: 403,
          statusText: '403',
          body: null,
        } as unknown as Response);
      }, async () => {
        new SseClient({ sdkKey: 'sk_test_dummy' });
        // Wait long enough that any reconnect timer would have fired (it shouldn't).
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      });
    });

    // fetch should have been called exactly once — no retry.
    assert.strictEqual(connectCallCount, 1);
  });

  it('flagStore.isEnabled() returns false (default) after a 403', async () => {
    const { FlagStore } = await import('../../src/store.js');
    const flagStore = new FlagStore();

    await suppressConsole(async () => {
      await withFetchStub(fetchReturning(403), async () => {
        const client = new SseClient({ sdkKey: 'sk_test_dummy' });
        client.onSnapshot((flags) => flagStore.setSnapshot(flags));
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      });
    });

    assert.strictEqual(flagStore.isEnabled('any-flag'), false);
  });

  it('disconnect() after 403 does not throw (silent no-op)', async () => {
    let client!: SseClient;

    await suppressConsole(async () => {
      await withFetchStub(fetchReturning(403), async () => {
        client = new SseClient({ sdkKey: 'sk_test_dummy' });
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      });
    });

    assert.doesNotThrow(() => {
      client.disconnect();
      client.disconnect();
    });
  });

  it('onForbidden supports multiple listeners', async () => {
    let count = 0;

    await suppressConsole(async () => {
      await withFetchStub(fetchReturning(403), async () => {
        const client = new SseClient({ sdkKey: 'sk_test_dummy' });
        client.onForbidden(() => { count++; });
        client.onForbidden(() => { count++; });
        await new Promise<void>((resolve) => setTimeout(resolve, 50));
      });
    });

    assert.strictEqual(count, 2);
  });
});


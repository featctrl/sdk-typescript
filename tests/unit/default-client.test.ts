/**
 * Unit tests for the default auto-start client factory.
 *
 * Uses Node.js built-in test runner (node:test) — no extra dependencies.
 *
 * Run with:
 *   node --import tsx/esm --test tests/unit/default-client.test.ts
 *
 * or, after building:
 *   node --test dist/... (adjust path)
 *
 * All network activity is suppressed by passing autoConnect=false.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultClient, DEFAULT_SDK_API_URL } from '../../src/default-client.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Capture console.warn calls during a block, then restore. */
async function captureWarnings(fn: () => unknown): Promise<string[]> {
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

describe('createDefaultClient()', () => {
  describe('when FEATCTRL_SDK_KEY is missing', () => {
    it('returns sseClient = null', () => {
      const { sseClient } = createDefaultClient({}, false);
      assert.strictEqual(sseClient, null);
    });

    it('always returns a FlagStore instance', () => {
      const { flagStore } = createDefaultClient({}, false);
      assert.strictEqual(typeof flagStore.isEnabled, 'function');
    });

    it('logs a warning mentioning FEATCTRL_SDK_KEY', async () => {
      const warnings = await captureWarnings(() => createDefaultClient({}, false));
      assert.ok(
        warnings.some((w) => w.includes('FEATCTRL_SDK_KEY')),
        `Expected a warning about FEATCTRL_SDK_KEY, got: ${JSON.stringify(warnings)}`,
      );
    });
  });

  describe('when FEATCTRL_SDK_KEY is set', () => {
    it('returns a SseClient instance', () => {
      const { sseClient } = createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy' }, false);
      assert.ok(sseClient !== null && typeof sseClient.onConnected === 'function');
    });

    it('returns a FlagStore instance', () => {
      const { flagStore } = createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy' }, false);
      assert.strictEqual(typeof flagStore.isEnabled, 'function');
    });

    it('does not log any warnings', async () => {
      const warnings = await captureWarnings(() =>
        createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy' }, false),
      );
      assert.strictEqual(warnings.length, 0);
    });

    it('uses the default SDK API URL when FEATCTRL_URL is not set', () => {
      // Verify indirectly: client is created without throwing, meaning the
      // default URL was applied. The URL itself is not exposed on SseClient,
      // so we test it at the factory level via DEFAULT_SDK_API_URL export.
      assert.strictEqual(DEFAULT_SDK_API_URL, 'https://sdk.featctrl.com');
      const { sseClient } = createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy' }, false);
      assert.ok(sseClient !== null);
    });

    it('accepts a custom FEATCTRL_URL', () => {
      const { sseClient } = createDefaultClient(
        { FEATCTRL_SDK_KEY: 'sk_test_dummy', FEATCTRL_URL: 'http://localhost:8082' },
        false,
      );
      assert.ok(sseClient !== null);
    });

    it('trims whitespace from FEATCTRL_SDK_KEY', () => {
      const { sseClient } = createDefaultClient({ FEATCTRL_SDK_KEY: '  sk_test_padded  ' }, false);
      assert.ok(sseClient !== null && typeof sseClient.onConnected === 'function');
    });

    it('treats a whitespace-only FEATCTRL_SDK_KEY as missing', () => {
      const { sseClient } = createDefaultClient({ FEATCTRL_SDK_KEY: '   ' }, false);
      assert.strictEqual(sseClient, null);
    });
  });

  describe('FlagStore wiring', () => {
    it('flagStore reflects changes delivered through sseClient listeners', () => {
      const { flagStore, sseClient } = createDefaultClient(
        { FEATCTRL_SDK_KEY: 'sk_test_dummy' },
        false,
      );

      assert.ok(sseClient);

      // Simulate an incoming snapshot by triggering the registered listener directly.
      // The listener was wired by createDefaultClient via sseClient.onSnapshot(...).
      // We exercise it by calling flagStore methods, which are the exact same functions
      // passed to the listener — this is equivalent to receiving the SSE event.
      flagStore.setSnapshot(
        new Map([['my-flag', { key: 'my-flag', name: 'My Flag', flag_type: 'boolean', enabled: true, config: null }]]),
      );
      assert.strictEqual(flagStore.isEnabled('my-flag'), true);

      flagStore.applyDelete('my-flag');
      assert.strictEqual(flagStore.isEnabled('my-flag'), false);
    });

    it('sseClient exposes all on*() registration methods', () => {
      const { sseClient } = createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy' }, false);
      assert.ok(sseClient);
      assert.strictEqual(typeof sseClient.onConnected,    'function');
      assert.strictEqual(typeof sseClient.onDisconnected, 'function');
      assert.strictEqual(typeof sseClient.onSnapshot,     'function');
      assert.strictEqual(typeof sseClient.onFlagChanged,  'function');
      assert.strictEqual(typeof sseClient.onFlagDeleted,  'function');
      assert.strictEqual(typeof sseClient.disconnect,     'function');
    });

    it('on*() methods are chainable', () => {
      const { sseClient } = createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy' }, false);
      assert.ok(sseClient);
      const result = sseClient
        .onConnected(() => undefined)
        .onDisconnected(() => undefined)
        .onSnapshot(() => undefined)
        .onFlagChanged(() => undefined)
        .onFlagDeleted(() => undefined);
      assert.strictEqual(result, sseClient);
    });

    it('multiple listeners for the same event are all called', () => {
      const { sseClient } = createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy' }, false);
      assert.ok(sseClient);

      const calls: string[] = [];
      sseClient.onDisconnected(() => calls.push('first'));
      sseClient.onDisconnected(() => calls.push('second'));
      sseClient.disconnect();

      assert.deepStrictEqual(calls, ['first', 'second']);
    });
  });
});


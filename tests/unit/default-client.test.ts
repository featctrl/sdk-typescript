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
import { createDefaultClient } from '../../src/default-client.js';

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

/** Capture console.log calls during a block, then restore. */
async function captureLogs(fn: () => unknown): Promise<string[]> {
  const captured: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => captured.push(args.map(String).join(' '));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return captured;
}

/** Suppress both console.warn and console.log during a block. */
async function suppressConsole(fn: () => unknown): Promise<void> {
  const noop = () => {};
  const origWarn = console.warn;
  const origLog = console.log;
  console.warn = noop;
  console.log = noop;
  try { await fn(); } finally {
    console.warn = origWarn;
    console.log = origLog;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createDefaultClient()', () => {
  describe('when FEATCTRL_SDK_KEY is missing', () => {
    it('returns sseClient = null', () => {
      let client: ReturnType<typeof createDefaultClient> | undefined;
      suppressConsole(() => { client = createDefaultClient({}, false); });
      assert.strictEqual(client!.sseClient, null);
    });

    it('always returns a FlagStore instance', () => {
      let client: ReturnType<typeof createDefaultClient> | undefined;
      suppressConsole(() => { client = createDefaultClient({}, false); });
      assert.strictEqual(typeof client!.flagStore.isEnabled, 'function');
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
      let client: ReturnType<typeof createDefaultClient> | undefined;
      suppressConsole(() => { client = createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy' }, false); });
      assert.ok(client!.sseClient !== null && typeof client!.sseClient.onConnected === 'function');
    });

    it('returns a FlagStore instance', () => {
      let client: ReturnType<typeof createDefaultClient> | undefined;
      suppressConsole(() => { client = createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy' }, false); });
      assert.strictEqual(typeof client!.flagStore.isEnabled, 'function');
    });

    it('does not log any warnings', async () => {
      const warnings = await captureWarnings(() =>
        suppressConsole(() => createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy' }, false)),
      );
      assert.strictEqual(warnings.length, 0);
    });

    it('accepts a custom FEATCTRL_URL', () => {
      let client: ReturnType<typeof createDefaultClient> | undefined;
      suppressConsole(() => {
        client = createDefaultClient(
          { FEATCTRL_SDK_KEY: 'sk_test_dummy', FEATCTRL_URL: 'http://localhost:8082' },
          false,
        );
      });
      assert.ok(client!.sseClient !== null);
    });

    it('trims whitespace from FEATCTRL_SDK_KEY', () => {
      let client: ReturnType<typeof createDefaultClient> | undefined;
      suppressConsole(() => {
        client = createDefaultClient({ FEATCTRL_SDK_KEY: '  sk_test_padded  ' }, false);
      });
      assert.ok(client!.sseClient !== null && typeof client!.sseClient.onConnected === 'function');
    });

    it('treats a whitespace-only FEATCTRL_SDK_KEY as missing', () => {
      let client: ReturnType<typeof createDefaultClient> | undefined;
      suppressConsole(() => {
        client = createDefaultClient({ FEATCTRL_SDK_KEY: '   ' }, false);
      });
      assert.strictEqual(client!.sseClient, null);
    });
  });

  describe('FEATCTRL_MODE', () => {
    it('logs "livestreaming mode" when FEATCTRL_MODE is unset', async () => {
      const logs = await captureLogs(() =>
        createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy' }, false),
      );
      assert.ok(
        logs.some((l) => l.includes('livestreaming mode')),
        `Expected a log about livestreaming mode, got: ${JSON.stringify(logs)}`,
      );
    });

    it('logs "snapshot mode" when FEATCTRL_MODE=snapshot', async () => {
      const logs = await captureLogs(() =>
        createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy', FEATCTRL_MODE: 'snapshot' }, false),
      );
      assert.ok(
        logs.some((l) => l.includes('snapshot mode')),
        `Expected a log about snapshot mode, got: ${JSON.stringify(logs)}`,
      );
    });

    it('logs "livestreaming mode" when FEATCTRL_MODE=livestreaming', async () => {
      const logs = await captureLogs(() =>
        createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy', FEATCTRL_MODE: 'livestreaming' }, false),
      );
      assert.ok(
        logs.some((l) => l.includes('livestreaming mode')),
        `Expected a log about livestreaming mode, got: ${JSON.stringify(logs)}`,
      );
    });

    it('warns and falls back to livestreaming on invalid FEATCTRL_MODE', async () => {
      let warnings: string[] = [];
      const logs = await captureLogs(async () => {
        warnings = await captureWarnings(() =>
          createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy', FEATCTRL_MODE: 'invalid_value' }, false),
        );
      });
      assert.ok(
        warnings.some((w) => w.includes('Invalid FEATCTRL_MODE')),
        `Expected a warning about invalid FEATCTRL_MODE, got: ${JSON.stringify(warnings)}`,
      );
      assert.ok(
        logs.some((l) => l.includes('livestreaming mode')),
        `Expected fallback log about livestreaming mode, got: ${JSON.stringify(logs)}`,
      );
    });

    it('disconnect() is idempotent — calling it twice does not throw', () => {
      let client: ReturnType<typeof createDefaultClient> | undefined;
      suppressConsole(() => {
        client = createDefaultClient(
          { FEATCTRL_SDK_KEY: 'sk_test_dummy', FEATCTRL_MODE: 'snapshot' },
          false,
        );
      });
      assert.doesNotThrow(() => {
        client!.sseClient?.disconnect();
        client!.sseClient?.disconnect();
      });
    });
  });
});


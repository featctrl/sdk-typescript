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
});


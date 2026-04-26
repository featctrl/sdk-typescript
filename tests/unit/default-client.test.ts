/**
 * Unit tests for the default auto-start client factory.
 *
 * Uses Vitest — no real network activity (autoConnect=false).
 *
 * Run with:
 *   npm run test:unit
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDefaultClient } from '../../src/default-client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createDefaultClient()', () => {
  describe('when FEATCTRL_SDK_KEY is missing', () => {
    it('returns sseClient = null', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const client = createDefaultClient({}, false);
      expect(client.sseClient).toBeNull();
    });

    it('always returns a FlagStore instance', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const client = createDefaultClient({}, false);
      expect(typeof client.flagStore.isEnabled).toBe('function');
    });

    it('logs a warning mentioning FEATCTRL_SDK_KEY', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      createDefaultClient({}, false);
      const allWarnings = warnSpy.mock.calls.map((args) => args.join(' '));
      expect(allWarnings.some((w) => w.includes('FEATCTRL_SDK_KEY'))).toBe(true);
    });
  });

  describe('when FEATCTRL_SDK_KEY is set', () => {
    it('returns a SseClient instance', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const client = createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy' }, false);
      expect(client.sseClient).not.toBeNull();
      expect(typeof client.sseClient!.onConnected).toBe('function');
    });

    it('returns a FlagStore instance', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const client = createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy' }, false);
      expect(typeof client.flagStore.isEnabled).toBe('function');
    });

    it('does not log any warnings', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy' }, false);
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('accepts a custom FEATCTRL_URL', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const client = createDefaultClient(
        { FEATCTRL_SDK_KEY: 'sk_test_dummy', FEATCTRL_URL: 'http://localhost:8082' },
        false,
      );
      expect(client.sseClient).not.toBeNull();
    });

    it('trims whitespace from FEATCTRL_SDK_KEY', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const client = createDefaultClient({ FEATCTRL_SDK_KEY: '  sk_test_padded  ' }, false);
      expect(client.sseClient).not.toBeNull();
      expect(typeof client.sseClient!.onConnected).toBe('function');
    });

    it('treats a whitespace-only FEATCTRL_SDK_KEY as missing', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const client = createDefaultClient({ FEATCTRL_SDK_KEY: '   ' }, false);
      expect(client.sseClient).toBeNull();
    });
  });

  describe('FEATCTRL_MODE', () => {
    it('logs "livestreaming mode" when FEATCTRL_MODE is unset', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy' }, false);
      const allLogs = logSpy.mock.calls.map((args) => args.join(' '));
      expect(allLogs.some((l) => l.includes('livestreaming mode'))).toBe(true);
    });

    it('logs "snapshot mode" when FEATCTRL_MODE=snapshot', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy', FEATCTRL_MODE: 'snapshot' }, false);
      const allLogs = logSpy.mock.calls.map((args) => args.join(' '));
      expect(allLogs.some((l) => l.includes('snapshot mode'))).toBe(true);
    });

    it('logs "livestreaming mode" when FEATCTRL_MODE=livestreaming', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy', FEATCTRL_MODE: 'livestreaming' }, false);
      const allLogs = logSpy.mock.calls.map((args) => args.join(' '));
      expect(allLogs.some((l) => l.includes('livestreaming mode'))).toBe(true);
    });

    it('warns and falls back to livestreaming on invalid FEATCTRL_MODE', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      createDefaultClient({ FEATCTRL_SDK_KEY: 'sk_test_dummy', FEATCTRL_MODE: 'invalid_value' }, false);
      const allWarnings = warnSpy.mock.calls.map((args) => args.join(' '));
      const allLogs = logSpy.mock.calls.map((args) => args.join(' '));
      expect(allWarnings.some((w) => w.includes('Invalid FEATCTRL_MODE'))).toBe(true);
      expect(allLogs.some((l) => l.includes('livestreaming mode'))).toBe(true);
    });

    it('disconnect() is idempotent — calling it twice does not throw', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const client = createDefaultClient(
        { FEATCTRL_SDK_KEY: 'sk_test_dummy', FEATCTRL_MODE: 'snapshot' },
        false,
      );
      expect(() => {
        client.sseClient?.disconnect();
        client.sseClient?.disconnect();
      }).not.toThrow();
    });
  });
});


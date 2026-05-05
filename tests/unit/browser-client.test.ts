/**
 * Unit tests for createBrowserClient() factory.
 *
 * All tests use `autoConnect: false` so no real network activity occurs.
 * Private _handleEvent is accessed via `(client as any)` for event simulation.
 *
 * Run with:
 *   npm run test:unit
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBrowserClient } from '../../src/browser/client.js';
import { SseClient } from '../../src/client.js';
import { FlagStore } from '../../src/store.js';
import type { FeatCtrlFlag } from '../../src/types.js';
// Shorthand: invoke the private _handleEvent on a client instance.
function handleEvent(client: SseClient, type: string, data: string): void {
  (client as unknown as { _handleEvent(t: string, d: string): void })._handleEvent(type, data);
}
// -- Setup / teardown ----------------------------------------------------------
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => { /* never resolves */ })));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
// -- Factory shape -------------------------------------------------------------
describe('createBrowserClient()', () => {
  it('returns an object with a client (SseClient) and a store (FlagStore)', () => {
    const { client, store } = createBrowserClient({ sdkKey: 'sk_test', autoConnect: false });
    expect(client).toBeInstanceOf(SseClient);
    expect(store).toBeInstanceOf(FlagStore);
  });
  it('returns a fresh independent pair on every call', () => {
    const first = createBrowserClient({ sdkKey: 'sk_test', autoConnect: false });
    const second = createBrowserClient({ sdkKey: 'sk_test', autoConnect: false });
    expect(first.client).not.toBe(second.client);
    expect(first.store).not.toBe(second.store);
  });
  describe('flags.snapshot event', () => {
    it('store.isEnabled(key) returns the correct value after a snapshot', () => {
      const { client, store } = createBrowserClient({ sdkKey: 'sk_test', autoConnect: false });
      const flag: FeatCtrlFlag = { key: 'dark-mode', name: 'Dark Mode', flag_type: 'boolean', enabled: true, config: null };
      handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [flag] }));
      expect(store.isEnabled('dark-mode')).toBe(true);
    });
    it('store.isEnabled returns false for a disabled flag in the snapshot', () => {
      const { client, store } = createBrowserClient({ sdkKey: 'sk_test', autoConnect: false });
      const flag: FeatCtrlFlag = { key: 'beta', name: 'Beta', flag_type: 'boolean', enabled: false, config: null };
      handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [flag] }));
      expect(store.isEnabled('beta')).toBe(false);
    });
    it('store.isEnabled returns undefined for a key not in the snapshot', () => {
      const { client, store } = createBrowserClient({ sdkKey: 'sk_test', autoConnect: false });
      handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [] }));
      expect(store.isEnabled('nonexistent')).toBeUndefined();
    });
  });
  describe('flag.changed event', () => {
    it('store.isEnabled(key) reflects the update after flag.changed', () => {
      const { client, store } = createBrowserClient({ sdkKey: 'sk_test', autoConnect: false });
      const initial: FeatCtrlFlag = { key: 'feature-x', name: 'Feature X', flag_type: 'boolean', enabled: false, config: null };
      handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [initial] }));
      expect(store.isEnabled('feature-x')).toBe(false);
      const updated: FeatCtrlFlag = { ...initial, enabled: true };
      handleEvent(client, 'flag.changed', JSON.stringify(updated));
      expect(store.isEnabled('feature-x')).toBe(true);
    });
    it('adds a new flag to the store on flag.changed', () => {
      const { client, store } = createBrowserClient({ sdkKey: 'sk_test', autoConnect: false });
      handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [] }));
      const newFlag: FeatCtrlFlag = { key: 'new-flag', name: 'New Flag', flag_type: 'boolean', enabled: true, config: null };
      handleEvent(client, 'flag.changed', JSON.stringify(newFlag));
      expect(store.isEnabled('new-flag')).toBe(true);
    });
  });
  describe('flag.deleted event', () => {
    it('store.isEnabled(key) returns undefined after flag.deleted', () => {
      const { client, store } = createBrowserClient({ sdkKey: 'sk_test', autoConnect: false });
      const flag: FeatCtrlFlag = { key: 'temp-flag', name: 'Temp Flag', flag_type: 'boolean', enabled: true, config: null };
      handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [flag] }));
      expect(store.isEnabled('temp-flag')).toBe(true);
      handleEvent(client, 'flag.deleted', JSON.stringify({ key: 'temp-flag' }));
      expect(store.isEnabled('temp-flag')).toBeUndefined();
    });
  });
  describe('client.ready()', () => {
    it('resolves after the first snapshot', async () => {
      const { client } = createBrowserClient({ sdkKey: 'sk_test', autoConnect: false });
      let resolved = false;
      const p = client.ready().then(() => { resolved = true; });
      expect(resolved).toBe(false);
      handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [] }));
      await p;
      expect(resolved).toBe(true);
    });
    it('resolves immediately if the snapshot was already received', async () => {
      const { client } = createBrowserClient({ sdkKey: 'sk_test', autoConnect: false });
      handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [] }));
      await expect(client.ready()).resolves.toBeUndefined();
    });
  });
  describe('autoConnect: false', () => {
    it('does not start the SSE connection (fetch is never called)', async () => {
      const fetchMock = vi.mocked(globalThis.fetch);
      createBrowserClient({ sdkKey: 'sk_test', autoConnect: false });
      await vi.runAllTimersAsync();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
  describe('browser-safe construction', () => {
    it('accepts a custom sdkApiUrl without throwing', () => {
      expect(() =>
        createBrowserClient({ sdkKey: 'sk_test', sdkApiUrl: 'https://custom.example.com', autoConnect: false }),
      ).not.toThrow();
    });
    it('accepts a custom watchdogSecs without throwing', () => {
      expect(() =>
        createBrowserClient({ sdkKey: 'sk_test', watchdogSecs: 60, autoConnect: false }),
      ).not.toThrow();
    });
  });
});

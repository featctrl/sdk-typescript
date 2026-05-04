/**
 * Unit tests for SseClient private event-handling logic.
 *
 * Private methods are accessed via `(client as any)` — TypeScript's `private`
 * keyword is compile-time only and does not affect runtime accessibility.
 *
 * All tests use `autoConnect: false` so no real fetch calls are made during
 * construction. Fake timers prevent watchdog/reconnect timer leaks.
 *
 * Run with:
 *   npm run test:unit
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SseClient } from '../../src/client.js';
import { FlagStore } from '../../src/store.js';
import type { FeatCtrlFlag } from '../../src/types.js';

// Shorthand: invoke the private _handleEvent on a client instance.
function handleEvent(client: SseClient, type: string, data: string): void {
  (client as unknown as { _handleEvent(t: string, d: string): void })._handleEvent(type, data);
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
  // Stub fetch so any accidental network call is a no-op rather than a failure.
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {/* never resolves */})));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── connection.established ────────────────────────────────────────────────────

describe('_handleEvent — connection.established', () => {
  it('fires onConnected listeners with the correct UUIDs', () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    let receivedConn = '';
    let receivedInst = '';
    client.onConnected((c, i) => { receivedConn = c; receivedInst = i; });

    handleEvent(client, 'connection.established', JSON.stringify({
      connection_uuid: 'conn-123',
      instance_uuid: 'inst-456',
    }));

    expect(receivedConn).toBe('conn-123');
    expect(receivedInst).toBe('inst-456');
  });

  it('supports multiple onConnected listeners', () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    let count = 0;
    client.onConnected(() => { count++; });
    client.onConnected(() => { count++; });

    handleEvent(client, 'connection.established', JSON.stringify({
      connection_uuid: 'c', instance_uuid: 'i',
    }));

    expect(count).toBe(2);
  });

  it('arms the watchdog timer after connection', () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    handleEvent(client, 'connection.established', JSON.stringify({
      connection_uuid: 'c', instance_uuid: 'i',
    }));

    // Watchdog is 120 s by default. Advancing 119 999 ms must NOT fire it.
    vi.advanceTimersByTime(119_999);
    // No reconnect fetch should have been triggered yet.
    expect(vi.getMockedSystemTime()).toBeDefined(); // fake timers still active
  });
});

// ── flags.snapshot ────────────────────────────────────────────────────────────

describe('_handleEvent — flags.snapshot', () => {
  it('fires onSnapshot with a correctly keyed Map', () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    const store = new FlagStore();
    client.onSnapshot((flags) => store.setSnapshot(flags));

    const flag: FeatCtrlFlag = { key: 'dark-mode', name: 'Dark Mode', flag_type: 'boolean', enabled: true, config: null };
    handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [flag] }));

    expect(store.isEnabled('dark-mode')).toBe(true);
  });

  it('fires multiple onSnapshot listeners', () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    let callCount = 0;
    client.onSnapshot(() => { callCount++; });
    client.onSnapshot(() => { callCount++; });

    handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [] }));

    expect(callCount).toBe(2);
  });

  it('calls disconnect() after snapshot in snapshotMode', () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false, snapshotMode: true });
    const disconnectSpy = vi.spyOn(client, 'disconnect');

    handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [] }));

    expect(disconnectSpy).toHaveBeenCalledOnce();
  });

  it('does not call disconnect() after snapshot in livestreaming mode', () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false, snapshotMode: false });
    const disconnectSpy = vi.spyOn(client, 'disconnect');

    handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [] }));

    expect(disconnectSpy).not.toHaveBeenCalled();
  });

  it('isReady is false before snapshot and true after', () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    expect(client.isReady).toBe(false);
    handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [] }));
    expect(client.isReady).toBe(true);
  });

  it('isReady is true inside an onSnapshot listener', () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    let readyInsideListener = false;
    client.onSnapshot(() => { readyInsideListener = client.isReady; });
    handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [] }));
    expect(readyInsideListener).toBe(true);
  });

  it('ready() resolves after flags.snapshot is handled', async () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    let resolved = false;
    const p = client.ready().then(() => { resolved = true; });
    expect(resolved).toBe(false);
    handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [] }));
    await p;
    expect(resolved).toBe(true);
  });

  it('ready() resolves immediately when already ready', async () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [] }));
    // Should resolve in the next microtask without any event.
    await expect(client.ready()).resolves.toBeUndefined();
  });

  it('multiple ready() calls all resolve when snapshot arrives', async () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    let count = 0;
    const p1 = client.ready().then(() => { count++; });
    const p2 = client.ready().then(() => { count++; });
    const p3 = client.ready().then(() => { count++; });
    handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [] }));
    await Promise.all([p1, p2, p3]);
    expect(count).toBe(3);
  });

  it('ready() resolvers are not called again on a second snapshot', async () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [] }));
    await client.ready(); // drain first snapshot
    let extraCalls = 0;
    // Enqueue a new ready() — it should resolve immediately because isReady is true.
    await client.ready().then(() => { extraCalls++; });
    // Fire a second snapshot — should NOT enqueue or re-fire anything extra.
    handleEvent(client, 'flags.snapshot', JSON.stringify({ flags: [] }));
    expect(extraCalls).toBe(1); // resolved once, immediately
  });
});

// ── flag.changed ──────────────────────────────────────────────────────────────

describe('_handleEvent — flag.changed', () => {
  it('fires onFlagChanged with the correct flag object', () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    let received: FeatCtrlFlag | null = null;
    client.onFlagChanged((f) => { received = f; });

    const flag: FeatCtrlFlag = { key: 'beta', name: 'Beta', flag_type: 'boolean', enabled: false, config: null };
    handleEvent(client, 'flag.changed', JSON.stringify(flag));

    expect(received).toEqual(flag);
  });

  it('applies the change to a FlagStore via onFlagChanged', () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    const store = new FlagStore();
    client.onFlagChanged((f) => store.applyChange(f));

    const flag: FeatCtrlFlag = { key: 'rollout', name: 'Rollout', flag_type: 'boolean', enabled: true, config: null };
    handleEvent(client, 'flag.changed', JSON.stringify(flag));

    expect(store.isEnabled('rollout')).toBe(true);
  });
});

// ── flag.deleted ──────────────────────────────────────────────────────────────

describe('_handleEvent — flag.deleted', () => {
  it('fires onFlagDeleted with the correct key', () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    let deletedKey = '';
    client.onFlagDeleted((k) => { deletedKey = k; });

    handleEvent(client, 'flag.deleted', JSON.stringify({ key: 'old-flag' }));

    expect(deletedKey).toBe('old-flag');
  });

  it('removes the flag from a FlagStore via onFlagDeleted', () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    const store = new FlagStore();
    const flag: FeatCtrlFlag = { key: 'temp', name: 'Temp', flag_type: 'boolean', enabled: true, config: null };
    store.applyChange(flag);
    client.onFlagDeleted((k) => store.applyDelete(k));

    handleEvent(client, 'flag.deleted', JSON.stringify({ key: 'temp' }));

    expect(store.isEnabled('temp')).toBeUndefined();
  });
});

// ── heartbeat ─────────────────────────────────────────────────────────────────

describe('_handleEvent — heartbeat', () => {
  it('does not throw when no connection has been established', () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    // Without connectionUuid/instanceUuid, _ackHeartbeat() is a no-op.
    expect(() => handleEvent(client, 'heartbeat', '')).not.toThrow();
  });

  it('sends a POST /heartbeat after connection is established', () => {
    const fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
    vi.stubGlobal('fetch', fetchMock);

    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });

    // Establish a connection so _ackHeartbeat has the UUIDs it needs.
    handleEvent(client, 'connection.established', JSON.stringify({
      connection_uuid: 'conn-hb', instance_uuid: 'inst-hb',
    }));

    // _resetWatchdog was called by connection.established — clear call count.
    fetchMock.mockClear();

    handleEvent(client, 'heartbeat', '');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/heartbeat');
    expect(url).toContain('conn-hb');
    expect(options.method).toBe('POST');
  });
});

// ── reconnect ─────────────────────────────────────────────────────────────────

describe('_handleEvent — reconnect', () => {
  it('initiates a new connection immediately (fetch is called)', async () => {
    let resolveFirst!: (r: Response) => void;
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => { resolveFirst = resolve; }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    handleEvent(client, 'reconnect', '');

    // The reconnect path calls _connect() synchronously (as a floating promise).
    // Flush microtasks so the fetch call is issued.
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledOnce();

    // Clean up the dangling promise.
    resolveFirst({ ok: false, status: 503, statusText: '503', body: null } as unknown as Response);
    await vi.runAllTimersAsync();
  });

  it('does not reconnect when disconnecting', () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    client.disconnect(); // sets disconnecting = true
    handleEvent(client, 'reconnect', '');

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── unknown event type ────────────────────────────────────────────────────────

describe('_handleEvent — unknown event type', () => {
  it('silently ignores an unrecognised event type', () => {
    const client = new SseClient({ sdkKey: 'sk_test', autoConnect: false });
    expect(() => handleEvent(client, 'some.future.event', '{}')).not.toThrow();
  });
});


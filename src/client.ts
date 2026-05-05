import type { FeatCtrlFlag } from './types.js';

/** Configuration for the SSE client. */
interface SseClientConfig {
  /** Base URL of the FeatCtrl backend. @default "https://sdk.featctrl.com" */
  sdkApiUrl?: string;
  sdkKey: string;
  /**
   * When `true`, the client disconnects automatically after receiving the first
   * `flags.snapshot` event and does not reconnect. Suitable for short-lived
   * processes or batch jobs. @default false
   */
  snapshotMode?: boolean;
  /**
   * When `true` (default), the client connects automatically upon construction.
   * Pass `false` to disable automatic connection and keep networking off
   * (for example, in tests to avoid real network activity).
   * @default true
   */
  autoConnect?: boolean;
  /**
   * Number of seconds to wait for a heartbeat before assuming the connection
   * has stalled and reconnecting. @default 120
   */
  watchdogSecs?: number;
}

const DEFAULT_SDK_API_URL = 'https://sdk.featctrl.com';
const INITIAL_BACKOFF_MS = 3_000;
const MAX_BACKOFF_MS = 30_000;
const DEFAULT_HEARTBEAT_WATCHDOG_SECS = 120;

/**
 * SSE client for Node.js 22+.
 *
 * Uses the native `fetch` API with `response.body.getReader()` to consume the
 * server-sent event stream. Listeners are registered via `on*()` methods and
 * support multiple subscribers.
 */
export class SseClient {
  private readonly sdkApiUrl: string;
  private readonly sdkKey: string;
  private readonly _watchdogSecs: number;
  private readonly _snapshotMode: boolean;

  private abortController: AbortController | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionUuid: string | null = null;
  private instanceUuid: string | null = null;
  private backoffMs = INITIAL_BACKOFF_MS;
  private disconnecting = false;
  private permanentlyStopped = false;
  private _isReady = false;
  private _readyResolvers: Array<() => void> = [];

  // ── Listener registries ───────────────────────────────────────────────────

  private _connectedListeners:         Array<(connUuid: string, instUuid: string) => void> = [];
  private _disconnectedListeners:      Array<() => void> = [];
  private _snapshotListeners:          Array<(flags: Map<string, FeatCtrlFlag>) => void> = [];
  private _flagChangedListeners:       Array<(flag: FeatCtrlFlag) => void> = [];
  private _flagKeyListeners:           Map<string, Array<(flag: FeatCtrlFlag) => void>> = new Map();
  private _flagKeyTokens:              Map<symbol, { key: string; fn: (flag: FeatCtrlFlag) => void }> = new Map();
  private _flagDeletedListeners:       Array<(key: string) => void> = [];
  private _watchdogTimeoutListeners:   Array<() => void> = [];
  private _forbiddenListeners:         Array<() => void> = [];

  constructor(config: SseClientConfig) {
    this.sdkApiUrl = config.sdkApiUrl?.replace(/\/$/, '') ?? DEFAULT_SDK_API_URL;
    this.sdkKey = config.sdkKey;
    this._snapshotMode = config.snapshotMode ?? false;
    this._watchdogSecs = config.watchdogSecs ?? DEFAULT_HEARTBEAT_WATCHDOG_SECS;

    if (config.autoConnect !== false) {
      void this._connect().catch(() => undefined);
    }
  }

  // ── Public listener registration ─────────────────────────────────────────

  /** Register a listener called when the SSE connection is established. Chainable. */
  onConnected(fn: (connUuid: string, instUuid: string) => void): this {
    this._connectedListeners.push(fn);
    return this;
  }

  /** Register a listener called when the client disconnects. Chainable. */
  onDisconnected(fn: () => void): this {
    this._disconnectedListeners.push(fn);
    return this;
  }

  /** Register a listener called once on connection with the full flag snapshot. Chainable. */
  onSnapshot(fn: (flags: Map<string, FeatCtrlFlag>) => void): this {
    this._snapshotListeners.push(fn);
    return this;
  }

  /** Register a listener called when any flag is created or updated. Chainable. */
  onFlagChanged(fn: (flag: FeatCtrlFlag) => void): this;
  /**
   * Register a listener scoped to a single flag key.
   * Only fires for that specific key — other flag changes are ignored.
   *
   * Returns a unique subscription token. Pass it to `unsubscribe()` to remove
   * the listener (e.g. in a `useEffect` cleanup).
   */
  onFlagChanged(key: string, fn: (flag: FeatCtrlFlag) => void): symbol;
  onFlagChanged(keyOrFn: string | ((flag: FeatCtrlFlag) => void), fn?: (flag: FeatCtrlFlag) => void): this | symbol {
    if (typeof keyOrFn === 'string') {
      const key = keyOrFn;
      if (!this._flagKeyListeners.has(key)) {
        this._flagKeyListeners.set(key, []);
      }
      this._flagKeyListeners.get(key)!.push(fn!);
      const token = Symbol();
      this._flagKeyTokens.set(token, { key, fn: fn! });
      return token;
    }
    this._flagChangedListeners.push(keyOrFn);
    return this;
  }

  /**
   * Remove a per-flag listener previously registered with `onFlagChanged(key, fn)`.
   * The token returned by `onFlagChanged` uniquely identifies the subscription.
   */
  unsubscribe(token: symbol): void {
    const entry = this._flagKeyTokens.get(token);
    if (!entry) return;
    this._flagKeyTokens.delete(token);
    const listeners = this._flagKeyListeners.get(entry.key);
    if (listeners) {
      const idx = listeners.indexOf(entry.fn);
      if (idx !== -1) listeners.splice(idx, 1);
    }
  }

  /** Register a listener called when a flag is deleted. Chainable. */
  onFlagDeleted(fn: (key: string) => void): this {
    this._flagDeletedListeners.push(fn);
    return this;
  }

  /** Register a listener called when the heartbeat watchdog timer expires. Chainable. */
  onWatchdogTimeout(fn: () => void): this {
    this._watchdogTimeoutListeners.push(fn);
    return this;
  }

  /**
   * Register a listener called when the server returns 403 Forbidden.
   * After this event, the client will never reconnect — default flag values
   * are served indefinitely. Chainable.
   */
  onForbidden(fn: () => void): this {
    this._forbiddenListeners.push(fn);
    return this;
  }

  // ── Readiness ─────────────────────────────────────────────────────────────

  /**
   * `true` once the first `flags.snapshot` event has been received.
   * `false` before the initial snapshot arrives.
   */
  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * Returns a `Promise<void>` that resolves as soon as the first
   * `flags.snapshot` has been received. If the snapshot has already arrived,
   * the promise resolves immediately (next microtask).
   *
   * Safe to call at any point — before or after `autoConnect` fires.
   *
   * ```ts
   * await client.ready();
   * const enabled = store.isEnabled('my-flag') ?? false;
   * ```
   */
  ready(): Promise<void> {
    if (this._isReady) return Promise.resolve();
    return new Promise<void>((resolve) => {
      this._readyResolvers.push(resolve);
    });
  }

  // ── Connection lifecycle ──────────────────────────────────────────────────

  /**
   * Open the SSE connection to the FeatCtrl backend.
   *
   * @param previousUuid - Connection UUID from a previous session, passed to the
   *                       FeatCtrl backend for graceful transfer acknowledgement.
   */
  private async _connect(previousUuid?: string): Promise<void> {
    this.disconnecting = false;

    // Cancel any pending reconnect timer before opening a new connection.
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const url = new URL(`${this.sdkApiUrl}/sse`);
    url.searchParams.set('sdk_key', this.sdkKey);
    if (previousUuid) {
      url.searchParams.set('connection_uuid', previousUuid);
    }

    this.abortController = new AbortController();

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        headers: { Accept: 'text/event-stream', 'Cache-Control': 'no-cache',},
        signal: this.abortController.signal,
      });
    } catch {
      if (this.disconnecting) return;
      this._scheduleReconnect();
      return;
    }

    if (!response.ok || !response.body) {
      if (response.status === 403) {
        console.warn(
          '[FeatCtrl] Received 403 Forbidden — SDK key not recognized by the server. ' +
          'Retries permanently disabled. Default flag values will be served indefinitely.',
        );
        this.permanentlyStopped = true;
        this.abortController?.abort();
        this.abortController = null;
        this._forbiddenListeners.forEach((fn) => fn());
        return;
      }
      console.log('[FeatCtrl] Bad response:', response.status, response.statusText);
      if (this.disconnecting) return;
      this._scheduleReconnect();
      return;
    }

    // Connection succeeded — reset backoff.
    this.backoffMs = INITIAL_BACKOFF_MS;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventType = '';
    let eventData = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          this._clearWatchdog();
          // Stream ended cleanly — reconnect unless we are shutting down.
          if (!this.disconnecting && !this.permanentlyStopped) {
            this._connect(this.connectionUuid ?? undefined).catch(() => undefined);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        // Keep the last (potentially incomplete) line in the buffer.
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line === '') {
            // Blank line — flush the current event.
            if (eventType) {
              this._handleEvent(eventType, eventData);
            }
            eventType = '';
            eventData = '';
          } else if (line.startsWith('event:')) {
            eventType = line.slice('event:'.length).trim();
          } else if (line.startsWith('data:')) {
            eventData = line.slice('data:'.length).trim();
          }
          // Lines starting with ':' are SSE comments — ignore them.
        }
      }
    } catch {
      this._clearWatchdog();
      try {
        await reader.cancel();
      } catch {
        // Ignore reader cancellation failures during reconnect cleanup.
      }
      this.abortController?.abort();
      this.abortController = null;
      if (this.disconnecting || this.permanentlyStopped) return;
      this._scheduleReconnect();
    }
  }

  /** Gracefully disconnect from the FeatCtrl backend and notify the server. */
  disconnect(): void {
    if (this.disconnecting || this.permanentlyStopped) return;
    this.disconnecting = true;

    // Cancel any pending reconnect timer.
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this._clearWatchdog();
    this._disconnectedListeners.forEach((fn) => fn());

    const connUuid = this.connectionUuid;
    const instUuid = this.instanceUuid;

    // Abort the in-flight fetch.
    this.abortController?.abort();
    this.abortController = null;

    // Best-effort DELETE /disconnect — do not throw on failure.
    if (connUuid && instUuid) {
      const disconnectUrl = `${this.sdkApiUrl}/disconnect?connection_uuid=${connUuid}&instance_uuid=${instUuid}`;
      fetch(disconnectUrl, { method: 'DELETE' }).catch(() => undefined);
    }

    this.connectionUuid = null;
    this.instanceUuid = null;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _handleEvent(type: string, data: string): void {
    switch (type) {
      case 'connection.established': {
        const parsed = JSON.parse(data) as { connection_uuid: string; instance_uuid: string };
        this.connectionUuid = parsed.connection_uuid;
        this.instanceUuid = parsed.instance_uuid;
        this._resetWatchdog();
        this._connectedListeners.forEach((fn) => fn(parsed.connection_uuid, parsed.instance_uuid));
        break;
      }

      case 'flags.snapshot': {
        const parsed = JSON.parse(data) as { flags: FeatCtrlFlag[] };
        const map = new Map<string, FeatCtrlFlag>(parsed.flags.map((f) => [f.key, f]));
        if (!this._isReady) {
          this._isReady = true;
          const resolvers = this._readyResolvers;
          this._readyResolvers = [];
          resolvers.forEach((fn) => fn());
        }
        this._snapshotListeners.forEach((fn) => fn(map));
        if (this._snapshotMode) {
          this.disconnect();
        }
        break;
      }

      case 'flag.changed': {
        const flag = JSON.parse(data) as FeatCtrlFlag;
        this._flagChangedListeners.forEach((fn) => fn(flag));
        this._flagKeyListeners.get(flag.key)?.forEach((fn) => fn(flag));
        break;
      }

      case 'flag.deleted': {
        const parsed = JSON.parse(data) as { key: string };
        this._flagDeletedListeners.forEach((fn) => fn(parsed.key));
        break;
      }

      case 'heartbeat': {
        // Data is intentionally empty — do not attempt JSON.parse("").
        this._ackHeartbeat();
        break;
      }

      case 'reconnect': {
        // The FeatCtrl backend is doing a graceful shutdown.  Reconnect and pass the old
        // connection UUID so the server can publish the transfer ack.
        const oldConnUuid = this.connectionUuid;
        this._clearWatchdog();
        this.abortController?.abort();
        this.abortController = null;
        if (!this.disconnecting) {
          this._connect(oldConnUuid ?? undefined).catch(() => undefined);
        }
        break;
      }

      default:
        // Unknown event type — ignore silently.
        break;
    }
  }

  private _ackHeartbeat(): void {
    if (!this.connectionUuid || !this.instanceUuid) return;
    const url = `${this.sdkApiUrl}/heartbeat?connection_uuid=${this.connectionUuid}&instance_uuid=${this.instanceUuid}`;
    fetch(url, { method: 'POST' }).catch(() => undefined);
    this._resetWatchdog();
  }

  private _scheduleReconnect(): void {
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.disconnecting) {
        this._connect().catch(() => undefined);
      }
    }, delay);
  }

  private _clearWatchdog(): void {
    if (this._watchdogTimer !== null) {
      clearTimeout(this._watchdogTimer);
      this._watchdogTimer = null;
    }
  }

  private _resetWatchdog(): void {
    this._clearWatchdog();
    this._watchdogTimer = setTimeout(() => {
      this._watchdogTimer = null;
      if (this.disconnecting) return;
      const savedUuid = this.connectionUuid;
      this._watchdogTimeoutListeners.forEach((fn) => fn());
      this.abortController?.abort();
      this.abortController = null;
      this._connect(savedUuid ?? undefined).catch(() => undefined);
    }, this._watchdogSecs * 1_000);
  }
}

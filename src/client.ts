import type { FeatCtrlFlag } from './types.js';

/** Configuration for the SSE client. */
interface SseClientConfig {
  /** Base URL of the FeatCtrl backend. @default "https://sdk.featctrl.com" */
  sdkApiUrl?: string;
  sdkKey: string;
}

const DEFAULT_SDK_API_URL = 'https://sdk.featctrl.com';
const INITIAL_BACKOFF_MS = 3_000;
const MAX_BACKOFF_MS = 30_000;

/**
 * SSE client for Node.js 18+.
 *
 * Uses the native `fetch` API with `response.body.getReader()` to consume the
 * server-sent event stream. Listeners are registered via `on*()` methods and
 * support multiple subscribers.
 */
export class SseClient {
  private readonly sdkApiUrl: string;
  private readonly sdkKey: string;

  private abortController: AbortController | null = null;
  private connectionUuid: string | null = null;
  private instanceUuid: string | null = null;
  private backoffMs = INITIAL_BACKOFF_MS;
  private disconnecting = false;

  // ── Listener registries ───────────────────────────────────────────────────

  private _connectedListeners:    Array<(connUuid: string, instUuid: string) => void> = [];
  private _disconnectedListeners: Array<() => void> = [];
  private _snapshotListeners:     Array<(flags: Map<string, FeatCtrlFlag>) => void> = [];
  private _flagChangedListeners:  Array<(flag: FeatCtrlFlag) => void> = [];
  private _flagDeletedListeners:  Array<(key: string) => void> = [];

  constructor(config: SseClientConfig) {
    this.sdkApiUrl = config.sdkApiUrl?.replace(/\/$/, '') ?? DEFAULT_SDK_API_URL;
    this.sdkKey = config.sdkKey;
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

  /** Register a listener called when a flag is created or updated. Chainable. */
  onFlagChanged(fn: (flag: FeatCtrlFlag) => void): this {
    this._flagChangedListeners.push(fn);
    return this;
  }

  /** Register a listener called when a flag is deleted. Chainable. */
  onFlagDeleted(fn: (key: string) => void): this {
    this._flagDeletedListeners.push(fn);
    return this;
  }

  // ── Connection lifecycle ──────────────────────────────────────────────────

  /**
   * Open the SSE connection to the FeatCtrl backend.
   *
   * @param previousUuid - Connection UUID from a previous session, passed to the
   *                       FeatCtrl backend for graceful transfer acknowledgement.
   */
  async connect(previousUuid?: string): Promise<void> {
    this.disconnecting = false;

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
          // Stream ended cleanly — reconnect unless we are shutting down.
          if (!this.disconnecting) {
            this.connect(this.connectionUuid ?? undefined).catch(() => undefined);
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
      try {
        await reader.cancel();
      } catch {
        // Ignore reader cancellation failures during reconnect cleanup.
      }
      this.abortController?.abort();
      this.abortController = null;
      if (this.disconnecting) return;
      this._scheduleReconnect();
    }
  }

  /** Gracefully disconnect from the FeatCtrl backend and notify the server. */
  disconnect(): void {
    this.disconnecting = true;
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
        this._connectedListeners.forEach((fn) => fn(parsed.connection_uuid, parsed.instance_uuid));
        break;
      }

      case 'flags.snapshot': {
        const parsed = JSON.parse(data) as { flags: FeatCtrlFlag[] };
        const map = new Map<string, FeatCtrlFlag>(parsed.flags.map((f) => [f.key, f]));
        this._snapshotListeners.forEach((fn) => fn(map));
        break;
      }

      case 'flag.changed': {
        const flag = JSON.parse(data) as FeatCtrlFlag;
        this._flagChangedListeners.forEach((fn) => fn(flag));
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
        this.abortController?.abort();
        this.abortController = null;
        if (!this.disconnecting) {
          this.connect(oldConnUuid ?? undefined).catch(() => undefined);
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
  }

  private _scheduleReconnect(): void {
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    setTimeout(() => {
      if (!this.disconnecting) {
        this.connect().catch(() => undefined);
      }
    }, delay);
  }
}

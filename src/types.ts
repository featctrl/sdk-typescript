/**
 * Feature flag model as returned by the FeatCtrl backend.
 */
export interface FeatCtrlFlag {
  key: string;
  name: string;
  flag_type: 'boolean';
  enabled: boolean;
  config: Record<string, unknown> | null;
}

/**
 * Public interface for the auto-start SSE client singleton (`sseClient`).
 * All `on*()` methods are chainable and support multiple listeners.
 */
export interface FeatCtrlClient {
  onConnected(fn: (connUuid: string, instUuid: string) => void): FeatCtrlClient;
  onDisconnected(fn: () => void): FeatCtrlClient;
  onSnapshot(fn: (flags: Map<string, FeatCtrlFlag>) => void): FeatCtrlClient;
  onFlagChanged(fn: (flag: FeatCtrlFlag) => void): FeatCtrlClient;
  onFlagDeleted(fn: (key: string) => void): FeatCtrlClient;
  onWatchdogTimeout(fn: () => void): FeatCtrlClient;
  onForbidden(fn: () => void): FeatCtrlClient;
  disconnect(): void;
}

/**
 * Public interface for the auto-start flag store singleton (`flagStore`).
 */
export interface FeatCtrlFlagStore {
  isEnabled(key: string): boolean | undefined;
  getConfig<T>(key: string): T | undefined;
  getAll(): ReadonlyMap<string, FeatCtrlFlag>;
}

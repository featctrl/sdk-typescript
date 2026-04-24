import type { FeatCtrlFlag } from './types.js';

export type { FeatCtrlFlag } from './types.js';
export { flagStore, sseClient } from './default-client.js';

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
  disconnect(): void;
}

/**
 * Public interface for the auto-start flag store singleton (`flagStore`).
 */
export interface FeatCtrlFlagStore {
  isEnabled(key: string): boolean;
  getConfig<T>(key: string): T | null;
  getAll(): ReadonlyMap<string, FeatCtrlFlag>;
}

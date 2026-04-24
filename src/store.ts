import type { FeatCtrlFlag } from './types.js';

/**
 * In-memory store for feature flags received from the FeatCtrl backend via SSE.
 *
 * Acts as a singleton within a Node.js process: instantiate once and share the
 * instance across your application.
 */
export class FlagStore {
  private flags = new Map<string, FeatCtrlFlag>();

  /** Replace the entire flag map with a fresh snapshot from the FeatCtrl backend. */
  setSnapshot(flags: Map<string, FeatCtrlFlag>): void {
    this.flags = new Map(flags);
  }

  /** Insert or update a single flag (from a `flag.changed` event). */
  applyChange(flag: FeatCtrlFlag): void {
    this.flags.set(flag.key, flag);
  }

  /** Remove a flag from the store (from a `flag.deleted` event). */
  applyDelete(key: string): void {
    this.flags.delete(key);
  }

  /**
   * Returns `true` if the named flag exists and is enabled, `false` otherwise.
   * Safe to call before the initial snapshot is received — returns `false`.
   */
  isEnabled(key: string): boolean {
    return this.flags.get(key)?.enabled ?? false;
  }

  /**
   * Returns the typed configuration object of a flag, or `null` if the flag
   * does not exist or has no configuration.
   */
  getConfig<T = unknown>(key: string): T | null {
    return (this.flags.get(key)?.config as T) ?? null;
  }

  /**
   * Returns a read-only view of the full flag map.
   * Used by the Vite plugin to serialise all flags into `/api/flags`.
   */
  getAll(): ReadonlyMap<string, FeatCtrlFlag> {
    return this.flags;
  }
}

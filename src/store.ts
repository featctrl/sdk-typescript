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
   * Returns `true` if the named flag exists and is enabled, `false` if it
   * exists and is disabled, or `undefined` if the key is not present in the
   * store (e.g. before the initial snapshot is received, or the flag has been
   * deleted, or if it doesn't exist at all).
   *
   * Use the `??` operator to apply a default:
   * ```ts
   * const enabled = flagStore.isEnabled('my-flag') ?? defaultValue;
   * ```
   */
  isEnabled(key: string): boolean | undefined {
    return this.flags.get(key)?.enabled;
  }

  /**
   * Returns the typed configuration object of a flag, or `undefined` if the
   * flag does not exist or has no configuration.
   */
  getConfig<T = unknown>(key: string): T | undefined {
    return (this.flags.get(key)?.config as T) ?? undefined;
  }

  /**
   * Returns a read-only view of the full flag map.
   * Used by the Vite plugin to serialize all flags into `/api/flags`.
   */
  getAll(): ReadonlyMap<string, FeatCtrlFlag> {
    return this.flags;
  }
}

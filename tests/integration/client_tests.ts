/**
 * Integration tests for @featctrl/typescript — SseClient + FlagStore.
 *
 * Backend-dependent tests (TSSDK-001, TSSDK-002) are skipped automatically
 * when FEATCTRL_SDK_KEY is not set.
 *
 * Run with:
 *   npm run test:integration
 *
 * Or with a live backend:
 *   FEATCTRL_SDK_KEY=sk_... FEATCTRL_URL=http://localhost:8082 npm run test:integration
 *
 * Pure FlagStore logic (TSSDK-003–006) lives in tests/unit/store.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { SseClient } from '../../src/client.js';
import { FlagStore } from '../../src/store.js';

const SDK_API_URL = process.env['FEATCTRL_URL'] ?? process.env['SDK_API_URL'] ?? 'http://localhost:8082';
const SDK_KEY     = process.env['FEATCTRL_SDK_KEY'] ?? process.env['SDK_KEY'] ?? '';

describe('SseClient — integration', () => {
  /**
   * TSSDK-001: SseClient connects to the FeatCtrl backend and receives
   * connection.established.
   */
  it.skipIf(!SDK_KEY)('TSSDK-001: receives connection.established with valid UUIDs', () => {
    return new Promise<void>((resolve, reject) => {
      let client: SseClient | undefined;
      const timeout = setTimeout(() => {
        client?.disconnect();
        reject(new Error('Timeout: connection.established not received within 10 s'));
      }, 10_000);

      try {
        client = new SseClient({ sdkApiUrl: SDK_API_URL, sdkKey: SDK_KEY });
        client.onConnected((connUuid, instUuid) => {
          clearTimeout(timeout);
          try {
            expect(connUuid).toBeTruthy();
            expect(instUuid).toBeTruthy();
            client.disconnect();
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  });

  /**
   * TSSDK-002: SseClient receives flags.snapshot and FlagStore is populated.
   */
  it.skipIf(!SDK_KEY)('TSSDK-002: receives flags.snapshot and populates FlagStore', () => {
    return new Promise<void>((resolve, reject) => {
      let client: SseClient | undefined;
      const timeout = setTimeout(() => {
        client?.disconnect();
        reject(new Error('Timeout: flags.snapshot not received within 10 s'));
      }, 10_000);

      try {
        const store = new FlagStore();
        client = new SseClient({ sdkApiUrl: SDK_API_URL, sdkKey: SDK_KEY });
        client.onSnapshot((flags) => {
          clearTimeout(timeout);
          try {
            store.setSnapshot(flags);
            // An empty map is valid when the environment has no flags configured.
            expect(store.getAll()).toBeInstanceOf(Map);
            resolve();
          } catch (err) {
            reject(err);
          } finally {
            client?.disconnect();
          }
        });
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
});

/**
 * Integration tests for @featctrl/typescript-sdk — SseClient + FlagStore.
 *
 * These tests require a running FeatCtrl backend instance and are skipped by default.
 * Run them explicitly with:
 *
 *   npx ts-node --test tests/integration/client_tests.ts
 *
 * or with a test runner that supports the `#[ignore]`-equivalent opt-in flag.
 *
 * All tests are prefixed with `TSSDK-` to match the MAPPING.yaml IDs.
 */

import { SseClient } from '../../src/client.js';
import { FlagStore } from '../../src/store.js';
import type { FeatCtrlFlag } from '../../src/types.js';

const SDK_API_URL = process.env.FEATCTRL_URL ?? process.env.SDK_API_URL ?? 'http://localhost:8082';
const SDK_KEY = process.env.FEATCTRL_SDK_KEY ?? process.env.SDK_KEY ?? '';

/**
 * TSSDK-001: SseClient connects to the FeatCtrl backend and receives connection.established
 *
 * Prerequisites:
 *   - FeatCtrl backend running at FEATCTRL_URL
 *   - Valid FEATCTRL_SDK_KEY environment variable
 *
 * Skipped when FEATCTRL_SDK_KEY is empty (default CI behaviour).
 */
async function test_tssdk_001_connection_established(): Promise<void> {
  if (!SDK_KEY) {
    console.log('TSSDK-001: skipped (SDK_KEY not set)');
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout: connection.established not received')), 10_000);

    const client = new SseClient({ sdkApiUrl: SDK_API_URL, sdkKey: SDK_KEY });
    client.onConnected((connUuid, instUuid) => {
      clearTimeout(timeout);
      if (!connUuid) { reject(new Error('connection_uuid is empty')); return; }
      if (!instUuid) { reject(new Error('instance_uuid is empty')); return; }
      client.disconnect();
      resolve();
    });
    client.connect().catch(reject);
  });

  console.log('TSSDK-001: PASS');
}

/**
 * TSSDK-002: SseClient receives flags.snapshot and FlagStore is populated
 *
 * Prerequisites:
 *   - FeatCtrl backend running at FEATCTRL_URL
 *   - Valid FEATCTRL_SDK_KEY environment variable
 *   - At least one flag exists in the environment linked to the SDK key
 */
async function test_tssdk_002_flags_snapshot_populates_store(): Promise<void> {
  if (!SDK_KEY) {
    console.log('TSSDK-002: skipped (SDK_KEY not set)');
    return;
  }

  const store = new FlagStore();

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout: flags.snapshot not received')), 10_000);

    const client = new SseClient({ sdkApiUrl: SDK_API_URL, sdkKey: SDK_KEY });
    client.onSnapshot((flags) => {
      clearTimeout(timeout);
      store.setSnapshot(flags);
      client.disconnect();
      resolve();
    });
    client.connect().catch(reject);
  });

  const all = store.getAll();
  if (all.size === 0) {
    console.warn('TSSDK-002: PASS (store is empty — no flags in environment)');
  } else {
    console.log(`TSSDK-002: PASS (${all.size} flag(s) loaded)`);
  }
}

/**
 * TSSDK-003: FlagStore.isEnabled returns false for an unknown flag key
 */
async function test_tssdk_003_is_enabled_unknown_key(): Promise<void> {
  const store = new FlagStore();
  const result = store.isEnabled('__nonexistent_flag__');
  if (result !== false) {
    throw new Error(`Expected false, got ${result}`);
  }
  console.log('TSSDK-003: PASS');
}

/**
 * TSSDK-004: FlagStore.getConfig returns null for an unknown flag key
 */
async function test_tssdk_004_get_config_unknown_key(): Promise<void> {
  const store = new FlagStore();
  const result = store.getConfig('__nonexistent_flag__');
  if (result !== null) {
    throw new Error(`Expected null, got ${JSON.stringify(result)}`);
  }
  console.log('TSSDK-004: PASS');
}

/**
 * TSSDK-005: FlagStore.applyChange upserts a flag correctly
 */
async function test_tssdk_005_apply_change(): Promise<void> {
  const store = new FlagStore();
  const flag: FeatCtrlFlag = {
    key: 'test-flag',
    name: 'Test Flag',
    flag_type: 'boolean',
    enabled: true,
    config: null,
  };

  store.applyChange(flag);

  if (!store.isEnabled('test-flag')) {
    throw new Error('Expected flag to be enabled');
  }

  console.log('TSSDK-005: PASS');
}

/**
 * TSSDK-006: FlagStore.applyDelete removes a flag
 */
async function test_tssdk_006_apply_delete(): Promise<void> {
  const store = new FlagStore();
  const flag: FeatCtrlFlag = {
    key: 'delete-me',
    name: 'Delete Me',
    flag_type: 'boolean',
    enabled: true,
    config: null,
  };

  store.applyChange(flag);
  if (!store.isEnabled('delete-me')) {
    throw new Error('Flag should be enabled before delete');
  }

  store.applyDelete('delete-me');
  if (store.isEnabled('delete-me')) {
    throw new Error('Flag should not be enabled after delete');
  }

  console.log('TSSDK-006: PASS');
}

// ── Runner ───────────────────────────────────────────────────────────────────

const tests = [
  test_tssdk_001_connection_established,
  test_tssdk_002_flags_snapshot_populates_store,
  test_tssdk_003_is_enabled_unknown_key,
  test_tssdk_004_get_config_unknown_key,
  test_tssdk_005_apply_change,
  test_tssdk_006_apply_delete,
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  try {
    await test();
    passed++;
  } catch (err) {
    console.error(`${test.name}: FAIL —`, err instanceof Error ? err.message : err);
    failed++;
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

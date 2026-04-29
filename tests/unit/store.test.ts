/**
 * Unit tests for FlagStore.
 *
 * These tests require no network access and no running backend.
 *
 * Run with:
 *   npm run test:unit
 */

import { describe, it, expect } from 'vitest';
import { FlagStore } from '../../src/store.js';
import type { FeatCtrlFlag } from '../../src/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFlag(key: string, enabled: boolean, config: FeatCtrlFlag['config'] = null): FeatCtrlFlag {
  return { key, name: key, flag_type: 'boolean', enabled, config };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FlagStore', () => {
  describe('isEnabled()', () => {
    it('returns undefined for an unknown flag key (TSSDK-003)', () => {
      const store = new FlagStore();
      expect(store.isEnabled('__nonexistent_flag__')).toBeUndefined();
    });

    it('returns true after applyChange with enabled=true', () => {
      const store = new FlagStore();
      store.applyChange(makeFlag('my-flag', true));
      expect(store.isEnabled('my-flag')).toBe(true);
    });

    it('returns false after applyChange with enabled=false', () => {
      const store = new FlagStore();
      store.applyChange(makeFlag('my-flag', false));
      expect(store.isEnabled('my-flag')).toBe(false);
    });

    it('applying a default with ?? returns the flag value when the key exists', () => {
      const store = new FlagStore();
      store.applyChange(makeFlag('enabled-flag', true));
      store.applyChange(makeFlag('disabled-flag', false));
      expect(store.isEnabled('enabled-flag') ?? 'default').toBe(true);
      expect(store.isEnabled('disabled-flag') ?? 'default').toBe(false);
    });

    it('applying a default with ?? returns the default when the key is absent', () => {
      const store = new FlagStore();
      expect(store.isEnabled('__nonexistent_flag__') ?? 'default').toBe('default');
    });

    it('returns undefined for a flag that has been deleted', () => {
      const store = new FlagStore();
      store.applyChange(makeFlag('my-flag', true));
      store.applyDelete('my-flag');
      expect(store.isEnabled('my-flag')).toBeUndefined();
    });
  });

  describe('getConfig()', () => {
    it('returns null for an unknown flag key (TSSDK-004)', () => {
      const store = new FlagStore();
      expect(store.getConfig('__nonexistent_flag__')).toBeUndefined();
    });

    it('returns the config object when present', () => {
      const store = new FlagStore();
      store.applyChange({ key: 'cfg', name: 'cfg', flag_type: 'boolean', enabled: true, config: { threshold: 42 } });
      expect(store.getConfig('cfg')).toEqual({ threshold: 42 });
    });

    it('returns null when config is explicitly null', () => {
      const store = new FlagStore();
      store.applyChange(makeFlag('no-cfg', true, null));
      expect(store.getConfig('no-cfg')).toBeUndefined();
    });
  });

  describe('applyChange()', () => {
    it('upserts a flag correctly (TSSDK-005)', () => {
      const store = new FlagStore();
      store.applyChange(makeFlag('test-flag', true));
      expect(store.isEnabled('test-flag')).toBe(true);
    });

    it('overwrites an existing flag', () => {
      const store = new FlagStore();
      store.applyChange(makeFlag('flag', true));
      store.applyChange(makeFlag('flag', false));
      expect(store.isEnabled('flag')).toBe(false);
    });
  });

  describe('applyDelete()', () => {
    it('removes a flag from the store (TSSDK-006)', () => {
      const store = new FlagStore();
      store.applyChange(makeFlag('delete-me', true));
      expect(store.isEnabled('delete-me')).toBe(true);
      store.applyDelete('delete-me');
      expect(store.isEnabled('delete-me')).toBeUndefined();
    });

    it('is a no-op for an unknown key', () => {
      const store = new FlagStore();
      expect(() => store.applyDelete('ghost')).not.toThrow();
    });
  });

  describe('setSnapshot()', () => {
    it('replaces the entire flag map', () => {
      const store = new FlagStore();
      store.applyChange(makeFlag('old', true));
      const newFlags = new Map([['new-flag', makeFlag('new-flag', true)]]);
      store.setSnapshot(newFlags);
      expect(store.isEnabled('old')).toBeUndefined();
      expect(store.isEnabled('new-flag')).toBe(true);
    });
  });

  describe('getAll()', () => {
    it('returns an empty map before any snapshot', () => {
      const store = new FlagStore();
      expect(store.getAll().size).toBe(0);
    });

    it('returns all flags after a snapshot', () => {
      const store = new FlagStore();
      store.setSnapshot(new Map([
        ['a', makeFlag('a', true)],
        ['b', makeFlag('b', false)],
      ]));
      expect(store.getAll().size).toBe(2);
    });
  });
});


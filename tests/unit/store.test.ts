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
    it('returns false for an unknown flag key (TSSDK-003)', () => {
      const store = new FlagStore();
      expect(store.isEnabled('__nonexistent_flag__')).toBe(false);
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

    it('returns false for a flag that has been deleted', () => {
      const store = new FlagStore();
      store.applyChange(makeFlag('my-flag', true));
      store.applyDelete('my-flag');
      expect(store.isEnabled('my-flag')).toBe(false);
    });
  });

  describe('getConfig()', () => {
    it('returns null for an unknown flag key (TSSDK-004)', () => {
      const store = new FlagStore();
      expect(store.getConfig('__nonexistent_flag__')).toBeNull();
    });

    it('returns the config object when present', () => {
      const store = new FlagStore();
      store.applyChange({ key: 'cfg', name: 'cfg', flag_type: 'boolean', enabled: true, config: { threshold: 42 } });
      expect(store.getConfig('cfg')).toEqual({ threshold: 42 });
    });

    it('returns null when config is explicitly null', () => {
      const store = new FlagStore();
      store.applyChange(makeFlag('no-cfg', true, null));
      expect(store.getConfig('no-cfg')).toBeNull();
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
      expect(store.isEnabled('delete-me')).toBe(false);
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
      expect(store.isEnabled('old')).toBe(false);
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


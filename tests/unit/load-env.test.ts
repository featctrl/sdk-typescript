/**
 * Unit tests for the internal env-file loader.
 *
 * Run with:
 *   npm run test:unit
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadEnvIfNeeded } from '../../src/load-env.js';

beforeEach(() => {
  delete process.env['FEATCTRL_SDK_KEY'];
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env['FEATCTRL_SDK_KEY'];
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('loadEnvIfNeeded()', () => {
  describe('when FEATCTRL_SDK_KEY is already set', () => {
    it('does not call process.loadEnvFile at all', () => {
      process.env['FEATCTRL_SDK_KEY'] = 'sk_already_set';
      const loadSpy = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});
      loadEnvIfNeeded();
      expect(loadSpy).not.toHaveBeenCalled();
    });

    it('does not modify the existing key value', () => {
      process.env['FEATCTRL_SDK_KEY'] = 'sk_original';
      vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});
      loadEnvIfNeeded();
      expect(process.env['FEATCTRL_SDK_KEY']).toBe('sk_original');
    });

    it('treats a whitespace-only value as missing and loads files', () => {
      process.env['FEATCTRL_SDK_KEY'] = '   ';
      const loadSpy = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});
      loadEnvIfNeeded();
      expect(loadSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('when FEATCTRL_SDK_KEY is missing', () => {
    it('tries .env.local then .env', () => {
      const calls: string[] = [];
      vi.spyOn(process, 'loadEnvFile').mockImplementation((path) => {
        calls.push(path as string);
      });
      loadEnvIfNeeded();
      expect(calls).toEqual(['.env.local', '.env']);
    });

    it('calls process.loadEnvFile exactly twice', () => {
      const loadSpy = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {});
      loadEnvIfNeeded();
      expect(loadSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('error handling', () => {
    it('does not throw when .env.local does not exist', () => {
      vi.spyOn(process, 'loadEnvFile')
        .mockImplementationOnce(() => { throw new Error('ENOENT: no such file or directory'); })
        .mockImplementationOnce(() => {});
      expect(() => loadEnvIfNeeded()).not.toThrow();
    });

    it('does not throw when neither .env.local nor .env exist', () => {
      vi.spyOn(process, 'loadEnvFile').mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory');
      });
      expect(() => loadEnvIfNeeded()).not.toThrow();
    });

    it('still tries .env even when .env.local throws', () => {
      const loadSpy = vi.spyOn(process, 'loadEnvFile')
        .mockImplementationOnce(() => { throw new Error('ENOENT'); })
        .mockImplementationOnce(() => {});
      loadEnvIfNeeded();
      expect(loadSpy).toHaveBeenCalledTimes(2);
      expect(loadSpy).toHaveBeenNthCalledWith(2, '.env');
    });
  });
});


import { describe, it, expect } from 'vitest';
import { toCookieHeader } from './publicApi.js';
import { Cookie } from './types.js';

function makeCookie(name: string, value: string): Cookie {
  return {
    name,
    value,
    source: {
      browser: 'chrome',
    },
  };
}

describe('toCookieHeader', () => {
  describe('basic serialization', () => {
    it('should return empty string for empty array', () => {
      expect(toCookieHeader([], {})).toBe('');
    });

    it('should serialize a single cookie', () => {
      expect(toCookieHeader([makeCookie('a', '1')], {})).toBe('a=1');
    });

    it('should serialize multiple cookies joined by "; "', () => {
      const cookies = [makeCookie('a', '1'), makeCookie('b', '2'), makeCookie('c', '3')];
      expect(toCookieHeader(cookies, {})).toBe('a=1; b=2; c=3');
    });

    it('should preserve original order when no options are set', () => {
      const cookies = [makeCookie('z', '1'), makeCookie('a', '2'), makeCookie('m', '3')];
      expect(toCookieHeader(cookies, {})).toBe('z=1; a=2; m=3');
    });

    it('should handle cookie values with special characters', () => {
      const cookies = [makeCookie('token', 'abc=def+ghi/jkl')];
      expect(toCookieHeader(cookies, {})).toBe('token=abc=def+ghi/jkl');
    });

    it('should handle empty cookie value', () => {
      expect(toCookieHeader([makeCookie('a', '')], {})).toBe('a=');
    });
  });

  describe('sortByName', () => {
    it('should sort cookies alphabetically by name', () => {
      const cookies = [makeCookie('z', '1'), makeCookie('a', '2'), makeCookie('m', '3')];
      expect(toCookieHeader(cookies, { sortByName: true })).toBe('a=2; m=3; z=1');
    });

    it('should not sort when sortByName is false', () => {
      const cookies = [makeCookie('z', '1'), makeCookie('a', '2')];
      expect(toCookieHeader(cookies, { sortByName: false })).toBe('z=1; a=2');
    });

    it('should handle case-sensitive sorting', () => {
      const cookies = [makeCookie('B', '1'), makeCookie('a', '2'), makeCookie('A', '3')];
      const result = toCookieHeader(cookies, { sortByName: true });
      // localeCompare default: 'a' < 'A' < 'B' (locale dependent, but A/a should be near each other)
      expect(result).toContain('a=2');
      expect(result).toContain('A=3');
      expect(result).toContain('B=1');
    });
  });

  describe('removeDuplicates', () => {
    it('should keep only the first occurrence of each cookie name', () => {
      const cookies = [makeCookie('a', '1'), makeCookie('b', '2'), makeCookie('a', '3')];
      expect(toCookieHeader(cookies, { removeDuplicates: true })).toBe('a=1; b=2');
    });

    it('should not remove duplicates when removeDuplicates is false', () => {
      const cookies = [makeCookie('a', '1'), makeCookie('a', '2')];
      expect(toCookieHeader(cookies, { removeDuplicates: false })).toBe('a=1; a=2');
    });

    it('should handle all duplicate names', () => {
      const cookies = [makeCookie('a', '1'), makeCookie('a', '2'), makeCookie('a', '3')];
      expect(toCookieHeader(cookies, { removeDuplicates: true })).toBe('a=1');
    });

    it('should handle no duplicates', () => {
      const cookies = [makeCookie('a', '1'), makeCookie('b', '2')];
      expect(toCookieHeader(cookies, { removeDuplicates: true })).toBe('a=1; b=2');
    });
  });

  describe('sortByName + removeDuplicates combined', () => {
    it('should sort first then deduplicate', () => {
      const cookies = [
        makeCookie('z', 'last'),
        makeCookie('a', 'first'),
        makeCookie('m', 'mid'),
        makeCookie('a', 'dup'),
      ];
      expect(toCookieHeader(cookies, { sortByName: true, removeDuplicates: true })).toBe(
        'a=first; m=mid; z=last'
      );
    });

    it('should keep the first occurrence after sorting', () => {
      const cookies = [makeCookie('b', '2'), makeCookie('a', 'second'), makeCookie('a', 'first')];
      // After sort: a=second, a=first, b=2 → dedup keeps a=second
      expect(toCookieHeader(cookies, { sortByName: true, removeDuplicates: true })).toBe(
        'a=second; b=2'
      );
    });
  });
});

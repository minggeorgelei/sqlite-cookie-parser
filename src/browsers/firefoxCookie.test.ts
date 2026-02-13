import { describe, it, expect } from 'vitest';
import { getCookiesFromFirefoxSqlite } from './firefoxCookie';

describe('getCookiesFromFirefoxSqlite', () => {
  describe('return structure', () => {
    it('should always return an object with cookies and warnings arrays', async () => {
      const result = await getCookiesFromFirefoxSqlite({}, ['https://example.com'], null);

      expect(result).toHaveProperty('cookies');
      expect(result).toHaveProperty('warnings');
      expect(Array.isArray(result.cookies)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should return Cookie objects with required properties when cookies exist', async () => {
      const result = await getCookiesFromFirefoxSqlite({}, ['https://google.com'], null);

      for (const cookie of result.cookies) {
        expect(typeof cookie.name).toBe('string');
        expect(typeof cookie.value).toBe('string');
        expect(cookie).toHaveProperty('domain');
        expect(cookie).toHaveProperty('path');
      }
    });
  });

  describe('options parameter', () => {
    it('should accept empty options object', async () => {
      const result = await getCookiesFromFirefoxSqlite({}, ['https://example.com'], null);

      expect(result).toBeDefined();
    });

    it('should accept options with profile', async () => {
      const result = await getCookiesFromFirefoxSqlite(
        { profile: 'default-release' },
        ['https://example.com'],
        null
      );

      expect(result).toBeDefined();
    });

    it('should accept options with includeExpired', async () => {
      const result = await getCookiesFromFirefoxSqlite(
        { includeExpired: true },
        ['https://example.com'],
        null
      );

      expect(result).toBeDefined();
    });

    it('should accept options with both profile and includeExpired', async () => {
      const result = await getCookiesFromFirefoxSqlite(
        { profile: 'default-release', includeExpired: false },
        ['https://example.com'],
        null
      );

      expect(result).toBeDefined();
    });
  });

  describe('origins parameter', () => {
    it('should handle empty origins array', async () => {
      const result = await getCookiesFromFirefoxSqlite({}, [], null);

      expect(result.cookies).toHaveLength(0);
    });

    it('should handle single origin', async () => {
      const result = await getCookiesFromFirefoxSqlite({}, ['https://example.com'], null);

      expect(result).toBeDefined();
    });

    it('should handle multiple origins', async () => {
      const result = await getCookiesFromFirefoxSqlite(
        {},
        ['https://example.com', 'https://test.com'],
        null
      );

      expect(result).toBeDefined();
    });

    it('should handle HTTP origins', async () => {
      const result = await getCookiesFromFirefoxSqlite({}, ['http://example.com'], null);

      expect(result).toBeDefined();
    });

    it('should handle origins with ports', async () => {
      const result = await getCookiesFromFirefoxSqlite({}, ['https://localhost:3000'], null);

      expect(result).toBeDefined();
    });

    it('should handle origins with paths (path should be ignored)', async () => {
      const result = await getCookiesFromFirefoxSqlite(
        {},
        ['https://example.com/some/path'],
        null
      );

      expect(result).toBeDefined();
    });
  });

  describe('cookieNames parameter', () => {
    it('should accept null to get all cookies', async () => {
      const result = await getCookiesFromFirefoxSqlite({}, ['https://example.com'], null);

      expect(result).toBeDefined();
    });

    it('should accept empty Set (returns no cookies)', async () => {
      const result = await getCookiesFromFirefoxSqlite({}, ['https://google.com'], new Set());

      // Empty Set means no cookie names match, so no cookies returned
      expect(result.cookies).toHaveLength(0);
    });

    it('should filter cookies by name when Set is provided', async () => {
      const cookieNames = new Set(['NID', 'SID', 'HSID']);
      const result = await getCookiesFromFirefoxSqlite({}, ['https://google.com'], cookieNames);

      // All returned cookies should have names in the Set
      for (const cookie of result.cookies) {
        expect(cookieNames.has(cookie.name)).toBe(true);
      }
    });

    it('should return empty when filtering by non-existent cookie names', async () => {
      const cookieNames = new Set(['__NONEXISTENT_COOKIE_NAME_XYZ__']);
      const result = await getCookiesFromFirefoxSqlite({}, ['https://google.com'], cookieNames);

      expect(result.cookies).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should return warning for non-existent profile', async () => {
      const result = await getCookiesFromFirefoxSqlite(
        { profile: 'ThisProfileDoesNotExist12345' },
        ['https://example.com'],
        null
      );

      expect(result.cookies).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should return warning on invalid origin URL', async () => {
      const result = await getCookiesFromFirefoxSqlite({}, ['not-a-valid-url'], null);

      expect(result.cookies).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('includeExpired behavior', () => {
    it('should return potentially more cookies with includeExpired=true', async () => {
      const withExpired = await getCookiesFromFirefoxSqlite(
        { includeExpired: true },
        ['https://google.com'],
        null
      );

      const withoutExpired = await getCookiesFromFirefoxSqlite(
        { includeExpired: false },
        ['https://google.com'],
        null
      );

      // With expired should have >= cookies than without
      expect(withExpired.cookies.length).toBeGreaterThanOrEqual(withoutExpired.cookies.length);
    });
  });

  describe('cookie properties', () => {
    it('should have valid sameSite values', async () => {
      const result = await getCookiesFromFirefoxSqlite({}, ['https://google.com'], null);

      const validSameSite = ['none', 'lax', 'strict', undefined];
      for (const cookie of result.cookies) {
        expect(validSameSite).toContain(cookie.sameSite);
      }
    });

    it('should have boolean secure and httpOnly', async () => {
      const result = await getCookiesFromFirefoxSqlite({}, ['https://google.com'], null);

      for (const cookie of result.cookies) {
        if (cookie.secure !== undefined) {
          expect(typeof cookie.secure).toBe('boolean');
        }
        if (cookie.httpOnly !== undefined) {
          expect(typeof cookie.httpOnly).toBe('boolean');
        }
      }
    });

    it('should have numeric or undefined expires', async () => {
      const result = await getCookiesFromFirefoxSqlite({}, ['https://google.com'], null);

      for (const cookie of result.cookies) {
        if (cookie.expires !== undefined) {
          expect(typeof cookie.expires).toBe('number');
        }
      }
    });

    it('should not have partitionKey (Firefox does not support CHIPS)', async () => {
      const result = await getCookiesFromFirefoxSqlite({}, ['https://google.com'], null);

      for (const cookie of result.cookies) {
        expect(cookie.partitionKey).toBeUndefined();
      }
    });
  });

  describe('Firefox-specific behavior', () => {
    it('should handle Firefox profile directory naming convention', async () => {
      // Firefox profiles are named like: abc123.default-release
      const result = await getCookiesFromFirefoxSqlite(
        { profile: 'default-release' },
        ['https://example.com'],
        null
      );

      expect(result).toBeDefined();
    });

    it('should handle direct path to cookies.sqlite file', async () => {
      // This should work if user provides direct path
      const result = await getCookiesFromFirefoxSqlite(
        { profile: '/nonexistent/path/cookies.sqlite' },
        ['https://example.com'],
        null
      );

      // Should return warning since path doesn't exist
      expect(result.cookies).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should handle direct path to profile directory', async () => {
      const result = await getCookiesFromFirefoxSqlite(
        { profile: '/nonexistent/profile/directory' },
        ['https://example.com'],
        null
      );

      expect(result.cookies).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

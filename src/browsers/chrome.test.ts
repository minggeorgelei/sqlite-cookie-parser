import { describe, it, expect } from 'vitest';
import { getCookiesFromChrome } from './chrome';

describe('getCookiesFromChrome', () => {
  describe('return structure', () => {
    it('should always return an object with cookies and warnings arrays', async () => {
      const result = await getCookiesFromChrome({}, ['https://example.com'], null);

      expect(result).toHaveProperty('cookies');
      expect(result).toHaveProperty('warnings');
      expect(Array.isArray(result.cookies)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should return Cookie objects with required properties when cookies exist', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'Default' },
        ['https://google.com'],
        null
      );

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
      const result = await getCookiesFromChrome({}, ['https://example.com'], null);

      expect(result).toBeDefined();
    });

    it('should accept options with only profile', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'Default' },
        ['https://example.com'],
        null
      );

      expect(result).toBeDefined();
    });

    it('should accept options with only includeExpired', async () => {
      const result = await getCookiesFromChrome(
        { includeExpired: true },
        ['https://example.com'],
        null
      );

      expect(result).toBeDefined();
    });

    it('should accept options with both profile and includeExpired', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'Default', includeExpired: false },
        ['https://example.com'],
        null
      );

      expect(result).toBeDefined();
    });
  });

  describe('origins parameter', () => {
    it('should handle empty origins array', async () => {
      const result = await getCookiesFromChrome({ profile: 'Default' }, [], null);

      expect(result.cookies).toHaveLength(0);
    });

    it('should handle single origin', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'Default' },
        ['https://example.com'],
        null
      );

      expect(result).toBeDefined();
    });

    it('should handle multiple origins', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'Default' },
        ['https://example.com', 'https://test.com'],
        null
      );

      expect(result).toBeDefined();
    });

    it('should handle HTTP origins', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'Default' },
        ['http://example.com'],
        null
      );

      expect(result).toBeDefined();
    });

    it('should handle origins with ports', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'Default' },
        ['https://localhost:3000'],
        null
      );

      expect(result).toBeDefined();
    });

    it('should handle origins with paths (path should be ignored)', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'Default' },
        ['https://example.com/some/path'],
        null
      );

      expect(result).toBeDefined();
    });
  });

  describe('cookieNames parameter', () => {
    it('should accept null to get all cookies', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'Default' },
        ['https://example.com'],
        null
      );

      expect(result).toBeDefined();
    });

    it('should accept empty Set (returns no cookies)', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'Default' },
        ['https://google.com'],
        new Set()
      );

      // Empty Set means no cookie names match, so no cookies returned
      expect(result.cookies).toHaveLength(0);
    });

    it('should filter cookies by name when Set is provided', async () => {
      const cookieNames = new Set(['NID', 'SID', 'HSID']);
      const result = await getCookiesFromChrome(
        { profile: 'Default' },
        ['https://google.com'],
        cookieNames
      );

      // All returned cookies should have names in the Set
      for (const cookie of result.cookies) {
        expect(cookieNames.has(cookie.name)).toBe(true);
      }
    });

    it('should return empty when filtering by non-existent cookie names', async () => {
      const cookieNames = new Set(['__NONEXISTENT_COOKIE_NAME_XYZ__']);
      const result = await getCookiesFromChrome(
        { profile: 'Default' },
        ['https://google.com'],
        cookieNames
      );

      expect(result.cookies).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should return warning for non-existent profile', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'ThisProfileDoesNotExist12345' },
        ['https://example.com'],
        null
      );

      expect(result.cookies).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should return warning on invalid origin URL', async () => {
      const result = await getCookiesFromChrome({ profile: 'Default' }, ['not-a-valid-url'], null);

      expect(result.cookies).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Invalid URL');
    });
  });

  describe('includeExpired behavior', () => {
    it('should return potentially more cookies with includeExpired=true', async () => {
      const withExpired = await getCookiesFromChrome(
        { profile: 'Default', includeExpired: true },
        ['https://google.com'],
        null
      );

      const withoutExpired = await getCookiesFromChrome(
        { profile: 'Default', includeExpired: false },
        ['https://google.com'],
        null
      );

      // With expired should have >= cookies than without
      expect(withExpired.cookies.length).toBeGreaterThanOrEqual(withoutExpired.cookies.length);
    });
  });

  describe('includePartitioned behavior', () => {
    it('should exclude partitioned cookies by default', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'Default' },
        ['https://google.com'],
        null
      );

      for (const cookie of result.cookies) {
        expect(cookie.partitionKey).toBeUndefined();
      }
    });

    it('should include partitioned cookies when includePartitioned=true', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'Default', includePartitioned: true },
        ['https://google.com'],
        null
      );

      expect(result).toBeDefined();
      // All cookies should be present, partitioned ones should have partitionKey set
      for (const cookie of result.cookies) {
        if (cookie.partitionKey !== undefined) {
          expect(typeof cookie.partitionKey).toBe('string');
          expect(cookie.partitionKey.length).toBeGreaterThan(0);
        }
      }
    });

    it('should return more or equal cookies with includePartitioned=true', async () => {
      const withPartitioned = await getCookiesFromChrome(
        { profile: 'Default', includePartitioned: true },
        ['https://google.com'],
        null
      );

      const withoutPartitioned = await getCookiesFromChrome(
        { profile: 'Default', includePartitioned: false },
        ['https://google.com'],
        null
      );

      expect(withPartitioned.cookies.length).toBeGreaterThanOrEqual(
        withoutPartitioned.cookies.length
      );
    });

    it('should have valid partitionKey format (URL) when present', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'Default', includePartitioned: true },
        ['https://google.com'],
        null
      );

      for (const cookie of result.cookies) {
        if (cookie.partitionKey) {
          expect(cookie.partitionKey).toMatch(/^https?:\/\//);
        }
      }
    });
  });

  describe('cookie properties', () => {
    it('should have valid sameSite values', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'Default' },
        ['https://google.com'],
        null
      );

      const validSameSite = ['none', 'lax', 'strict', undefined];
      for (const cookie of result.cookies) {
        expect(validSameSite).toContain(cookie.sameSite);
      }
    });

    it('should have boolean secure and httpOnly', async () => {
      const result = await getCookiesFromChrome(
        { profile: 'Default' },
        ['https://google.com'],
        null
      );

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
      const result = await getCookiesFromChrome(
        { profile: 'Default' },
        ['https://google.com'],
        null
      );

      for (const cookie of result.cookies) {
        if (cookie.expires !== undefined) {
          expect(typeof cookie.expires).toBe('number');
        }
      }
    });
  });
});

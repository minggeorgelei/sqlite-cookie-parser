import { describe, it, expect } from 'vitest';
import { getCookiesFromSafari } from './safariCookie';

describe('getCookiesFromSafari', () => {
  describe('return structure', () => {
    it('should always return an object with cookies and warnings arrays', async () => {
      const result = await getCookiesFromSafari({}, ['https://example.com'], null);

      expect(result).toHaveProperty('cookies');
      expect(result).toHaveProperty('warnings');
      expect(Array.isArray(result.cookies)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should return Cookie objects with required properties when cookies exist', async () => {
      const result = await getCookiesFromSafari(
        { includeExpired: true },
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
      const result = await getCookiesFromSafari({}, ['https://example.com'], null);

      expect(result).toBeDefined();
    });

    it('should accept options with profile as direct file path', async () => {
      const result = await getCookiesFromSafari(
        { profile: '/nonexistent/Cookies.binarycookies' },
        ['https://example.com'],
        null
      );

      // Non-existent path should result in warning
      expect(result.cookies).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should accept options with includeExpired', async () => {
      const result = await getCookiesFromSafari(
        { includeExpired: true },
        ['https://example.com'],
        null
      );

      expect(result).toBeDefined();
    });
  });

  describe('origins parameter', () => {
    it('should handle empty origins array', async () => {
      const result = await getCookiesFromSafari({}, [], null);

      expect(result.cookies).toHaveLength(0);
    });

    it('should handle single origin', async () => {
      const result = await getCookiesFromSafari({}, ['https://example.com'], null);

      expect(result).toBeDefined();
    });

    it('should handle multiple origins', async () => {
      const result = await getCookiesFromSafari(
        {},
        ['https://example.com', 'https://test.com'],
        null
      );

      expect(result).toBeDefined();
    });

    it('should handle HTTP origins', async () => {
      const result = await getCookiesFromSafari({}, ['http://example.com'], null);

      expect(result).toBeDefined();
    });

    it('should handle origins with ports', async () => {
      const result = await getCookiesFromSafari({}, ['https://localhost:3000'], null);

      expect(result).toBeDefined();
    });

    it('should handle origins with paths (path should be ignored)', async () => {
      const result = await getCookiesFromSafari({}, ['https://example.com/some/path'], null);

      expect(result).toBeDefined();
    });
  });

  describe('cookieNames parameter', () => {
    it('should accept null to get all cookies', async () => {
      const result = await getCookiesFromSafari({}, ['https://example.com'], null);

      expect(result).toBeDefined();
    });

    it('should accept empty Set (returns no cookies)', async () => {
      const result = await getCookiesFromSafari(
        { includeExpired: true },
        ['https://google.com'],
        new Set()
      );

      expect(result.cookies).toHaveLength(0);
    });

    it('should filter cookies by name when Set is provided', async () => {
      const cookieNames = new Set(['NID', 'SID', 'HSID']);
      const result = await getCookiesFromSafari(
        { includeExpired: true },
        ['https://google.com'],
        cookieNames
      );

      for (const cookie of result.cookies) {
        expect(cookieNames.has(cookie.name)).toBe(true);
      }
    });

    it('should return empty when filtering by non-existent cookie names', async () => {
      const cookieNames = new Set(['__NONEXISTENT_COOKIE_NAME_XYZ__']);
      const result = await getCookiesFromSafari(
        { includeExpired: true },
        ['https://google.com'],
        cookieNames
      );

      expect(result.cookies).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should return warning for non-existent profile path', async () => {
      const result = await getCookiesFromSafari(
        { profile: '/nonexistent/path/to/cookies' },
        ['https://example.com'],
        null
      );

      expect(result.cookies).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should return warning on invalid origin URL', async () => {
      const result = await getCookiesFromSafari({}, ['not-a-valid-url'], null);

      expect(result.cookies).toHaveLength(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('includeExpired behavior', () => {
    it('should return potentially more cookies with includeExpired=true', async () => {
      const withExpired = await getCookiesFromSafari(
        { includeExpired: true },
        ['https://google.com'],
        null
      );

      const withoutExpired = await getCookiesFromSafari(
        { includeExpired: false },
        ['https://google.com'],
        null
      );

      expect(withExpired.cookies.length).toBeGreaterThanOrEqual(withoutExpired.cookies.length);
    });
  });

  describe('cookie properties', () => {
    it('should have boolean secure and httpOnly', async () => {
      const result = await getCookiesFromSafari(
        { includeExpired: true },
        ['https://google.com'],
        null
      );

      for (const cookie of result.cookies) {
        expect(typeof cookie.secure).toBe('boolean');
        expect(typeof cookie.httpOnly).toBe('boolean');
      }
    });

    it('should have numeric or undefined expires', async () => {
      const result = await getCookiesFromSafari(
        { includeExpired: true },
        ['https://google.com'],
        null
      );

      for (const cookie of result.cookies) {
        if (cookie.expires !== undefined) {
          expect(typeof cookie.expires).toBe('number');
          // Safari expiry should be a reasonable future/past timestamp (after year 2000)
          expect(cookie.expires).toBeGreaterThan(946684800000);
        }
      }
    });

    it('should not have partitionKey (Safari does not support CHIPS)', async () => {
      const result = await getCookiesFromSafari(
        { includeExpired: true },
        ['https://google.com'],
        null
      );

      for (const cookie of result.cookies) {
        expect(cookie.partitionKey).toBeUndefined();
      }
    });

    it('should not have sameSite (not stored in BinaryCookies format)', async () => {
      const result = await getCookiesFromSafari(
        { includeExpired: true },
        ['https://google.com'],
        null
      );

      for (const cookie of result.cookies) {
        expect(cookie.sameSite).toBeUndefined();
      }
    });

    it('should have domain without leading dot', async () => {
      const result = await getCookiesFromSafari(
        { includeExpired: true },
        ['https://google.com'],
        null
      );

      for (const cookie of result.cookies) {
        expect(cookie.domain).toBeDefined();
        expect(cookie.domain!.startsWith('.')).toBe(false);
      }
    });
  });

  describe('Safari-specific behavior', () => {
    it('should only work on macOS', async () => {
      // This test just verifies the function runs on the current platform
      const result = await getCookiesFromSafari({}, ['https://example.com'], null);

      if (process.platform !== 'darwin') {
        expect(result.warnings).toContain('Safari cookies are only supported on macOS.');
      } else {
        expect(result).toBeDefined();
      }
    });

    it('should match cookies for subdomain origins', async () => {
      // A cookie with domain "google.com" should match origin "https://www.google.com"
      const resultWww = await getCookiesFromSafari(
        { includeExpired: true },
        ['https://www.google.com'],
        null
      );
      const resultBase = await getCookiesFromSafari(
        { includeExpired: true },
        ['https://google.com'],
        null
      );

      // www.google.com should get at least all cookies that google.com gets
      // (since .google.com cookies match both)
      expect(resultWww.cookies.length).toBeGreaterThanOrEqual(resultBase.cookies.length);
    });
  });
});

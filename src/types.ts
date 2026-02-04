/**
 * Cookie object interface
 */
export interface Cookie {
  /** Cookie name */
  name: string;
  /** Cookie value (null if encrypted and decryption failed) */
  value: string | null;
  /** Cookie domain */
  domain?: string;
  /** Cookie path */
  path?: string;
  /** Expiration date (null if session cookie) */
  expires?: number;
  /** Whether cookie requires HTTPS */
  secure?: boolean;
  /** Whether cookie is HTTP-only */
  httpOnly?: boolean;
  /** SameSite attribute */
  sameSite?: SameSiteValue;
}

export type SameSiteValue = 'none' | 'lax' | 'strict';

export type BrowserType = 'chrome' | 'edge' | 'firefox' | 'safari';

/**
 * Options for getCookiesFromBrowser
 */
export interface GetCookiesOptions {
  /** Browser profile name (default: 'Default') */
  profile?: string;
  /** Whether to include expired cookies (default: false) */
  includeExpired?: boolean;
}

export type GetDBOptions = GetCookiesOptions & { dbPath: string };

export interface GetCookiesResult {
  cookies: Cookie[];
  warnings: string[];
}

/**
 * Options for toCookieHeader
 */
export interface ToCookieHeaderOptions {
  /** Filter cookies by domain */
  domain?: string;
  /** Filter cookies by path (default: '/') */
  path?: string;
  /** Whether the request is over HTTPS (default: false) */
  secure?: boolean;
}

/**
 * Raw cookie row from Chrome/Edge database
 */
export interface ChromeCookieRow {
  name: string;
  value: string;
  encrypted_value: Buffer | null;
  host: string;
  path: string;
  expires_utc: number;
  is_secure: number;
  is_httponly: number;
  samesite: number;
}

/**
 * Raw cookie row from Firefox database
 */
export interface FirefoxCookieRow {
  name: string;
  value: string;
  host: string;
  path: string;
  expiry: number;
  isSecure: number;
  isHttpOnly: number;
}

export type DecryptFunction = (encryptedValue: Buffer) => string;

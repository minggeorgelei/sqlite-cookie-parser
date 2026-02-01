/**
 * Cookie object interface
 */
export interface Cookie {
  /** Cookie name */
  name: string;
  /** Cookie value (null if encrypted and decryption failed) */
  value: string | null;
  /** Whether the cookie value was encrypted in the database */
  encrypted: boolean;
  /** Cookie domain */
  domain: string;
  /** Cookie path */
  path: string;
  /** Expiration date (null if session cookie) */
  expires: Date | null;
  /** Whether cookie requires HTTPS */
  secure: boolean;
  /** Whether cookie is HTTP-only */
  httpOnly: boolean;
  /** SameSite attribute */
  sameSite: SameSiteValue;
}

export type SameSiteValue = 'none' | 'lax' | 'strict' | 'unspecified';

export type BrowserType = 'chrome' | 'edge' | 'firefox';

/**
 * Options for getCookiesFromBrowser
 */
export interface GetCookiesOptions {
  /** Browser profile name (default: 'Default') */
  profile?: string;
  /** Custom path to cookie database */
  cookiePath: string;
  /** Filter cookies by domain */
  domain?: string;
  /** Attempt to decrypt encrypted cookies (default: true, macOS Chrome/Edge only) */
  decrypt?: boolean;
  timeoutMs?: number;
  includeExpired?: boolean;
}

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

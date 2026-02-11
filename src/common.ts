import {
  GetCookiesResult,
  Cookie,
  SameSiteValue,
  GetDBOptions,
  BrowserType,
  GetCookiesOptions,
} from './types.js';
import { tmpdir } from 'os';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

type ChromeCookieRow = {
  name?: unknown;
  value?: unknown;
  encrypted_value?: unknown;
  host_key?: unknown;
  path?: unknown;
  expires_utc?: unknown;
  is_secure?: unknown;
  is_httponly?: unknown;
  samesite?: unknown;
  top_frame_site_key?: unknown;
  has_cross_site_ancestor?: unknown;
};

export async function getCookiesFromChromiumSqliteDB(
  options: GetDBOptions,
  origins: string[],
  cookieNames: Set<string> | null,
  browser: BrowserType,
  decrypytFn: (encryptedValue: Uint8Array) => string | null
): Promise<GetCookiesResult> {
  const warnings: string[] = [];

  const tmpdirPath = mkdtempSync(path.join(tmpdir(), 'sqlite-cookie-chromium-db-'));
  const tempDbPath = path.join(tmpdirPath, 'Cookies');
  try {
    copyFileSync(options.dbPath, tempDbPath);
  } catch (error) {
    rmSync(tmpdirPath, { recursive: true, force: true });
    warnings.push(`Failed to copy cookie database: ${(error as Error).message}`);
    return { cookies: [], warnings };
  }

  try {
    const hosts = origins.map((origin) => new URL(origin).hostname);
    const whereClause = buildHostWhereClause(hosts, 'host_key');
    const rowsResult = await getRawCookiesFromChromiumDb(tempDbPath, whereClause);

    if (!rowsResult.success) {
      rmSync(tmpdirPath, { recursive: true, force: true });
      warnings.push(rowsResult.error);
      return { cookies: [], warnings };
    }

    const cookies = decryptRawCookiesFromChromiumRows(
      rowsResult.rows,
      options,
      hosts,
      cookieNames,
      browser,
      decrypytFn,
      warnings
    );

    rmSync(tmpdirPath, { recursive: true, force: true });
    return { cookies, warnings };
  } catch (error) {
    rmSync(tmpdirPath, { recursive: true, force: true });
    warnings.push(`Failed to get cookies: ${(error as Error).message}`);
    return { cookies: [], warnings };
  }
}

function decryptRawCookiesFromChromiumRows(
  rows: ChromeCookieRow[],
  options: GetDBOptions,
  hosts: string[],
  cookieNames: Set<string> | null,
  browser: BrowserType,
  decryptFn: (encryptedValue: Uint8Array) => string | null,
  warnings: string[] = []
): Cookie[] {
  const cookies: Cookie[] = [];
  for (const row of rows) {
    const name = typeof row.name === 'string' ? row.name : '';
    if (cookieNames && !cookieNames.has(name)) {
      continue;
    }
    const hostString = typeof row.host_key === 'string' ? row.host_key : '';
    if (!hostString) {
      continue;
    }
    const host = hostString.startsWith('.') ? hostString.substring(1) : hostString;
    const domainLower = host.toLowerCase();
    if (
      !hosts.some((host) => {
        const hostLower = host.toLowerCase();
        return hostLower === domainLower || hostLower.endsWith(`.${domainLower}`);
      })
    ) {
      continue;
    }

    const partitionKey =
      typeof row.top_frame_site_key === 'string' && row.top_frame_site_key
        ? row.top_frame_site_key
        : undefined;

    // Filter out partitioned cookies by default
    if (!options.includePartitioned && partitionKey) {
      continue;
    }

    const valueTemp = typeof row.value === 'string' ? row.value : null;
    let value = valueTemp;
    if (!value) {
      const encryptedValue = row.encrypted_value;
      if (encryptedValue instanceof Uint8Array) {
        const decrypted = decryptFn(encryptedValue);
        value = decrypted;
      }
    }
    if (value === null) {
      warnings.push(`Failed to decrypt cookie value for cookie "${name}" at host "${host}"`);
      continue;
    }

    const expiresUtc =
      typeof row.expires_utc === 'number' || typeof row.expires_utc === 'bigint'
        ? row.expires_utc
        : tryParseInt(row.expires_utc);

    // Convert Chrome timestamp to JavaScript timestamp (milliseconds)
    const expires = normalizeExpiration(expiresUtc, 'chrome');

    // Check if cookie is expired (if not including expired cookies)
    if (!options.includeExpired && expires && expires < Date.now()) {
      continue;
    }

    const secure =
      row.is_secure === 1 ||
      row.is_secure === true ||
      row.is_secure === 1n ||
      row.is_secure === '1';
    const httpOnly =
      row.is_httponly === 1 ||
      row.is_httponly === true ||
      row.is_httponly === 1n ||
      row.is_httponly === '1';

    const sameSite = normalizeSameSite(row.samesite);
    const rowPath = typeof row.path === 'string' ? row.path : '';

    // Create Cookie object
    const cookie: Cookie = {
      name,
      value,
      domain: host,
      path: rowPath || '/',
      expires,
      secure,
      httpOnly,
      sameSite,
      partitionKey,
      source: {
        browser,
        profile: options.dbPath,
      },
    };

    cookies.push(cookie);
  }
  return cookies;
}

function normalizeSameSite(value: unknown): SameSiteValue | undefined {
  if (typeof value === 'bigint') {
    const intValue = Number(value);
    return Number.isFinite(intValue) ? normalizeSameSite(intValue) : undefined;
  } else if (typeof value === 'number') {
    switch (value) {
      case 0:
        return 'none';
      case 1:
        return 'lax';
      case 2:
        return 'strict';
      default:
        return undefined;
    }
  } else if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return normalizeSameSite(parsed);
    }
    const lower = value.toLowerCase();
    switch (lower) {
      case 'none':
      case 'no_restriction':
        return 'none';
      case 'lax':
        return 'lax';
      case 'strict':
        return 'strict';
      default:
        return undefined;
    }
  }
}

function tryParseInt(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

// Offset between 1601-01-01 and 1970-01-01 in milliseconds
const CHROME_EPOCH_OFFSET_MS = 11644473600000n;
// Offset between 2001-01-01 and 1970-01-01 in seconds
const SAFARI_EPOCH_OFFSET_S = 978307200;

/**
 * Normalize browser-specific timestamp to JavaScript milliseconds (since 1970-01-01 UTC)
 * @param timestamp - The raw timestamp value from the browser database
 * @param browser - The browser type (determines timestamp format)
 *   - chrome/edge: microseconds since 1601-01-01
 *   - firefox: seconds since 1970-01-01
 *   - safari: seconds since 2001-01-01 (CFAbsoluteTime)
 * @returns Milliseconds since epoch (1970-01-01), or undefined if conversion fails
 */
export function normalizeExpiration(
  timestamp: number | bigint | null,
  browser: BrowserType
): number | undefined {
  if (timestamp === null || timestamp === 0 || timestamp === 0n) {
    return undefined;
  }

  try {
    switch (browser) {
      case 'chrome':
      case 'edge': {
        // Chrome/Edge: microseconds since 1601-01-01
        // Use bigint arithmetic to avoid precision loss
        const microsBigInt =
          typeof timestamp === 'bigint' ? timestamp : BigInt(Math.floor(timestamp));
        const millisFrom1601 = microsBigInt / 1000n;
        const millisFrom1970 = millisFrom1601 - CHROME_EPOCH_OFFSET_MS;
        return Number(millisFrom1970);
      }

      case 'firefox': {
        // Firefox: milliseconds since 1970-01-01 (already in JavaScript timestamp format)
        return typeof timestamp === 'bigint' ? Number(timestamp) : timestamp;
      }

      case 'safari': {
        // Safari: seconds since 2001-01-01 (CFAbsoluteTime)
        const seconds = typeof timestamp === 'bigint' ? Number(timestamp) : timestamp;
        return (seconds + SAFARI_EPOCH_OFFSET_S) * 1000;
      }

      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}

function expandHostCandidates(hostname: string): string[] {
  const parts = hostname.split('.');
  if (parts.length <= 1) {
    return [hostname];
  }
  const candidates: Set<string> = new Set();
  for (let i = 0; i <= parts.length - 2; i++) {
    const candidate = parts.slice(i).join('.');
    candidates.add(candidate);
  }
  return Array.from(candidates);
}

function buildHostWhereClause(hosts: string[], column: 'host_key'): string {
  const clauses: string[] = [];
  for (const host of hosts) {
    const candidates = expandHostCandidates(host);
    for (const candidate of candidates) {
      const escaped = sqlEscape(candidate);
      const escapedDot = sqlEscape(`.${candidate}`);
      const escapedLike = sqlEscape(`%.${candidate}`);
      clauses.push(`${column} = ${escaped}`);
      clauses.push(`${column} = ${escapedDot}`);
      clauses.push(`${column} LIKE ${escapedLike}`);
    }
  }
  return clauses.length ? clauses.join(' OR ') : '1=0';
}

function sqlEscape(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function getRawCookiesFromChromiumDb(
  dbPath: string,
  whereClause: string
): Promise<{ success: true; rows: ChromeCookieRow[] } | { success: false; error: string }> {
  try {
    const db = new Database(dbPath, { readonly: true });

    try {
      const sql = `
        SELECT
          name,
          value,
          encrypted_value,
          host_key,
          path,
          expires_utc,
          is_secure,
          is_httponly,
          samesite,
          top_frame_site_key,
          has_cross_site_ancestor
        FROM cookies
        WHERE ${whereClause}
        ORDER BY expires_utc DESC
      `;

      const stmt = db.prepare(sql);
      const rows = stmt.all() as ChromeCookieRow[];
      return { success: true, rows };
    } catch (error) {
      return { success: false, error: `SQL query failed: ${(error as Error).message}` };
    } finally {
      db.close();
    }
  } catch (error) {
    return { success: false, error: `Failed to open database: ${(error as Error).message}` };
  }
}

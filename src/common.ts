import { GetCookiesOptions, GetCookiesResult, Cookie, SameSiteValue } from './types.js';
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
};

export async function getCookiesFromChromeSqliteDB(
  options: GetCookiesOptions,
  origins: string[],
  cookieNames: Set<string> | null,
  decrypytFn: (encryptedValue: Uint8Array) => string | null
): Promise<GetCookiesResult> {
  const warnings: string[] = [];

  const tmpdirPath = mkdtempSync(path.join(tmpdir(), 'sqlite-cookie-temp-db-'));
  const tempDbPath = path.join(tmpdirPath, 'Cookies');
  try {
    copyFileSync(options.cookiePath, tempDbPath);
  } catch (error) {
    rmSync(tmpdirPath, { recursive: true, force: true });
    warnings.push(`Failed to copy cookie database: ${(error as Error).message}`);
    return { cookies: [], warnings };
  }

  try {
    const hosts = origins.map((origin) => new URL(origin).hostname);
    const whereClause = buildHostWhereClause(hosts, 'host_key');
    const rowsResult = await getRawCookiesFromChromeDb(tempDbPath, whereClause);

    if (!rowsResult.success) {
      rmSync(tmpdirPath, { recursive: true, force: true });
      warnings.push(rowsResult.error);
      return { cookies: [], warnings };
    }

    const partialOptions: { profile?: string; includeExpired?: boolean } = {};
    if (options.profile) {
      partialOptions.profile = options.profile;
    }
    if (options.includeExpired) {
      partialOptions.includeExpired = options.includeExpired;
    }
    const cookies = decryptRawCookiesFromChromeRows(
      rowsResult.rows,
      partialOptions,
      hosts,
      cookieNames,
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

function decryptRawCookiesFromChromeRows(
  rows: ChromeCookieRow[],
  options: { profile?: string; includeExpired?: boolean },
  hosts: string[],
  cookieNames: Set<string> | null,
  decryptFn: (encryptedValue: Uint8Array) => string | null,
  warnings: string[] = []
): Cookie[] {
  const cookies: Cookie[] = [];
  for (const row of rows) {
    const name = typeof row.name === 'string' ? row.name : '';
    if (cookieNames && !cookieNames.has(name)) {
      continue;
    }
    const host = typeof row.host_key === 'string' ? row.host_key : '';
    if (!host) {
      continue;
    }
    const hostTemp = host.startsWith('.') ? host.substring(1) : host;
    const domainLower = hostTemp.toLowerCase();
    if (
      !hosts.some((host) => {
        const hostLower = host.toLowerCase();
        return hostLower === domainLower || hostLower.endsWith(`.${domainLower}`);
      })
    ) {
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
    const expires = chromeTimestampToMillis(expiresUtc);

    // Check if cookie is expired (if not including expired cookies)
    if (!options.includeExpired && expires && expires < Date.now()) {
      continue;
    }

    const sameSite = normalizeSameSite(row.samesite);
    // Create Cookie object
    const cookie: Cookie = {
      name,
      value,
      encrypted: valueTemp === null,
      domain: host,
      path: typeof row.path === 'string' ? row.path : '/',
      expires: expires ?? undefined,
      secure: Boolean(row.is_secure),
      httpOnly: Boolean(row.is_httponly),
      sameSite,
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

/**
 * Convert Chrome/WebKit timestamp to JavaScript timestamp (milliseconds since 1970-01-01)
 * @param chromeTimestamp - Chrome timestamp (microseconds since 1601-01-01)
 * @returns Milliseconds since epoch (1970-01-01), or null if conversion fails
 */
function chromeTimestampToMillis(chromeTimestamp: number | bigint | null): number | undefined {
  if (chromeTimestamp === null || chromeTimestamp === 0 || chromeTimestamp === 0n) {
    return undefined;
  }

  try {
    // Convert bigint to number
    const microseconds =
      typeof chromeTimestamp === 'bigint' ? Number(chromeTimestamp) : chromeTimestamp;

    // Chrome timestamp: microseconds since 1601-01-01 00:00:00 UTC
    // JavaScript Date: milliseconds since 1970-01-01 00:00:00 UTC
    // Offset between 1601-01-01 and 1970-01-01 is 11644473600000 milliseconds
    const EPOCH_OFFSET_MS = 11644473600000;
    const millisecondsFrom1970 = microseconds / 1000 - EPOCH_OFFSET_MS;

    return millisecondsFrom1970;
  } catch (error) {
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
  return value.replace(/'/g, "''");
}

async function getRawCookiesFromChromeDb(
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
          samesite
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

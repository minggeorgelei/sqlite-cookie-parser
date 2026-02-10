import { homedir, tmpdir } from 'os';
import {
  copyFileSync,
  mkdtempSync,
  rmSync,
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  Dirent,
} from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import lz4 from 'lz4';
import {
  GetCookiesOptions,
  GetCookiesResult,
  Cookie,
  SameSiteValue,
  GetDBOptions,
} from '../types.js';
import { normalizeExpiration } from '../common.js';

type FirefoxCookieRow = {
  name?: unknown;
  value?: unknown;
  host?: unknown;
  path?: unknown;
  expiry?: unknown;
  isSecure?: unknown;
  isHttpOnly?: unknown;
  sameSite?: unknown;
  originAttributes?: unknown;
  isPartitionedAttributeSet?: unknown;
};

/**
 * Get cookies from Firefox (both persistent cookies from SQLite and session cookies from sessionstore)
 * @param options - Options for getting cookies
 * @param origins - List of origins to filter cookies by
 * @param cookieNames - Set of cookie names to filter (null for all)
 * @returns Promise resolving to cookies and warnings
 */
export async function getCookiesFromFirefoxSqlite(
  options: GetCookiesOptions,
  origins: string[],
  cookieNames: Set<string> | null
): Promise<GetCookiesResult> {
  const warnings: string[] = [];
  const allCookies: Cookie[] = [];

  // Parse hosts from origins, catch invalid URLs
  let hosts: string[];
  try {
    hosts = origins.map((origin) => new URL(origin).hostname);
  } catch (error) {
    warnings.push(`Invalid URL: ${(error as Error).message}`);
    return { cookies: [], warnings };
  }

  // 1. Get persistent cookies from cookies.sqlite
  const sqlDBPath = resolveFirefoxDBPath(options.profile);
  if (sqlDBPath) {
    const dbOptions: GetDBOptions = {
      dbPath: sqlDBPath,
      profile: options.profile,
      includeExpired: options.includeExpired,
      includePartitioned: options.includePartitioned,
    };

    const { cookies: persistentCookies, warnings: dbWarnings } =
      await getCookiesFromFirefoxSqliteDB(dbOptions, origins, cookieNames);
    allCookies.push(...persistentCookies);
    warnings.push(...dbWarnings);
  } else {
    warnings.push('Could not resolve Firefox cookie database path.');
  }

  // 2. Get session cookies from sessionstore (recovery.jsonlz4)
  const profileDir = resolveFirefoxProfileDir(options.profile);
  if (profileDir) {
    const sessionStorePath = path.join(profileDir, 'sessionstore-backups', 'recovery.jsonlz4');
    if (existsSync(sessionStorePath)) {
      try {
        const sessionData = readJsonLz4File(sessionStorePath);
        if (sessionData.cookies && Array.isArray(sessionData.cookies)) {
          const sessionCookies = parseSessionCookies(sessionData.cookies, hosts, cookieNames);
          // Avoid duplicates: only add session cookies that don't exist in persistent cookies
          const existingKeys = new Set(allCookies.map((c) => `${c.name}@${c.domain}`));
          for (const sc of sessionCookies) {
            const key = `${sc.name}@${sc.domain}`;
            if (!existingKeys.has(key)) {
              allCookies.push(sc);
            }
          }
        }
      } catch (error) {
        warnings.push(`Failed to parse sessionstore: ${(error as Error).message}`);
      }
    }
  }

  if (allCookies.length === 0 && warnings.length === 0) {
    warnings.push('No cookies found.');
  }

  return { cookies: allCookies, warnings };
}

/**
 * Get cookies from a Firefox SQLite database file
 */
async function getCookiesFromFirefoxSqliteDB(
  options: GetDBOptions,
  origins: string[],
  cookieNames: Set<string> | null
): Promise<GetCookiesResult> {
  const warnings: string[] = [];

  // Create a temporary copy of the database to avoid lock issues
  const tmpdirPath = mkdtempSync(path.join(tmpdir(), 'sqlite-cookie-firefox-db-'));
  const tempDbPath = path.join(tmpdirPath, 'cookies.sqlite');
  try {
    copyFileSync(options.dbPath, tempDbPath);
  } catch (error) {
    rmSync(tmpdirPath, { recursive: true, force: true });
    warnings.push(`Failed to copy cookie database: ${(error as Error).message}`);
    return { cookies: [], warnings };
  }

  try {
    const hosts = origins.map((origin) => new URL(origin).hostname);
    const whereClause = buildHostWhereClause(hosts);
    const rowsResult = await getRawCookiesFromFirefoxDb(tempDbPath, whereClause);

    if (!rowsResult.success) {
      rmSync(tmpdirPath, { recursive: true, force: true });
      warnings.push(rowsResult.error);
      return { cookies: [], warnings };
    }

    const cookies = parseFirefoxCookieRows(rowsResult.rows, options, hosts, cookieNames, warnings);

    rmSync(tmpdirPath, { recursive: true, force: true });
    return { cookies, warnings };
  } catch (error) {
    rmSync(tmpdirPath, { recursive: true, force: true });
    warnings.push(`Failed to get cookies: ${(error as Error).message}`);
    return { cookies: [], warnings };
  }
}

/**
 * Parse raw Firefox cookie rows into Cookie objects
 */
function parseFirefoxCookieRows(
  rows: FirefoxCookieRow[],
  options: GetCookiesOptions,
  hosts: string[],
  cookieNames: Set<string> | null,
  warnings: string[] = []
): Cookie[] {
  const cookies: Cookie[] = [];

  for (const row of rows) {
    const name = typeof row.name === 'string' ? row.name : '';
    if (cookieNames && !cookieNames.has(name)) {
      continue;
    }

    const hostString = typeof row.host === 'string' ? row.host : '';
    if (!hostString) {
      continue;
    }

    // Firefox uses host without leading dot for exact match, with leading dot for subdomain match
    const host = hostString.startsWith('.') ? hostString.substring(1) : hostString;
    const domainLower = host.toLowerCase();

    // Check if this cookie matches any of the requested hosts
    if (
      !hosts.some((h) => {
        const hostLower = h.toLowerCase();
        return hostLower === domainLower || hostLower.endsWith(`.${domainLower}`);
      })
    ) {
      continue;
    }

    // Parse partition key from originAttributes
    // Firefox stores partition info in originAttributes like "^partitionKey=(https,example.com)"
    const partitionKey = parseFirefoxPartitionKey(row.originAttributes);

    // Filter out partitioned cookies by default
    if (!options.includePartitioned && partitionKey) {
      continue;
    }

    // Firefox stores value as plain text (no encryption)
    const value = typeof row.value === 'string' ? row.value : null;
    if (value === null) {
      warnings.push(`Invalid cookie value for cookie "${name}" at host "${host}"`);
      continue;
    }

    const expiry =
      typeof row.expiry === 'number' || typeof row.expiry === 'bigint'
        ? row.expiry
        : tryParseInt(row.expiry);

    // Convert Firefox timestamp to JavaScript timestamp (milliseconds)
    // Firefox uses seconds since 1970-01-01
    const expires = normalizeExpiration(expiry, 'firefox');

    // Check if cookie is expired (if not including expired cookies)
    if (!options.includeExpired && expires && expires < Date.now()) {
      continue;
    }

    const secure =
      row.isSecure === 1 || row.isSecure === true || row.isSecure === 1n || row.isSecure === '1';
    const httpOnly =
      row.isHttpOnly === 1 ||
      row.isHttpOnly === true ||
      row.isHttpOnly === 1n ||
      row.isHttpOnly === '1';

    const sameSite = normalizeSameSite(row.sameSite);
    const rowPath = typeof row.path === 'string' ? row.path : '';

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
    // Firefox sameSite values: 0=none, 1=lax, 2=strict
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
        return 'none';
      case 'lax':
        return 'lax';
      case 'strict':
        return 'strict';
      default:
        return undefined;
    }
  }
  return undefined;
}

function tryParseInt(value: unknown): number | null {
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Parse partition key from Firefox originAttributes
 * Firefox stores partition info in originAttributes like "^partitionKey=(https,example.com)"
 * @param originAttributes - The originAttributes string from Firefox cookie
 * @returns The partition key URL or undefined if not partitioned
 */
function parseFirefoxPartitionKey(originAttributes: unknown): string | undefined {
  if (typeof originAttributes !== 'string' || !originAttributes) {
    return undefined;
  }

  // Firefox originAttributes format: ^partitionKey=(scheme,domain)
  // Example: ^partitionKey=(https,example.com)
  const partitionMatch = originAttributes.match(/\^partitionKey=\(([^,]+),([^)]+)\)/);
  if (partitionMatch) {
    const [, scheme, domain] = partitionMatch;
    return `${scheme}://${domain}`;
  }

  return undefined;
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

function buildHostWhereClause(hosts: string[]): string {
  const clauses: string[] = [];
  for (const host of hosts) {
    const candidates = expandHostCandidates(host);
    for (const candidate of candidates) {
      const escaped = sqlEscape(candidate);
      const escapedDot = sqlEscape(`.${candidate}`);
      const escapedLike = sqlEscape(`%.${candidate}`);
      clauses.push(`host = ${escaped}`);
      clauses.push(`host = ${escapedDot}`);
      clauses.push(`host LIKE ${escapedLike}`);
    }
  }
  return clauses.length ? clauses.join(' OR ') : '1=0';
}

function sqlEscape(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function getRawCookiesFromFirefoxDb(
  dbPath: string,
  whereClause: string
): Promise<{ success: true; rows: FirefoxCookieRow[] } | { success: false; error: string }> {
  try {
    const db = new Database(dbPath, { readonly: true });

    try {
      const sql = `
        SELECT
          name,
          value,
          host,
          path,
          expiry,
          isSecure,
          isHttpOnly,
          sameSite,
          originAttributes,
          isPartitionedAttributeSet
        FROM moz_cookies
        WHERE ${whereClause}
        ORDER BY expiry DESC
      `;

      const stmt = db.prepare(sql);
      const rows = stmt.all() as FirefoxCookieRow[];
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

/**
 * Resolve Firefox cookie database path
 * Firefox profile structure:
 * - macOS: ~/Library/Application Support/Firefox/Profiles/<profile>/cookies.sqlite
 * - Linux: ~/.mozilla/firefox/<profile>/cookies.sqlite
 * - Windows: %APPDATA%\Mozilla\Firefox\Profiles\<profile>\cookies.sqlite
 */
function resolveFirefoxDBPath(profile?: string): string | null {
  // If profile is a direct file path
  if (profile) {
    const stat = statSync(profile, { throwIfNoEntry: false });
    if (stat && stat.isFile()) {
      return profile;
    }
    // Could be path to profile directory
    if (stat && stat.isDirectory()) {
      const cookiePath = path.join(profile, 'cookies.sqlite');
      if (existsSync(cookiePath)) {
        return cookiePath;
      }
    }
  }

  const profilesDir = getFirefoxProfilesDir();
  if (!profilesDir || !existsSync(profilesDir)) {
    return null;
  }

  const profileDirs = getFirefoxProfileDirs(profilesDir);

  // If profile name is specified, look for matching profile directory
  if (profile) {
    const candidates = findFirefoxProfileDirs(profileDirs, profile);
    for (const candidate of candidates) {
      const cookiePath = path.join(candidate, 'cookies.sqlite');
      if (existsSync(cookiePath)) {
        return cookiePath;
      }
    }
    return null;
  }

  // No profile specified, try to find the default profile
  // Prefer default-release profile, then default profile, then any profile
  const defaultRelease = profileDirs.find((dir) => dir.endsWith('.default-release'));
  if (defaultRelease) {
    const cookiePath = path.join(defaultRelease, 'cookies.sqlite');
    if (existsSync(cookiePath)) {
      return cookiePath;
    }
  }

  const defaultProfile = profileDirs.find((dir) => dir.endsWith('.default'));
  if (defaultProfile) {
    const cookiePath = path.join(defaultProfile, 'cookies.sqlite');
    if (existsSync(cookiePath)) {
      return cookiePath;
    }
  }

  // Try any profile that has cookies.sqlite
  for (const profileDir of profileDirs) {
    const cookiePath = path.join(profileDir, 'cookies.sqlite');
    if (existsSync(cookiePath)) {
      return cookiePath;
    }
  }

  return null;
}

function getFirefoxProfilesDir(): string | null {
  const homeDir = homedir();
  const platform = process.platform;

  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', 'Firefox', 'Profiles');
  } else if (platform === 'linux') {
    return path.join(homeDir, '.mozilla', 'firefox');
  } else if (platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
      'Mozilla',
      'Firefox',
      'Profiles'
    );
  }
  return null;
}

function getFirefoxProfileDirs(profilesDir: string): string[] {
  try {
    const entries = readdirSync(profilesDir, { withFileTypes: true });
    return entries
      .filter((entry: Dirent) => entry.isDirectory())
      .map((entry: Dirent) => path.join(profilesDir, entry.name));
  } catch {
    return [];
  }
}

function findFirefoxProfileDirs(profileDirs: string[], profileName: string): string[] {
  const lowerProfile = profileName.toLowerCase();

  const matchDirs = profileDirs.filter((dir) => {
    const dirName = path.basename(dir).toLowerCase();
    return dirName === lowerProfile;
  });

  if (matchDirs.length > 0) {
    return matchDirs;
  }

  return [];
}

// ============ Session Cookies from sessionstore ============

interface FirefoxSessionCookie {
  name?: string;
  value?: string;
  host?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
}

interface FirefoxSessionData {
  cookies?: FirefoxSessionCookie[];
}

/**
 * Read and decompress a Firefox jsonlz4 file
 * Format: 8-byte magic header "mozLz40\0" + 4-byte decompressed size (LE) + LZ4 block data
 */
function readJsonLz4File(filePath: string): FirefoxSessionData {
  const buffer = readFileSync(filePath);

  // Check magic header
  const magic = buffer.subarray(0, 8).toString('ascii');
  if (magic !== 'mozLz40\0') {
    throw new Error(`Invalid jsonlz4 magic header: ${magic}`);
  }

  // Read decompressed size from bytes 8-11 (little-endian)
  const decompressedSize = buffer.readUInt32LE(8);

  // Decompress LZ4 data (skip 8-byte header + 4-byte size = 12 bytes)
  const compressed = buffer.subarray(12);
  const outputBuffer = Buffer.alloc(decompressedSize);
  lz4.decodeBlock(compressed, outputBuffer);

  const jsonStr = outputBuffer.toString('utf8');
  return JSON.parse(jsonStr) as FirefoxSessionData;
}

/**
 * Parse session cookies and filter by hosts and cookie names
 */
function parseSessionCookies(
  sessionCookies: FirefoxSessionCookie[],
  hosts: string[],
  cookieNames: Set<string> | null
): Cookie[] {
  const cookies: Cookie[] = [];

  for (const sc of sessionCookies) {
    const name = sc.name || '';
    if (cookieNames && !cookieNames.has(name)) {
      continue;
    }

    const hostString = sc.host || '';
    if (!hostString) {
      continue;
    }

    const host = hostString.startsWith('.') ? hostString.substring(1) : hostString;
    const domainLower = host.toLowerCase();

    // Check if this cookie matches any of the requested hosts
    if (
      !hosts.some((h) => {
        const hostLower = h.toLowerCase();
        return hostLower === domainLower || hostLower.endsWith(`.${domainLower}`);
      })
    ) {
      continue;
    }

    const cookie: Cookie = {
      name,
      value: sc.value || '',
      domain: host,
      path: sc.path || '/',
      expires: undefined, // Session cookies have no expiry
      secure: sc.secure || false,
      httpOnly: sc.httpOnly || false,
    };

    cookies.push(cookie);
  }

  return cookies;
}

/**
 * Resolve Firefox profile directory path
 */
function resolveFirefoxProfileDir(profile?: string): string | null {
  // If profile is a directory path
  if (profile) {
    const stat = statSync(profile, { throwIfNoEntry: false });
    if (stat && stat.isDirectory()) {
      return profile;
    }
    if (stat && stat.isFile()) {
      return path.dirname(profile);
    }
  }

  const profilesDir = getFirefoxProfilesDir();
  if (!profilesDir || !existsSync(profilesDir)) {
    return null;
  }

  const profileDirs = getFirefoxProfileDirs(profilesDir);

  // If profile name is specified, look for matching profile directory
  if (profile) {
    const candidates = findFirefoxProfileDirs(profileDirs, profile);
    if (candidates.length > 0) {
      return candidates[0];
    }
    return null;
  }

  // No profile specified, try to find the default profile
  const defaultRelease = profileDirs.find((dir) => dir.endsWith('.default-release'));
  if (defaultRelease) {
    return defaultRelease;
  }

  const defaultProfile = profileDirs.find((dir) => dir.endsWith('.default'));
  if (defaultProfile) {
    return defaultProfile;
  }

  // Return first available profile
  return profileDirs.length > 0 ? profileDirs[0] : null;
}

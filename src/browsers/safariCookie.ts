import { homedir, tmpdir } from 'os';
import { copyFileSync, mkdtempSync, rmSync, existsSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { GetCookiesOptions, GetCookiesResult, Cookie } from '../types.js';
import { normalizeExpiration } from '../common.js';

/**
 * Safari BinaryCookies file format:
 * - Magic: "cook" (4 bytes)
 * - Number of pages: uint32 BE
 * - Page sizes: uint32 BE × numPages
 * - Pages data (concatenated)
 * - Checksum (8 bytes)
 *
 * Each page:
 * - Page header: 0x00000100 (4 bytes LE)
 * - Number of cookies: uint32 LE
 * - Cookie offsets: uint32 LE × numCookies
 * - Page end marker: 0x00000000 (4 bytes)
 * - Cookie records
 *
 * Each cookie record:
 * - Size: uint32 LE
 * - Flags: uint32 LE (bit 0 = secure, bit 2 = httpOnly)
 * - Unknown: 4 bytes
 * - URL offset: uint32 LE (relative to cookie start)
 * - Name offset: uint32 LE (relative to cookie start)
 * - Path offset: uint32 LE (relative to cookie start)
 * - Value offset: uint32 LE (relative to cookie start)
 * - Comment: 8 bytes
 * - Expiry date: float64 LE (CFAbsoluteTime, seconds since 2001-01-01)
 * - Creation date: float64 LE (CFAbsoluteTime)
 */

interface RawSafariCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expiry: number;
  secure: boolean;
  httpOnly: boolean;
}

const BINARY_COOKIES_MAGIC = 'cook';

/**
 * Get cookies from Safari's Cookies.binarycookies file
 * @param options - Options for getting cookies
 * @param origins - List of origins to filter cookies by
 * @param cookieNames - Set of cookie names to filter (null for all)
 * @returns Promise resolving to cookies and warnings
 */
export async function getCookiesFromSafari(
  options: GetCookiesOptions,
  origins: string[],
  cookieNames: Set<string> | null
): Promise<GetCookiesResult> {
  const warnings: string[] = [];

  if (process.platform !== 'darwin') {
    warnings.push('Safari cookies are only supported on macOS.');
    return { cookies: [], warnings };
  }

  // Parse hosts from origins
  let hosts: string[];
  try {
    hosts = origins.map((origin) => new URL(origin).hostname);
  } catch (error) {
    warnings.push(`Invalid URL: ${(error as Error).message}`);
    return { cookies: [], warnings };
  }

  const cookieFilePath = resolveSafariCookiePath(options.profile);
  if (!cookieFilePath) {
    warnings.push('Could not find Safari cookie file.');
    return { cookies: [], warnings };
  }

  // Copy the file to a temp location to avoid lock issues
  const tmpdirPath = mkdtempSync(path.join(tmpdir(), 'sqlite-cookie-safari-'));
  const tempFilePath = path.join(tmpdirPath, 'Cookies.binarycookies');
  try {
    copyFileSync(cookieFilePath, tempFilePath);
  } catch (error) {
    rmSync(tmpdirPath, { recursive: true, force: true });
    warnings.push(`Failed to copy Safari cookie file: ${(error as Error).message}`);
    return { cookies: [], warnings };
  }

  try {
    const fileBuffer = readFileSync(tempFilePath);
    const rawCookies = parseBinaryCookies(fileBuffer);
    const cookies = filterAndConvertCookies(rawCookies, options, hosts, cookieNames);

    rmSync(tmpdirPath, { recursive: true, force: true });

    if (cookies.length === 0 && warnings.length === 0) {
      warnings.push('No cookies found.');
    }

    return { cookies, warnings };
  } catch (error) {
    rmSync(tmpdirPath, { recursive: true, force: true });
    warnings.push(`Failed to parse Safari cookie file: ${(error as Error).message}`);
    return { cookies: [], warnings };
  }
}

/**
 * Parse Safari's BinaryCookies file format
 */
function parseBinaryCookies(buffer: Buffer): RawSafariCookie[] {
  let offset = 0;

  // Validate magic header
  const magic = buffer.subarray(0, 4).toString('ascii');
  if (magic !== BINARY_COOKIES_MAGIC) {
    throw new Error(`Invalid BinaryCookies magic: expected "${BINARY_COOKIES_MAGIC}", got "${magic}"`);
  }
  offset = 4;

  // Number of pages (big-endian)
  const numPages = buffer.readUInt32BE(offset);
  offset += 4;

  // Page sizes (big-endian)
  const pageSizes: number[] = [];
  for (let i = 0; i < numPages; i++) {
    pageSizes.push(buffer.readUInt32BE(offset));
    offset += 4;
  }

  // Parse each page
  const cookies: RawSafariCookie[] = [];
  for (let i = 0; i < numPages; i++) {
    const pageStart = offset;
    const pageBuffer = buffer.subarray(pageStart, pageStart + pageSizes[i]);
    const pageCookies = parsePage(pageBuffer);
    cookies.push(...pageCookies);
    offset += pageSizes[i];
  }

  return cookies;
}

/**
 * Parse a single page of cookies
 */
function parsePage(page: Buffer): RawSafariCookie[] {
  let offset = 0;

  // Page header (0x00000100, little-endian)
  // const pageHeader = page.readUInt32LE(offset);
  offset += 4;

  // Number of cookies in this page
  const numCookies = page.readUInt32LE(offset);
  offset += 4;

  // Cookie offsets (relative to page start)
  const cookieOffsets: number[] = [];
  for (let i = 0; i < numCookies; i++) {
    cookieOffsets.push(page.readUInt32LE(offset));
    offset += 4;
  }

  // Parse each cookie
  const cookies: RawSafariCookie[] = [];
  for (const cookieOffset of cookieOffsets) {
    try {
      const cookie = parseCookieRecord(page, cookieOffset);
      if (cookie) {
        cookies.push(cookie);
      }
    } catch {
      // Skip malformed cookie records
    }
  }

  return cookies;
}

/**
 * Parse a single cookie record from the page buffer
 */
function parseCookieRecord(page: Buffer, startOffset: number): RawSafariCookie | null {
  let offset = startOffset;

  // Cookie size
  // const cookieSize = page.readUInt32LE(offset);
  offset += 4;

  // Flags (bit 0 = secure, bit 2 = httpOnly)
  const flags = page.readUInt32LE(offset);
  offset += 4;

  // Unknown fields (2 × 4 bytes)
  offset += 8;

  // String offsets (relative to cookie start)
  const urlOffset = page.readUInt32LE(offset);
  offset += 4;
  const nameOffset = page.readUInt32LE(offset);
  offset += 4;
  const pathOffset = page.readUInt32LE(offset);
  offset += 4;
  const valueOffset = page.readUInt32LE(offset);
  offset += 4;

  // Comment/unknown (8 bytes, skip)
  offset += 8;

  // Expiry date (CFAbsoluteTime, float64 LE)
  const expiry = page.readDoubleLE(offset);
  offset += 8;

  // Creation date (skip)
  // offset += 8;

  // Read null-terminated strings
  const domain = readNullTerminatedString(page, startOffset + urlOffset);
  const name = readNullTerminatedString(page, startOffset + nameOffset);
  const cookiePath = readNullTerminatedString(page, startOffset + pathOffset);
  const value = readNullTerminatedString(page, startOffset + valueOffset);

  const secure = (flags & 0x1) !== 0;
  const httpOnly = (flags & 0x4) !== 0;

  return {
    name,
    value,
    domain,
    path: cookiePath,
    expiry,
    secure,
    httpOnly,
  };
}

/**
 * Read a null-terminated string from a buffer
 */
function readNullTerminatedString(buffer: Buffer, offset: number): string {
  if (offset < 0 || offset >= buffer.length) {
    return '';
  }
  const end = buffer.indexOf(0, offset);
  if (end === -1) {
    return buffer.subarray(offset).toString('utf8');
  }
  return buffer.subarray(offset, end).toString('utf8');
}

/**
 * Filter raw Safari cookies by host, name, and expiry, then convert to Cookie objects
 */
function filterAndConvertCookies(
  rawCookies: RawSafariCookie[],
  options: GetCookiesOptions,
  hosts: string[],
  cookieNames: Set<string> | null
): Cookie[] {
  const cookies: Cookie[] = [];

  for (const raw of rawCookies) {
    // Filter by cookie name
    if (cookieNames && !cookieNames.has(raw.name)) {
      continue;
    }

    // Normalize domain (remove leading dot)
    const domain = raw.domain.startsWith('.') ? raw.domain.substring(1) : raw.domain;
    const domainLower = domain.toLowerCase();

    // Check if this cookie matches any of the requested hosts
    if (
      !hosts.some((h) => {
        const hostLower = h.toLowerCase();
        return hostLower === domainLower || hostLower.endsWith(`.${domainLower}`);
      })
    ) {
      continue;
    }

    // Convert expiry (CFAbsoluteTime -> JS milliseconds)
    const expires = normalizeExpiration(raw.expiry, 'safari');

    // Filter expired cookies
    if (!options.includeExpired && expires && expires < Date.now()) {
      continue;
    }

    const cookie: Cookie = {
      name: raw.name,
      value: raw.value,
      domain,
      path: raw.path || '/',
      expires,
      secure: raw.secure,
      httpOnly: raw.httpOnly,
    };

    cookies.push(cookie);
  }

  return cookies;
}

/**
 * Resolve the path to Safari's Cookies.binarycookies file
 *
 * Safari cookie file locations on macOS:
 * - ~/Library/Cookies/Cookies.binarycookies (traditional)
 * - ~/Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies (sandboxed)
 */
function resolveSafariCookiePath(profile?: string): string | null {
  // If profile is a direct file path
  if (profile) {
    const stat = statSync(profile, { throwIfNoEntry: false });
    if (stat && stat.isFile()) {
      return profile;
    }
    // Could be a directory containing the cookie file
    if (stat && stat.isDirectory()) {
      const cookiePath = path.join(profile, 'Cookies.binarycookies');
      if (existsSync(cookiePath)) {
        return cookiePath;
      }
    }
  }

  const homeDir = homedir();

  // Try sandboxed location first (newer macOS)
  const sandboxedPath = path.join(
    homeDir,
    'Library',
    'Containers',
    'com.apple.Safari',
    'Data',
    'Library',
    'Cookies',
    'Cookies.binarycookies'
  );
  if (existsSync(sandboxedPath)) {
    return sandboxedPath;
  }

  // Traditional location
  const traditionalPath = path.join(homeDir, 'Library', 'Cookies', 'Cookies.binarycookies');
  if (existsSync(traditionalPath)) {
    return traditionalPath;
  }

  return null;
}

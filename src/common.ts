import { GetCookiesOptions, GetCookiesResult, Cookie } from './types.js';
import { tmpdir } from 'os';
import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'fs';
import path from 'path';

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
    return { cookies: [], warnings };
  } catch (error) {}
  return { cookies: [], warnings };
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

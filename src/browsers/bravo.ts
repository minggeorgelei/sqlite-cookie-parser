import { GetCookiesOptions, GetCookiesResult } from '../types.js';
import { getCookiesFromBraveMacSqlite } from '../bravoMacCookie.js';
import { getCookiesFromBraveWindowsSqlite } from '../bravoWindowsCookie.js';
import { getCookiesFromBraveLinuxSqlite } from '../bravoLinuxCookie.js';

export async function getCookiesFromBrave(
  options: GetCookiesOptions,
  origins: string[],
  cookieNames: Set<string> | null
): Promise<GetCookiesResult> {
  const warnings: string[] = [];

  if (process.platform === 'darwin') {
    const result = await getCookiesFromBraveMacSqlite(options, origins, cookieNames);
    warnings.push(...result.warnings);
    return { cookies: result.cookies, warnings };
  }

  if (process.platform === 'win32') {
    const result = await getCookiesFromBraveWindowsSqlite(options, origins, cookieNames);
    warnings.push(...result.warnings);
    return { cookies: result.cookies, warnings };
  }

  if (process.platform === 'linux') {
    const result = await getCookiesFromBraveLinuxSqlite(options, origins, cookieNames);
    warnings.push(...result.warnings);
    return { cookies: result.cookies, warnings };
  }

  return { cookies: [], warnings };
}

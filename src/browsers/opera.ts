import { GetCookiesOptions, GetCookiesResult } from '../types.js';
import { getCookiesFromOperaMacSqlite } from '../operaMacCookie.js';
import { getCookiesFromOperaWindowsSqlite } from '../operaWindowsCookie.js';
import { getCookiesFromOperaLinuxSqlite } from '../operaLinuxCookie.js';

export async function getCookiesFromOpera(
  options: GetCookiesOptions,
  origins: string[],
  cookieNames: Set<string> | null
): Promise<GetCookiesResult> {
  const warnings: string[] = [];

  if (process.platform === 'darwin') {
    const result = await getCookiesFromOperaMacSqlite(options, origins, cookieNames);
    warnings.push(...result.warnings);
    return { cookies: result.cookies, warnings };
  }

  if (process.platform === 'win32') {
    const result = await getCookiesFromOperaWindowsSqlite(options, origins, cookieNames);
    warnings.push(...result.warnings);
    return { cookies: result.cookies, warnings };
  }

  if (process.platform === 'linux') {
    const result = await getCookiesFromOperaLinuxSqlite(options, origins, cookieNames);
    warnings.push(...result.warnings);
    return { cookies: result.cookies, warnings };
  }

  return { cookies: [], warnings };
}

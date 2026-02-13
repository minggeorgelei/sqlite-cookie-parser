import { GetCookiesOptions, GetCookiesResult } from '../types';
import { getCookiesFromChromeSqlite } from '../chromeMacCookie';
import { getCookiesFromChromeWindowsSqlite } from '../chromeWindowsCookie';
import { getCookiesFromChromeLinuxSqlite } from '../chromeLinuxCookie';

export async function getCookiesFromChrome(
  options: GetCookiesOptions,
  origins: string[],
  cookieNames: Set<string> | null
): Promise<GetCookiesResult> {
  const warnings: string[] = [];

  if (process.platform === 'darwin') {
    const result = await getCookiesFromChromeSqlite(options, origins, cookieNames);
    warnings.push(...result.warnings);
    return { cookies: result.cookies, warnings };
  }

  if (process.platform === 'win32') {
    const result = await getCookiesFromChromeWindowsSqlite(options, origins, cookieNames);
    warnings.push(...result.warnings);
    return { cookies: result.cookies, warnings };
  }

  if (process.platform === 'linux') {
    const result = await getCookiesFromChromeLinuxSqlite(options, origins, cookieNames);
    warnings.push(...result.warnings);
    return { cookies: result.cookies, warnings };
  }

  return { cookies: [], warnings };
}

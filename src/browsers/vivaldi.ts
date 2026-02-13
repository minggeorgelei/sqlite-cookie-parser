import { GetCookiesOptions, GetCookiesResult } from '../types';
import { getCookiesFromVivaldiMacSqlite } from '../vivaldiMacCookie';
import { getCookiesFromVivaldiWindowsSqlite } from '../vivaldiWindowsCookie';
import { getCookiesFromVivaldiLinuxSqlite } from '../vivaldiLinuxCookie';

export async function getCookiesFromVivaldi(
  options: GetCookiesOptions,
  origins: string[],
  cookieNames: Set<string> | null
): Promise<GetCookiesResult> {
  const warnings: string[] = [];

  if (process.platform === 'darwin') {
    const result = await getCookiesFromVivaldiMacSqlite(options, origins, cookieNames);
    warnings.push(...result.warnings);
    return { cookies: result.cookies, warnings };
  }

  if (process.platform === 'win32') {
    const result = await getCookiesFromVivaldiWindowsSqlite(options, origins, cookieNames);
    warnings.push(...result.warnings);
    return { cookies: result.cookies, warnings };
  }

  if (process.platform === 'linux') {
    const result = await getCookiesFromVivaldiLinuxSqlite(options, origins, cookieNames);
    warnings.push(...result.warnings);
    return { cookies: result.cookies, warnings };
  }

  return { cookies: [], warnings };
}

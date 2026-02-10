import { GetCookiesOptions, GetCookiesResult } from '../types.js';
import { getCookiesFromEdgeSqlite } from '../edgeMacCookie.js';
import { getCookiesFromEdgeWindowsSqlite } from '../edgeWindowsCookie.js';

export async function getCookiesFromEdge(
  options: GetCookiesOptions,
  origins: string[],
  cookieNames: Set<string> | null
): Promise<GetCookiesResult> {
  const warnings: string[] = [];

  if (process.platform === 'darwin') {
    const result = await getCookiesFromEdgeSqlite(options, origins, cookieNames);
    warnings.push(...result.warnings);
    return { cookies: result.cookies, warnings };
  }

  if (process.platform === 'win32') {
    const result = await getCookiesFromEdgeWindowsSqlite(options, origins, cookieNames);
    warnings.push(...result.warnings);
    return { cookies: result.cookies, warnings };
  }

  return { cookies: [], warnings };
}

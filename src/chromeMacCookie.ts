import { homedir } from 'os';
import { resolveChromeDefaultorSpecificDBPath } from './util/fileHelper.js';

export async function getCookiesFromChromeSqliteDB(
  options: { profile?: string; includeExpired?: boolean },
  origins: string[],
  cookieNames: Set<string> | null
) {}

function resolveChromeDBPath(profile?: string): string | null {
  const homeDir = homedir();
  const rootPath = `${homeDir}/Library/Application Support/Google/Chrome`;
  return resolveChromeDefaultorSpecificDBPath([rootPath], profile);
}

import { homedir } from 'os';
import { resolveChromeDefaultorSpecificDBPath } from './util/fileHelper.js';
import { GetCookiesOptions, GetCookiesResult, GetDBOptions } from './types.js';
import { findFirstMacKeyChainPassword } from './util/macKeyChain.js';
import { getAES128CBCKey, decryptChomiumAES128CBCCookieValue } from './util/crypto.js';
import { getCookiesFromChromeSqliteDB } from './common.js';

export async function getCookiesFromChromeSqlite(
  options: GetCookiesOptions,
  origins: string[],
  cookieNames: Set<string> | null
): Promise<GetCookiesResult> {
  const sqDBPath = resolveChromeDBPath(options.profile);
  if (!sqDBPath) {
    return {
      cookies: [],
      warnings: ['Could not resolve Chrome cookie database path.'],
    };
  }

  const warnings: string[] = [];

  const passwordResult = await findFirstMacKeyChainPassword(
    ['Chrome Safe Storage'],
    'Chrome',
    5000,
    'Chrome Safe Storage'
  );
  if (!passwordResult.success) {
    warnings.push(`Failed to get Chrome decryption key: ${passwordResult.error}`);
    return { cookies: [], warnings };
  }

  const chromePassword = passwordResult.password.trim();
  if (!chromePassword) {
    warnings.push('Chrome decryption key is empty.');
    return { cookies: [], warnings };
  }

  // iterations is 1003 for macOS Chrome
  const key = getAES128CBCKey(chromePassword, 1003);
  const decryptFn = (encryptedValue: Uint8Array): string | null => {
    return decryptChomiumAES128CBCCookieValue(encryptedValue, [key]);
  };

  const dbOptions: GetDBOptions = {
    dbPath: sqDBPath,
  };
  dbOptions.profile = options.profile;
  dbOptions.includeExpired = options.includeExpired;

  const { cookies, warnings: dbWarnings } = await getCookiesFromChromeSqliteDB(
    dbOptions,
    origins,
    cookieNames,
    decryptFn
  );
  warnings.push(...dbWarnings);

  return { cookies, warnings };
}

function resolveChromeDBPath(profile?: string): string | null {
  const homeDir = homedir();
  const rootPath = `${homeDir}/Library/Application Support/Google/Chrome`;
  return resolveChromeDefaultorSpecificDBPath([rootPath], profile);
}

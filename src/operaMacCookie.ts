import { homedir } from 'os';
import { resolveBrowserDefaultorSpecificDBPath } from './util/fileHelper.js';
import { GetCookiesOptions, GetCookiesResult, GetDBOptions } from './types.js';
import { findFirstMacKeyChainPassword } from './util/macKeyChain.js';
import { getAES128CBCKey, decryptChomiumAES128CBCCookieValue } from './util/crypto.js';
import { getCookiesFromChromiumSqliteDB } from './common.js';

export async function getCookiesFromOperaMacSqlite(
  options: GetCookiesOptions,
  origins: string[],
  cookieNames: Set<string> | null
): Promise<GetCookiesResult> {
  const sqlDBPath = resolveOperaMacDBPath(options.profile);
  if (!sqlDBPath) {
    return {
      cookies: [],
      warnings: ['Could not resolve Opera cookie database path.'],
    };
  }

  const warnings: string[] = [];

  const passwordResult = await findFirstMacKeyChainPassword(
    ['Opera Safe Storage'],
    'Opera',
    5000,
    'Opera Safe Storage'
  );
  if (!passwordResult.success) {
    warnings.push(`Failed to get Opera decryption key: ${passwordResult.error}`);
    return { cookies: [], warnings };
  }

  const operaPassword = passwordResult.password.trim();
  if (!operaPassword) {
    warnings.push('Opera decryption key is empty.');
    return { cookies: [], warnings };
  }

  // iterations is 1003 for macOS Opera (same as Chrome)
  const key = getAES128CBCKey(operaPassword, 1003);
  const decryptFn = (encryptedValue: Uint8Array): string | null => {
    return decryptChomiumAES128CBCCookieValue(encryptedValue, [key]);
  };

  const dbOptions: GetDBOptions = {
    dbPath: sqlDBPath,
  };
  dbOptions.profile = options.profile;
  dbOptions.includeExpired = options.includeExpired;

  const { cookies, warnings: dbWarnings } = await getCookiesFromChromiumSqliteDB(
    dbOptions,
    origins,
    cookieNames,
    'opera',
    decryptFn
  );
  warnings.push(...dbWarnings);

  return { cookies, warnings };
}

function resolveOperaMacDBPath(profile?: string): string | null {
  const homeDir = homedir();
  const rootPath = `${homeDir}/Library/Application Support/com.operasoftware.Opera`;
  return resolveBrowserDefaultorSpecificDBPath([rootPath], profile);
}

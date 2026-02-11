import { homedir } from 'os';
import { resolveBrowserDefaultorSpecificDBPath } from './util/fileHelper.js';
import { GetCookiesOptions, GetCookiesResult, GetDBOptions } from './types.js';
import { getAES128CBCKey, decryptChomiumAES128CBCCookieValue } from './util/crypto.js';
import { getCookiesFromChromiumSqliteDB } from './common.js';
import { findLinuxChromiumPassword } from './util/linuxKeyring.js';

export async function getCookiesFromOperaLinuxSqlite(
  options: GetCookiesOptions,
  origins: string[],
  cookieNames: Set<string> | null
): Promise<GetCookiesResult> {
  const sqlDBPath = resolveOperaLinuxDBPath(options.profile);
  if (!sqlDBPath) {
    return {
      cookies: [],
      warnings: ['Could not resolve Opera cookie database path on Linux.'],
    };
  }

  const warnings: string[] = [];

  const passwordResult = await findLinuxChromiumPassword('opera', 'Opera Safe Storage', 5000);
  if (passwordResult.warnings.length > 0) {
    warnings.push(...passwordResult.warnings);
  }

  // iterations is 1 for Linux Opera (same as Linux Chrome)
  const key = getAES128CBCKey(passwordResult.password, 1);
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

function resolveOperaLinuxDBPath(profile?: string): string | null {
  const homeDir = homedir();
  const roots = [`${homeDir}/.config/opera`];
  return resolveBrowserDefaultorSpecificDBPath(roots, profile);
}

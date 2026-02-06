import { GetCookiesOptions, GetCookiesResult, GetDBOptions } from './types.js';
import { homedir } from 'os';
import { resolveBrowserDefaultorSpecificDBPath } from './util/fileHelper.js';
import { findFirstMacKeyChainPassword } from './util/macKeyChain.js';
import { getAES128CBCKey, decryptChomiumAES128CBCCookieValue } from './util/crypto.js';
import { getCookiesFromChromiumSqliteDB } from './common.js';

export async function getCookiesFromEdgeSqlite(
  options: GetCookiesOptions,
  origins: string[],
  cookieNames: Set<string> | null
): Promise<GetCookiesResult> {
  const sqlDBPath = resolveEdgeDBPath(options.profile);
  if (!sqlDBPath) {
    return {
      cookies: [],
      warnings: ['Could not resolve Edge cookie database path.'],
    };
  }

  const warnings: string[] = [];

  const passwordResult = await findFirstMacKeyChainPassword(
    ['Microsoft Edge Safe Storage', 'Microsoft Edge'],
    'Microsoft Edge',
    5000,
    'Microsoft Edge Safe Storage'
  );
  if (!passwordResult.success) {
    warnings.push(`Failed to get Edge decryption key: ${passwordResult.error}`);
    return { cookies: [], warnings };
  }

  const edgePassword = passwordResult.password.trim();
  if (!edgePassword) {
    warnings.push('Edge decryption key is empty.');
    return { cookies: [], warnings };
  }

  // iterations is 1003 for macOS Edge (same as Chrome)
  const key = getAES128CBCKey(edgePassword, 1003);
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
    decryptFn
  );
  warnings.push(...dbWarnings);

  return { cookies, warnings };
}

function resolveEdgeDBPath(profile?: string): string | null {
  const homeDir = homedir();
  const rootPath = `${homeDir}/Library/Application Support/Microsoft Edge`;
  return resolveBrowserDefaultorSpecificDBPath([rootPath], profile);
}

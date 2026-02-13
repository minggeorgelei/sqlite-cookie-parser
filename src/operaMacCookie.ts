import { homedir } from 'os';
import { resolveBrowserDefaultorSpecificDBPath } from './util/fileHelper';
import { GetCookiesOptions, GetCookiesResult, GetCookiesFromFileOptions } from './types';
import { findFirstMacKeyChainPassword } from './util/macKeyChain';
import { getAES128CBCKey, decryptChomiumAES128CBCCookieValue } from './util/crypto';
import { getCookiesFromChromiumSqliteDB } from './common';

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

  const fileOptions: GetCookiesFromFileOptions = {
    cookieFilePath: sqlDBPath,
  };
  fileOptions.profile = options.profile;
  fileOptions.includeExpired = options.includeExpired;

  const { cookies, warnings: dbWarnings } = await getCookiesFromChromiumSqliteDB(
    fileOptions,
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

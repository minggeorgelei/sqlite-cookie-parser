import { homedir } from 'os';
import { resolveBrowserDefaultorSpecificDBPath } from './util/fileHelper';
import { GetCookiesOptions, GetCookiesResult, GetCookiesFromFileOptions } from './types';
import { findFirstMacKeyChainPassword } from './util/macKeyChain';
import { getAES128CBCKey, decryptChomiumAES128CBCCookieValue } from './util/crypto';
import { getCookiesFromChromiumSqliteDB } from './common';

export async function getCookiesFromBraveMacSqlite(
  options: GetCookiesOptions,
  origins: string[],
  cookieNames: Set<string> | null
): Promise<GetCookiesResult> {
  const sqlDBPath = resolveBraveMacDBPath(options.profile);
  if (!sqlDBPath) {
    return {
      cookies: [],
      warnings: ['Could not resolve Brave cookie database path.'],
    };
  }

  const warnings: string[] = [];

  const passwordResult = await findFirstMacKeyChainPassword(
    ['Brave Safe Storage'],
    'Brave',
    5000,
    'Brave Safe Storage'
  );
  if (!passwordResult.success) {
    warnings.push(`Failed to get Brave decryption key: ${passwordResult.error}`);
    return { cookies: [], warnings };
  }

  const bravePassword = passwordResult.password.trim();
  if (!bravePassword) {
    warnings.push('Brave decryption key is empty.');
    return { cookies: [], warnings };
  }

  // iterations is 1003 for macOS Brave (same as Chrome)
  const key = getAES128CBCKey(bravePassword, 1003);
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
    'brave',
    decryptFn
  );
  warnings.push(...dbWarnings);

  return { cookies, warnings };
}

function resolveBraveMacDBPath(profile?: string): string | null {
  const homeDir = homedir();
  const rootPath = `${homeDir}/Library/Application Support/BraveSoftware/Brave-Browser`;
  return resolveBrowserDefaultorSpecificDBPath([rootPath], profile);
}

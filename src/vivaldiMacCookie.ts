import { homedir } from 'os';
import { resolveBrowserDefaultorSpecificDBPath } from './util/fileHelper';
import { GetCookiesOptions, GetCookiesResult, GetCookiesFromFileOptions } from './types';
import { findFirstMacKeyChainPassword } from './util/macKeyChain';
import { getAES128CBCKey, decryptChomiumAES128CBCCookieValue } from './util/crypto';
import { getCookiesFromChromiumSqliteDB } from './common';

export async function getCookiesFromVivaldiMacSqlite(
  options: GetCookiesOptions,
  origins: string[],
  cookieNames: Set<string> | null
): Promise<GetCookiesResult> {
  const sqlDBPath = resolveVivaldiMacDBPath(options.profile);
  if (!sqlDBPath) {
    return {
      cookies: [],
      warnings: ['Could not resolve Vivaldi cookie database path.'],
    };
  }

  const warnings: string[] = [];

  const passwordResult = await findFirstMacKeyChainPassword(
    ['Vivaldi Safe Storage'],
    'Vivaldi',
    5000,
    'Vivaldi Safe Storage'
  );
  if (!passwordResult.success) {
    warnings.push(`Failed to get Vivaldi decryption key: ${passwordResult.error}`);
    return { cookies: [], warnings };
  }

  const vivaldiPassword = passwordResult.password.trim();
  if (!vivaldiPassword) {
    warnings.push('Vivaldi decryption key is empty.');
    return { cookies: [], warnings };
  }

  // iterations is 1003 for macOS Vivaldi (same as Chrome)
  const key = getAES128CBCKey(vivaldiPassword, 1003);
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
    'vivaldi',
    decryptFn
  );
  warnings.push(...dbWarnings);

  return { cookies, warnings };
}

function resolveVivaldiMacDBPath(profile?: string): string | null {
  const homeDir = homedir();
  const rootPath = `${homeDir}/Library/Application Support/Vivaldi`;
  return resolveBrowserDefaultorSpecificDBPath([rootPath], profile);
}

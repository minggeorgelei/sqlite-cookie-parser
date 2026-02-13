import path from 'path';
import { readFileSync } from 'fs';
import { resolveBrowserDefaultorSpecificDBPath } from './util/fileHelper';
import { GetCookiesOptions, GetCookiesResult, GetCookiesFromFileOptions } from './types';
import { decryptWindowsDpapi } from './util/windowsDpapi';
import { decryptChromiumAES256GCMCookieValue } from './util/crypto';
import { getCookiesFromChromiumSqliteDB } from './common';

export async function getCookiesFromBraveWindowsSqlite(
  options: GetCookiesOptions,
  origins: string[],
  cookieNames: Set<string> | null
): Promise<GetCookiesResult> {
  const braveUserDataDir = resolveBraveWindowsUserDataDir();
  const sqlDBPath = resolveBraveWindowsDBPath(braveUserDataDir, options.profile);
  if (!sqlDBPath) {
    return {
      cookies: [],
      warnings: ['Could not resolve Brave cookie database path on Windows.'],
    };
  }

  const warnings: string[] = [];

  const keyResult = await extractBraveWindowsEncryptionKey(braveUserDataDir);
  if (!keyResult.success) {
    warnings.push(`Failed to get Brave decryption key: ${keyResult.error}`);
    return { cookies: [], warnings };
  }

  const key = keyResult.key;
  const decryptFn = (encryptedValue: Uint8Array): string | null => {
    return decryptChromiumAES256GCMCookieValue(encryptedValue, key);
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

function resolveBraveWindowsUserDataDir(): string {
  const localAppData =
    process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  return path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data');
}

function resolveBraveWindowsDBPath(userDataDir: string, profile?: string): string | null {
  return resolveBrowserDefaultorSpecificDBPath([userDataDir], profile);
}

async function extractBraveWindowsEncryptionKey(
  userDataDir: string
): Promise<{ success: true; key: Buffer } | { success: false; error: string }> {
  const localStatePath = path.join(userDataDir, 'Local State');

  let localStateContent: string;
  try {
    localStateContent = readFileSync(localStatePath, 'utf8');
  } catch (error) {
    return {
      success: false,
      error: `Failed to read Local State file: ${(error as Error).message}`,
    };
  }

  let localState: { os_crypt?: { encrypted_key?: string } };
  try {
    localState = JSON.parse(localStateContent);
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse Local State JSON: ${(error as Error).message}`,
    };
  }

  const encryptedKeyBase64 = localState?.os_crypt?.encrypted_key;
  if (!encryptedKeyBase64) {
    return { success: false, error: 'No encrypted_key found in Local State' };
  }

  const encryptedKeyWithPrefix = Buffer.from(encryptedKeyBase64, 'base64');

  // The key is prefixed with "DPAPI" (5 bytes)
  const dpapiPrefix = encryptedKeyWithPrefix.subarray(0, 5).toString('utf8');
  if (dpapiPrefix !== 'DPAPI') {
    return { success: false, error: 'Encrypted key does not have expected DPAPI prefix' };
  }

  const encryptedKey = encryptedKeyWithPrefix.subarray(5);
  const dpapiResult = await decryptWindowsDpapi(encryptedKey);
  if (!dpapiResult.success) {
    return { success: false, error: `DPAPI decryption failed: ${dpapiResult.error}` };
  }

  return { success: true, key: dpapiResult.decrypted };
}

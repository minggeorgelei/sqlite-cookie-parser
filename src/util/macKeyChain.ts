// macos Chrome / Edge cookie decryption keychain access
import { executeProcess } from './processExecutor.js';

export async function findMacKeyChainPassword(
  service: string,
  account: string,
  timeoutMs: number
): Promise<{ success: true; password: string } | { success: false; error: string }> {
  const result = await executeProcess(
    'security',
    ['find-generic-password', '-w', '-s', service, '-a', account],
    timeoutMs
  );
  if (result.code === 0) {
    return { success: true, password: result.stdout.trim() };
  } else {
    return { success: false, error: result.stderr.trim() || `exit ${result.code}` };
  }
}

export async function findFirstMacKeyChainPassword(
  services: string[],
  account: string,
  timeoutMs: number,
  label: string
): Promise<{ success: true; password: string } | { success: false; error: string }> {
  let lastError: string | null = null;
  for (const service of services) {
    const result = await findMacKeyChainPassword(service, account, timeoutMs);
    if (result.success) {
      return result;
    } else {
      lastError = result.error;
    }
  }
  return { success: false, error: lastError ?? `Failed to find password for label ${label}` };
}

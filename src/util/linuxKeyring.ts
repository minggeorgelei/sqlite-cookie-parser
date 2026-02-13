// Linux keyring password retrieval via secret-tool (libsecret)
import { executeProcess } from './processExecutor';

const LINUX_DEFAULT_PASSWORD = 'peanuts';

/**
 * Attempt to retrieve the Chromium encryption password from the Linux keyring.
 * Tries secret-tool (GNOME Keyring / KDE Wallet) with v2 and v1 schemas.
 * Falls back to the hardcoded default password "peanuts" if keyring is unavailable.
 */
export async function findLinuxChromiumPassword(
  application: string,
  label: string,
  timeoutMs: number
): Promise<{ password: string; warnings: string[] }> {
  const warnings: string[] = [];

  // Try v2 schema first, then v1
  const schemas = [
    'chrome_libsecret_os_crypt_password_v2',
    'chrome_libsecret_os_crypt_password_v1',
  ];

  for (const schema of schemas) {
    const result = await executeProcess(
      'secret-tool',
      ['lookup', 'xdg:schema', schema, 'application', application],
      timeoutMs
    );
    if (result.code === 0) {
      const password = result.stdout.trim();
      if (password) {
        return { password, warnings };
      }
    }
  }

  // Also try looking up by label directly
  const labelResult = await executeProcess(
    'secret-tool',
    ['lookup', 'xdg:schema', 'chrome_libsecret_os_crypt_password_v1', 'application', application],
    timeoutMs
  );
  if (labelResult.code === 0 && labelResult.stdout.trim()) {
    return { password: labelResult.stdout.trim(), warnings };
  }

  warnings.push(`Could not retrieve ${label} from keyring, using default password.`);
  return { password: LINUX_DEFAULT_PASSWORD, warnings };
}

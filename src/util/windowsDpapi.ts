// Windows DPAPI decryption via PowerShell
import { executeProcess } from './processExecutor';

export async function decryptWindowsDpapi(
  encryptedBytes: Buffer,
  timeoutMs: number = 5000
): Promise<{ success: true; decrypted: Buffer } | { success: false; error: string }> {
  const base64Input = encryptedBytes.toString('base64');
  const script = [
    'Add-Type -AssemblyName System.Security',
    `$bytes = [Convert]::FromBase64String("${base64Input}")`,
    '$decrypted = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)',
    '[Convert]::ToBase64String($decrypted)',
  ].join('; ');

  const result = await executeProcess(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    timeoutMs
  );

  if (result.code !== 0) {
    return { success: false, error: result.stderr.trim() || `powershell exit ${result.code}` };
  }

  const output = result.stdout.trim();
  if (!output) {
    return { success: false, error: 'DPAPI decryption returned empty result' };
  }

  try {
    const decrypted = Buffer.from(output, 'base64');
    return { success: true, decrypted };
  } catch (error) {
    return { success: false, error: `Failed to decode DPAPI result: ${(error as Error).message}` };
  }
}

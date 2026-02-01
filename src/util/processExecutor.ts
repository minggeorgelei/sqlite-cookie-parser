import { spawn } from 'child_process';

export async function executeProcess(
  file: string,
  args: string[],
  timeoutMs: number
): Promise<{ code: number; stdout: string; stderr: string }> {
  const runPromise = new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      resolve({ code: 124, stdout, stderr: `${stderr}\nProcess time out after ${timeoutMs} ms` });
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 0, stdout, stderr });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ code: 127, stdout, stderr: `${stderr}\nProcess execution error: ${err.message}` });
    });
  });
  const result = await runPromise;
  return result;
}

import path from 'path';
import { homedir } from 'os';
import { existsSync, stat, statSync } from 'fs';

export function isLikeFilePath(path: string): boolean {
  return path.includes('/') || path.includes('\\');
}

export function normalizePath(pathStr: string): string {
  if (pathStr.startsWith('~/')) {
    return path.join(homedir(), pathStr.slice(2));
  }
  if (path.isAbsolute(pathStr)) {
    return pathStr;
  }
  return path.resolve(process.cwd(), pathStr);
}

export function resolveChromeDefaultorSpecificDBPath(
  roots: string[],
  profile?: string
): string | null {
  const candidates: string[] = [];
  if (profile && isLikeFilePath(profile)) {
    const stat = statSync(profile, { throwIfNoEntry: false });
    if (stat && stat.isFile()) {
      return profile;
    }
    const candidate1 = path.join(profile, 'Cookies');
    candidates.push(candidate1);
    const candidate2 = path.join(profile, 'Network', 'Cookies');
    candidates.push(candidate2);
  } else {
    for (const root of roots) {
      const candidate1 = path.join(root, 'Cookies');
      candidates.push(candidate1);
      const candidate2 = path.join(root, 'Network', 'Cookies');
      candidates.push(candidate2);
    }
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

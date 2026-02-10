import path from 'path';
import { homedir } from 'os';
import { existsSync, statSync } from 'fs';

export function normalizePath(pathStr: string): string {
  if (pathStr.startsWith('~/')) {
    return path.join(homedir(), pathStr.slice(2));
  }
  if (path.isAbsolute(pathStr)) {
    return pathStr;
  }
  return path.resolve(process.cwd(), pathStr);
}

export function resolveBrowserDefaultorSpecificDBPath(
  roots: string[],
  profile?: string
): string | null {
  const candidates: string[] = [];
  let isProfileDir = false;
  profile = profile?.trim();
  if (profile) {
    const stat = statSync(profile, { throwIfNoEntry: false });
    if (stat && stat.isFile()) {
      return profile;
    }
    if (stat && stat.isDirectory()) {
      isProfileDir = true;
      const candidate1 = path.join(profile, 'Cookies');
      candidates.push(candidate1);
      const candidate2 = path.join(profile, 'Network', 'Cookies');
      candidates.push(candidate2);
    }
  }
  if (!isProfileDir) {
    const profileDir = profile || 'Default';
    for (const root of roots) {
      const candidate1 = path.join(root, profileDir, 'Cookies');
      candidates.push(candidate1);
      const candidate2 = path.join(root, profileDir, 'Network', 'Cookies');
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

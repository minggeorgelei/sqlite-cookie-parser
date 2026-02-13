import { Cookie, CookieHeaderOption } from './types';

/**
 * Convert an array of Cookie objects into a Cookie header string (e.g. "name1=value1; name2=value2")
 * @param cookies - The cookies to serialize
 * @param options - Options for formatting the header
 *   - removeDuplicates: keep only the first occurrence of each cookie name
 *   - sortByName: sort cookies alphabetically by name
 * @returns A formatted Cookie header string
 */
export function toCookieHeader(cookies: Cookie[], options: CookieHeaderOption): string {
  const items = cookies.map((cookie) => ({ name: cookie.name, value: cookie.value }));
  if (options.sortByName) {
    items.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (options.removeDuplicates) {
    const seen = new Set<string>();
    const uniqueItems = [];
    for (const item of items) {
      if (!seen.has(item.name)) {
        seen.add(item.name);
        uniqueItems.push(item);
      }
    }
    return uniqueItems.map((item) => `${item.name}=${item.value}`).join('; ');
  }
  return items.map((item) => `${item.name}=${item.value}`).join('; ');
}

import {
  Cookie,
  CookieHeaderOption,
  GetCookiesOptions,
  GetCookiesResult,
  GetCookiesFromBrowserParams,
} from './types';
import { getCookiesFromChrome } from './browsers/chrome';
import { getCookiesFromEdge } from './browsers/edge';
import { getCookiesFromFirefoxSqlite } from './browsers/firefoxCookie';
import { getCookiesFromSafari } from './browsers/safariCookie';
import { getCookiesFromOpera } from './browsers/opera';
import { getCookiesFromBrave } from './browsers/bravo';
import { getCookiesFromVivaldi } from './browsers/vivaldi';

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

/**
 * Extract cookies from a specified browser's local storage.
 * Supports Chrome, Edge, Firefox, Safari, Opera, Brave and Vivaldi.
 * @param params - Browser and filtering options
 * @returns Extracted cookies and any warnings encountered during parsing
 */
export async function getCookiesFromBrowser(
  params: GetCookiesFromBrowserParams,
): Promise<GetCookiesResult> {
  const { origins, cookieNames, browserName, profile, includeExpired, includePartitioned } = params;
  const cookieNamesSet = cookieNames ? new Set(cookieNames) : null;
  const options: GetCookiesOptions = { profile, includeExpired, includePartitioned };

  switch (browserName) {
    case 'chrome':
      return getCookiesFromChrome(options, origins, cookieNamesSet);
    case 'edge':
      return getCookiesFromEdge(options, origins, cookieNamesSet);
    case 'firefox':
      return getCookiesFromFirefoxSqlite(options, origins, cookieNamesSet);
    case 'safari':
      return getCookiesFromSafari(options, origins, cookieNamesSet);
    case 'opera':
      return getCookiesFromOpera(options, origins, cookieNamesSet);
    case 'brave':
      return getCookiesFromBrave(options, origins, cookieNamesSet);
    case 'vivaldi':
      return getCookiesFromVivaldi(options, origins, cookieNamesSet);
  }
}

# sqlite-cookie-parser

Extract cookies from browser local storage and convert them to HTTP Cookie header format.

## Features

- Support for 7 browsers: Chrome, Edge, Firefox, Safari, Opera, Brave, Vivaldi
- Cross-platform: macOS, Windows, Linux
- Automatic cookie decryption (Chromium-based browsers)
- Filter by origin, cookie name, expiration, and partition key (CHIPS)
- Convert cookies to HTTP `Cookie` header string
- Full TypeScript support

## Installation

```bash
npm install sqlite-cookie-parser
```

## Quick Start

```typescript
import { getCookiesFromBrowser, toCookieHeader } from 'sqlite-cookie-parser';

// Extract cookies from Chrome for specific origins
const { cookies, warnings } = await getCookiesFromBrowser({
  browserName: 'chrome',
  origins: ['https://github.com'],
});

// Convert to Cookie header string
const header = toCookieHeader(cookies, { removeDuplicates: true });

// Use in HTTP request
const response = await fetch('https://github.com/api/user', {
  headers: { Cookie: header },
});
```

## API

### `getCookiesFromBrowser(params)`

Extract cookies from a browser's local storage.

**Parameters** (`GetCookiesFromBrowserParams`):

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `browserName` | `BrowserName` | Yes | - | `'chrome'` \| `'edge'` \| `'firefox'` \| `'safari'` \| `'opera'` \| `'brave'` \| `'vivaldi'` |
| `origins` | `string[]` | Yes | - | Origins to extract cookies for (e.g. `['https://example.com']`) |
| `cookieNames` | `string[]` | No | all | Filter by cookie names |
| `profile` | `string` | No | `'Default'` | Browser profile name |
| `includeExpired` | `boolean` | No | `false` | Include expired cookies |
| `includePartitioned` | `boolean` | No | `false` | Include partitioned cookies (CHIPS) |

**Returns:** `Promise<GetCookiesResult>`

```typescript
interface GetCookiesResult {
  cookies: Cookie[];
  warnings: string[];
}
```

**Examples:**

```typescript
// Get all cookies for a domain
const { cookies } = await getCookiesFromBrowser({
  browserName: 'chrome',
  origins: ['https://github.com'],
});

// Filter specific cookies from Firefox
const { cookies } = await getCookiesFromBrowser({
  browserName: 'firefox',
  origins: ['https://example.com'],
  cookieNames: ['session_id', 'csrf_token'],
});

// Use a specific profile and include expired cookies
const { cookies } = await getCookiesFromBrowser({
  browserName: 'edge',
  origins: ['https://example.com'],
  profile: 'Profile 1',
  includeExpired: true,
});
```

### `toCookieHeader(cookies, options)`

Convert a cookie array to an HTTP `Cookie` header string.

**Parameters:**

| Field | Type | Description |
|-------|------|-------------|
| `cookies` | `Cookie[]` | Array of cookie objects |
| `options.removeDuplicates` | `boolean` | Keep only the first occurrence of each cookie name |
| `options.sortByName` | `boolean` | Sort cookies alphabetically by name |

**Returns:** `string` (e.g. `"name1=value1; name2=value2"`)

```typescript
const header = toCookieHeader(cookies, {
  removeDuplicates: true,
  sortByName: true,
});
```

## Cookie Object

```typescript
interface Cookie {
  name: string;
  value: string | null;       // null if decryption failed
  domain: string;
  path: string;
  expires?: number;           // ms since epoch, undefined for session cookies
  secure: boolean;
  httpOnly: boolean;
  sameSite?: 'none' | 'lax' | 'strict';
  partitionKey?: string;      // CHIPS partition key
  source: {
    browser: BrowserName;
    cookieFilePath: string;
  };
}
```

## Supported Browsers & Platforms

| Browser | macOS | Windows | Linux |
|---------|-------|---------|-------|
| Chrome | Yes | Yes | Yes |
| Edge | Yes | Yes | Yes |
| Firefox | Yes | Yes | Yes |
| Safari | Yes | - | - |
| Opera | Yes | Yes | Yes |
| Brave | Yes | Yes | Yes |
| Vivaldi | Yes | Yes | Yes |

## Cookie Decryption

Chromium-based browsers (Chrome, Edge, Opera, Brave, Vivaldi) encrypt cookie values. This library handles decryption automatically:

- **macOS**: Retrieves encryption keys from the macOS Keychain
- **Windows**: Decrypts using DPAPI via the browser's Local State file
- **Linux**: Retrieves keys from the system keyring (`secret-tool`)

Firefox and Safari do not encrypt cookie values.

If decryption fails, the cookie's `value` will be `null`.

## Notes

- The browser should be closed while reading cookies, otherwise the database may be locked
- Requires read permission to browser profile directories
- Firefox session cookies are read from the session recovery file (`recovery.jsonlz4`)

## License

MIT

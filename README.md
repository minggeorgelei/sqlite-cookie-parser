# SQLite Cookie Parser

Extract cookies from browser profiles (Chrome, Edge, Firefox) and convert them to HTTP request header format.

## Features

- 📦 Extract cookies from browser SQLite databases
- 🌐 Support for Chrome, Edge, and Firefox
- 🔒 Handles secure, httpOnly, and SameSite attributes
- 🎯 Filter cookies by domain and path
- 🔄 Convert cookie arrays to HTTP header format
- 💻 Cross-platform support (macOS, Windows, Linux)
- 📝 Full TypeScript support with type definitions

## Installation

```bash
npm install
npm run build
```

## API

### `getCookiesFromBrowser(options)`

Extract cookies from a browser profile.

**Parameters:**
- `options.browser` (string): Browser name - 'chrome', 'edge', or 'firefox'
- `options.profile` (string, optional): Profile name, default is 'Default'
- `options.cookiePath` (string, optional): Custom path to cookie database
- `options.domain` (string, optional): Filter cookies by domain

**Returns:** Array of cookie objects

**Example:**
```typescript
import { getCookiesFromBrowser } from 'sqlite-cookie-parser';

// Get all cookies from Chrome
const cookies = getCookiesFromBrowser({
  browser: 'chrome',
  profile: 'Default'
});

// Get cookies for specific domain
const domainCookies = getCookiesFromBrowser({
  browser: 'chrome',
  domain: 'github.com'
});

// Use custom database path
const customCookies = getCookiesFromBrowser({
  cookiePath: '/path/to/Cookies'
});
```

### `toCookieHeader(cookies, options)`

Convert cookie array to HTTP Cookie header string.

**Parameters:**
- `cookies` (Array): Array of cookie objects
- `options.domain` (string, optional): Filter by domain
- `options.path` (string, optional): Filter by path, default is '/'
- `options.secure` (boolean, optional): Whether request is HTTPS, default is false

**Returns:** Cookie header string

**Example:**
```typescript
import { toCookieHeader, Cookie } from 'sqlite-cookie-parser';

const cookies: Cookie[] = [
  { name: 'session', value: 'abc123', encrypted: false, domain: 'example.com', path: '/', expires: null, secure: false, httpOnly: true, sameSite: 'lax' },
  { name: 'token', value: 'xyz789', encrypted: false, domain: 'example.com', path: '/', expires: null, secure: false, httpOnly: true, sameSite: 'lax' }
];

// Convert to header
const header = toCookieHeader(cookies);
// Result: "session=abc123; token=xyz789"

// Use in fetch request
fetch('https://example.com/api', {
  headers: {
    'Cookie': header
  }
});
```

### `getBrowserCookiePath(browser, profile)`

Get the default cookie database path for a browser.

**Parameters:**
- `browser` (string): Browser name
- `profile` (string, optional): Profile name

**Returns:** Path string

## Cookie Object Structure

```javascript
{
  name: string,           // Cookie name
  value: string|null,     // Cookie value (null if encrypted and decryption failed)
  encrypted: boolean,     // Whether cookie was encrypted in database
  domain: string,         // Cookie domain
  path: string,           // Cookie path
  expires: Date|null,     // Expiration date (null for session cookies)
  secure: boolean,        // Requires HTTPS
  httpOnly: boolean,      // HTTP-only flag
  sameSite: string        // 'none', 'lax', 'strict', or 'unspecified'
}
```

## Cookie Encryption

Modern browsers encrypt cookie values for security. This library handles decryption automatically:

### macOS
✅ **Automatic decryption** for Chrome and Edge cookies
- Uses macOS Keychain to retrieve encryption keys
- No additional dependencies required
- Works out of the box

### Windows
⚠️ **Manual setup required**
- Chrome/Edge cookies are encrypted using DPAPI
- Requires additional native modules for decryption
- Cookies will be marked with `encrypted: true` and `value: null` by default

### Linux
⚠️ **Manual setup required**
- Encryption varies by distribution
- May use gnome-keyring, kwallet, or other systems
- Cookies will be marked with `encrypted: true` and `value: null` by default

### Disable Decryption

If you want to skip decryption attempts:

```javascript
const cookies = getCookiesFromBrowser({
  browser: 'chrome',
  decrypt: false  // Don't attempt decryption
});

// Check which cookies are encrypted
cookies.forEach(cookie => {
  if (cookie.encrypted && !cookie.value) {
    console.log(`${cookie.name} is encrypted and couldn't be decrypted`);
  }
});
```

## Usage Example

```typescript
import { getCookiesFromBrowser, toCookieHeader } from 'sqlite-cookie-parser';

// 1. Extract cookies from Chrome for a specific domain
const cookies = getCookiesFromBrowser({
  browser: 'chrome',
  domain: 'github.com'
});

console.log(`Found ${cookies.length} cookies`);

// 2. Convert to header format for HTTP request
const cookieHeader = toCookieHeader(cookies, {
  domain: 'github.com',
  path: '/',
  secure: true  // For HTTPS requests
});

// 3. Use in HTTP request
const response = await fetch('https://github.com/api/user', {
  headers: {
    'Cookie': cookieHeader
  }
});
```

## Run Example

```bash
npm run example
```

## Platform-Specific Cookie Paths

### macOS
- Chrome: `~/Library/Application Support/Google/Chrome/Default/Cookies`
- Edge: `~/Library/Application Support/Microsoft Edge/Default/Cookies`
- Firefox: `~/Library/Application Support/Firefox/Profiles/*/cookies.sqlite`

### Windows
- Chrome: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Network\Cookies`
- Edge: `%LOCALAPPDATA%\Microsoft\Edge\User Data\Default\Network\Cookies`
- Firefox: `%APPDATA%\Mozilla\Firefox\Profiles\*\cookies.sqlite`

### Linux
- Chrome: `~/.config/google-chrome/Default/Cookies`
- Edge: `~/.config/microsoft-edge/Default/Cookies`
- Firefox: `~/.mozilla/firefox/*/cookies.sqlite`

## Notes

- **Browser must be closed** or cookies database might be locked by the browser
- Requires **read permission** to browser profile directories
- **macOS**: Cookie decryption works automatically for Chrome/Edge
- **Windows/Linux**: Additional setup needed for encrypted cookie decryption
- Encrypted cookies that can't be decrypted will have `value: null` and `encrypted: true`
- Firefox generally doesn't encrypt cookie values (except on some configurations)

## License

MIT

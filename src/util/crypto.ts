import { createDecipheriv, pbkdf2Sync } from 'crypto';

const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

export function getAES128CBCKey(password: string, iterations: number): Buffer {
  const key = pbkdf2Sync(password, 'saltysalt', iterations, 16, 'sha1');
  return key;
}

export function decryptChomiumAES128CBCCookieValue(
  encryptedValue: Uint8Array,
  keyCandidates: Buffer[]
): string | null {
  const buffer = Buffer.from(encryptedValue);
  if (buffer.length < 3) {
    return null;
  }

  // check whether it is prefixed with "v10" or "v11"
  const prefix = buffer.subarray(0, 3).toString('utf8');
  const hasPrefix = prefix === 'v10' || prefix === 'v11';
  if (!hasPrefix) {
    return decodeCookieValue(buffer, false);
  }

  const text = buffer.subarray(3);
  if (!text.length) {
    return '';
  }

  for (const key of keyCandidates) {
    const decryptedBuffer = tryDecryptAES128CBC(text, key);
    if (!decryptedBuffer) {
      continue;
    }
    const decryptedValue = decodeCookieValue(decryptedBuffer, true);
    if (decryptedValue !== null) {
      return decryptedValue;
    }
  }

  return null;
}

function tryDecryptAES128CBC(text: Buffer, key: Buffer): Buffer | null {
  try {
    const iv = Buffer.alloc(16, ' ');
    const decipher = createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(false);
    let decrypted = Buffer.concat([decipher.update(text), decipher.final()]);
    // Remove PKCS#7 padding
    const paddingLength = decrypted[decrypted.length - 1];
    if (paddingLength > 0 && paddingLength <= 16) {
      decrypted = decrypted.subarray(0, decrypted.length - paddingLength);
    }
    return decrypted;
  } catch (error) {
    return null;
  }
}

function decodeCookieValue(value: Buffer, removePrefix = true): string | null {
  const bytes = removePrefix && value.length >= 32 ? value.subarray(32) : value;
  let decrypted: string;
  try {
    decrypted = UTF8_DECODER.decode(bytes);
  } catch (error) {
    return null;
  }
  return removeLeadingControlChars(decrypted);
}

function removeLeadingControlChars(value: string): string {
  let index = 0;
  while (index < value.length && value.charCodeAt(index) <= 0x1f) {
    index++;
  }
  return value.substring(index);
}

/**
 * Decrypt a Windows Chromium cookie value encrypted with AES-256-GCM.
 * Format: v10/v20 prefix (3 bytes) + nonce (12 bytes) + ciphertext + auth tag (16 bytes)
 */
export function decryptChromiumAES256GCMCookieValue(
  encryptedValue: Uint8Array,
  key: Buffer
): string | null {
  const buffer = Buffer.from(encryptedValue);
  if (buffer.length < 3) {
    return null;
  }

  const prefix = buffer.subarray(0, 3).toString('utf8');
  const hasPrefix = prefix === 'v10' || prefix === 'v20';
  if (!hasPrefix) {
    // Not encrypted, try to return as plain text
    try {
      return UTF8_DECODER.decode(buffer);
    } catch {
      return null;
    }
  }

  const payload = buffer.subarray(3);
  if (payload.length < 12 + 16) {
    // Need at least nonce (12) + auth tag (16)
    return null;
  }

  const nonce = payload.subarray(0, 12);
  const ciphertextWithTag = payload.subarray(12);
  const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - 16);
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - 16);

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return UTF8_DECODER.decode(decrypted);
  } catch {
    return null;
  }
}

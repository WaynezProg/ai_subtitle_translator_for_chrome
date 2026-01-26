/**
 * Crypto and Hashing Utilities
 *
 * Provides cryptographic functions, hashing, encoding/decoding,
 * and secure random generation utilities for the extension.
 */

// =============================================================================
// Hash Functions
// =============================================================================

/**
 * Calculate SHA-256 hash of a string
 */
export async function sha256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  return bufferToHex(hashBuffer);
}

/**
 * Calculate SHA-1 hash of a string (for non-security purposes like cache keys)
 */
export async function sha1(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-1', dataBuffer);
  return bufferToHex(hashBuffer);
}

/**
 * Calculate MD5-like hash using SubtleCrypto (fallback to simple hash)
 * Note: Use only for non-security purposes like cache keys
 */
export function simpleHash(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Calculate a fast hash for cache keys (FNV-1a)
 */
export function fnv1aHash(data: string): number {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * Calculate content hash for deduplication
 */
export async function contentHash(content: string | object): Promise<string> {
  const data = typeof content === 'string' ? content : JSON.stringify(content);
  return sha256(data);
}

// =============================================================================
// Buffer Conversions
// =============================================================================

/**
 * Convert ArrayBuffer to hex string
 */
export function bufferToHex(buffer: ArrayBuffer): string {
  const byteArray = new Uint8Array(buffer);
  return Array.from(byteArray)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to ArrayBuffer
 */
export function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes.buffer;
}

/**
 * Convert ArrayBuffer to Base64
 */
export function bufferToBase64(buffer: ArrayBuffer): string {
  const byteArray = new Uint8Array(buffer);
  const binaryString = Array.from(byteArray)
    .map((byte) => String.fromCharCode(byte))
    .join('');
  return btoa(binaryString);
}

/**
 * Convert Base64 to ArrayBuffer
 */
export function base64ToBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert string to ArrayBuffer
 */
export function stringToBuffer(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer;
}

/**
 * Convert ArrayBuffer to string
 */
export function bufferToString(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

// =============================================================================
// Base64 Encoding/Decoding
// =============================================================================

/**
 * Encode string to Base64
 */
export function base64Encode(data: string): string {
  // Handle Unicode characters
  const utf8Bytes = new TextEncoder().encode(data);
  const binaryString = Array.from(utf8Bytes)
    .map((byte) => String.fromCharCode(byte))
    .join('');
  return btoa(binaryString);
}

/**
 * Decode Base64 to string
 */
export function base64Decode(base64: string): string {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Encode string to URL-safe Base64
 */
export function base64UrlEncode(data: string): string {
  return base64Encode(data)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode URL-safe Base64 to string
 */
export function base64UrlDecode(base64url: string): string {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  // Add padding if needed
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }
  return base64Decode(base64);
}

// =============================================================================
// Random Generation
// =============================================================================

/**
 * Generate random bytes
 */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Generate random hex string
 */
export function randomHex(length: number): string {
  const bytes = randomBytes(Math.ceil(length / 2));
  return bufferToHex(bytes.buffer).slice(0, length);
}

/**
 * Generate UUID v4
 */
export function uuid(): string {
  const bytes = randomBytes(16);
  // Set version (4) and variant (RFC 4122)
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bufferToHex(bytes.buffer);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Generate short unique ID
 */
export function shortId(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map((byte) => chars[byte % chars.length])
    .join('');
}

/**
 * Generate random integer in range [min, max]
 */
export function randomInt(min: number, max: number): number {
  const range = max - min + 1;
  const bytesNeeded = Math.ceil(Math.log2(range) / 8) || 1;
  const maxValue = Math.pow(256, bytesNeeded);
  const cutoff = maxValue - (maxValue % range);

  let value: number;
  do {
    const bytes = randomBytes(bytesNeeded);
    value = bytes.reduce((acc, byte, i) => acc + byte * Math.pow(256, i), 0);
  } while (value >= cutoff);

  return min + (value % range);
}

/**
 * Shuffle array using Fisher-Yates
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// =============================================================================
// Encryption/Decryption
// =============================================================================

/**
 * Generate a random encryption key
 */
export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Export CryptoKey to raw format
 */
export async function exportKey(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', key);
  return bufferToBase64(raw);
}

/**
 * Import key from raw format
 */
export async function importKey(keyData: string): Promise<CryptoKey> {
  const raw = base64ToBuffer(keyData);
  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(raw),
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data using AES-GCM
 */
export async function encrypt(data: string, key: CryptoKey): Promise<string> {
  const iv = randomBytes(12);
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);

  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBuffer
  );

  // Combine IV and encrypted data
  const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encryptedBuffer), iv.length);

  return bufferToBase64(combined.buffer);
}

/**
 * Decrypt data using AES-GCM
 */
export async function decrypt(encryptedData: string, key: CryptoKey): Promise<string> {
  const combined = base64ToBuffer(encryptedData);
  const combinedArray = new Uint8Array(combined);

  const iv = combinedArray.slice(0, 12);
  const data = combinedArray.slice(12);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return new TextDecoder().decode(decryptedBuffer);
}

/**
 * Derive key from password using PBKDF2
 */
export async function deriveKey(
  password: string,
  salt: string | Uint8Array,
  iterations: number = 100000
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);
  const saltBuffer = typeof salt === 'string' ? encoder.encode(salt) : salt;

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// =============================================================================
// HMAC
// =============================================================================

/**
 * Generate HMAC-SHA256 signature
 */
export async function hmacSign(data: string, secretKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyBuffer = encoder.encode(secretKey);
  const dataBuffer = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, dataBuffer);
  return bufferToHex(signature);
}

/**
 * Verify HMAC-SHA256 signature
 */
export async function hmacVerify(
  data: string,
  signature: string,
  secretKey: string
): Promise<boolean> {
  const expectedSignature = await hmacSign(data, secretKey);
  return timingSafeEqual(signature, expectedSignature);
}

// =============================================================================
// Security Utilities
// =============================================================================

/**
 * Constant-time string comparison
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Sanitize sensitive data for logging
 */
export function maskSensitiveData(data: string, visibleChars: number = 4): string {
  if (data.length <= visibleChars * 2) {
    return '*'.repeat(data.length);
  }
  const start = data.slice(0, visibleChars);
  const end = data.slice(-visibleChars);
  const middle = '*'.repeat(Math.min(data.length - visibleChars * 2, 8));
  return `${start}${middle}${end}`;
}

/**
 * Generate a secure token
 */
export function generateToken(length: number = 32): string {
  return base64UrlEncode(bufferToString(randomBytes(length).buffer)).slice(0, length);
}

// =============================================================================
// Checksum
// =============================================================================

/**
 * Calculate CRC32 checksum
 */
export function crc32(data: string): number {
  let crc = 0xffffffff;
  const table = getCRC32Table();

  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data.charCodeAt(i)) & 0xff];
  }

  return (crc ^ 0xffffffff) >>> 0;
}

// CRC32 lookup table (lazy initialization)
let crc32Table: Uint32Array | null = null;

function getCRC32Table(): Uint32Array {
  if (crc32Table) return crc32Table;

  crc32Table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crc32Table[i] = c;
  }
  return crc32Table;
}

/**
 * Calculate Adler-32 checksum (faster than CRC32)
 */
export function adler32(data: string): number {
  const MOD_ADLER = 65521;
  let a = 1;
  let b = 0;

  for (let i = 0; i < data.length; i++) {
    a = (a + data.charCodeAt(i)) % MOD_ADLER;
    b = (b + a) % MOD_ADLER;
  }

  return ((b << 16) | a) >>> 0;
}

// =============================================================================
// Fingerprinting
// =============================================================================

/**
 * Generate a content fingerprint for change detection
 */
export async function generateFingerprint(content: unknown): Promise<string> {
  const serialized = typeof content === 'string' ? content : JSON.stringify(content);
  const hash = await sha256(serialized);
  return hash.slice(0, 16);
}

/**
 * Generate a simple browser fingerprint (for analytics/debugging, not security)
 */
export function getBrowserFingerprint(): string {
  const components: string[] = [];

  // User agent
  components.push(navigator.userAgent);

  // Language
  components.push(navigator.language);

  // Screen
  components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);

  // Timezone
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone);

  // Platform
  components.push(navigator.platform);

  return simpleHash(components.join('|'));
}

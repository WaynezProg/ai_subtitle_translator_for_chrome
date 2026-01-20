/**
 * Crypto Utilities
 * 
 * Provides AES-GCM encryption for sensitive data storage.
 * Uses Web Crypto API with PBKDF2 key derivation.
 * 
 * @security Key is derived from extension ID and installation timestamp,
 * making it unique per installation but consistent across sessions.
 */

// ============================================================================
// Types
// ============================================================================

export interface EncryptedData {
  /** Base64 encoded ciphertext */
  ciphertext: string;
  /** Base64 encoded initialization vector */
  iv: string;
  /** Base64 encoded salt used for key derivation */
  salt: string;
  /** Version for future compatibility */
  version: 1;
}

/** Storage key for installation timestamp */
const INSTALL_TIME_KEY = '__crypto_install_time__';

/** PBKDF2 iteration count - balance between security and performance */
const PBKDF2_ITERATIONS = 100000;

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Convert Uint8Array to Base64 string
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert ArrayBuffer to Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return uint8ArrayToBase64(new Uint8Array(buffer));
}

/**
 * Convert Base64 string to Uint8Array
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Get or create installation timestamp
 * This ensures consistent key derivation across sessions
 */
async function getInstallTime(): Promise<string> {
  try {
    const result = await chrome.storage.local.get(INSTALL_TIME_KEY);
    if (result[INSTALL_TIME_KEY]) {
      return result[INSTALL_TIME_KEY] as string;
    }
    
    // First time - create and store installation timestamp
    const installTime = new Date().toISOString();
    await chrome.storage.local.set({ [INSTALL_TIME_KEY]: installTime });
    return installTime;
  } catch {
    // Fallback for environments without chrome.storage (e.g., tests)
    console.warn('[Crypto] chrome.storage not available, using fallback');
    return 'fallback-install-time';
  }
}

/**
 * Get extension ID safely
 */
function getExtensionId(): string {
  try {
    return chrome.runtime?.id || 'fallback-extension-id';
  } catch {
    return 'fallback-extension-id';
  }
}

/**
 * Derive encryption key using PBKDF2
 */
async function deriveKey(salt: Uint8Array): Promise<CryptoKey> {
  const extensionId = getExtensionId();
  const installTime = await getInstallTime();
  const keyMaterial = `${extensionId}:${installTime}`;
  
  // Import key material for PBKDF2
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(keyMaterial),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  // Derive AES-GCM key
  // Cast salt to BufferSource to satisfy TypeScript's strict type checking
  // Note: Uint8Array is a valid BufferSource in the browser, but TS lib.dom types
  // are overly strict about ArrayBufferLike vs ArrayBuffer
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Encrypt a string using AES-GCM
 * 
 * @param plaintext - The string to encrypt
 * @returns Encrypted data object containing ciphertext, IV, and salt
 * 
 * @example
 * ```typescript
 * const encrypted = await encrypt('my-secret-api-key');
 * // Store encrypted in chrome.storage
 * ```
 */
export async function encrypt(plaintext: string): Promise<EncryptedData> {
  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Derive key and encrypt
  const key = await deriveKey(salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  
  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: uint8ArrayToBase64(iv),
    salt: uint8ArrayToBase64(salt),
    version: 1,
  };
}

/**
 * Decrypt data encrypted with encrypt()
 * 
 * @param data - Encrypted data object
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails (wrong key, corrupted data, etc.)
 * 
 * @example
 * ```typescript
 * const plaintext = await decrypt(encryptedData);
 * ```
 */
export async function decrypt(data: EncryptedData): Promise<string> {
  const salt = base64ToUint8Array(data.salt);
  const iv = base64ToUint8Array(data.iv);
  const ciphertext = base64ToUint8Array(data.ciphertext);
  
  // Derive key and decrypt
  const key = await deriveKey(salt);
  // Cast iv and ciphertext to BufferSource for TypeScript compatibility
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as BufferSource },
    key,
    ciphertext as unknown as BufferSource
  );
  
  return new TextDecoder().decode(plaintext);
}

/**
 * Check if data is in encrypted format
 * 
 * @param data - Data to check
 * @returns true if data appears to be encrypted
 */
export function isEncryptedData(data: unknown): data is EncryptedData {
  if (!data || typeof data !== 'object') {
    return false;
  }
  
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.ciphertext === 'string' &&
    typeof obj.iv === 'string' &&
    typeof obj.salt === 'string' &&
    obj.version === 1
  );
}

/**
 * Encrypt a value if it's a string, pass through if already encrypted
 * Useful for migration scenarios
 * 
 * @param value - String or already encrypted data
 * @returns Encrypted data
 */
export async function ensureEncrypted(value: string | EncryptedData): Promise<EncryptedData> {
  if (isEncryptedData(value)) {
    return value;
  }
  return encrypt(value);
}

/**
 * Decrypt a value if encrypted, pass through if plain string
 * Useful for migration scenarios
 * 
 * @param value - Encrypted data or plain string
 * @returns Decrypted string
 */
export async function ensureDecrypted(value: string | EncryptedData): Promise<string> {
  if (isEncryptedData(value)) {
    return decrypt(value);
  }
  return value;
}

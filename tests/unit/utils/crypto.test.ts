/**
 * Tests for crypto utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  encrypt,
  decrypt,
  isEncryptedData,
  ensureEncrypted,
  ensureDecrypted,
  type EncryptedData,
} from '@shared/utils/crypto';

describe('crypto utilities', () => {
  // Store the install time to ensure consistent key derivation
  const mockInstallTime = '2024-01-01T00:00:00.000Z';
  const storageData: Record<string, unknown> = {
    '__crypto_install_time__': mockInstallTime,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock chrome.storage.local to return consistent install time
    vi.mocked(chrome.storage.local.get).mockImplementation(async (keys) => {
      if (typeof keys === 'string') {
        return { [keys]: storageData[keys] };
      }
      if (Array.isArray(keys)) {
        const result: Record<string, unknown> = {};
        keys.forEach(key => {
          if (storageData[key] !== undefined) {
            result[key] = storageData[key];
          }
        });
        return result;
      }
      return {};
    });
    
    vi.mocked(chrome.storage.local.set).mockImplementation(async (items) => {
      Object.assign(storageData, items);
    });
  });

  describe('encrypt', () => {
    it('should encrypt a string and return encrypted data structure', async () => {
      const plaintext = 'my-secret-api-key';
      
      const encrypted = await encrypt(plaintext);
      
      expect(encrypted).toHaveProperty('ciphertext');
      expect(encrypted).toHaveProperty('iv');
      expect(encrypted).toHaveProperty('salt');
      expect(encrypted).toHaveProperty('version', 1);
      expect(typeof encrypted.ciphertext).toBe('string');
      expect(typeof encrypted.iv).toBe('string');
      expect(typeof encrypted.salt).toBe('string');
    });

    it('should produce different ciphertext for same plaintext (random IV)', async () => {
      const plaintext = 'test-key';
      
      const encrypted1 = await encrypt(plaintext);
      const encrypted2 = await encrypt(plaintext);
      
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it('should handle empty string', async () => {
      const encrypted = await encrypt('');
      
      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.version).toBe(1);
    });

    it('should handle long strings', async () => {
      const longString = 'a'.repeat(10000);
      
      const encrypted = await encrypt(longString);
      
      expect(encrypted.ciphertext).toBeTruthy();
    });

    it('should handle unicode characters', async () => {
      const unicodeString = 'API金鑰: 測試123 emoji: 🔐';
      
      const encrypted = await encrypt(unicodeString);
      
      expect(encrypted.ciphertext).toBeTruthy();
    });
  });

  describe('decrypt', () => {
    it('should decrypt encrypted data back to original plaintext', async () => {
      const plaintext = 'my-secret-api-key';
      const encrypted = await encrypt(plaintext);
      
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should handle empty string round-trip', async () => {
      const encrypted = await encrypt('');
      
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe('');
    });

    it('should handle unicode characters round-trip', async () => {
      const original = 'API金鑰: 測試123 emoji: 🔐';
      const encrypted = await encrypt(original);
      
      const decrypted = await decrypt(encrypted);
      
      expect(decrypted).toBe(original);
    });

    it('should throw error for corrupted ciphertext', async () => {
      const encrypted = await encrypt('test');
      const corrupted: EncryptedData = {
        ...encrypted,
        ciphertext: 'invalid-base64!!!',
      };
      
      await expect(decrypt(corrupted)).rejects.toThrow();
    });

    it('should throw error for wrong IV', async () => {
      const encrypted = await encrypt('test');
      const wrongIv: EncryptedData = {
        ...encrypted,
        iv: 'AAAAAAAAAAAAAAAA', // 12 bytes in base64
      };
      
      await expect(decrypt(wrongIv)).rejects.toThrow();
    });
  });

  describe('isEncryptedData', () => {
    it('should return true for valid encrypted data', async () => {
      const encrypted = await encrypt('test');
      
      expect(isEncryptedData(encrypted)).toBe(true);
    });

    it('should return false for plain string', () => {
      expect(isEncryptedData('plain-string')).toBe(false);
    });

    it('should return false for null', () => {
      expect(isEncryptedData(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isEncryptedData(undefined)).toBe(false);
    });

    it('should return false for object missing required fields', () => {
      expect(isEncryptedData({ ciphertext: 'abc' })).toBe(false);
      expect(isEncryptedData({ ciphertext: 'abc', iv: 'def' })).toBe(false);
      expect(isEncryptedData({ ciphertext: 'abc', iv: 'def', salt: 'ghi' })).toBe(false);
    });

    it('should return false for wrong version', () => {
      expect(isEncryptedData({
        ciphertext: 'abc',
        iv: 'def',
        salt: 'ghi',
        version: 2,
      })).toBe(false);
    });
  });

  describe('ensureEncrypted', () => {
    it('should encrypt plain string', async () => {
      const result = await ensureEncrypted('plain-text');
      
      expect(isEncryptedData(result)).toBe(true);
    });

    it('should pass through already encrypted data', async () => {
      const encrypted = await encrypt('test');
      
      const result = await ensureEncrypted(encrypted);
      
      expect(result).toBe(encrypted);
    });
  });

  describe('ensureDecrypted', () => {
    it('should decrypt encrypted data', async () => {
      const encrypted = await encrypt('secret');
      
      const result = await ensureDecrypted(encrypted);
      
      expect(result).toBe('secret');
    });

    it('should pass through plain string', async () => {
      const result = await ensureDecrypted('plain-text');
      
      expect(result).toBe('plain-text');
    });
  });

  describe('key derivation consistency', () => {
    it('should produce consistent decryption across calls', async () => {
      const plaintext = 'consistent-key-test';
      const encrypted = await encrypt(plaintext);
      
      // Decrypt multiple times
      const decrypted1 = await decrypt(encrypted);
      const decrypted2 = await decrypt(encrypted);
      const decrypted3 = await decrypt(encrypted);
      
      expect(decrypted1).toBe(plaintext);
      expect(decrypted2).toBe(plaintext);
      expect(decrypted3).toBe(plaintext);
    });
  });
});

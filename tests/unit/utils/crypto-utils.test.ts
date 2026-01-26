/**
 * Tests for Crypto and Hashing Utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  // Hash functions
  sha256,
  sha1,
  simpleHash,
  fnv1aHash,
  contentHash,
  // Buffer conversions
  bufferToHex,
  hexToBuffer,
  bufferToBase64,
  base64ToBuffer,
  stringToBuffer,
  bufferToString,
  // Base64
  base64Encode,
  base64Decode,
  base64UrlEncode,
  base64UrlDecode,
  // Random generation
  randomBytes,
  randomHex,
  uuid,
  shortId,
  randomInt,
  shuffleArray,
  // Encryption
  generateKey,
  exportKey,
  importKey,
  encrypt,
  decrypt,
  deriveKey,
  // HMAC
  hmacSign,
  hmacVerify,
  // Security utilities
  timingSafeEqual,
  maskSensitiveData,
  generateToken,
  // Checksum
  crc32,
  adler32,
  // Fingerprinting
  generateFingerprint,
  getBrowserFingerprint,
} from '@shared/utils/crypto-utils';

describe('Crypto Utils', () => {
  describe('Hash Functions', () => {
    describe('sha256', () => {
      it('should hash empty string', async () => {
        const hash = await sha256('');
        expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
      });

      it('should hash "hello world"', async () => {
        const hash = await sha256('hello world');
        expect(hash).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
      });

      it('should produce consistent hashes', async () => {
        const hash1 = await sha256('test');
        const hash2 = await sha256('test');
        expect(hash1).toBe(hash2);
      });

      it('should produce different hashes for different inputs', async () => {
        const hash1 = await sha256('hello');
        const hash2 = await sha256('world');
        expect(hash1).not.toBe(hash2);
      });
    });

    describe('sha1', () => {
      it('should hash empty string', async () => {
        const hash = await sha1('');
        expect(hash).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
      });

      it('should hash "hello world"', async () => {
        const hash = await sha1('hello world');
        expect(hash).toBe('2aae6c35c94fcfb415dbe95f408b9ce91ee846ed');
      });
    });

    describe('simpleHash', () => {
      it('should hash strings', () => {
        const hash = simpleHash('test');
        expect(typeof hash).toBe('string');
        expect(hash.length).toBe(8);
      });

      it('should be consistent', () => {
        const hash1 = simpleHash('hello');
        const hash2 = simpleHash('hello');
        expect(hash1).toBe(hash2);
      });

      it('should produce different hashes for different inputs', () => {
        const hash1 = simpleHash('hello');
        const hash2 = simpleHash('world');
        expect(hash1).not.toBe(hash2);
      });
    });

    describe('fnv1aHash', () => {
      it('should hash strings to numbers', () => {
        const hash = fnv1aHash('test');
        expect(typeof hash).toBe('number');
        expect(hash).toBeGreaterThan(0);
      });

      it('should be consistent', () => {
        const hash1 = fnv1aHash('hello');
        const hash2 = fnv1aHash('hello');
        expect(hash1).toBe(hash2);
      });

      it('should produce different hashes for different inputs', () => {
        const hash1 = fnv1aHash('hello');
        const hash2 = fnv1aHash('world');
        expect(hash1).not.toBe(hash2);
      });
    });

    describe('contentHash', () => {
      it('should hash string content', async () => {
        const hash = await contentHash('test content');
        expect(hash.length).toBe(64); // SHA-256 = 64 hex chars
      });

      it('should hash object content', async () => {
        const hash = await contentHash({ key: 'value' });
        expect(hash.length).toBe(64);
      });

      it('should produce same hash for equivalent objects', async () => {
        const hash1 = await contentHash({ a: 1, b: 2 });
        const hash2 = await contentHash({ a: 1, b: 2 });
        expect(hash1).toBe(hash2);
      });
    });
  });

  describe('Buffer Conversions', () => {
    describe('bufferToHex / hexToBuffer', () => {
      it('should convert buffer to hex', () => {
        const buffer = new Uint8Array([0, 255, 128, 64]).buffer;
        const hex = bufferToHex(buffer);
        expect(hex).toBe('00ff8040');
      });

      it('should convert hex to buffer', () => {
        const buffer = hexToBuffer('00ff8040');
        const array = new Uint8Array(buffer);
        expect(Array.from(array)).toEqual([0, 255, 128, 64]);
      });

      it('should round-trip correctly', () => {
        const original = new Uint8Array([1, 2, 3, 255]).buffer;
        const hex = bufferToHex(original);
        const restored = hexToBuffer(hex);
        expect(new Uint8Array(restored)).toEqual(new Uint8Array(original));
      });
    });

    describe('bufferToBase64 / base64ToBuffer', () => {
      it('should convert buffer to base64', () => {
        const buffer = new Uint8Array([72, 101, 108, 108, 111]).buffer; // "Hello"
        const base64 = bufferToBase64(buffer);
        expect(base64).toBe('SGVsbG8=');
      });

      it('should convert base64 to buffer', () => {
        const buffer = base64ToBuffer('SGVsbG8=');
        const text = new TextDecoder().decode(buffer);
        expect(text).toBe('Hello');
      });

      it('should round-trip correctly', () => {
        const original = new Uint8Array([1, 2, 3, 255]).buffer;
        const base64 = bufferToBase64(original);
        const restored = base64ToBuffer(base64);
        expect(new Uint8Array(restored)).toEqual(new Uint8Array(original));
      });
    });

    describe('stringToBuffer / bufferToString', () => {
      it('should convert string to buffer', () => {
        const buffer = stringToBuffer('Hello');
        expect(buffer.byteLength).toBe(5);
      });

      it('should convert buffer to string', () => {
        const buffer = new Uint8Array([72, 101, 108, 108, 111]).buffer;
        const str = bufferToString(buffer);
        expect(str).toBe('Hello');
      });

      it('should handle Unicode', () => {
        const original = '你好世界';
        const buffer = stringToBuffer(original);
        const restored = bufferToString(buffer);
        expect(restored).toBe(original);
      });
    });
  });

  describe('Base64 Encoding/Decoding', () => {
    describe('base64Encode / base64Decode', () => {
      it('should encode ASCII strings', () => {
        expect(base64Encode('Hello World')).toBe('SGVsbG8gV29ybGQ=');
      });

      it('should decode ASCII strings', () => {
        expect(base64Decode('SGVsbG8gV29ybGQ=')).toBe('Hello World');
      });

      it('should handle Unicode', () => {
        const original = '你好世界';
        const encoded = base64Encode(original);
        const decoded = base64Decode(encoded);
        expect(decoded).toBe(original);
      });

      it('should round-trip correctly', () => {
        const original = 'Test 123 !@#';
        expect(base64Decode(base64Encode(original))).toBe(original);
      });
    });

    describe('base64UrlEncode / base64UrlDecode', () => {
      it('should encode to URL-safe base64', () => {
        // Characters that would be + or / in standard base64
        const result = base64UrlEncode('>>>???');
        expect(result).not.toContain('+');
        expect(result).not.toContain('/');
        expect(result).not.toContain('=');
      });

      it('should decode URL-safe base64', () => {
        const original = '>>>???';
        const encoded = base64UrlEncode(original);
        const decoded = base64UrlDecode(encoded);
        expect(decoded).toBe(original);
      });
    });
  });

  describe('Random Generation', () => {
    describe('randomBytes', () => {
      it('should generate specified number of bytes', () => {
        const bytes = randomBytes(16);
        expect(bytes.length).toBe(16);
      });

      it('should generate different values each time', () => {
        const bytes1 = randomBytes(16);
        const bytes2 = randomBytes(16);
        expect(bytes1).not.toEqual(bytes2);
      });
    });

    describe('randomHex', () => {
      it('should generate hex string of specified length', () => {
        const hex = randomHex(32);
        expect(hex.length).toBe(32);
        expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
      });
    });

    describe('uuid', () => {
      it('should generate valid UUID v4', () => {
        const id = uuid();
        expect(id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        );
      });

      it('should generate unique UUIDs', () => {
        const ids = new Set(Array.from({ length: 100 }, () => uuid()));
        expect(ids.size).toBe(100);
      });
    });

    describe('shortId', () => {
      it('should generate ID of specified length', () => {
        const id = shortId(12);
        expect(id.length).toBe(12);
      });

      it('should only contain alphanumeric characters', () => {
        const id = shortId(100);
        expect(/^[A-Za-z0-9]+$/.test(id)).toBe(true);
      });

      it('should default to 8 characters', () => {
        const id = shortId();
        expect(id.length).toBe(8);
      });
    });

    describe('randomInt', () => {
      it('should generate integers within range', () => {
        for (let i = 0; i < 100; i++) {
          const num = randomInt(1, 10);
          expect(num).toBeGreaterThanOrEqual(1);
          expect(num).toBeLessThanOrEqual(10);
        }
      });

      it('should generate inclusive bounds', () => {
        const results = new Set<number>();
        for (let i = 0; i < 1000; i++) {
          results.add(randomInt(1, 3));
        }
        expect(results.has(1)).toBe(true);
        expect(results.has(2)).toBe(true);
        expect(results.has(3)).toBe(true);
      });
    });

    describe('shuffleArray', () => {
      it('should preserve all elements', () => {
        const original = [1, 2, 3, 4, 5];
        const shuffled = shuffleArray(original);

        expect(shuffled.sort()).toEqual(original.sort());
      });

      it('should not modify original array', () => {
        const original = [1, 2, 3, 4, 5];
        const copy = [...original];
        shuffleArray(original);

        expect(original).toEqual(copy);
      });

      it('should produce different orders', () => {
        const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const results = new Set<string>();

        for (let i = 0; i < 50; i++) {
          results.add(shuffleArray(original).join(','));
        }

        // Should have multiple different orderings
        expect(results.size).toBeGreaterThan(1);
      });
    });
  });

  describe('Encryption/Decryption', () => {
    describe('generateKey / exportKey / importKey', () => {
      it('should generate and export key', async () => {
        const key = await generateKey();
        const exported = await exportKey(key);

        expect(typeof exported).toBe('string');
        expect(exported.length).toBeGreaterThan(0);
      });

      it('should import key', async () => {
        const originalKey = await generateKey();
        const exported = await exportKey(originalKey);
        const imported = await importKey(exported);

        expect(imported).toBeDefined();
        expect(imported.type).toBe('secret');
      });
    });

    describe('encrypt / decrypt', () => {
      it('should encrypt and decrypt data', async () => {
        const key = await generateKey();
        const plaintext = 'Hello, World!';

        const encrypted = await encrypt(plaintext, key);
        const decrypted = await decrypt(encrypted, key);

        expect(decrypted).toBe(plaintext);
      });

      it('should produce different ciphertexts for same plaintext', async () => {
        const key = await generateKey();
        const plaintext = 'Same message';

        const encrypted1 = await encrypt(plaintext, key);
        const encrypted2 = await encrypt(plaintext, key);

        expect(encrypted1).not.toBe(encrypted2);
      });

      it('should handle Unicode', async () => {
        const key = await generateKey();
        const plaintext = '你好世界 🌍';

        const encrypted = await encrypt(plaintext, key);
        const decrypted = await decrypt(encrypted, key);

        expect(decrypted).toBe(plaintext);
      });

      it('should handle long text', async () => {
        const key = await generateKey();
        const plaintext = 'x'.repeat(10000);

        const encrypted = await encrypt(plaintext, key);
        const decrypted = await decrypt(encrypted, key);

        expect(decrypted).toBe(plaintext);
      });
    });

    describe('deriveKey', () => {
      it('should derive key from password', async () => {
        const key = await deriveKey('password123', 'salt');
        expect(key).toBeDefined();
        expect(key.type).toBe('secret');
      });

      it('should produce same key for same password and salt', async () => {
        const key1 = await deriveKey('password', 'salt');
        const key2 = await deriveKey('password', 'salt');

        const exported1 = await exportKey(key1);
        const exported2 = await exportKey(key2);

        expect(exported1).toBe(exported2);
      });

      it('should produce different keys for different passwords', async () => {
        const key1 = await deriveKey('password1', 'salt');
        const key2 = await deriveKey('password2', 'salt');

        const exported1 = await exportKey(key1);
        const exported2 = await exportKey(key2);

        expect(exported1).not.toBe(exported2);
      });

      it('should produce different keys for different salts', async () => {
        const key1 = await deriveKey('password', 'salt1');
        const key2 = await deriveKey('password', 'salt2');

        const exported1 = await exportKey(key1);
        const exported2 = await exportKey(key2);

        expect(exported1).not.toBe(exported2);
      });
    });
  });

  describe('HMAC', () => {
    describe('hmacSign / hmacVerify', () => {
      it('should sign data', async () => {
        const signature = await hmacSign('data', 'secret');
        expect(typeof signature).toBe('string');
        expect(signature.length).toBe(64); // SHA-256 = 64 hex chars
      });

      it('should verify valid signature', async () => {
        const data = 'important data';
        const secret = 'my-secret';
        const signature = await hmacSign(data, secret);

        const isValid = await hmacVerify(data, signature, secret);
        expect(isValid).toBe(true);
      });

      it('should reject invalid signature', async () => {
        const data = 'important data';
        const secret = 'my-secret';
        const signature = await hmacSign(data, secret);

        const isValid = await hmacVerify(data, signature + 'x', secret);
        expect(isValid).toBe(false);
      });

      it('should reject tampered data', async () => {
        const data = 'important data';
        const secret = 'my-secret';
        const signature = await hmacSign(data, secret);

        const isValid = await hmacVerify('tampered data', signature, secret);
        expect(isValid).toBe(false);
      });
    });
  });

  describe('Security Utilities', () => {
    describe('timingSafeEqual', () => {
      it('should return true for equal strings', () => {
        expect(timingSafeEqual('hello', 'hello')).toBe(true);
      });

      it('should return false for different strings', () => {
        expect(timingSafeEqual('hello', 'world')).toBe(false);
      });

      it('should return false for different lengths', () => {
        expect(timingSafeEqual('short', 'longer')).toBe(false);
      });
    });

    describe('maskSensitiveData', () => {
      it('should mask middle of long strings', () => {
        const masked = maskSensitiveData('sk-abcdefghijklmnop');
        expect(masked).toBe('sk-a********mnop');
      });

      it('should fully mask short strings', () => {
        const masked = maskSensitiveData('short');
        expect(masked).toBe('*****');
      });

      it('should respect visibleChars parameter', () => {
        const masked = maskSensitiveData('abcdefghijklmnop', 2);
        expect(masked).toBe('ab********op');
      });
    });

    describe('generateToken', () => {
      it('should generate token of specified length', () => {
        const token = generateToken(16);
        expect(token.length).toBe(16);
      });

      it('should generate unique tokens', () => {
        // Use longer tokens to reduce collision probability
        const tokens = new Set(Array.from({ length: 100 }, () => generateToken(64)));
        expect(tokens.size).toBe(100);
      });
    });
  });

  describe('Checksum', () => {
    describe('crc32', () => {
      it('should calculate CRC32', () => {
        const checksum = crc32('hello');
        expect(typeof checksum).toBe('number');
        expect(checksum).toBeGreaterThan(0);
      });

      it('should be consistent', () => {
        const checksum1 = crc32('test data');
        const checksum2 = crc32('test data');
        expect(checksum1).toBe(checksum2);
      });

      it('should produce different checksums for different data', () => {
        const checksum1 = crc32('hello');
        const checksum2 = crc32('world');
        expect(checksum1).not.toBe(checksum2);
      });
    });

    describe('adler32', () => {
      it('should calculate Adler-32', () => {
        const checksum = adler32('hello');
        expect(typeof checksum).toBe('number');
        expect(checksum).toBeGreaterThan(0);
      });

      it('should be consistent', () => {
        const checksum1 = adler32('test data');
        const checksum2 = adler32('test data');
        expect(checksum1).toBe(checksum2);
      });

      it('should produce different checksums for different data', () => {
        const checksum1 = adler32('hello');
        const checksum2 = adler32('world');
        expect(checksum1).not.toBe(checksum2);
      });
    });
  });

  describe('Fingerprinting', () => {
    describe('generateFingerprint', () => {
      it('should generate fingerprint for string', async () => {
        const fingerprint = await generateFingerprint('content');
        expect(fingerprint.length).toBe(16);
      });

      it('should generate fingerprint for object', async () => {
        const fingerprint = await generateFingerprint({ key: 'value' });
        expect(fingerprint.length).toBe(16);
      });

      it('should produce same fingerprint for same content', async () => {
        const fp1 = await generateFingerprint('test');
        const fp2 = await generateFingerprint('test');
        expect(fp1).toBe(fp2);
      });
    });

    describe('getBrowserFingerprint', () => {
      it('should generate fingerprint', () => {
        const fingerprint = getBrowserFingerprint();
        expect(typeof fingerprint).toBe('string');
        expect(fingerprint.length).toBe(8);
      });

      it('should be consistent', () => {
        const fp1 = getBrowserFingerprint();
        const fp2 = getBrowserFingerprint();
        expect(fp1).toBe(fp2);
      });
    });
  });
});

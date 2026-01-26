/**
 * Tests for Input Validation and Sanitization Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  // Type validators
  isString,
  isNonEmptyString,
  isNumber,
  isPositiveNumber,
  isNonNegativeNumber,
  isInteger,
  isBoolean,
  isArray,
  isNonEmptyArray,
  isObject,
  // String validators
  hasLength,
  matchesPattern,
  isValidEmail,
  isValidUrl,
  isSecureUrl,
  // Language validators
  isValidLanguageCode,
  // API key validators
  isValidOpenAIKey,
  isValidAnthropicKey,
  // Sanitization
  sanitizeString,
  escapeHtml,
  stripHtml,
  normalizeWhitespace,
  truncate,
  // Subtitle validators
  isValidCueTiming,
  isValidVideoId,
  // Composite validators
  validateNumber,
  validateString,
  validateEnum,
  // Assertion helpers
  assertValid,
  assertDefined,
} from '@shared/utils/validation';

// ============================================================================
// Type Validators
// ============================================================================

describe('Type Validators', () => {
  describe('isString', () => {
    it('should return true for strings', () => {
      expect(isString('')).toBe(true);
      expect(isString('hello')).toBe(true);
    });

    it('should return false for non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString([])).toBe(false);
    });
  });

  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('  hello  ')).toBe(true);
    });

    it('should return false for empty strings', () => {
      expect(isNonEmptyString('')).toBe(false);
      expect(isNonEmptyString('   ')).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('should return true for valid numbers', () => {
      expect(isNumber(0)).toBe(true);
      expect(isNumber(123)).toBe(true);
      expect(isNumber(-456)).toBe(true);
      expect(isNumber(3.14)).toBe(true);
    });

    it('should return false for NaN and non-numbers', () => {
      expect(isNumber(NaN)).toBe(false);
      expect(isNumber('123')).toBe(false);
      expect(isNumber(null)).toBe(false);
    });
  });

  describe('isPositiveNumber', () => {
    it('should return true for positive numbers', () => {
      expect(isPositiveNumber(1)).toBe(true);
      expect(isPositiveNumber(0.001)).toBe(true);
    });

    it('should return false for zero and negative numbers', () => {
      expect(isPositiveNumber(0)).toBe(false);
      expect(isPositiveNumber(-1)).toBe(false);
    });
  });

  describe('isNonNegativeNumber', () => {
    it('should return true for zero and positive numbers', () => {
      expect(isNonNegativeNumber(0)).toBe(true);
      expect(isNonNegativeNumber(100)).toBe(true);
    });

    it('should return false for negative numbers', () => {
      expect(isNonNegativeNumber(-0.001)).toBe(false);
    });
  });

  describe('isInteger', () => {
    it('should return true for integers', () => {
      expect(isInteger(0)).toBe(true);
      expect(isInteger(42)).toBe(true);
      expect(isInteger(-100)).toBe(true);
    });

    it('should return false for floats', () => {
      expect(isInteger(3.14)).toBe(false);
      expect(isInteger(0.5)).toBe(false);
    });
  });

  describe('isBoolean', () => {
    it('should return true for booleans', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });

    it('should return false for non-booleans', () => {
      expect(isBoolean(0)).toBe(false);
      expect(isBoolean('true')).toBe(false);
    });
  });

  describe('isArray', () => {
    it('should return true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
    });

    it('should return false for non-arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('array')).toBe(false);
    });
  });

  describe('isNonEmptyArray', () => {
    it('should return true for non-empty arrays', () => {
      expect(isNonEmptyArray([1])).toBe(true);
    });

    it('should return false for empty arrays', () => {
      expect(isNonEmptyArray([])).toBe(false);
    });
  });

  describe('isObject', () => {
    it('should return true for plain objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ a: 1 })).toBe(true);
    });

    it('should return false for arrays and null', () => {
      expect(isObject([])).toBe(false);
      expect(isObject(null)).toBe(false);
    });
  });
});

// ============================================================================
// String Validators
// ============================================================================

describe('String Validators', () => {
  describe('hasLength', () => {
    it('should validate minimum length', () => {
      expect(hasLength('hello', { min: 3 })).toBe(true);
      expect(hasLength('hi', { min: 3 })).toBe(false);
    });

    it('should validate maximum length', () => {
      expect(hasLength('hi', { max: 5 })).toBe(true);
      expect(hasLength('hello world', { max: 5 })).toBe(false);
    });

    it('should validate both min and max', () => {
      expect(hasLength('hello', { min: 3, max: 10 })).toBe(true);
      expect(hasLength('hi', { min: 3, max: 10 })).toBe(false);
    });
  });

  describe('matchesPattern', () => {
    it('should return true for matching patterns', () => {
      expect(matchesPattern('hello123', /^[a-z]+\d+$/)).toBe(true);
    });

    it('should return false for non-matching patterns', () => {
      expect(matchesPattern('123hello', /^[a-z]+\d+$/)).toBe(false);
    });
  });

  describe('isValidEmail', () => {
    it('should validate correct emails', () => {
      expect(isValidEmail('user@example.com')).toBe(true);
      expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(isValidEmail('invalid')).toBe(false);
      expect(isValidEmail('missing@domain')).toBe(false);
      expect(isValidEmail('@nodomain.com')).toBe(false);
    });
  });

  describe('isValidUrl', () => {
    it('should validate correct URLs', () => {
      expect(isValidUrl('https://example.com')).toBe(true);
      expect(isValidUrl('http://localhost:3000')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidUrl('not-a-url')).toBe(false);
      expect(isValidUrl('')).toBe(false);
    });
  });

  describe('isSecureUrl', () => {
    it('should return true for HTTPS URLs', () => {
      expect(isSecureUrl('https://example.com')).toBe(true);
    });

    it('should return false for HTTP URLs', () => {
      expect(isSecureUrl('http://example.com')).toBe(false);
    });
  });
});

// ============================================================================
// Language Validators
// ============================================================================

describe('Language Validators', () => {
  describe('isValidLanguageCode', () => {
    it('should accept valid language codes', () => {
      expect(isValidLanguageCode('en')).toBe(true);
      expect(isValidLanguageCode('zh-TW')).toBe(true);
      expect(isValidLanguageCode('zh-CN')).toBe(true);
      expect(isValidLanguageCode('ja')).toBe(true);
      expect(isValidLanguageCode('auto')).toBe(true);
    });

    it('should accept standard ISO codes', () => {
      expect(isValidLanguageCode('fr')).toBe(true);
      expect(isValidLanguageCode('de-DE')).toBe(true);
    });

    it('should reject invalid codes', () => {
      expect(isValidLanguageCode('invalid')).toBe(false);
      expect(isValidLanguageCode('')).toBe(false);
      expect(isValidLanguageCode(123)).toBe(false);
    });
  });
});

// ============================================================================
// API Key Validators
// ============================================================================

describe('API Key Validators', () => {
  describe('isValidOpenAIKey', () => {
    it('should accept valid OpenAI keys', () => {
      // Standard key format
      const validKey = 'sk-' + 'a'.repeat(48);
      expect(isValidOpenAIKey(validKey)).toBe(true);
    });

    it('should accept project keys', () => {
      const projectKey = 'sk-proj-' + 'a'.repeat(80);
      expect(isValidOpenAIKey(projectKey)).toBe(true);
    });

    it('should reject invalid keys', () => {
      expect(isValidOpenAIKey('invalid-key')).toBe(false);
      expect(isValidOpenAIKey('')).toBe(false);
    });
  });

  describe('isValidAnthropicKey', () => {
    it('should accept valid Anthropic keys', () => {
      const validKey = 'sk-ant-' + 'a'.repeat(80);
      expect(isValidAnthropicKey(validKey)).toBe(true);
    });

    it('should reject invalid keys', () => {
      expect(isValidAnthropicKey('sk-invalid')).toBe(false);
      expect(isValidAnthropicKey('')).toBe(false);
    });
  });
});

// ============================================================================
// Sanitization Functions
// ============================================================================

describe('Sanitization Functions', () => {
  describe('sanitizeString', () => {
    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });

    it('should remove control characters', () => {
      expect(sanitizeString('hello\x00world')).toBe('helloworld');
    });

    it('should preserve newlines and tabs', () => {
      expect(sanitizeString('hello\nworld\ttab')).toBe('hello\nworld\ttab');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<div class="test">')).toBe('&lt;div class=&quot;test&quot;&gt;');
      expect(escapeHtml("it's & that")).toBe('it&#39;s &amp; that');
    });
  });

  describe('stripHtml', () => {
    it('should remove HTML tags', () => {
      expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
    });

    it('should handle self-closing tags', () => {
      expect(stripHtml('Line 1<br/>Line 2')).toBe('Line 1Line 2');
    });
  });

  describe('normalizeWhitespace', () => {
    it('should collapse multiple spaces', () => {
      expect(normalizeWhitespace('hello    world')).toBe('hello world');
    });

    it('should collapse newlines', () => {
      expect(normalizeWhitespace('hello\n\n\nworld')).toBe('hello world');
    });
  });

  describe('truncate', () => {
    it('should truncate long strings', () => {
      expect(truncate('hello world', 8)).toBe('hello...');
    });

    it('should not truncate short strings', () => {
      expect(truncate('hello', 10)).toBe('hello');
    });

    it('should use custom ellipsis', () => {
      expect(truncate('hello world', 8, '…')).toBe('hello w…');
    });
  });
});

// ============================================================================
// Subtitle Validators
// ============================================================================

describe('Subtitle Validators', () => {
  describe('isValidCueTiming', () => {
    it('should accept valid timings', () => {
      expect(isValidCueTiming(0, 1000)).toBe(true);
      expect(isValidCueTiming(5000, 10000)).toBe(true);
    });

    it('should reject invalid timings', () => {
      expect(isValidCueTiming(1000, 1000)).toBe(false); // Equal
      expect(isValidCueTiming(2000, 1000)).toBe(false); // End before start
      expect(isValidCueTiming(-100, 1000)).toBe(false); // Negative
    });
  });

  describe('isValidVideoId', () => {
    it('should validate YouTube video IDs', () => {
      expect(isValidVideoId('dQw4w9WgXcQ', 'youtube')).toBe(true);
      expect(isValidVideoId('abc123', 'youtube')).toBe(false);
    });

    it('should validate Netflix video IDs', () => {
      expect(isValidVideoId('80100172', 'netflix')).toBe(true);
      expect(isValidVideoId('abc123', 'netflix')).toBe(false);
    });

    it('should validate generic video IDs', () => {
      expect(isValidVideoId('video-123_abc')).toBe(true);
      expect(isValidVideoId('')).toBe(false);
    });
  });
});

// ============================================================================
// Composite Validators
// ============================================================================

describe('Composite Validators', () => {
  describe('validateNumber', () => {
    it('should validate and parse numbers', () => {
      expect(validateNumber(42)).toEqual({ valid: true, value: 42 });
      expect(validateNumber('3.14')).toEqual({ valid: true, value: 3.14 });
    });

    it('should validate range', () => {
      expect(validateNumber(5, { min: 1, max: 10 }).valid).toBe(true);
      expect(validateNumber(15, { max: 10 }).valid).toBe(false);
    });

    it('should validate integer', () => {
      expect(validateNumber(5, { integer: true }).valid).toBe(true);
      expect(validateNumber(5.5, { integer: true }).valid).toBe(false);
    });

    it('should return error for invalid input', () => {
      const result = validateNumber('not-a-number');
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('validateString', () => {
    it('should validate and sanitize strings', () => {
      const result = validateString('  hello  ');
      expect(result.valid).toBe(true);
      expect(result.value).toBe('hello');
    });

    it('should validate length', () => {
      expect(validateString('hi', { minLength: 5 }).valid).toBe(false);
      expect(validateString('hello world', { maxLength: 5 }).value).toBe('hello');
    });

    it('should validate pattern', () => {
      expect(validateString('abc123', { pattern: /^[a-z]+$/ }).valid).toBe(false);
    });
  });

  describe('validateEnum', () => {
    const colors = ['red', 'green', 'blue'] as const;

    it('should accept valid enum values', () => {
      const result = validateEnum('red', colors);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('red');
    });

    it('should reject invalid enum values', () => {
      const result = validateEnum('yellow', colors);
      expect(result.valid).toBe(false);
    });
  });
});

// ============================================================================
// Assertion Helpers
// ============================================================================

describe('Assertion Helpers', () => {
  describe('assertValid', () => {
    it('should not throw for valid results', () => {
      expect(() => assertValid({ valid: true, value: 'test' })).not.toThrow();
    });

    it('should throw for invalid results', () => {
      expect(() => assertValid({ valid: false, error: 'Test error' })).toThrow('Test error');
    });

    it('should use custom message', () => {
      expect(() => assertValid({ valid: false }, 'Custom error')).toThrow('Custom error');
    });
  });

  describe('assertDefined', () => {
    it('should not throw for defined values', () => {
      expect(() => assertDefined('value')).not.toThrow();
      expect(() => assertDefined(0)).not.toThrow();
      expect(() => assertDefined(false)).not.toThrow();
    });

    it('should throw for null or undefined', () => {
      expect(() => assertDefined(null)).toThrow();
      expect(() => assertDefined(undefined)).toThrow();
    });

    it('should use custom message', () => {
      expect(() => assertDefined(null, 'Custom null error')).toThrow('Custom null error');
    });
  });
});

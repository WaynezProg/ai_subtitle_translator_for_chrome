/**
 * Tests for helper utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatTime,
  formatDuration,
  parseTimestamp,
  truncate,
  escapeHtml,
  stripHtml,
  normalizeWhitespace,
  generateId,
  getLanguageDisplayName,
  normalizeLanguageCode,
  sleep,
  retry,
  debounce,
  throttle,
  extractVideoId,
  generateCacheKey,
  parseCacheKey,
  isNonEmptyString,
  isValidUrl,
  isValidLanguageCode,
} from '@shared/utils/helpers';

// ============================================================================
// Time Formatting Tests
// ============================================================================

describe('formatTime', () => {
  it('should format seconds only', () => {
    expect(formatTime(30)).toBe('0:30');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(0)).toBe('0:00');
  });

  it('should format minutes and seconds', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(130)).toBe('2:10');
    expect(formatTime(599)).toBe('9:59');
  });

  it('should format hours, minutes, and seconds', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(3665)).toBe('1:01:05');
    expect(formatTime(7325)).toBe('2:02:05');
  });

  it('should handle large values', () => {
    expect(formatTime(36000)).toBe('10:00:00');
    expect(formatTime(86400)).toBe('24:00:00');
  });
});

describe('formatDuration', () => {
  it('should format milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
    expect(formatDuration(0)).toBe('0ms');
  });

  it('should format seconds', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(30000)).toBe('30s');
    expect(formatDuration(59000)).toBe('59s');
  });

  it('should format minutes and seconds', () => {
    expect(formatDuration(60000)).toBe('1m');
    expect(formatDuration(90000)).toBe('1m 30s');
    expect(formatDuration(3540000)).toBe('59m');
  });

  it('should format hours and minutes', () => {
    expect(formatDuration(3600000)).toBe('1h');
    expect(formatDuration(5400000)).toBe('1h 30m');
    expect(formatDuration(7200000)).toBe('2h');
  });
});

describe('parseTimestamp', () => {
  it('should parse HH:MM:SS.mmm format', () => {
    expect(parseTimestamp('01:02:03.500')).toBe(3723.5);
    expect(parseTimestamp('00:00:00.000')).toBe(0);
    expect(parseTimestamp('10:30:45.250')).toBe(37845.25);
  });

  it('should parse MM:SS.mmm format', () => {
    expect(parseTimestamp('02:30.500')).toBe(150.5);
    expect(parseTimestamp('00:05.000')).toBe(5);
    expect(parseTimestamp('59:59.999')).toBeCloseTo(3599.999);
  });

  it('should parse SS.mmm format', () => {
    expect(parseTimestamp('30.500')).toBe(30.5);
    expect(parseTimestamp('5.0')).toBe(5);
  });

  it('should handle empty string', () => {
    // Empty string results in NaN when split and parsed
    expect(parseTimestamp('')).toBeNaN();
  });
});

// ============================================================================
// String Utilities Tests
// ============================================================================

describe('truncate', () => {
  it('should return string unchanged if shorter than maxLength', () => {
    expect(truncate('hello', 10)).toBe('hello');
    expect(truncate('', 5)).toBe('');
  });

  it('should truncate with ellipsis if longer than maxLength', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
    expect(truncate('abcdefghij', 6)).toBe('abc...');
  });

  it('should handle edge cases', () => {
    expect(truncate('hello', 5)).toBe('hello');
    expect(truncate('hello', 4)).toBe('h...');
  });
});

describe('escapeHtml', () => {
  it('should escape HTML special characters', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
    expect(escapeHtml("'test'")).toBe('&#39;test&#39;');
  });

  it('should leave normal text unchanged', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
    expect(escapeHtml('')).toBe('');
  });

  it('should escape multiple special characters', () => {
    expect(escapeHtml('<a href="test">')).toBe('&lt;a href=&quot;test&quot;&gt;');
  });
});

describe('stripHtml', () => {
  it('should strip HTML tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello');
    expect(stripHtml('<div><span>Test</span></div>')).toBe('Test');
  });

  it('should preserve text content', () => {
    expect(stripHtml('plain text')).toBe('plain text');
    expect(stripHtml('<b>bold</b> and <i>italic</i>')).toBe('bold and italic');
  });

  it('should handle empty strings', () => {
    expect(stripHtml('')).toBe('');
    expect(stripHtml('<div></div>')).toBe('');
  });
});

describe('normalizeWhitespace', () => {
  it('should collapse multiple spaces', () => {
    expect(normalizeWhitespace('hello    world')).toBe('hello world');
  });

  it('should trim leading and trailing whitespace', () => {
    expect(normalizeWhitespace('  hello  ')).toBe('hello');
  });

  it('should handle newlines and tabs', () => {
    expect(normalizeWhitespace('hello\n\nworld')).toBe('hello world');
    expect(normalizeWhitespace('hello\t\tworld')).toBe('hello world');
  });

  it('should handle empty strings', () => {
    expect(normalizeWhitespace('')).toBe('');
    expect(normalizeWhitespace('   ')).toBe('');
  });
});

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('should generate IDs with timestamp prefix', () => {
    const id = generateId();
    expect(id).toMatch(/^\d+-[a-z0-9]+$/);
  });
});

// ============================================================================
// Language Utilities Tests
// ============================================================================

describe('getLanguageDisplayName', () => {
  it('should return Traditional Chinese for zh-TW', () => {
    expect(getLanguageDisplayName('zh-TW')).toBe('Traditional Chinese (繁體中文)');
  });

  it('should return Simplified Chinese for zh-CN', () => {
    expect(getLanguageDisplayName('zh-CN')).toBe('Simplified Chinese (简体中文)');
  });

  it('should return display name for common language codes', () => {
    expect(getLanguageDisplayName('en')).toBe('English');
    expect(getLanguageDisplayName('ja')).toBe('Japanese');
    expect(getLanguageDisplayName('ko')).toBe('Korean');
  });

  it('should return code for unknown languages', () => {
    expect(getLanguageDisplayName('xyz')).toBe('xyz');
  });
});

describe('normalizeLanguageCode', () => {
  it('should normalize Chinese variants', () => {
    expect(normalizeLanguageCode('zh')).toBe('zh-CN');
    expect(normalizeLanguageCode('zh-hans')).toBe('zh-CN');
    expect(normalizeLanguageCode('zh-hant')).toBe('zh-TW');
    expect(normalizeLanguageCode('zh-tw')).toBe('zh-TW');
    expect(normalizeLanguageCode('zh-cn')).toBe('zh-CN');
  });

  it('should normalize English variants', () => {
    expect(normalizeLanguageCode('en-us')).toBe('en');
    expect(normalizeLanguageCode('en-gb')).toBe('en-GB');
  });

  it('should handle underscores', () => {
    expect(normalizeLanguageCode('zh_TW')).toBe('zh-TW');
  });

  it('should return original code for unknown mappings', () => {
    expect(normalizeLanguageCode('fr')).toBe('fr');
    expect(normalizeLanguageCode('de')).toBe('de');
  });
});

// ============================================================================
// Async Utilities Tests
// ============================================================================

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve after specified time', async () => {
    const promise = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
  });
});

describe('retry', () => {
  it('should return result on first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await retry(fn, { maxAttempts: 3 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const result = await retry(fn, { maxAttempts: 3, baseDelay: 1 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(retry(fn, { maxAttempts: 2, baseDelay: 1 }))
      .rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should stop retrying if shouldRetry returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('not retryable'));

    await expect(retry(fn, {
      maxAttempts: 3,
      baseDelay: 1,
      shouldRetry: () => false,
    })).rejects.toThrow('not retryable');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should only call function once for rapid calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to the function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('arg1', 'arg2');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });
});

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call function immediately', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should ignore calls within throttle period', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should allow calls after throttle period', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    vi.advanceTimersByTime(100);
    throttled();

    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// URL Utilities Tests
// ============================================================================

describe('extractVideoId', () => {
  it('should extract YouTube video ID from standard URL', () => {
    const result = extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(result).toEqual({ platform: 'youtube', videoId: 'dQw4w9WgXcQ' });
  });

  it('should extract YouTube video ID from embed URL', () => {
    const result = extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(result).toEqual({ platform: 'youtube', videoId: 'dQw4w9WgXcQ' });
  });

  it('should extract YouTube video ID from short URL', () => {
    const result = extractVideoId('https://youtu.be/dQw4w9WgXcQ');
    expect(result).toEqual({ platform: 'youtube', videoId: 'dQw4w9WgXcQ' });
  });

  it('should extract Netflix video ID', () => {
    const result = extractVideoId('https://www.netflix.com/watch/12345678');
    expect(result).toEqual({ platform: 'netflix', videoId: '12345678' });
  });

  it('should extract Disney+ video ID', () => {
    const result = extractVideoId('https://www.disneyplus.com/video/abc123');
    expect(result).toEqual({ platform: 'disney', videoId: 'abc123' });
  });

  it('should extract Prime Video ID', () => {
    const result = extractVideoId('https://www.primevideo.com/detail/ABCD1234');
    expect(result).toEqual({ platform: 'prime', videoId: 'ABCD1234' });
  });

  it('should return null for unsupported URLs', () => {
    const result = extractVideoId('https://example.com/video/123');
    expect(result).toBeNull();
  });
});

// ============================================================================
// Cache Key Utilities Tests
// ============================================================================

describe('generateCacheKey', () => {
  it('should generate cache key without provider model', () => {
    const key = generateCacheKey('video123', 'en', 'zh-TW');
    expect(key).toBe('video123:en:zh-TW');
  });

  it('should generate cache key with provider model', () => {
    const key = generateCacheKey('video123', 'en', 'zh-TW', 'gpt-4');
    expect(key).toBe('video123:en:zh-TW:gpt-4');
  });
});

describe('parseCacheKey', () => {
  it('should parse cache key without provider model', () => {
    const result = parseCacheKey('video123:en:zh-TW');
    expect(result).toEqual({
      videoId: 'video123',
      sourceLanguage: 'en',
      targetLanguage: 'zh-TW',
      providerModel: undefined,
    });
  });

  it('should parse cache key with provider model', () => {
    const result = parseCacheKey('video123:en:zh-TW:gpt-4');
    expect(result).toEqual({
      videoId: 'video123',
      sourceLanguage: 'en',
      targetLanguage: 'zh-TW',
      providerModel: 'gpt-4',
    });
  });

  it('should return null for invalid key', () => {
    expect(parseCacheKey('invalid')).toBeNull();
    expect(parseCacheKey('only:two')).toBeNull();
  });
});

// ============================================================================
// Validation Utilities Tests
// ============================================================================

describe('isNonEmptyString', () => {
  it('should return true for non-empty strings', () => {
    expect(isNonEmptyString('hello')).toBe(true);
    expect(isNonEmptyString('  text  ')).toBe(true);
  });

  it('should return false for empty strings', () => {
    expect(isNonEmptyString('')).toBe(false);
    expect(isNonEmptyString('   ')).toBe(false);
  });

  it('should return false for non-strings', () => {
    expect(isNonEmptyString(null)).toBe(false);
    expect(isNonEmptyString(undefined)).toBe(false);
    expect(isNonEmptyString(123)).toBe(false);
    expect(isNonEmptyString({})).toBe(false);
  });
});

describe('isValidUrl', () => {
  it('should return true for valid URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('http://localhost:3000')).toBe(true);
    expect(isValidUrl('https://sub.domain.com/path?query=1')).toBe(true);
  });

  it('should return false for invalid URLs', () => {
    expect(isValidUrl('not a url')).toBe(false);
    expect(isValidUrl('example.com')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });
});

describe('isValidLanguageCode', () => {
  it('should return true for valid language codes', () => {
    expect(isValidLanguageCode('en')).toBe(true);
    expect(isValidLanguageCode('zh-TW')).toBe(true);
    expect(isValidLanguageCode('pt-BR')).toBe(true);
    expect(isValidLanguageCode('eng')).toBe(true);
  });

  it('should return false for invalid language codes', () => {
    expect(isValidLanguageCode('')).toBe(false);
    expect(isValidLanguageCode('e')).toBe(false);
    expect(isValidLanguageCode('english')).toBe(false);
    expect(isValidLanguageCode('12')).toBe(false);
  });
});

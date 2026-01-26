/**
 * Tests for String Manipulation Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  toCamelCase,
  toPascalCase,
  toSnakeCase,
  toKebabCase,
  toConstantCase,
  toTitleCase,
  toSentenceCase,
  capitalize,
  uncapitalize,
  interpolate,
  format,
  pad,
  padZero,
  repeat,
  reverse,
  truncate,
  truncateWords,
  truncateLines,
  pluralize,
  pluralizeCustom,
  equalsIgnoreCase,
  containsIgnoreCase,
  startsWithIgnoreCase,
  endsWithIgnoreCase,
  naturalCompare,
  removeWhitespace,
  normalizeWhitespace,
  removeNonPrintable,
  removeAccents,
  stripHtml,
  escapeHtml,
  unescapeHtml,
  escapeRegex,
  extractNumbers,
  extractFirstNumber,
  extractWords,
  extractUniqueChars,
  countWords,
  countOccurrences,
  splitBy,
  chunk,
  splitLines,
  splitPreservingQuotes,
  toBase64,
  fromBase64,
  hashCode,
  stringToId,
  formatSrtTime,
  formatVttTime,
  parseSrtTime,
  formatDuration,
  cleanSubtitleText,
  containsCJK,
  isRTL,
} from '@shared/utils/string-utils';

// ============================================================================
// Case Conversion Tests
// ============================================================================

describe('Case Conversion', () => {
  describe('toCamelCase', () => {
    it('should convert various formats to camelCase', () => {
      expect(toCamelCase('hello world')).toBe('helloWorld');
      expect(toCamelCase('hello-world')).toBe('helloWorld');
      expect(toCamelCase('hello_world')).toBe('helloWorld');
      expect(toCamelCase('HelloWorld')).toBe('helloWorld');
    });
  });

  describe('toPascalCase', () => {
    it('should convert to PascalCase', () => {
      expect(toPascalCase('hello world')).toBe('HelloWorld');
      expect(toPascalCase('hello-world')).toBe('HelloWorld');
    });
  });

  describe('toSnakeCase', () => {
    it('should convert to snake_case', () => {
      expect(toSnakeCase('helloWorld')).toBe('hello_world');
      expect(toSnakeCase('HelloWorld')).toBe('hello_world');
      expect(toSnakeCase('hello-world')).toBe('hello_world');
    });
  });

  describe('toKebabCase', () => {
    it('should convert to kebab-case', () => {
      expect(toKebabCase('helloWorld')).toBe('hello-world');
      expect(toKebabCase('HelloWorld')).toBe('hello-world');
      expect(toKebabCase('hello_world')).toBe('hello-world');
    });
  });

  describe('toConstantCase', () => {
    it('should convert to CONSTANT_CASE', () => {
      expect(toConstantCase('helloWorld')).toBe('HELLO_WORLD');
      expect(toConstantCase('hello-world')).toBe('HELLO_WORLD');
    });
  });

  describe('toTitleCase', () => {
    it('should convert to Title Case', () => {
      expect(toTitleCase('hello world')).toBe('Hello World');
      expect(toTitleCase('HELLO WORLD')).toBe('Hello World');
    });
  });

  describe('toSentenceCase', () => {
    it('should convert to Sentence case', () => {
      expect(toSentenceCase('hello world')).toBe('Hello world');
      expect(toSentenceCase('HELLO WORLD')).toBe('Hello world');
    });
  });

  describe('capitalize', () => {
    it('should capitalize first letter', () => {
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize('HELLO')).toBe('HELLO');
    });
  });

  describe('uncapitalize', () => {
    it('should lowercase first letter', () => {
      expect(uncapitalize('Hello')).toBe('hello');
      expect(uncapitalize('hello')).toBe('hello');
    });
  });
});

// ============================================================================
// String Formatting Tests
// ============================================================================

describe('String Formatting', () => {
  describe('interpolate', () => {
    it('should interpolate named variables', () => {
      expect(interpolate('Hello {name}!', { name: 'World' })).toBe('Hello World!');
      expect(interpolate('{a} + {b} = {c}', { a: 1, b: 2, c: 3 })).toBe('1 + 2 = 3');
    });

    it('should handle missing variables', () => {
      expect(interpolate('Hello {name}!', {})).toBe('Hello !');
    });

    it('should handle null/undefined', () => {
      expect(interpolate('{a}{b}', { a: null, b: undefined })).toBe('');
    });
  });

  describe('format', () => {
    it('should format with positional arguments', () => {
      expect(format('{0} + {1} = {2}', 1, 2, 3)).toBe('1 + 2 = 3');
      expect(format('Hello {0}!', 'World')).toBe('Hello World!');
    });
  });

  describe('pad', () => {
    it('should pad to the right by default', () => {
      expect(pad('hi', 5)).toBe('hi   ');
    });

    it('should pad to the left', () => {
      expect(pad('hi', 5, ' ', 'left')).toBe('   hi');
    });

    it('should pad both sides', () => {
      expect(pad('hi', 6, '-', 'both')).toBe('--hi--');
    });
  });

  describe('padZero', () => {
    it('should pad with zeros', () => {
      expect(padZero(5, 3)).toBe('005');
      expect(padZero(123, 3)).toBe('123');
    });
  });

  describe('repeat', () => {
    it('should repeat string', () => {
      expect(repeat('ab', 3)).toBe('ababab');
      expect(repeat('x', 0)).toBe('');
    });
  });

  describe('reverse', () => {
    it('should reverse string', () => {
      expect(reverse('hello')).toBe('olleh');
      expect(reverse('abc')).toBe('cba');
    });
  });
});

// ============================================================================
// Text Truncation Tests
// ============================================================================

describe('Text Truncation', () => {
  describe('truncate', () => {
    it('should truncate at end with ellipsis', () => {
      expect(truncate('Hello World', 8)).toBe('Hello...');
    });

    it('should not truncate short strings', () => {
      expect(truncate('Hi', 10)).toBe('Hi');
    });

    it('should truncate at start', () => {
      expect(truncate('Hello World', 8, { position: 'start' })).toBe('...World');
    });

    it('should truncate in middle', () => {
      expect(truncate('Hello World', 10, { position: 'middle' })).toBe('Hel...rld');
    });

    it('should use custom ellipsis', () => {
      expect(truncate('Hello World', 9, { ellipsis: '..' })).toBe('Hello W..');
    });

    it('should respect word boundary', () => {
      const result = truncate('Hello World Today', 14, { wordBoundary: true });
      expect(result).toBe('Hello World...');
    });
  });

  describe('truncateWords', () => {
    it('should truncate by word count', () => {
      expect(truncateWords('one two three four', 2)).toBe('one two...');
    });

    it('should not truncate if within limit', () => {
      expect(truncateWords('one two', 5)).toBe('one two');
    });
  });

  describe('truncateLines', () => {
    it('should truncate by line count', () => {
      expect(truncateLines('a\nb\nc\nd', 2)).toBe('a\nb...');
    });
  });
});

// ============================================================================
// Pluralization Tests
// ============================================================================

describe('Pluralization', () => {
  describe('pluralize', () => {
    it('should pluralize with count', () => {
      expect(pluralize(1, 'item')).toBe('1 item');
      expect(pluralize(5, 'item')).toBe('5 items');
    });

    it('should use custom plural form', () => {
      expect(pluralize(2, 'person', 'people')).toBe('2 people');
    });

    it('should optionally exclude count', () => {
      expect(pluralize(5, 'item', 'items', false)).toBe('items');
    });
  });

  describe('pluralizeCustom', () => {
    it('should handle custom forms', () => {
      const forms = { zero: 'no items', one: 'item', other: 'items' };
      expect(pluralizeCustom(0, forms)).toBe('0 no items');
      expect(pluralizeCustom(1, forms)).toBe('1 item');
      expect(pluralizeCustom(5, forms)).toBe('5 items');
    });
  });
});

// ============================================================================
// String Comparison Tests
// ============================================================================

describe('String Comparison', () => {
  describe('equalsIgnoreCase', () => {
    it('should compare case-insensitively', () => {
      expect(equalsIgnoreCase('Hello', 'hello')).toBe(true);
      expect(equalsIgnoreCase('Hello', 'world')).toBe(false);
    });
  });

  describe('containsIgnoreCase', () => {
    it('should check contains case-insensitively', () => {
      expect(containsIgnoreCase('Hello World', 'WORLD')).toBe(true);
      expect(containsIgnoreCase('Hello World', 'foo')).toBe(false);
    });
  });

  describe('startsWithIgnoreCase', () => {
    it('should check startsWith case-insensitively', () => {
      expect(startsWithIgnoreCase('Hello World', 'HELLO')).toBe(true);
      expect(startsWithIgnoreCase('Hello World', 'World')).toBe(false);
    });
  });

  describe('endsWithIgnoreCase', () => {
    it('should check endsWith case-insensitively', () => {
      expect(endsWithIgnoreCase('Hello World', 'WORLD')).toBe(true);
      expect(endsWithIgnoreCase('Hello World', 'Hello')).toBe(false);
    });
  });

  describe('naturalCompare', () => {
    it('should sort naturally', () => {
      const arr = ['item10', 'item2', 'item1'];
      arr.sort(naturalCompare);
      expect(arr).toEqual(['item1', 'item2', 'item10']);
    });
  });
});

// ============================================================================
// String Cleaning Tests
// ============================================================================

describe('String Cleaning', () => {
  describe('removeWhitespace', () => {
    it('should remove all whitespace', () => {
      expect(removeWhitespace('hello world')).toBe('helloworld');
      expect(removeWhitespace('  a  b  ')).toBe('ab');
    });
  });

  describe('normalizeWhitespace', () => {
    it('should normalize whitespace', () => {
      expect(normalizeWhitespace('  hello   world  ')).toBe('hello world');
    });
  });

  describe('removeNonPrintable', () => {
    it('should remove control characters', () => {
      expect(removeNonPrintable('hello\x00world')).toBe('helloworld');
    });
  });

  describe('removeAccents', () => {
    it('should remove accents', () => {
      expect(removeAccents('café')).toBe('cafe');
      expect(removeAccents('naïve')).toBe('naive');
    });
  });

  describe('stripHtml', () => {
    it('should remove HTML tags', () => {
      expect(stripHtml('<b>Hello</b> <i>World</i>')).toBe('Hello World');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML entities', () => {
      expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
      expect(escapeHtml('"test"')).toBe('&quot;test&quot;');
    });
  });

  describe('unescapeHtml', () => {
    it('should unescape HTML entities', () => {
      expect(unescapeHtml('&lt;script&gt;')).toBe('<script>');
      expect(unescapeHtml('&quot;test&quot;')).toBe('"test"');
    });
  });

  describe('escapeRegex', () => {
    it('should escape regex special characters', () => {
      expect(escapeRegex('hello.world')).toBe('hello\\.world');
      expect(escapeRegex('[a-z]+')).toBe('\\[a-z\\]\\+');
    });
  });
});

// ============================================================================
// String Extraction Tests
// ============================================================================

describe('String Extraction', () => {
  describe('extractNumbers', () => {
    it('should extract all numbers', () => {
      expect(extractNumbers('I have 3 apples and 5 oranges')).toEqual([3, 5]);
      expect(extractNumbers('Price: $19.99')).toEqual([19.99]);
    });

    it('should handle negative numbers', () => {
      expect(extractNumbers('Temperature: -5 to 10')).toEqual([-5, 10]);
    });
  });

  describe('extractFirstNumber', () => {
    it('should extract first number', () => {
      expect(extractFirstNumber('Page 42 of 100')).toBe(42);
    });

    it('should return null if no number', () => {
      expect(extractFirstNumber('no numbers')).toBeNull();
    });
  });

  describe('extractWords', () => {
    it('should extract words', () => {
      expect(extractWords('Hello, World!')).toEqual(['Hello', 'World']);
    });
  });

  describe('extractUniqueChars', () => {
    it('should extract unique characters', () => {
      expect(extractUniqueChars('hello')).toBe('helo');
    });
  });

  describe('countWords', () => {
    it('should count words', () => {
      expect(countWords('hello world')).toBe(2);
      expect(countWords('  one  two  three  ')).toBe(3);
    });
  });

  describe('countOccurrences', () => {
    it('should count occurrences', () => {
      expect(countOccurrences('abcabc', 'ab')).toBe(2);
      expect(countOccurrences('abcABC', 'ab', false)).toBe(2);
    });

    it('should handle empty search', () => {
      expect(countOccurrences('abc', '')).toBe(0);
    });
  });
});

// ============================================================================
// String Splitting Tests
// ============================================================================

describe('String Splitting', () => {
  describe('splitBy', () => {
    it('should split by multiple delimiters', () => {
      expect(splitBy('a,b;c|d', [',', ';', '|'])).toEqual(['a', 'b', 'c', 'd']);
    });
  });

  describe('chunk', () => {
    it('should split into chunks', () => {
      expect(chunk('abcdefgh', 3)).toEqual(['abc', 'def', 'gh']);
    });

    it('should handle invalid size', () => {
      expect(chunk('abc', 0)).toEqual(['abc']);
    });
  });

  describe('splitLines', () => {
    it('should split into lines', () => {
      expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
      expect(splitLines('a\r\nb')).toEqual(['a', 'b']);
    });
  });

  describe('splitPreservingQuotes', () => {
    it('should preserve quoted segments', () => {
      expect(splitPreservingQuotes('hello "world foo" bar')).toEqual(['hello', 'world foo', 'bar']);
    });

    it('should handle single quotes', () => {
      expect(splitPreservingQuotes("hello 'world foo' bar")).toEqual(['hello', 'world foo', 'bar']);
    });
  });
});

// ============================================================================
// Encoding Tests
// ============================================================================

describe('Encoding', () => {
  describe('toBase64 and fromBase64', () => {
    it('should encode and decode', () => {
      expect(toBase64('hello')).toBe('aGVsbG8=');
      expect(fromBase64('aGVsbG8=')).toBe('hello');
    });

    it('should handle unicode', () => {
      const original = '你好世界';
      const encoded = toBase64(original);
      expect(fromBase64(encoded)).toBe(original);
    });
  });

  describe('hashCode', () => {
    it('should generate consistent hash', () => {
      expect(hashCode('hello')).toBe(hashCode('hello'));
      expect(hashCode('hello')).not.toBe(hashCode('world'));
    });
  });

  describe('stringToId', () => {
    it('should generate valid ID', () => {
      expect(stringToId('Hello World!')).toBe('hello-world');
      expect(stringToId('Test_123')).toBe('test-123');
    });
  });
});

// ============================================================================
// Subtitle-Specific Tests
// ============================================================================

describe('Subtitle Utilities', () => {
  describe('formatSrtTime', () => {
    it('should format SRT timestamp', () => {
      expect(formatSrtTime(0)).toBe('00:00:00,000');
      expect(formatSrtTime(3661500)).toBe('01:01:01,500');
    });
  });

  describe('formatVttTime', () => {
    it('should format VTT timestamp', () => {
      expect(formatVttTime(0)).toBe('00:00:00.000');
      expect(formatVttTime(3661500)).toBe('01:01:01.500');
    });
  });

  describe('parseSrtTime', () => {
    it('should parse SRT timestamp', () => {
      expect(parseSrtTime('00:00:00,000')).toBe(0);
      expect(parseSrtTime('01:01:01,500')).toBe(3661500);
    });

    it('should handle VTT format too', () => {
      expect(parseSrtTime('00:00:05.250')).toBe(5250);
    });
  });

  describe('formatDuration', () => {
    it('should format various durations', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(5000)).toBe('5.0s');
      expect(formatDuration(65000)).toBe('1m 5s');
      expect(formatDuration(3665000)).toBe('1h 1m');
    });
  });

  describe('cleanSubtitleText', () => {
    it('should clean subtitle text', () => {
      expect(cleanSubtitleText('<b>Hello</b> [music] world')).toBe('Hello world');
      expect(cleanSubtitleText('{\\an8}Test (laughing)')).toBe('Test');
    });
  });

  describe('containsCJK', () => {
    it('should detect CJK characters', () => {
      expect(containsCJK('Hello 世界')).toBe(true);
      expect(containsCJK('こんにちは')).toBe(true);
      expect(containsCJK('Hello World')).toBe(false);
    });
  });

  describe('isRTL', () => {
    it('should detect RTL text', () => {
      expect(isRTL('שלום עולם')).toBe(true);
      expect(isRTL('مرحبا بالعالم')).toBe(true);
      expect(isRTL('Hello World')).toBe(false);
    });
  });
});

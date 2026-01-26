/**
 * String Manipulation Utilities
 *
 * Provides comprehensive string manipulation functions:
 * - Case conversion (camelCase, snake_case, etc.)
 * - String formatting and templates
 * - Text truncation and ellipsis
 * - Pluralization
 * - String comparison and matching
 * - Encoding/decoding utilities
 */

// ============================================================================
// Case Conversion
// ============================================================================

/**
 * Convert string to camelCase
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^[A-Z]/, (c) => c.toLowerCase());
}

/**
 * Convert string to PascalCase
 */
export function toPascalCase(str: string): string {
  const camel = toCamelCase(str);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * Convert string to snake_case
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '_$1')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
    .replace(/^_/, '');
}

/**
 * Convert string to kebab-case
 */
export function toKebabCase(str: string): string {
  return str
    .replace(/([A-Z])/g, '-$1')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
    .replace(/^-/, '');
}

/**
 * Convert string to CONSTANT_CASE
 */
export function toConstantCase(str: string): string {
  return toSnakeCase(str).toUpperCase();
}

/**
 * Convert string to Title Case
 */
export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(?:^|\s|-|_)\w/g, (c) => c.toUpperCase())
    .replace(/[-_]/g, ' ');
}

/**
 * Convert string to Sentence case
 */
export function toSentenceCase(str: string): string {
  const lower = str.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Capitalize first letter
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Lowercase first letter
 */
export function uncapitalize(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

// ============================================================================
// String Formatting
// ============================================================================

/**
 * Template string interpolation with named variables
 */
export function interpolate(
  template: string,
  variables: Record<string, string | number | boolean | null | undefined>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const value = variables[key];
    return value !== null && value !== undefined ? String(value) : '';
  });
}

/**
 * Format string with positional arguments
 */
export function format(template: string, ...args: (string | number | boolean)[]): string {
  return template.replace(/\{(\d+)\}/g, (_, index) => {
    const idx = parseInt(index, 10);
    return idx < args.length ? String(args[idx]) : '';
  });
}

/**
 * Pad string to specified length
 */
export function pad(
  str: string,
  length: number,
  char = ' ',
  position: 'left' | 'right' | 'both' = 'right'
): string {
  if (str.length >= length) return str;

  const padding = char.repeat(length - str.length);

  switch (position) {
    case 'left':
      return padding + str;
    case 'right':
      return str + padding;
    case 'both': {
      const leftPad = char.repeat(Math.floor((length - str.length) / 2));
      const rightPad = char.repeat(Math.ceil((length - str.length) / 2));
      return leftPad + str + rightPad;
    }
  }
}

/**
 * Pad number with leading zeros
 */
export function padZero(num: number, length: number): string {
  return String(num).padStart(length, '0');
}

/**
 * Repeat string n times
 */
export function repeat(str: string, count: number): string {
  return str.repeat(Math.max(0, count));
}

/**
 * Reverse a string
 */
export function reverse(str: string): string {
  return [...str].reverse().join('');
}

// ============================================================================
// Text Truncation
// ============================================================================

/**
 * Truncate string with ellipsis
 */
export function truncate(
  str: string,
  maxLength: number,
  options?: {
    ellipsis?: string;
    position?: 'end' | 'middle' | 'start';
    wordBoundary?: boolean;
  }
): string {
  const { ellipsis = '...', position = 'end', wordBoundary = false } = options || {};

  if (str.length <= maxLength) return str;

  const availableLength = maxLength - ellipsis.length;
  if (availableLength <= 0) return ellipsis.slice(0, maxLength);

  switch (position) {
    case 'start':
      return ellipsis + str.slice(str.length - availableLength);

    case 'middle': {
      const halfLength = Math.floor(availableLength / 2);
      return str.slice(0, halfLength) + ellipsis + str.slice(str.length - halfLength);
    }

    case 'end':
    default: {
      let truncated = str.slice(0, availableLength);

      if (wordBoundary) {
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > availableLength * 0.5) {
          truncated = truncated.slice(0, lastSpace);
        }
      }

      return truncated + ellipsis;
    }
  }
}

/**
 * Truncate to word count
 */
export function truncateWords(str: string, maxWords: number, ellipsis = '...'): string {
  const words = str.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return str;

  return words.slice(0, maxWords).join(' ') + ellipsis;
}

/**
 * Truncate to line count
 */
export function truncateLines(str: string, maxLines: number, ellipsis = '...'): string {
  const lines = str.split('\n');
  if (lines.length <= maxLines) return str;

  return lines.slice(0, maxLines).join('\n') + ellipsis;
}

// ============================================================================
// Pluralization
// ============================================================================

/**
 * Simple pluralization
 */
export function pluralize(
  count: number,
  singular: string,
  plural?: string,
  includeCount = true
): string {
  const word = count === 1 ? singular : (plural || singular + 's');
  return includeCount ? `${count} ${word}` : word;
}

/**
 * Pluralize with custom forms
 */
export function pluralizeCustom(
  count: number,
  forms: { zero?: string; one: string; few?: string; many?: string; other: string },
  includeCount = true
): string {
  let word: string;

  if (count === 0 && forms.zero) {
    word = forms.zero;
  } else if (count === 1) {
    word = forms.one;
  } else if (count >= 2 && count <= 4 && forms.few) {
    word = forms.few;
  } else if (count >= 5 && forms.many) {
    word = forms.many;
  } else {
    word = forms.other;
  }

  return includeCount ? `${count} ${word}` : word;
}

// ============================================================================
// String Comparison
// ============================================================================

/**
 * Check if strings are equal (case insensitive)
 */
export function equalsIgnoreCase(str1: string, str2: string): boolean {
  return str1.toLowerCase() === str2.toLowerCase();
}

/**
 * Check if string contains substring (case insensitive)
 */
export function containsIgnoreCase(str: string, search: string): boolean {
  return str.toLowerCase().includes(search.toLowerCase());
}

/**
 * Check if string starts with prefix (case insensitive)
 */
export function startsWithIgnoreCase(str: string, prefix: string): boolean {
  return str.toLowerCase().startsWith(prefix.toLowerCase());
}

/**
 * Check if string ends with suffix (case insensitive)
 */
export function endsWithIgnoreCase(str: string, suffix: string): boolean {
  return str.toLowerCase().endsWith(suffix.toLowerCase());
}

/**
 * Natural sort comparison function
 */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// ============================================================================
// String Cleaning
// ============================================================================

/**
 * Remove all whitespace
 */
export function removeWhitespace(str: string): string {
  return str.replace(/\s+/g, '');
}

/**
 * Normalize whitespace (collapse multiple spaces)
 */
export function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Remove non-printable characters
 */
export function removeNonPrintable(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/[\x00-\x1F\x7F]/g, '');
}

/**
 * Remove accents/diacritics from string
 */
export function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Strip HTML tags from string
 */
export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Escape HTML entities
 */
export function escapeHtml(str: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (char) => entities[char]);
}

/**
 * Unescape HTML entities
 */
export function unescapeHtml(str: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
  };
  return str.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => entities[entity] || entity);
}

/**
 * Escape regex special characters
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ============================================================================
// String Extraction
// ============================================================================

/**
 * Extract all numbers from string
 */
export function extractNumbers(str: string): number[] {
  const matches = str.match(/-?\d+\.?\d*/g);
  return matches ? matches.map(Number) : [];
}

/**
 * Extract first number from string
 */
export function extractFirstNumber(str: string): number | null {
  const match = str.match(/-?\d+\.?\d*/);
  return match ? Number(match[0]) : null;
}

/**
 * Extract words from string
 */
export function extractWords(str: string): string[] {
  return str.match(/\b[\w]+\b/g) || [];
}

/**
 * Extract unique characters
 */
export function extractUniqueChars(str: string): string {
  return [...new Set(str)].join('');
}

/**
 * Count word occurrences
 */
export function countWords(str: string): number {
  const words = str.trim().split(/\s+/).filter(Boolean);
  return words.length;
}

/**
 * Count character occurrences
 */
export function countOccurrences(str: string, search: string, caseSensitive = true): number {
  if (!search) return 0;

  const source = caseSensitive ? str : str.toLowerCase();
  const target = caseSensitive ? search : search.toLowerCase();

  let count = 0;
  let pos = 0;

  while ((pos = source.indexOf(target, pos)) !== -1) {
    count++;
    pos += target.length;
  }

  return count;
}

// ============================================================================
// String Splitting
// ============================================================================

/**
 * Split string by multiple delimiters
 */
export function splitBy(str: string, delimiters: string | string[]): string[] {
  const delimArray = Array.isArray(delimiters) ? delimiters : [delimiters];
  const escaped = delimArray.map(escapeRegex).join('|');
  return str.split(new RegExp(escaped)).filter(Boolean);
}

/**
 * Split string into chunks of specified size
 */
export function chunk(str: string, size: number): string[] {
  if (size <= 0) return [str];

  const chunks: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size));
  }
  return chunks;
}

/**
 * Split string into lines
 */
export function splitLines(str: string): string[] {
  return str.split(/\r?\n/);
}

/**
 * Split string while preserving quoted segments
 */
export function splitPreservingQuotes(str: string, delimiter = ' '): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (const char of str) {
    if ((char === '"' || char === "'") && !inQuotes) {
      inQuotes = true;
      quoteChar = char;
    } else if (char === quoteChar && inQuotes) {
      inQuotes = false;
      quoteChar = '';
    } else if (char === delimiter && !inQuotes) {
      if (current) {
        result.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    result.push(current);
  }

  return result;
}

// ============================================================================
// Encoding/Decoding
// ============================================================================

/**
 * Encode string to Base64
 */
export function toBase64(str: string): string {
  if (typeof btoa !== 'undefined') {
    return btoa(unescape(encodeURIComponent(str)));
  }
  // Node.js fallback
  return Buffer.from(str, 'utf-8').toString('base64');
}

/**
 * Decode Base64 to string
 */
export function fromBase64(base64: string): string {
  if (typeof atob !== 'undefined') {
    return decodeURIComponent(escape(atob(base64)));
  }
  // Node.js fallback
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Generate a hash code for string (non-cryptographic)
 */
export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return hash;
}

/**
 * Generate a simple unique ID from string
 */
export function stringToId(str: string): string {
  return toKebabCase(str)
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 50);
}

// ============================================================================
// Subtitle-Specific Utilities
// ============================================================================

/**
 * Format subtitle timestamp (milliseconds to SRT format)
 */
export function formatSrtTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${padZero(hours, 2)}:${padZero(minutes, 2)}:${padZero(seconds, 2)},${padZero(milliseconds, 3)}`;
}

/**
 * Format subtitle timestamp (milliseconds to WebVTT format)
 */
export function formatVttTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${padZero(hours, 2)}:${padZero(minutes, 2)}:${padZero(seconds, 2)}.${padZero(milliseconds, 3)}`;
}

/**
 * Parse SRT timestamp to milliseconds
 */
export function parseSrtTime(time: string): number {
  const match = time.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
  if (!match) return 0;

  const [, hours, minutes, seconds, ms] = match;
  return (
    parseInt(hours, 10) * 3600000 +
    parseInt(minutes, 10) * 60000 +
    parseInt(seconds, 10) * 1000 +
    parseInt(ms, 10)
  );
}

/**
 * Format duration for display
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/**
 * Clean subtitle text (remove formatting tags, normalize spaces)
 */
export function cleanSubtitleText(text: string): string {
  return text
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/\{[^}]*\}/g, '') // Remove ASS/SSA tags
    .replace(/\[[^\]]*\]/g, '') // Remove brackets content
    .replace(/\([^)]*\)/g, '') // Remove parentheses content
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Detect if text contains CJK characters
 */
export function containsCJK(text: string): boolean {
  return /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(text);
}

/**
 * Detect if text is primarily RTL (Right-to-Left)
 */
export function isRTL(text: string): boolean {
  // Hebrew, Arabic, Persian, etc.
  const rtlChars = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  const ltrChars = /[A-Za-z\u00C0-\u00FF]/;

  const rtlCount = (text.match(new RegExp(rtlChars.source, 'g')) || []).length;
  const ltrCount = (text.match(new RegExp(ltrChars.source, 'g')) || []).length;

  return rtlCount > ltrCount;
}

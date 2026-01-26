/**
 * Input Validation and Sanitization Utilities
 *
 * Provides type-safe validation functions for user inputs,
 * API responses, and data integrity checks.
 */

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult<T> {
  /** Whether validation passed */
  valid: boolean;
  /** Validated and possibly transformed value */
  value?: T;
  /** Error message if validation failed */
  error?: string;
}

export type Validator<T> = (input: unknown) => ValidationResult<T>;

// ============================================================================
// Basic Type Validators
// ============================================================================

/**
 * Validate that input is a string
 */
export function isString(input: unknown): input is string {
  return typeof input === 'string';
}

/**
 * Validate that input is a non-empty string
 */
export function isNonEmptyString(input: unknown): input is string {
  return typeof input === 'string' && input.trim().length > 0;
}

/**
 * Validate that input is a number
 */
export function isNumber(input: unknown): input is number {
  return typeof input === 'number' && !Number.isNaN(input);
}

/**
 * Validate that input is a positive number
 */
export function isPositiveNumber(input: unknown): input is number {
  return isNumber(input) && input > 0;
}

/**
 * Validate that input is a non-negative number
 */
export function isNonNegativeNumber(input: unknown): input is number {
  return isNumber(input) && input >= 0;
}

/**
 * Validate that input is an integer
 */
export function isInteger(input: unknown): input is number {
  return isNumber(input) && Number.isInteger(input);
}

/**
 * Validate that input is a boolean
 */
export function isBoolean(input: unknown): input is boolean {
  return typeof input === 'boolean';
}

/**
 * Validate that input is an array
 */
export function isArray(input: unknown): input is unknown[] {
  return Array.isArray(input);
}

/**
 * Validate that input is a non-empty array
 */
export function isNonEmptyArray(input: unknown): input is unknown[] {
  return Array.isArray(input) && input.length > 0;
}

/**
 * Validate that input is an object (not null, not array)
 */
export function isObject(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

// ============================================================================
// String Validators
// ============================================================================

/**
 * Validate string length
 */
export function hasLength(
  input: string,
  options: { min?: number; max?: number }
): boolean {
  const len = input.length;
  if (options.min !== undefined && len < options.min) return false;
  if (options.max !== undefined && len > options.max) return false;
  return true;
}

/**
 * Validate string matches a pattern
 */
export function matchesPattern(input: string, pattern: RegExp): boolean {
  return pattern.test(input);
}

/**
 * Validate email format
 */
export function isValidEmail(input: unknown): boolean {
  if (!isString(input)) return false;
  // Simple email regex - not comprehensive but catches most issues
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(input);
}

/**
 * Validate URL format
 */
export function isValidUrl(input: unknown): boolean {
  if (!isString(input)) return false;
  try {
    new URL(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate URL is HTTPS
 */
export function isSecureUrl(input: unknown): boolean {
  if (!isString(input)) return false;
  try {
    const url = new URL(input);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

// ============================================================================
// Language Code Validators
// ============================================================================

const VALID_LANGUAGE_CODES = new Set([
  'en', 'zh-TW', 'zh-CN', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru',
  'ar', 'hi', 'th', 'vi', 'id', 'ms', 'nl', 'pl', 'tr', 'cs', 'sv', 'da',
  'fi', 'no', 'el', 'he', 'hu', 'ro', 'sk', 'uk', 'bg', 'hr', 'sr', 'sl',
  'et', 'lv', 'lt', 'auto',
]);

/**
 * Validate language code
 */
export function isValidLanguageCode(input: unknown): boolean {
  if (!isString(input)) return false;
  return VALID_LANGUAGE_CODES.has(input) || /^[a-z]{2}(-[A-Z]{2})?$/.test(input);
}

// ============================================================================
// API Key Validators
// ============================================================================

/**
 * Validate OpenAI API key format
 */
export function isValidOpenAIKey(input: unknown): boolean {
  if (!isString(input)) return false;
  // OpenAI keys start with 'sk-' and are 51 characters long
  return /^sk-[a-zA-Z0-9]{48}$/.test(input) || /^sk-proj-[a-zA-Z0-9-_]{80,}$/.test(input);
}

/**
 * Validate Anthropic API key format
 */
export function isValidAnthropicKey(input: unknown): boolean {
  if (!isString(input)) return false;
  // Anthropic keys start with 'sk-ant-'
  return /^sk-ant-[a-zA-Z0-9-_]{80,}$/.test(input);
}

// ============================================================================
// Sanitization Functions
// ============================================================================

/**
 * Sanitize string by trimming and removing control characters
 */
export function sanitizeString(input: string): string {
  // Remove control characters except newlines and tabs
  return input.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/**
 * Sanitize HTML by escaping special characters
 */
export function escapeHtml(input: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return input.replace(/[&<>"']/g, (char) => escapeMap[char]);
}

/**
 * Strip HTML tags from string
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

/**
 * Normalize whitespace (collapse multiple spaces/newlines)
 */
export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/**
 * Truncate string to max length with ellipsis
 */
export function truncate(input: string, maxLength: number, ellipsis = '...'): string {
  if (input.length <= maxLength) return input;
  return input.slice(0, maxLength - ellipsis.length) + ellipsis;
}

// ============================================================================
// Subtitle-specific Validators
// ============================================================================

/**
 * Validate subtitle cue timing
 */
export function isValidCueTiming(startTime: unknown, endTime: unknown): boolean {
  if (!isNonNegativeNumber(startTime) || !isNonNegativeNumber(endTime)) {
    return false;
  }
  return endTime > startTime;
}

/**
 * Validate video ID format (YouTube, Netflix, etc.)
 */
export function isValidVideoId(input: unknown, platform?: string): boolean {
  if (!isString(input) || input.trim().length === 0) return false;

  switch (platform) {
    case 'youtube':
      // YouTube video IDs are 11 characters
      return /^[a-zA-Z0-9_-]{11}$/.test(input);
    case 'netflix':
      // Netflix uses numeric IDs
      return /^\d+$/.test(input);
    default:
      // Generic: non-empty string with reasonable characters
      return /^[a-zA-Z0-9_-]+$/.test(input) && input.length <= 100;
  }
}

// ============================================================================
// Composite Validators
// ============================================================================

/**
 * Validate and parse a string to number
 */
export function validateNumber(
  input: unknown,
  options: { min?: number; max?: number; integer?: boolean } = {}
): ValidationResult<number> {
  let value: number;

  if (isNumber(input)) {
    value = input;
  } else if (isString(input)) {
    value = parseFloat(input);
  } else {
    return { valid: false, error: 'Input must be a number or numeric string' };
  }

  if (Number.isNaN(value)) {
    return { valid: false, error: 'Invalid number format' };
  }

  if (options.integer && !Number.isInteger(value)) {
    return { valid: false, error: 'Number must be an integer' };
  }

  if (options.min !== undefined && value < options.min) {
    return { valid: false, error: `Number must be at least ${options.min}` };
  }

  if (options.max !== undefined && value > options.max) {
    return { valid: false, error: `Number must be at most ${options.max}` };
  }

  return { valid: true, value };
}

/**
 * Validate and sanitize a string
 */
export function validateString(
  input: unknown,
  options: { minLength?: number; maxLength?: number; pattern?: RegExp; sanitize?: boolean } = {}
): ValidationResult<string> {
  if (!isString(input)) {
    return { valid: false, error: 'Input must be a string' };
  }

  let value = options.sanitize !== false ? sanitizeString(input) : input;

  if (options.minLength !== undefined && value.length < options.minLength) {
    return { valid: false, error: `String must be at least ${options.minLength} characters` };
  }

  if (options.maxLength !== undefined && value.length > options.maxLength) {
    if (options.sanitize !== false) {
      value = truncate(value, options.maxLength, '');
    } else {
      return { valid: false, error: `String must be at most ${options.maxLength} characters` };
    }
  }

  if (options.pattern && !options.pattern.test(value)) {
    return { valid: false, error: 'String does not match required pattern' };
  }

  return { valid: true, value };
}

/**
 * Validate enum value
 */
export function validateEnum<T extends string>(
  input: unknown,
  allowedValues: readonly T[]
): ValidationResult<T> {
  if (!isString(input)) {
    return { valid: false, error: 'Input must be a string' };
  }

  if (!allowedValues.includes(input as T)) {
    return {
      valid: false,
      error: `Value must be one of: ${allowedValues.join(', ')}`,
    };
  }

  return { valid: true, value: input as T };
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that a value passes validation, throw if not
 */
export function assertValid<T>(
  result: ValidationResult<T>,
  message?: string
): asserts result is ValidationResult<T> & { valid: true; value: T } {
  if (!result.valid) {
    throw new Error(message || result.error || 'Validation failed');
  }
}

/**
 * Assert non-null/undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message = 'Value is null or undefined'
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

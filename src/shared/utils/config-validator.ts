/**
 * Configuration Validator
 *
 * Validates extension settings and configuration values
 * with type safety, custom rules, and helpful error messages.
 */

import { createLogger } from './logger';

const logger = createLogger('ConfigValidator');

// ============================================================================
// Types
// ============================================================================

/**
 * Validation result
 */
export interface ValidationResult<T = unknown> {
  valid: boolean;
  value?: T;
  errors: ValidationError[];
}

/**
 * Validation error
 */
export interface ValidationError {
  path: string;
  message: string;
  code: string;
  expected?: unknown;
  received?: unknown;
}

/**
 * Schema definition for a field
 */
export interface FieldSchema<T = unknown> {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'enum';
  required?: boolean;
  default?: T;
  description?: string;
  // String options
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  // Number options
  min?: number;
  max?: number;
  integer?: boolean;
  // Array options
  items?: FieldSchema;
  minItems?: number;
  maxItems?: number;
  // Enum options
  enum?: readonly T[];
  // Object options
  properties?: Record<string, FieldSchema>;
  // Custom validation
  validate?: (value: T) => string | null;
}

/**
 * Configuration schema
 */
export type ConfigSchema = Record<string, FieldSchema>;

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Validate a value against a field schema
 */
export function validateField<T>(
  value: unknown,
  schema: FieldSchema<T>,
  path: string = ''
): ValidationResult<T> {
  const errors: ValidationError[] = [];

  // Handle undefined/null
  if (value === undefined || value === null) {
    if (schema.required) {
      errors.push({
        path,
        message: `Field is required`,
        code: 'REQUIRED',
      });
      return { valid: false, errors };
    }

    // Return default value if available
    if (schema.default !== undefined) {
      return { valid: true, value: schema.default, errors: [] };
    }

    return { valid: true, value: undefined, errors: [] };
  }

  // Type validation
  switch (schema.type) {
    case 'string':
      if (typeof value !== 'string') {
        errors.push({
          path,
          message: `Expected string, got ${typeof value}`,
          code: 'TYPE_MISMATCH',
          expected: 'string',
          received: typeof value,
        });
      } else {
        validateString(value, schema, path, errors);
      }
      break;

    case 'number':
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push({
          path,
          message: `Expected number, got ${typeof value}`,
          code: 'TYPE_MISMATCH',
          expected: 'number',
          received: typeof value,
        });
      } else {
        validateNumber(value, schema, path, errors);
      }
      break;

    case 'boolean':
      if (typeof value !== 'boolean') {
        errors.push({
          path,
          message: `Expected boolean, got ${typeof value}`,
          code: 'TYPE_MISMATCH',
          expected: 'boolean',
          received: typeof value,
        });
      }
      break;

    case 'array':
      if (!Array.isArray(value)) {
        errors.push({
          path,
          message: `Expected array, got ${typeof value}`,
          code: 'TYPE_MISMATCH',
          expected: 'array',
          received: typeof value,
        });
      } else {
        validateArray(value, schema, path, errors);
      }
      break;

    case 'object':
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors.push({
          path,
          message: `Expected object, got ${Array.isArray(value) ? 'array' : typeof value}`,
          code: 'TYPE_MISMATCH',
          expected: 'object',
          received: Array.isArray(value) ? 'array' : typeof value,
        });
      } else {
        validateObject(value as Record<string, unknown>, schema, path, errors);
      }
      break;

    case 'enum':
      if (!schema.enum?.includes(value as T)) {
        errors.push({
          path,
          message: `Value must be one of: ${schema.enum?.join(', ')}`,
          code: 'INVALID_ENUM',
          expected: schema.enum,
          received: value,
        });
      }
      break;
  }

  // Custom validation
  if (errors.length === 0 && schema.validate) {
    const customError = schema.validate(value as T);
    if (customError) {
      errors.push({
        path,
        message: customError,
        code: 'CUSTOM_VALIDATION',
      });
    }
  }

  return {
    valid: errors.length === 0,
    value: errors.length === 0 ? (value as T) : undefined,
    errors,
  };
}

function validateString(
  value: string,
  schema: FieldSchema,
  path: string,
  errors: ValidationError[]
): void {
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    errors.push({
      path,
      message: `String must be at least ${schema.minLength} characters`,
      code: 'MIN_LENGTH',
      expected: schema.minLength,
      received: value.length,
    });
  }

  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    errors.push({
      path,
      message: `String must be at most ${schema.maxLength} characters`,
      code: 'MAX_LENGTH',
      expected: schema.maxLength,
      received: value.length,
    });
  }

  if (schema.pattern && !schema.pattern.test(value)) {
    errors.push({
      path,
      message: `String does not match required pattern`,
      code: 'PATTERN_MISMATCH',
      expected: schema.pattern.toString(),
      received: value,
    });
  }
}

function validateNumber(
  value: number,
  schema: FieldSchema,
  path: string,
  errors: ValidationError[]
): void {
  if (schema.min !== undefined && value < schema.min) {
    errors.push({
      path,
      message: `Number must be at least ${schema.min}`,
      code: 'MIN_VALUE',
      expected: schema.min,
      received: value,
    });
  }

  if (schema.max !== undefined && value > schema.max) {
    errors.push({
      path,
      message: `Number must be at most ${schema.max}`,
      code: 'MAX_VALUE',
      expected: schema.max,
      received: value,
    });
  }

  if (schema.integer && !Number.isInteger(value)) {
    errors.push({
      path,
      message: `Number must be an integer`,
      code: 'NOT_INTEGER',
      received: value,
    });
  }
}

function validateArray(
  value: unknown[],
  schema: FieldSchema,
  path: string,
  errors: ValidationError[]
): void {
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    errors.push({
      path,
      message: `Array must have at least ${schema.minItems} items`,
      code: 'MIN_ITEMS',
      expected: schema.minItems,
      received: value.length,
    });
  }

  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    errors.push({
      path,
      message: `Array must have at most ${schema.maxItems} items`,
      code: 'MAX_ITEMS',
      expected: schema.maxItems,
      received: value.length,
    });
  }

  if (schema.items) {
    for (let i = 0; i < value.length; i++) {
      const itemResult = validateField(value[i], schema.items, `${path}[${i}]`);
      errors.push(...itemResult.errors);
    }
  }
}

function validateObject(
  value: Record<string, unknown>,
  schema: FieldSchema,
  path: string,
  errors: ValidationError[]
): void {
  if (schema.properties) {
    for (const [key, propSchema] of Object.entries(schema.properties)) {
      const propPath = path ? `${path}.${key}` : key;
      const propResult = validateField(value[key], propSchema, propPath);
      errors.push(...propResult.errors);
    }
  }
}

// ============================================================================
// Configuration Validator
// ============================================================================

/**
 * Validate a complete configuration object against a schema
 */
export function validateConfig<T extends Record<string, unknown>>(
  config: unknown,
  schema: ConfigSchema
): ValidationResult<T> {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return {
      valid: false,
      errors: [{
        path: '',
        message: 'Configuration must be an object',
        code: 'TYPE_MISMATCH',
        expected: 'object',
        received: config === null ? 'null' : Array.isArray(config) ? 'array' : typeof config,
      }],
    };
  }

  const configObj = config as Record<string, unknown>;
  const errors: ValidationError[] = [];
  const validatedConfig: Record<string, unknown> = {};

  for (const [key, fieldSchema] of Object.entries(schema)) {
    const result = validateField(configObj[key], fieldSchema, key);
    errors.push(...result.errors);

    if (result.valid && result.value !== undefined) {
      validatedConfig[key] = result.value;
    } else if (fieldSchema.default !== undefined) {
      validatedConfig[key] = fieldSchema.default;
    }
  }

  return {
    valid: errors.length === 0,
    value: errors.length === 0 ? (validatedConfig as T) : undefined,
    errors,
  };
}

/**
 * Apply defaults to a configuration object
 */
export function applyDefaults<T extends Record<string, unknown>>(
  config: Partial<T>,
  schema: ConfigSchema
): T {
  const result: Record<string, unknown> = { ...config };

  for (const [key, fieldSchema] of Object.entries(schema)) {
    if (result[key] === undefined && fieldSchema.default !== undefined) {
      result[key] = fieldSchema.default;
    }
  }

  return result as T;
}

// ============================================================================
// Extension Settings Schema
// ============================================================================

/**
 * Supported translation providers
 */
export const TRANSLATION_PROVIDERS = [
  'claude-api',
  'openai-api',
  'gemini-api',
  'ollama',
] as const;

/**
 * Supported target languages
 */
export const TARGET_LANGUAGES = [
  'zh-TW', 'zh-CN', 'en', 'ja', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ar', 'hi', 'th', 'vi',
] as const;

/**
 * Extension settings schema
 */
export const EXTENSION_SETTINGS_SCHEMA: ConfigSchema = {
  // Provider settings
  provider: {
    type: 'enum',
    enum: TRANSLATION_PROVIDERS,
    default: 'claude-api',
    description: 'Translation provider to use',
  },
  apiKey: {
    type: 'string',
    required: false,
    minLength: 10,
    description: 'API key for the selected provider',
    validate: (value: string) => {
      if (!value) return null;
      // Basic format check
      if (value.includes(' ')) {
        return 'API key should not contain spaces';
      }
      return null;
    },
  },
  ollamaUrl: {
    type: 'string',
    default: 'http://localhost:11434',
    pattern: /^https?:\/\/.+/,
    description: 'Ollama server URL',
  },
  ollamaModel: {
    type: 'string',
    default: 'llama2',
    minLength: 1,
    description: 'Ollama model to use',
  },

  // Language settings
  targetLanguage: {
    type: 'enum',
    enum: TARGET_LANGUAGES,
    default: 'zh-TW',
    description: 'Target language for translation',
  },
  sourceLanguage: {
    type: 'string',
    default: 'auto',
    description: 'Source language (auto for automatic detection)',
  },

  // Display settings
  fontSize: {
    type: 'number',
    default: 16,
    min: 8,
    max: 48,
    integer: true,
    description: 'Subtitle font size in pixels',
  },
  fontColor: {
    type: 'string',
    default: '#ffffff',
    pattern: /^#[0-9a-fA-F]{6}$/,
    description: 'Subtitle font color (hex)',
  },
  backgroundColor: {
    type: 'string',
    default: '#000000',
    pattern: /^#[0-9a-fA-F]{6}$/,
    description: 'Subtitle background color (hex)',
  },
  backgroundOpacity: {
    type: 'number',
    default: 0.7,
    min: 0,
    max: 1,
    description: 'Subtitle background opacity',
  },
  position: {
    type: 'enum',
    enum: ['top', 'bottom'] as const,
    default: 'bottom',
    description: 'Subtitle position on screen',
  },

  // Behavior settings
  autoStart: {
    type: 'boolean',
    default: true,
    description: 'Automatically start translation when video plays',
  },
  showOriginal: {
    type: 'boolean',
    default: false,
    description: 'Show original subtitles alongside translation',
  },
  cacheEnabled: {
    type: 'boolean',
    default: true,
    description: 'Enable translation caching',
  },
  cacheTtlDays: {
    type: 'number',
    default: 7,
    min: 1,
    max: 30,
    integer: true,
    description: 'Cache time-to-live in days',
  },

  // Performance settings
  maxConcurrentRequests: {
    type: 'number',
    default: 3,
    min: 1,
    max: 10,
    integer: true,
    description: 'Maximum concurrent translation requests',
  },
  requestTimeoutMs: {
    type: 'number',
    default: 30000,
    min: 5000,
    max: 120000,
    integer: true,
    description: 'Request timeout in milliseconds',
  },
  retryAttempts: {
    type: 'number',
    default: 3,
    min: 0,
    max: 10,
    integer: true,
    description: 'Number of retry attempts on failure',
  },
};

/**
 * Extension settings type
 */
export interface ExtensionSettings {
  provider: typeof TRANSLATION_PROVIDERS[number];
  apiKey?: string;
  ollamaUrl: string;
  ollamaModel: string;
  targetLanguage: typeof TARGET_LANGUAGES[number];
  sourceLanguage: string;
  fontSize: number;
  fontColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  position: 'top' | 'bottom';
  autoStart: boolean;
  showOriginal: boolean;
  cacheEnabled: boolean;
  cacheTtlDays: number;
  maxConcurrentRequests: number;
  requestTimeoutMs: number;
  retryAttempts: number;
}

/**
 * Validate extension settings
 */
export function validateExtensionSettings(
  settings: unknown
): ValidationResult<ExtensionSettings> {
  const result = validateConfig<ExtensionSettings>(settings, EXTENSION_SETTINGS_SCHEMA);

  if (!result.valid) {
    logger.debug('Settings validation failed', { errors: result.errors });
  }

  return result;
}

/**
 * Get default extension settings
 */
export function getDefaultSettings(): ExtensionSettings {
  const defaults: Record<string, unknown> = {};

  for (const [key, schema] of Object.entries(EXTENSION_SETTINGS_SCHEMA)) {
    if (schema.default !== undefined) {
      defaults[key] = schema.default;
    }
  }

  return defaults as ExtensionSettings;
}

/**
 * Merge partial settings with defaults
 */
export function mergeWithDefaults(
  settings: Partial<ExtensionSettings>
): ExtensionSettings {
  return applyDefaults(settings, EXTENSION_SETTINGS_SCHEMA);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  return errors
    .map((e) => `${e.path ? `${e.path}: ` : ''}${e.message}`)
    .join('\n');
}

/**
 * Check if a single setting value is valid
 */
export function isValidSetting(
  key: keyof ExtensionSettings,
  value: unknown
): boolean {
  const schema = EXTENSION_SETTINGS_SCHEMA[key];
  if (!schema) return false;

  const result = validateField(value, schema, key);
  return result.valid;
}

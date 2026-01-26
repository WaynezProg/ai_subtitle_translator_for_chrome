/**
 * Tests for Configuration Validator
 */

import { describe, it, expect } from 'vitest';
import {
  validateField,
  validateConfig,
  applyDefaults,
  validateExtensionSettings,
  getDefaultSettings,
  mergeWithDefaults,
  formatValidationErrors,
  isValidSetting,
  EXTENSION_SETTINGS_SCHEMA,
  type FieldSchema,
  type ConfigSchema,
  type ExtensionSettings,
} from '@shared/utils/config-validator';

// ============================================================================
// validateField Tests
// ============================================================================

describe('validateField', () => {
  describe('string validation', () => {
    const schema: FieldSchema<string> = { type: 'string' };

    it('should validate string values', () => {
      const result = validateField('hello', schema);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('hello');
    });

    it('should reject non-string values', () => {
      const result = validateField(123, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('TYPE_MISMATCH');
    });

    it('should validate minLength', () => {
      const minSchema: FieldSchema<string> = { type: 'string', minLength: 5 };

      expect(validateField('hello', minSchema).valid).toBe(true);
      expect(validateField('hi', minSchema).valid).toBe(false);
    });

    it('should validate maxLength', () => {
      const maxSchema: FieldSchema<string> = { type: 'string', maxLength: 5 };

      expect(validateField('hello', maxSchema).valid).toBe(true);
      expect(validateField('hello world', maxSchema).valid).toBe(false);
    });

    it('should validate pattern', () => {
      const patternSchema: FieldSchema<string> = {
        type: 'string',
        pattern: /^[a-z]+$/,
      };

      expect(validateField('hello', patternSchema).valid).toBe(true);
      expect(validateField('Hello123', patternSchema).valid).toBe(false);
    });
  });

  describe('number validation', () => {
    const schema: FieldSchema<number> = { type: 'number' };

    it('should validate number values', () => {
      const result = validateField(42, schema);
      expect(result.valid).toBe(true);
      expect(result.value).toBe(42);
    });

    it('should reject NaN', () => {
      const result = validateField(NaN, schema);
      expect(result.valid).toBe(false);
    });

    it('should validate min', () => {
      const minSchema: FieldSchema<number> = { type: 'number', min: 10 };

      expect(validateField(15, minSchema).valid).toBe(true);
      expect(validateField(5, minSchema).valid).toBe(false);
    });

    it('should validate max', () => {
      const maxSchema: FieldSchema<number> = { type: 'number', max: 100 };

      expect(validateField(50, maxSchema).valid).toBe(true);
      expect(validateField(150, maxSchema).valid).toBe(false);
    });

    it('should validate integer', () => {
      const intSchema: FieldSchema<number> = { type: 'number', integer: true };

      expect(validateField(42, intSchema).valid).toBe(true);
      expect(validateField(42.5, intSchema).valid).toBe(false);
    });
  });

  describe('boolean validation', () => {
    const schema: FieldSchema<boolean> = { type: 'boolean' };

    it('should validate boolean values', () => {
      expect(validateField(true, schema).valid).toBe(true);
      expect(validateField(false, schema).valid).toBe(true);
    });

    it('should reject non-boolean values', () => {
      expect(validateField('true', schema).valid).toBe(false);
      expect(validateField(1, schema).valid).toBe(false);
    });
  });

  describe('array validation', () => {
    const schema: FieldSchema<string[]> = {
      type: 'array',
      items: { type: 'string' },
    };

    it('should validate array values', () => {
      const result = validateField(['a', 'b', 'c'], schema);
      expect(result.valid).toBe(true);
    });

    it('should reject non-array values', () => {
      const result = validateField('not-an-array', schema);
      expect(result.valid).toBe(false);
    });

    it('should validate array items', () => {
      const result = validateField(['a', 123, 'c'], schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].path).toBe('[1]');
    });

    it('should validate minItems', () => {
      const minSchema: FieldSchema = { type: 'array', minItems: 2 };

      expect(validateField([1, 2], minSchema).valid).toBe(true);
      expect(validateField([1], minSchema).valid).toBe(false);
    });

    it('should validate maxItems', () => {
      const maxSchema: FieldSchema = { type: 'array', maxItems: 3 };

      expect(validateField([1, 2, 3], maxSchema).valid).toBe(true);
      expect(validateField([1, 2, 3, 4], maxSchema).valid).toBe(false);
    });
  });

  describe('object validation', () => {
    const schema: FieldSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', required: true },
        age: { type: 'number', min: 0 },
      },
    };

    it('should validate object values', () => {
      const result = validateField({ name: 'John', age: 30 }, schema);
      expect(result.valid).toBe(true);
    });

    it('should reject arrays as objects', () => {
      const result = validateField([], schema);
      expect(result.valid).toBe(false);
    });

    it('should validate nested properties', () => {
      const result = validateField({ name: 'John', age: -5 }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].path).toBe('age');
    });

    it('should check required properties', () => {
      const result = validateField({ age: 30 }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('REQUIRED');
    });
  });

  describe('enum validation', () => {
    const schema: FieldSchema<string> = {
      type: 'enum',
      enum: ['red', 'green', 'blue'] as const,
    };

    it('should validate enum values', () => {
      expect(validateField('red', schema).valid).toBe(true);
      expect(validateField('green', schema).valid).toBe(true);
    });

    it('should reject invalid enum values', () => {
      const result = validateField('yellow', schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_ENUM');
    });
  });

  describe('required and default', () => {
    it('should fail required fields when undefined', () => {
      const schema: FieldSchema = { type: 'string', required: true };
      const result = validateField(undefined, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('REQUIRED');
    });

    it('should use default value when undefined', () => {
      const schema: FieldSchema<string> = { type: 'string', default: 'default-value' };
      const result = validateField(undefined, schema);
      expect(result.valid).toBe(true);
      expect(result.value).toBe('default-value');
    });

    it('should allow undefined for optional fields', () => {
      const schema: FieldSchema = { type: 'string' };
      const result = validateField(undefined, schema);
      expect(result.valid).toBe(true);
    });
  });

  describe('custom validation', () => {
    it('should run custom validator', () => {
      const schema: FieldSchema<string> = {
        type: 'string',
        validate: (value) => {
          if (!value.includes('@')) {
            return 'Must contain @';
          }
          return null;
        },
      };

      expect(validateField('test@example.com', schema).valid).toBe(true);
      expect(validateField('invalid', schema).valid).toBe(false);
    });
  });
});

// ============================================================================
// validateConfig Tests
// ============================================================================

describe('validateConfig', () => {
  const schema: ConfigSchema = {
    name: { type: 'string', required: true },
    count: { type: 'number', default: 0 },
    enabled: { type: 'boolean', default: true },
  };

  it('should validate complete config', () => {
    const result = validateConfig({ name: 'test', count: 5, enabled: false }, schema);
    expect(result.valid).toBe(true);
    expect(result.value).toEqual({ name: 'test', count: 5, enabled: false });
  });

  it('should apply defaults', () => {
    const result = validateConfig({ name: 'test' }, schema);
    expect(result.valid).toBe(true);
    expect(result.value).toEqual({ name: 'test', count: 0, enabled: true });
  });

  it('should collect all errors', () => {
    const result = validateConfig({ count: 'invalid' }, schema);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it('should reject non-object config', () => {
    expect(validateConfig(null, schema).valid).toBe(false);
    expect(validateConfig([], schema).valid).toBe(false);
    expect(validateConfig('string', schema).valid).toBe(false);
  });
});

// ============================================================================
// applyDefaults Tests
// ============================================================================

describe('applyDefaults', () => {
  const schema: ConfigSchema = {
    name: { type: 'string', default: 'default-name' },
    count: { type: 'number', default: 10 },
    enabled: { type: 'boolean' }, // No default
  };

  it('should apply defaults for missing fields', () => {
    const result = applyDefaults({}, schema);
    expect(result.name).toBe('default-name');
    expect(result.count).toBe(10);
  });

  it('should not override existing values', () => {
    const result = applyDefaults({ name: 'custom', count: 5 }, schema);
    expect(result.name).toBe('custom');
    expect(result.count).toBe(5);
  });

  it('should not add fields without defaults', () => {
    const result = applyDefaults({}, schema);
    expect(result.enabled).toBeUndefined();
  });
});

// ============================================================================
// Extension Settings Tests
// ============================================================================

describe('Extension Settings Validation', () => {
  describe('validateExtensionSettings', () => {
    it('should validate valid settings', () => {
      const settings = {
        provider: 'claude-api',
        targetLanguage: 'zh-TW',
        fontSize: 16,
        autoStart: true,
      };

      const result = validateExtensionSettings(settings);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid provider', () => {
      const settings = {
        provider: 'invalid-provider',
      };

      const result = validateExtensionSettings(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'provider')).toBe(true);
    });

    it('should reject invalid fontSize', () => {
      const settings = {
        fontSize: 100, // Max is 48
      };

      const result = validateExtensionSettings(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'fontSize')).toBe(true);
    });

    it('should reject invalid color format', () => {
      const settings = {
        fontColor: 'red', // Should be hex
      };

      const result = validateExtensionSettings(settings);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'fontColor')).toBe(true);
    });

    it('should validate API key format', () => {
      const settings = {
        apiKey: 'key with spaces',
      };

      const result = validateExtensionSettings(settings);
      expect(result.valid).toBe(false);
    });

    it('should accept empty API key', () => {
      const settings = {
        provider: 'claude-api',
      };

      const result = validateExtensionSettings(settings);
      expect(result.valid).toBe(true);
    });
  });

  describe('getDefaultSettings', () => {
    it('should return all default values', () => {
      const defaults = getDefaultSettings();

      expect(defaults.provider).toBe('claude-api');
      expect(defaults.targetLanguage).toBe('zh-TW');
      expect(defaults.fontSize).toBe(16);
      expect(defaults.autoStart).toBe(true);
      expect(defaults.cacheEnabled).toBe(true);
    });
  });

  describe('mergeWithDefaults', () => {
    it('should merge partial settings with defaults', () => {
      const partial: Partial<ExtensionSettings> = {
        provider: 'openai-api',
        fontSize: 20,
      };

      const merged = mergeWithDefaults(partial);

      expect(merged.provider).toBe('openai-api');
      expect(merged.fontSize).toBe(20);
      expect(merged.targetLanguage).toBe('zh-TW'); // Default
      expect(merged.autoStart).toBe(true); // Default
    });
  });

  describe('isValidSetting', () => {
    it('should validate individual settings', () => {
      expect(isValidSetting('provider', 'claude-api')).toBe(true);
      expect(isValidSetting('provider', 'invalid')).toBe(false);
      expect(isValidSetting('fontSize', 20)).toBe(true);
      expect(isValidSetting('fontSize', 100)).toBe(false);
    });

    it('should return false for unknown keys', () => {
      // @ts-expect-error - Testing invalid key
      expect(isValidSetting('unknownKey', 'value')).toBe(false);
    });
  });
});

// ============================================================================
// formatValidationErrors Tests
// ============================================================================

describe('formatValidationErrors', () => {
  it('should format errors with paths', () => {
    const errors = [
      { path: 'name', message: 'Required', code: 'REQUIRED' },
      { path: 'age', message: 'Must be positive', code: 'MIN_VALUE' },
    ];

    const formatted = formatValidationErrors(errors);

    expect(formatted).toContain('name: Required');
    expect(formatted).toContain('age: Must be positive');
  });

  it('should handle errors without paths', () => {
    const errors = [
      { path: '', message: 'Invalid config', code: 'TYPE_MISMATCH' },
    ];

    const formatted = formatValidationErrors(errors);

    expect(formatted).toBe('Invalid config');
  });
});

// ============================================================================
// Schema Coverage Tests
// ============================================================================

describe('EXTENSION_SETTINGS_SCHEMA', () => {
  it('should have all required fields defined', () => {
    const requiredFields = [
      'provider',
      'targetLanguage',
      'fontSize',
      'fontColor',
      'backgroundColor',
      'backgroundOpacity',
      'position',
      'autoStart',
      'showOriginal',
      'cacheEnabled',
      'cacheTtlDays',
      'maxConcurrentRequests',
      'requestTimeoutMs',
      'retryAttempts',
    ];

    for (const field of requiredFields) {
      expect(EXTENSION_SETTINGS_SCHEMA[field]).toBeDefined();
    }
  });

  it('should have descriptions for all fields', () => {
    for (const [key, schema] of Object.entries(EXTENSION_SETTINGS_SCHEMA)) {
      expect(schema.description).toBeDefined();
    }
  });

  it('should have defaults for all non-required fields', () => {
    for (const [key, schema] of Object.entries(EXTENSION_SETTINGS_SCHEMA)) {
      if (!schema.required) {
        // apiKey is optional and doesn't need a default
        if (key !== 'apiKey') {
          expect(schema.default).toBeDefined();
        }
      }
    }
  });
});

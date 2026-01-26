import { describe, it, expect } from 'vitest';
import {
  // Type guards
  isString,
  isNumber,
  isBoolean,
  isNull,
  isUndefined,
  isNullish,
  isDefined,
  isArray,
  isTypedArray,
  isObject,
  isPlainObject,
  isFunction,
  isDate,
  isValidDate,
  isRegExp,
  isPromise,
  isError,
  isMap,
  isSet,
  isSymbol,
  // String validation
  isEmpty,
  isNotEmpty,
  hasMinLength,
  hasMaxLength,
  hasLengthBetween,
  matchesPattern,
  isEmail,
  isUrl,
  isUuid,
  isAlphanumeric,
  isAlpha,
  isNumeric,
  isJson,
  isHexColor,
  isIsoDate,
  isLanguageCode,
  // Number validation
  isPositive,
  isNegative,
  isNonNegative,
  isInRange,
  isInteger,
  isSafeInteger,
  isFinite,
  // Array validation
  isEmptyArray,
  isNotEmptyArray,
  hasMinItems,
  hasMaxItems,
  hasUniqueItems,
  allItemsValid,
  someItemsValid,
  // Object validation
  hasProperty,
  hasProperties,
  hasPropertyOfType,
  isEmptyObject,
  // Schema validation
  validateSchema,
  createValidator,
  Schema,
  // Assertions
  assert,
  assertDefined,
  assertString,
  assertNumber,
  assertArray,
  assertObject,
  assertSchema,
  // Sanitization
  toString,
  toNumber,
  toBoolean,
  toArray,
  withDefault,
} from '@shared/utils/validation-utils';

describe('Type Guards', () => {
  describe('isString', () => {
    it('should return true for strings', () => {
      expect(isString('')).toBe(true);
      expect(isString('hello')).toBe(true);
      expect(isString(String('test'))).toBe(true);
    });

    it('should return false for non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString(null)).toBe(false);
      expect(isString(undefined)).toBe(false);
      expect(isString([])).toBe(false);
      expect(isString({})).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('should return true for valid numbers', () => {
      expect(isNumber(0)).toBe(true);
      expect(isNumber(123)).toBe(true);
      expect(isNumber(-456.78)).toBe(true);
      expect(isNumber(Infinity)).toBe(true);
    });

    it('should return false for NaN', () => {
      expect(isNumber(NaN)).toBe(false);
    });

    it('should return false for non-numbers', () => {
      expect(isNumber('123')).toBe(false);
      expect(isNumber(null)).toBe(false);
      expect(isNumber(undefined)).toBe(false);
    });
  });

  describe('isBoolean', () => {
    it('should return true for booleans', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
    });

    it('should return false for non-booleans', () => {
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean('true')).toBe(false);
      expect(isBoolean(null)).toBe(false);
    });
  });

  describe('isNull', () => {
    it('should return true only for null', () => {
      expect(isNull(null)).toBe(true);
      expect(isNull(undefined)).toBe(false);
      expect(isNull(0)).toBe(false);
      expect(isNull('')).toBe(false);
    });
  });

  describe('isUndefined', () => {
    it('should return true only for undefined', () => {
      expect(isUndefined(undefined)).toBe(true);
      expect(isUndefined(null)).toBe(false);
      expect(isUndefined(0)).toBe(false);
    });
  });

  describe('isNullish', () => {
    it('should return true for null or undefined', () => {
      expect(isNullish(null)).toBe(true);
      expect(isNullish(undefined)).toBe(true);
    });

    it('should return false for other values', () => {
      expect(isNullish(0)).toBe(false);
      expect(isNullish('')).toBe(false);
      expect(isNullish(false)).toBe(false);
    });
  });

  describe('isDefined', () => {
    it('should return true for defined values', () => {
      expect(isDefined(0)).toBe(true);
      expect(isDefined('')).toBe(true);
      expect(isDefined(false)).toBe(true);
      expect(isDefined([])).toBe(true);
    });

    it('should return false for null or undefined', () => {
      expect(isDefined(null)).toBe(false);
      expect(isDefined(undefined)).toBe(false);
    });
  });

  describe('isArray', () => {
    it('should return true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray(new Array(5))).toBe(true);
    });

    it('should return false for non-arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('array')).toBe(false);
      expect(isArray({ length: 0 })).toBe(false);
    });
  });

  describe('isTypedArray', () => {
    it('should validate typed arrays', () => {
      const isStringArray = (arr: unknown) =>
        isTypedArray(arr, isString);

      expect(isStringArray(['a', 'b', 'c'])).toBe(true);
      expect(isStringArray([1, 2, 3])).toBe(false);
      expect(isStringArray(['a', 1, 'c'])).toBe(false);
      expect(isStringArray([])).toBe(true);
    });
  });

  describe('isObject', () => {
    it('should return true for objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ a: 1 })).toBe(true);
      expect(isObject(new Date())).toBe(true);
    });

    it('should return false for null and arrays', () => {
      expect(isObject(null)).toBe(false);
      expect(isObject([])).toBe(false);
      expect(isObject('object')).toBe(false);
    });
  });

  describe('isPlainObject', () => {
    it('should return true for plain objects', () => {
      expect(isPlainObject({})).toBe(true);
      expect(isPlainObject({ a: 1 })).toBe(true);
      expect(isPlainObject(Object.create(null))).toBe(true);
    });

    it('should return false for class instances', () => {
      expect(isPlainObject(new Date())).toBe(false);
      expect(isPlainObject(new Map())).toBe(false);
      expect(isPlainObject([])).toBe(false);
    });
  });

  describe('isFunction', () => {
    it('should return true for functions', () => {
      expect(isFunction(() => {})).toBe(true);
      expect(isFunction(function() {})).toBe(true);
      expect(isFunction(class {})).toBe(true);
    });

    it('should return false for non-functions', () => {
      expect(isFunction({})).toBe(false);
      expect(isFunction('function')).toBe(false);
    });
  });

  describe('isDate', () => {
    it('should return true for valid dates', () => {
      expect(isDate(new Date())).toBe(true);
      expect(isDate(new Date('2024-01-01'))).toBe(true);
    });

    it('should return false for invalid dates', () => {
      expect(isDate(new Date('invalid'))).toBe(false);
      expect(isDate(Date.now())).toBe(false);
      expect(isDate('2024-01-01')).toBe(false);
    });
  });

  describe('isValidDate', () => {
    it('should return true for valid dates', () => {
      expect(isValidDate(new Date())).toBe(true);
    });

    it('should return false for Invalid Date', () => {
      expect(isValidDate(new Date('invalid'))).toBe(false);
    });
  });

  describe('isRegExp', () => {
    it('should return true for RegExp', () => {
      expect(isRegExp(/test/)).toBe(true);
      expect(isRegExp(new RegExp('test'))).toBe(true);
    });

    it('should return false for non-RegExp', () => {
      expect(isRegExp('/test/')).toBe(false);
    });
  });

  describe('isPromise', () => {
    it('should return true for promises', () => {
      expect(isPromise(Promise.resolve())).toBe(true);
      expect(isPromise(new Promise(() => {}))).toBe(true);
    });

    it('should return true for promise-like objects', () => {
      const thenable = { then: () => {}, catch: () => {} };
      expect(isPromise(thenable)).toBe(true);
    });

    it('should return false for non-promises', () => {
      expect(isPromise({})).toBe(false);
      expect(isPromise({ then: 'not a function' })).toBe(false);
    });
  });

  describe('isError', () => {
    it('should return true for errors', () => {
      expect(isError(new Error())).toBe(true);
      expect(isError(new TypeError())).toBe(true);
    });

    it('should return false for non-errors', () => {
      expect(isError({ message: 'error' })).toBe(false);
    });
  });

  describe('isMap', () => {
    it('should return true for Map', () => {
      expect(isMap(new Map())).toBe(true);
    });

    it('should return false for non-Map', () => {
      expect(isMap({})).toBe(false);
      expect(isMap(new Set())).toBe(false);
    });
  });

  describe('isSet', () => {
    it('should return true for Set', () => {
      expect(isSet(new Set())).toBe(true);
    });

    it('should return false for non-Set', () => {
      expect(isSet([])).toBe(false);
      expect(isSet(new Map())).toBe(false);
    });
  });

  describe('isSymbol', () => {
    it('should return true for symbols', () => {
      expect(isSymbol(Symbol())).toBe(true);
      expect(isSymbol(Symbol('test'))).toBe(true);
    });

    it('should return false for non-symbols', () => {
      expect(isSymbol('symbol')).toBe(false);
    });
  });
});

describe('String Validation', () => {
  describe('isEmpty', () => {
    it('should return true for empty or whitespace strings', () => {
      expect(isEmpty('')).toBe(true);
      expect(isEmpty('   ')).toBe(true);
      expect(isEmpty('\t\n')).toBe(true);
    });

    it('should return false for non-empty strings', () => {
      expect(isEmpty('hello')).toBe(false);
      expect(isEmpty(' a ')).toBe(false);
    });
  });

  describe('isNotEmpty', () => {
    it('should return true for non-empty strings', () => {
      expect(isNotEmpty('hello')).toBe(true);
      expect(isNotEmpty(' a ')).toBe(true);
    });

    it('should return false for empty strings', () => {
      expect(isNotEmpty('')).toBe(false);
      expect(isNotEmpty('   ')).toBe(false);
    });
  });

  describe('hasMinLength', () => {
    it('should check minimum length', () => {
      expect(hasMinLength('hello', 5)).toBe(true);
      expect(hasMinLength('hello', 6)).toBe(false);
      expect(hasMinLength('', 0)).toBe(true);
    });
  });

  describe('hasMaxLength', () => {
    it('should check maximum length', () => {
      expect(hasMaxLength('hello', 5)).toBe(true);
      expect(hasMaxLength('hello', 4)).toBe(false);
      expect(hasMaxLength('', 0)).toBe(true);
    });
  });

  describe('hasLengthBetween', () => {
    it('should check length range', () => {
      expect(hasLengthBetween('hello', 3, 7)).toBe(true);
      expect(hasLengthBetween('hello', 5, 5)).toBe(true);
      expect(hasLengthBetween('hello', 6, 10)).toBe(false);
    });
  });

  describe('matchesPattern', () => {
    it('should check pattern match', () => {
      expect(matchesPattern('hello123', /^[a-z]+\d+$/)).toBe(true);
      expect(matchesPattern('HELLO', /^[a-z]+$/)).toBe(false);
    });
  });

  describe('isEmail', () => {
    it('should validate email addresses', () => {
      expect(isEmail('test@example.com')).toBe(true);
      expect(isEmail('user.name@domain.co.uk')).toBe(true);
      expect(isEmail('user+tag@example.org')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(isEmail('invalid')).toBe(false);
      expect(isEmail('@example.com')).toBe(false);
      expect(isEmail('test@')).toBe(false);
      expect(isEmail('test @example.com')).toBe(false);
    });
  });

  describe('isUrl', () => {
    it('should validate URLs', () => {
      expect(isUrl('https://example.com')).toBe(true);
      expect(isUrl('http://localhost:3000')).toBe(true);
      expect(isUrl('https://sub.domain.com/path?query=1')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isUrl('not a url')).toBe(false);
      expect(isUrl('ftp://example.com')).toBe(false);
      expect(isUrl('//example.com')).toBe(false);
    });
  });

  describe('isUuid', () => {
    it('should validate UUID v4', () => {
      expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isUuid('6ba7b810-9dad-41d4-b01c-816655440001')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(isUuid('not-a-uuid')).toBe(false);
      expect(isUuid('550e8400-e29b-51d4-a716-446655440000')).toBe(false); // v5
      expect(isUuid('550e8400-e29b-41d4-c716-446655440000')).toBe(false); // wrong variant
    });
  });

  describe('isAlphanumeric', () => {
    it('should validate alphanumeric strings', () => {
      expect(isAlphanumeric('abc123')).toBe(true);
      expect(isAlphanumeric('ABC')).toBe(true);
      expect(isAlphanumeric('123')).toBe(true);
    });

    it('should reject non-alphanumeric', () => {
      expect(isAlphanumeric('abc-123')).toBe(false);
      expect(isAlphanumeric('abc 123')).toBe(false);
      expect(isAlphanumeric('')).toBe(false);
    });
  });

  describe('isAlpha', () => {
    it('should validate alphabetic strings', () => {
      expect(isAlpha('abc')).toBe(true);
      expect(isAlpha('ABC')).toBe(true);
    });

    it('should reject non-alphabetic', () => {
      expect(isAlpha('abc123')).toBe(false);
      expect(isAlpha('')).toBe(false);
    });
  });

  describe('isNumeric', () => {
    it('should validate numeric strings', () => {
      expect(isNumeric('123')).toBe(true);
      expect(isNumeric('0')).toBe(true);
    });

    it('should reject non-numeric', () => {
      expect(isNumeric('12.3')).toBe(false);
      expect(isNumeric('-123')).toBe(false);
      expect(isNumeric('12a')).toBe(false);
    });
  });

  describe('isJson', () => {
    it('should validate JSON strings', () => {
      expect(isJson('{}')).toBe(true);
      expect(isJson('[]')).toBe(true);
      expect(isJson('{"key": "value"}')).toBe(true);
      expect(isJson('"string"')).toBe(true);
      expect(isJson('123')).toBe(true);
    });

    it('should reject invalid JSON', () => {
      expect(isJson('{')).toBe(false);
      expect(isJson("{'key': 'value'}")).toBe(false);
      expect(isJson('undefined')).toBe(false);
    });
  });

  describe('isHexColor', () => {
    it('should validate hex colors', () => {
      expect(isHexColor('#fff')).toBe(true);
      expect(isHexColor('#FFF')).toBe(true);
      expect(isHexColor('#ffffff')).toBe(true);
      expect(isHexColor('#FFFFFF')).toBe(true);
    });

    it('should reject invalid hex colors', () => {
      expect(isHexColor('fff')).toBe(false);
      expect(isHexColor('#ffff')).toBe(false);
      expect(isHexColor('#gggggg')).toBe(false);
    });
  });

  describe('isIsoDate', () => {
    it('should validate ISO date strings', () => {
      expect(isIsoDate('2024-01-15T10:30:00.000Z')).toBe(true);
      expect(isIsoDate('2024-01-15')).toBe(true);
    });

    it('should reject invalid ISO dates', () => {
      expect(isIsoDate('01/15/2024')).toBe(false);
      expect(isIsoDate('not a date')).toBe(false);
    });
  });

  describe('isLanguageCode', () => {
    it('should validate language codes', () => {
      expect(isLanguageCode('en')).toBe(true);
      expect(isLanguageCode('en-US')).toBe(true);
      expect(isLanguageCode('zh-TW')).toBe(true);
      expect(isLanguageCode('pt-BR')).toBe(true);
    });

    it('should reject invalid language codes', () => {
      expect(isLanguageCode('english')).toBe(false);
      expect(isLanguageCode('e')).toBe(false);
    });
  });
});

describe('Number Validation', () => {
  describe('isPositive', () => {
    it('should check positive numbers', () => {
      expect(isPositive(1)).toBe(true);
      expect(isPositive(0.001)).toBe(true);
      expect(isPositive(0)).toBe(false);
      expect(isPositive(-1)).toBe(false);
    });
  });

  describe('isNegative', () => {
    it('should check negative numbers', () => {
      expect(isNegative(-1)).toBe(true);
      expect(isNegative(-0.001)).toBe(true);
      expect(isNegative(0)).toBe(false);
      expect(isNegative(1)).toBe(false);
    });
  });

  describe('isNonNegative', () => {
    it('should check non-negative numbers', () => {
      expect(isNonNegative(0)).toBe(true);
      expect(isNonNegative(1)).toBe(true);
      expect(isNonNegative(-1)).toBe(false);
    });
  });

  describe('isInRange', () => {
    it('should check range', () => {
      expect(isInRange(5, 0, 10)).toBe(true);
      expect(isInRange(0, 0, 10)).toBe(true);
      expect(isInRange(10, 0, 10)).toBe(true);
      expect(isInRange(-1, 0, 10)).toBe(false);
      expect(isInRange(11, 0, 10)).toBe(false);
    });
  });

  describe('isInteger', () => {
    it('should check integers', () => {
      expect(isInteger(1)).toBe(true);
      expect(isInteger(0)).toBe(true);
      expect(isInteger(-5)).toBe(true);
      expect(isInteger(1.5)).toBe(false);
    });
  });

  describe('isSafeInteger', () => {
    it('should check safe integers', () => {
      expect(isSafeInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
      expect(isSafeInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    });
  });

  describe('isFinite', () => {
    it('should check finite numbers', () => {
      expect(isFinite(123)).toBe(true);
      expect(isFinite(Infinity)).toBe(false);
      expect(isFinite(-Infinity)).toBe(false);
    });
  });
});

describe('Array Validation', () => {
  describe('isEmptyArray', () => {
    it('should check empty arrays', () => {
      expect(isEmptyArray([])).toBe(true);
      expect(isEmptyArray([1])).toBe(false);
    });
  });

  describe('isNotEmptyArray', () => {
    it('should check non-empty arrays', () => {
      expect(isNotEmptyArray([1])).toBe(true);
      expect(isNotEmptyArray([])).toBe(false);
    });
  });

  describe('hasMinItems', () => {
    it('should check minimum items', () => {
      expect(hasMinItems([1, 2, 3], 3)).toBe(true);
      expect(hasMinItems([1, 2], 3)).toBe(false);
    });
  });

  describe('hasMaxItems', () => {
    it('should check maximum items', () => {
      expect(hasMaxItems([1, 2, 3], 3)).toBe(true);
      expect(hasMaxItems([1, 2, 3, 4], 3)).toBe(false);
    });
  });

  describe('hasUniqueItems', () => {
    it('should check unique items', () => {
      expect(hasUniqueItems([1, 2, 3])).toBe(true);
      expect(hasUniqueItems([1, 2, 2])).toBe(false);
    });

    it('should support key function', () => {
      const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
      expect(hasUniqueItems(items, (i) => i.id)).toBe(true);

      const dupes = [{ id: 1 }, { id: 2 }, { id: 1 }];
      expect(hasUniqueItems(dupes, (i) => i.id)).toBe(false);
    });
  });

  describe('allItemsValid', () => {
    it('should validate all items', () => {
      expect(allItemsValid([2, 4, 6], (n) => n % 2 === 0)).toBe(true);
      expect(allItemsValid([2, 3, 6], (n) => n % 2 === 0)).toBe(false);
    });
  });

  describe('someItemsValid', () => {
    it('should validate some items', () => {
      expect(someItemsValid([1, 2, 3], (n) => n % 2 === 0)).toBe(true);
      expect(someItemsValid([1, 3, 5], (n) => n % 2 === 0)).toBe(false);
    });
  });
});

describe('Object Validation', () => {
  describe('hasProperty', () => {
    it('should check property existence', () => {
      expect(hasProperty({ a: 1 }, 'a')).toBe(true);
      expect(hasProperty({ a: 1 }, 'b')).toBe(false);
      expect(hasProperty(null, 'a')).toBe(false);
    });
  });

  describe('hasProperties', () => {
    it('should check multiple properties', () => {
      expect(hasProperties({ a: 1, b: 2 }, ['a', 'b'])).toBe(true);
      expect(hasProperties({ a: 1 }, ['a', 'b'])).toBe(false);
    });
  });

  describe('hasPropertyOfType', () => {
    it('should check property type', () => {
      expect(hasPropertyOfType({ name: 'test' }, 'name', isString)).toBe(true);
      expect(hasPropertyOfType({ name: 123 }, 'name', isString)).toBe(false);
      expect(hasPropertyOfType({}, 'name', isString)).toBe(false);
    });
  });

  describe('isEmptyObject', () => {
    it('should check empty objects', () => {
      expect(isEmptyObject({})).toBe(true);
      expect(isEmptyObject({ a: 1 })).toBe(false);
    });
  });
});

describe('Schema Validation', () => {
  describe('validateSchema', () => {
    it('should validate basic schema', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
          age: { type: 'number', required: true },
        },
      };

      const result = validateSchema({ name: 'John', age: 30 }, schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report missing required properties', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
          age: { type: 'number', required: true },
        },
      };

      const result = validateSchema({ name: 'John' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].path).toBe('age');
    });

    it('should validate string constraints', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            required: true,
            minLength: 3,
            maxLength: 20,
            pattern: /^[a-z0-9]+$/,
          },
        },
      };

      expect(validateSchema({ username: 'abc123' }, schema).valid).toBe(true);
      expect(validateSchema({ username: 'ab' }, schema).valid).toBe(false);
      expect(validateSchema({ username: 'ABC-123' }, schema).valid).toBe(false);
    });

    it('should validate number constraints', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          score: { type: 'number', required: true, min: 0, max: 100 },
        },
      };

      expect(validateSchema({ score: 50 }, schema).valid).toBe(true);
      expect(validateSchema({ score: -1 }, schema).valid).toBe(false);
      expect(validateSchema({ score: 101 }, schema).valid).toBe(false);
    });

    it('should validate enum values', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          status: { type: 'string', required: true, enum: ['active', 'inactive', 'pending'] },
        },
      };

      expect(validateSchema({ status: 'active' }, schema).valid).toBe(true);
      expect(validateSchema({ status: 'unknown' }, schema).valid).toBe(false);
    });

    it('should validate multiple types', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          value: { type: ['string', 'number'], required: true },
        },
      };

      expect(validateSchema({ value: 'text' }, schema).valid).toBe(true);
      expect(validateSchema({ value: 123 }, schema).valid).toBe(true);
      expect(validateSchema({ value: true }, schema).valid).toBe(false);
    });

    it('should reject additional properties when configured', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
        },
        additionalProperties: false,
      };

      expect(validateSchema({ name: 'John', extra: 'value' }, schema).valid).toBe(false);
    });

    it('should allow additional properties by default', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
        },
      };

      expect(validateSchema({ name: 'John', extra: 'value' }, schema).valid).toBe(true);
    });

    it('should validate nested objects', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            required: true,
            properties: {
              name: { type: 'string', required: true },
            },
          },
        },
      };

      expect(validateSchema({ user: { name: 'John' } }, schema).valid).toBe(true);
      expect(validateSchema({ user: {} }, schema).valid).toBe(false);
    });

    it('should validate custom validators', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          email: {
            type: 'string',
            required: true,
            custom: (v) => isString(v) && isEmail(v as string),
          },
        },
      };

      expect(validateSchema({ email: 'test@example.com' }, schema).valid).toBe(true);
      expect(validateSchema({ email: 'invalid' }, schema).valid).toBe(false);
    });

    it('should return error for non-object input', () => {
      const schema: Schema = {
        type: 'object',
        properties: {},
      };

      const result = validateSchema('not an object', schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toBe('Value must be an object');
    });
  });

  describe('createValidator', () => {
    it('should create a type guard from schema', () => {
      interface User {
        name: string;
        age: number;
      }

      const schema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
          age: { type: 'number', required: true },
        },
      };

      const isUser = createValidator<User>(schema);

      const value: unknown = { name: 'John', age: 30 };
      if (isUser(value)) {
        // TypeScript now knows value is User
        expect(value.name).toBe('John');
        expect(value.age).toBe(30);
      }

      expect(isUser({ name: 'John', age: 30 })).toBe(true);
      expect(isUser({ name: 'John' })).toBe(false);
    });
  });
});

describe('Assertions', () => {
  describe('assert', () => {
    it('should not throw when condition is true', () => {
      expect(() => assert(true)).not.toThrow();
    });

    it('should throw when condition is false', () => {
      expect(() => assert(false)).toThrow('Assertion failed');
      expect(() => assert(false, 'Custom message')).toThrow('Custom message');
    });
  });

  describe('assertDefined', () => {
    it('should not throw for defined values', () => {
      expect(() => assertDefined(0)).not.toThrow();
      expect(() => assertDefined('')).not.toThrow();
      expect(() => assertDefined(false)).not.toThrow();
    });

    it('should throw for null or undefined', () => {
      expect(() => assertDefined(null)).toThrow('Value is null or undefined');
      expect(() => assertDefined(undefined)).toThrow('Value is null or undefined');
    });
  });

  describe('assertString', () => {
    it('should not throw for strings', () => {
      expect(() => assertString('hello')).not.toThrow();
    });

    it('should throw for non-strings', () => {
      expect(() => assertString(123)).toThrow('Value is not a string');
    });
  });

  describe('assertNumber', () => {
    it('should not throw for numbers', () => {
      expect(() => assertNumber(123)).not.toThrow();
    });

    it('should throw for non-numbers', () => {
      expect(() => assertNumber('123')).toThrow('Value is not a number');
    });
  });

  describe('assertArray', () => {
    it('should not throw for arrays', () => {
      expect(() => assertArray([1, 2, 3])).not.toThrow();
    });

    it('should throw for non-arrays', () => {
      expect(() => assertArray({})).toThrow('Value is not an array');
    });
  });

  describe('assertObject', () => {
    it('should not throw for objects', () => {
      expect(() => assertObject({ a: 1 })).not.toThrow();
    });

    it('should throw for non-objects', () => {
      expect(() => assertObject('object')).toThrow('Value is not an object');
    });
  });

  describe('assertSchema', () => {
    it('should not throw for valid objects', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
        },
      };

      expect(() => assertSchema({ name: 'John' }, schema)).not.toThrow();
    });

    it('should throw for invalid objects', () => {
      const schema: Schema = {
        type: 'object',
        properties: {
          name: { type: 'string', required: true },
        },
      };

      expect(() => assertSchema({}, schema)).toThrow('Schema validation failed');
    });
  });
});

describe('Sanitization', () => {
  describe('toString', () => {
    it('should convert values to string', () => {
      expect(toString('hello')).toBe('hello');
      expect(toString(123)).toBe('123');
      expect(toString(true)).toBe('true');
      expect(toString(null)).toBe('');
      expect(toString(undefined)).toBe('');
    });
  });

  describe('toNumber', () => {
    it('should convert values to number', () => {
      expect(toNumber(123)).toBe(123);
      expect(toNumber('456')).toBe(456);
      expect(toNumber('3.14')).toBe(3.14);
    });

    it('should return default for invalid values', () => {
      expect(toNumber('invalid')).toBe(0);
      expect(toNumber('invalid', -1)).toBe(-1);
    });
  });

  describe('toBoolean', () => {
    it('should convert values to boolean', () => {
      expect(toBoolean(true)).toBe(true);
      expect(toBoolean(false)).toBe(false);
      expect(toBoolean('true')).toBe(true);
      expect(toBoolean('TRUE')).toBe(true);
      expect(toBoolean('1')).toBe(true);
      expect(toBoolean('yes')).toBe(true);
      expect(toBoolean('false')).toBe(false);
      expect(toBoolean('0')).toBe(false);
      expect(toBoolean(1)).toBe(true);
      expect(toBoolean(0)).toBe(false);
    });
  });

  describe('toArray', () => {
    it('should wrap non-arrays', () => {
      expect(toArray('hello')).toEqual(['hello']);
      expect(toArray(123)).toEqual([123]);
    });

    it('should return arrays as-is', () => {
      expect(toArray([1, 2, 3])).toEqual([1, 2, 3]);
    });
  });

  describe('withDefault', () => {
    it('should return value if defined', () => {
      expect(withDefault('hello', 'default')).toBe('hello');
      expect(withDefault(0, 10)).toBe(0);
      expect(withDefault(false, true)).toBe(false);
    });

    it('should return default for null or undefined', () => {
      expect(withDefault(null, 'default')).toBe('default');
      expect(withDefault(undefined, 'default')).toBe('default');
    });
  });
});

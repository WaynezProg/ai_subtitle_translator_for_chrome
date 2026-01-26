/**
 * Tests for Type Guard Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  // Primitive guards
  isString,
  isNumber,
  isFiniteNumber,
  isInteger,
  isBoolean,
  isNull,
  isUndefined,
  isNullOrUndefined,
  isDefined,
  isSymbol,
  isBigInt,
  // Object guards
  isObject,
  isPlainObject,
  isArray,
  isTypedArray,
  isNonEmptyArray,
  isFunction,
  isDate,
  isRegExp,
  isMap,
  isSet,
  isPromise,
  isPromiseLike,
  isError,
  // String guards
  isNonEmptyString,
  isNonBlankString,
  matchesPattern,
  isEmail,
  isUrl,
  isUuid,
  isJsonString,
  // Number guards
  isPositiveNumber,
  isNegativeNumber,
  isPositiveInteger,
  isNonNegativeInteger,
  isInRange,
  // Object shape guards
  hasProperty,
  hasProperties,
  hasTypedProperty,
  createObjectGuard,
  // Union guards
  oneOf,
  unionOf,
  intersectionOf,
  // Assertions
  assert,
  assertDefined,
  assertString,
  assertNumber,
  assertBoolean,
  assertObject,
  assertArray,
  assertFunction,
  // Narrowing
  narrow,
  narrowWithDefault,
  filterByType,
  getProperty,
  getPropertyWithDefault,
  // Brand types
  createBrand,
  NonEmptyStringBrand,
  PositiveNumberBrand,
  NonNegativeNumberBrand,
  EmailBrand,
  UrlBrand,
  UuidBrand,
  // Utilities
  isAny,
  isNever,
  isRecord,
  isEmpty,
  isNotEmpty,
} from '@shared/utils/type-guards';

describe('Type Guards', () => {
  describe('Primitive Type Guards', () => {
    describe('isString', () => {
      it('should return true for strings', () => {
        expect(isString('hello')).toBe(true);
        expect(isString('')).toBe(true);
      });

      it('should return false for non-strings', () => {
        expect(isString(123)).toBe(false);
        expect(isString(null)).toBe(false);
        expect(isString(undefined)).toBe(false);
        expect(isString({})).toBe(false);
      });
    });

    describe('isNumber', () => {
      it('should return true for numbers', () => {
        expect(isNumber(0)).toBe(true);
        expect(isNumber(42)).toBe(true);
        expect(isNumber(-3.14)).toBe(true);
        expect(isNumber(Infinity)).toBe(true);
      });

      it('should return false for NaN', () => {
        expect(isNumber(NaN)).toBe(false);
      });

      it('should return false for non-numbers', () => {
        expect(isNumber('42')).toBe(false);
        expect(isNumber(null)).toBe(false);
      });
    });

    describe('isFiniteNumber', () => {
      it('should return true for finite numbers', () => {
        expect(isFiniteNumber(42)).toBe(true);
        expect(isFiniteNumber(0)).toBe(true);
      });

      it('should return false for Infinity', () => {
        expect(isFiniteNumber(Infinity)).toBe(false);
        expect(isFiniteNumber(-Infinity)).toBe(false);
      });
    });

    describe('isInteger', () => {
      it('should return true for integers', () => {
        expect(isInteger(42)).toBe(true);
        expect(isInteger(0)).toBe(true);
        expect(isInteger(-100)).toBe(true);
      });

      it('should return false for floats', () => {
        expect(isInteger(3.14)).toBe(false);
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
      });
    });

    describe('isNull', () => {
      it('should return true for null', () => {
        expect(isNull(null)).toBe(true);
      });

      it('should return false for non-null', () => {
        expect(isNull(undefined)).toBe(false);
        expect(isNull(0)).toBe(false);
      });
    });

    describe('isUndefined', () => {
      it('should return true for undefined', () => {
        expect(isUndefined(undefined)).toBe(true);
      });

      it('should return false for non-undefined', () => {
        expect(isUndefined(null)).toBe(false);
        expect(isUndefined(0)).toBe(false);
      });
    });

    describe('isNullOrUndefined', () => {
      it('should return true for null or undefined', () => {
        expect(isNullOrUndefined(null)).toBe(true);
        expect(isNullOrUndefined(undefined)).toBe(true);
      });

      it('should return false for other values', () => {
        expect(isNullOrUndefined(0)).toBe(false);
        expect(isNullOrUndefined('')).toBe(false);
      });
    });

    describe('isDefined', () => {
      it('should return true for defined values', () => {
        expect(isDefined(0)).toBe(true);
        expect(isDefined('')).toBe(true);
        expect(isDefined(false)).toBe(true);
      });

      it('should return false for null/undefined', () => {
        expect(isDefined(null)).toBe(false);
        expect(isDefined(undefined)).toBe(false);
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

    describe('isBigInt', () => {
      it('should return true for bigints', () => {
        expect(isBigInt(BigInt(42))).toBe(true);
        expect(isBigInt(0n)).toBe(true);
      });

      it('should return false for numbers', () => {
        expect(isBigInt(42)).toBe(false);
      });
    });
  });

  describe('Object Type Guards', () => {
    describe('isObject', () => {
      it('should return true for objects', () => {
        expect(isObject({})).toBe(true);
        expect(isObject({ a: 1 })).toBe(true);
        expect(isObject(new Date())).toBe(true);
      });

      it('should return false for null', () => {
        expect(isObject(null)).toBe(false);
      });

      it('should return false for arrays', () => {
        expect(isObject([])).toBe(false);
      });
    });

    describe('isPlainObject', () => {
      it('should return true for plain objects', () => {
        expect(isPlainObject({})).toBe(true);
        expect(isPlainObject({ a: 1 })).toBe(true);
        expect(isPlainObject(Object.create(null))).toBe(true);
      });

      it('should return false for class instances', () => {
        class MyClass {}
        expect(isPlainObject(new MyClass())).toBe(false);
        expect(isPlainObject(new Date())).toBe(false);
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

    describe('isTypedArray', () => {
      it('should return true for arrays with all matching types', () => {
        expect(isTypedArray([1, 2, 3], isNumber)).toBe(true);
        expect(isTypedArray(['a', 'b'], isString)).toBe(true);
      });

      it('should return false for mixed arrays', () => {
        expect(isTypedArray([1, 'two'], isNumber)).toBe(false);
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

    describe('isFunction', () => {
      it('should return true for functions', () => {
        expect(isFunction(() => {})).toBe(true);
        expect(isFunction(function () {})).toBe(true);
        expect(isFunction(class {})).toBe(true);
      });

      it('should return false for non-functions', () => {
        expect(isFunction({})).toBe(false);
      });
    });

    describe('isDate', () => {
      it('should return true for valid dates', () => {
        expect(isDate(new Date())).toBe(true);
      });

      it('should return false for invalid dates', () => {
        expect(isDate(new Date('invalid'))).toBe(false);
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

    describe('isMap', () => {
      it('should return true for Map', () => {
        expect(isMap(new Map())).toBe(true);
      });

      it('should return false for non-Map', () => {
        expect(isMap({})).toBe(false);
      });
    });

    describe('isSet', () => {
      it('should return true for Set', () => {
        expect(isSet(new Set())).toBe(true);
      });

      it('should return false for non-Set', () => {
        expect(isSet([])).toBe(false);
      });
    });

    describe('isPromise', () => {
      it('should return true for Promise', () => {
        expect(isPromise(Promise.resolve())).toBe(true);
      });

      it('should return true for Promise-like objects', () => {
        const promiseLike = {
          then: () => {},
          catch: () => {},
        };
        expect(isPromise(promiseLike)).toBe(true);
      });
    });

    describe('isPromiseLike', () => {
      it('should return true for thenables', () => {
        const thenable = { then: () => {} };
        expect(isPromiseLike(thenable)).toBe(true);
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
  });

  describe('String Type Guards', () => {
    describe('isNonEmptyString', () => {
      it('should return true for non-empty strings', () => {
        expect(isNonEmptyString('hello')).toBe(true);
        expect(isNonEmptyString(' ')).toBe(true);
      });

      it('should return false for empty string', () => {
        expect(isNonEmptyString('')).toBe(false);
      });
    });

    describe('isNonBlankString', () => {
      it('should return true for non-blank strings', () => {
        expect(isNonBlankString('hello')).toBe(true);
      });

      it('should return false for blank strings', () => {
        expect(isNonBlankString('')).toBe(false);
        expect(isNonBlankString('   ')).toBe(false);
      });
    });

    describe('matchesPattern', () => {
      it('should match strings against pattern', () => {
        expect(matchesPattern('hello123', /\d+/)).toBe(true);
        expect(matchesPattern('hello', /\d+/)).toBe(false);
      });
    });

    describe('isEmail', () => {
      it('should return true for valid emails', () => {
        expect(isEmail('test@example.com')).toBe(true);
        expect(isEmail('user.name@domain.co.uk')).toBe(true);
      });

      it('should return false for invalid emails', () => {
        expect(isEmail('invalid')).toBe(false);
        expect(isEmail('test@')).toBe(false);
      });
    });

    describe('isUrl', () => {
      it('should return true for valid URLs', () => {
        expect(isUrl('https://example.com')).toBe(true);
        expect(isUrl('http://localhost:3000')).toBe(true);
      });

      it('should return false for invalid URLs', () => {
        expect(isUrl('not a url')).toBe(false);
        expect(isUrl('example.com')).toBe(false);
      });
    });

    describe('isUuid', () => {
      it('should return true for valid UUIDs', () => {
        expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        expect(isUuid('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true);
      });

      it('should return false for invalid UUIDs', () => {
        expect(isUuid('not-a-uuid')).toBe(false);
        expect(isUuid('550e8400e29b41d4a716446655440000')).toBe(false);
      });
    });

    describe('isJsonString', () => {
      it('should return true for valid JSON strings', () => {
        expect(isJsonString('{"a": 1}')).toBe(true);
        expect(isJsonString('[1, 2, 3]')).toBe(true);
        expect(isJsonString('"string"')).toBe(true);
      });

      it('should return false for invalid JSON', () => {
        expect(isJsonString('{invalid}')).toBe(false);
        expect(isJsonString('not json')).toBe(false);
      });
    });
  });

  describe('Number Type Guards', () => {
    describe('isPositiveNumber', () => {
      it('should return true for positive numbers', () => {
        expect(isPositiveNumber(1)).toBe(true);
        expect(isPositiveNumber(0.5)).toBe(true);
      });

      it('should return false for zero and negative', () => {
        expect(isPositiveNumber(0)).toBe(false);
        expect(isPositiveNumber(-1)).toBe(false);
      });
    });

    describe('isNegativeNumber', () => {
      it('should return true for negative numbers', () => {
        expect(isNegativeNumber(-1)).toBe(true);
      });

      it('should return false for zero and positive', () => {
        expect(isNegativeNumber(0)).toBe(false);
        expect(isNegativeNumber(1)).toBe(false);
      });
    });

    describe('isPositiveInteger', () => {
      it('should return true for positive integers', () => {
        expect(isPositiveInteger(1)).toBe(true);
        expect(isPositiveInteger(100)).toBe(true);
      });

      it('should return false for floats and non-positive', () => {
        expect(isPositiveInteger(1.5)).toBe(false);
        expect(isPositiveInteger(0)).toBe(false);
      });
    });

    describe('isNonNegativeInteger', () => {
      it('should return true for non-negative integers', () => {
        expect(isNonNegativeInteger(0)).toBe(true);
        expect(isNonNegativeInteger(100)).toBe(true);
      });

      it('should return false for negative', () => {
        expect(isNonNegativeInteger(-1)).toBe(false);
      });
    });

    describe('isInRange', () => {
      it('should return true when in range', () => {
        expect(isInRange(5, 0, 10)).toBe(true);
        expect(isInRange(0, 0, 10)).toBe(true);
        expect(isInRange(10, 0, 10)).toBe(true);
      });

      it('should return false when out of range', () => {
        expect(isInRange(-1, 0, 10)).toBe(false);
        expect(isInRange(11, 0, 10)).toBe(false);
      });
    });
  });

  describe('Object Shape Guards', () => {
    describe('hasProperty', () => {
      it('should return true when property exists', () => {
        expect(hasProperty({ name: 'test' }, 'name')).toBe(true);
      });

      it('should return false when property missing', () => {
        expect(hasProperty({}, 'name')).toBe(false);
        expect(hasProperty(null, 'name')).toBe(false);
      });
    });

    describe('hasProperties', () => {
      it('should return true when all properties exist', () => {
        expect(hasProperties({ a: 1, b: 2, c: 3 }, 'a', 'b', 'c')).toBe(true);
      });

      it('should return false when any property missing', () => {
        expect(hasProperties({ a: 1 }, 'a', 'b')).toBe(false);
      });
    });

    describe('hasTypedProperty', () => {
      it('should return true when property has correct type', () => {
        expect(hasTypedProperty({ name: 'test' }, 'name', isString)).toBe(true);
      });

      it('should return false when property has wrong type', () => {
        expect(hasTypedProperty({ name: 123 }, 'name', isString)).toBe(false);
      });
    });

    describe('createObjectGuard', () => {
      it('should create a type guard for object shape', () => {
        interface Person {
          name: string;
          age: number;
        }

        const isPerson = createObjectGuard<Person>({
          name: isString,
          age: isNumber,
        });

        expect(isPerson({ name: 'John', age: 30 })).toBe(true);
        expect(isPerson({ name: 'John' })).toBe(false);
        expect(isPerson({ name: 123, age: 30 })).toBe(false);
      });
    });
  });

  describe('Union Type Guards', () => {
    describe('oneOf', () => {
      it('should return true for matching values', () => {
        const isColor = oneOf('red', 'green', 'blue');

        expect(isColor('red')).toBe(true);
        expect(isColor('green')).toBe(true);
        expect(isColor('yellow')).toBe(false);
      });
    });

    describe('unionOf', () => {
      it('should return true if any guard passes', () => {
        const isStringOrNumber = unionOf(isString, isNumber);

        expect(isStringOrNumber('hello')).toBe(true);
        expect(isStringOrNumber(42)).toBe(true);
        expect(isStringOrNumber(true)).toBe(false);
      });
    });

    describe('intersectionOf', () => {
      it('should return true if all guards pass', () => {
        const isPositiveInteger = intersectionOf(isNumber, isPositiveNumber);

        expect(isPositiveInteger(5)).toBe(true);
        expect(isPositiveInteger(-5)).toBe(false);
      });
    });
  });

  describe('Assertions', () => {
    describe('assert', () => {
      it('should not throw for valid values', () => {
        expect(() => assert('hello', isString)).not.toThrow();
      });

      it('should throw for invalid values', () => {
        expect(() => assert(123, isString)).toThrow(TypeError);
      });

      it('should use custom message', () => {
        expect(() => assert(123, isString, 'Custom error')).toThrow('Custom error');
      });
    });

    describe('assertDefined', () => {
      it('should not throw for defined values', () => {
        expect(() => assertDefined(0)).not.toThrow();
        expect(() => assertDefined('')).not.toThrow();
      });

      it('should throw for null/undefined', () => {
        expect(() => assertDefined(null)).toThrow(TypeError);
        expect(() => assertDefined(undefined)).toThrow(TypeError);
      });
    });

    describe('assertString', () => {
      it('should not throw for strings', () => {
        expect(() => assertString('hello')).not.toThrow();
      });

      it('should throw for non-strings', () => {
        expect(() => assertString(123)).toThrow();
      });
    });

    describe('assertNumber', () => {
      it('should not throw for numbers', () => {
        expect(() => assertNumber(42)).not.toThrow();
      });

      it('should throw for non-numbers', () => {
        expect(() => assertNumber('42')).toThrow();
      });
    });

    describe('assertBoolean', () => {
      it('should not throw for booleans', () => {
        expect(() => assertBoolean(true)).not.toThrow();
      });

      it('should throw for non-booleans', () => {
        expect(() => assertBoolean(1)).toThrow();
      });
    });

    describe('assertObject', () => {
      it('should not throw for objects', () => {
        expect(() => assertObject({})).not.toThrow();
      });

      it('should throw for non-objects', () => {
        expect(() => assertObject(null)).toThrow();
      });
    });

    describe('assertArray', () => {
      it('should not throw for arrays', () => {
        expect(() => assertArray([])).not.toThrow();
      });

      it('should throw for non-arrays', () => {
        expect(() => assertArray({})).toThrow();
      });
    });

    describe('assertFunction', () => {
      it('should not throw for functions', () => {
        expect(() => assertFunction(() => {})).not.toThrow();
      });

      it('should throw for non-functions', () => {
        expect(() => assertFunction({})).toThrow();
      });
    });
  });

  describe('Narrowing Helpers', () => {
    describe('narrow', () => {
      it('should return value if guard passes', () => {
        expect(narrow('hello', isString)).toBe('hello');
      });

      it('should return undefined if guard fails', () => {
        expect(narrow(123, isString)).toBeUndefined();
      });
    });

    describe('narrowWithDefault', () => {
      it('should return value if guard passes', () => {
        expect(narrowWithDefault('hello', isString, 'default')).toBe('hello');
      });

      it('should return default if guard fails', () => {
        expect(narrowWithDefault(123, isString, 'default')).toBe('default');
      });
    });

    describe('filterByType', () => {
      it('should filter array to matching types', () => {
        const mixed = [1, 'a', 2, 'b', 3];
        expect(filterByType(mixed, isNumber)).toEqual([1, 2, 3]);
        expect(filterByType(mixed, isString)).toEqual(['a', 'b']);
      });
    });

    describe('getProperty', () => {
      it('should return property if type matches', () => {
        expect(getProperty({ name: 'test' }, 'name', isString)).toBe('test');
      });

      it('should return undefined if type does not match', () => {
        expect(getProperty({ name: 123 }, 'name', isString)).toBeUndefined();
      });

      it('should return undefined if property missing', () => {
        expect(getProperty({}, 'name', isString)).toBeUndefined();
      });
    });

    describe('getPropertyWithDefault', () => {
      it('should return property if type matches', () => {
        expect(getPropertyWithDefault({ name: 'test' }, 'name', isString, 'default')).toBe(
          'test'
        );
      });

      it('should return default if type does not match', () => {
        expect(getPropertyWithDefault({ name: 123 }, 'name', isString, 'default')).toBe(
          'default'
        );
      });
    });
  });

  describe('Brand Types', () => {
    describe('createBrand', () => {
      it('should create brand validators', () => {
        const Percentage = createBrand<number, 'Percentage'>(
          'Percentage',
          (v) => v >= 0 && v <= 100
        );

        expect(Percentage.is(50)).toBe(true);
        expect(Percentage.is(150)).toBe(false);
      });

      it('should create value with brand', () => {
        const Percentage = createBrand<number, 'Percentage'>(
          'Percentage',
          (v) => v >= 0 && v <= 100
        );

        const value = Percentage.create(50);
        expect(value).toBe(50);
      });

      it('should throw on invalid create', () => {
        const Percentage = createBrand<number, 'Percentage'>(
          'Percentage',
          (v) => v >= 0 && v <= 100
        );

        expect(() => Percentage.create(150)).toThrow();
      });

      it('should assert brand type', () => {
        const Percentage = createBrand<number, 'Percentage'>(
          'Percentage',
          (v) => v >= 0 && v <= 100
        );

        expect(() => Percentage.assert(50)).not.toThrow();
        expect(() => Percentage.assert(150)).toThrow();
      });
    });

    describe('NonEmptyStringBrand', () => {
      it('should validate non-empty strings', () => {
        expect(NonEmptyStringBrand.is('hello')).toBe(true);
        expect(NonEmptyStringBrand.is('')).toBe(false);
      });
    });

    describe('PositiveNumberBrand', () => {
      it('should validate positive numbers', () => {
        expect(PositiveNumberBrand.is(5)).toBe(true);
        expect(PositiveNumberBrand.is(0)).toBe(false);
        expect(PositiveNumberBrand.is(-5)).toBe(false);
      });
    });

    describe('NonNegativeNumberBrand', () => {
      it('should validate non-negative numbers', () => {
        expect(NonNegativeNumberBrand.is(0)).toBe(true);
        expect(NonNegativeNumberBrand.is(5)).toBe(true);
        expect(NonNegativeNumberBrand.is(-1)).toBe(false);
      });
    });

    describe('EmailBrand', () => {
      it('should validate emails', () => {
        expect(EmailBrand.is('test@example.com')).toBe(true);
        expect(EmailBrand.is('invalid')).toBe(false);
      });
    });

    describe('UrlBrand', () => {
      it('should validate URLs', () => {
        expect(UrlBrand.is('https://example.com')).toBe(true);
        expect(UrlBrand.is('not a url')).toBe(false);
      });
    });

    describe('UuidBrand', () => {
      it('should validate UUIDs', () => {
        expect(UuidBrand.is('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        expect(UuidBrand.is('not-a-uuid')).toBe(false);
      });
    });
  });

  describe('Type Utilities', () => {
    describe('isAny', () => {
      it('should always return true', () => {
        expect(isAny(undefined)).toBe(true);
        expect(isAny(null)).toBe(true);
        expect(isAny(42)).toBe(true);
      });
    });

    describe('isNever', () => {
      it('should always return false', () => {
        expect(isNever(undefined)).toBe(false);
        expect(isNever(null)).toBe(false);
        expect(isNever(42)).toBe(false);
      });
    });

    describe('isRecord', () => {
      it('should return true for objects', () => {
        expect(isRecord({})).toBe(true);
        expect(isRecord({ a: 1 })).toBe(true);
      });

      it('should return false for non-objects', () => {
        expect(isRecord(null)).toBe(false);
        expect(isRecord([])).toBe(false);
      });
    });

    describe('isEmpty', () => {
      it('should return true for empty values', () => {
        expect(isEmpty(null)).toBe(true);
        expect(isEmpty(undefined)).toBe(true);
        expect(isEmpty('')).toBe(true);
        expect(isEmpty([])).toBe(true);
        expect(isEmpty({})).toBe(true);
        expect(isEmpty(new Map())).toBe(true);
        expect(isEmpty(new Set())).toBe(true);
      });

      it('should return false for non-empty values', () => {
        expect(isEmpty('hello')).toBe(false);
        expect(isEmpty([1])).toBe(false);
        expect(isEmpty({ a: 1 })).toBe(false);
        expect(isEmpty(new Map([['a', 1]]))).toBe(false);
        expect(isEmpty(new Set([1]))).toBe(false);
      });
    });

    describe('isNotEmpty', () => {
      it('should return true for non-empty values', () => {
        expect(isNotEmpty('hello')).toBe(true);
        expect(isNotEmpty([1])).toBe(true);
      });

      it('should return false for empty values', () => {
        expect(isNotEmpty('')).toBe(false);
        expect(isNotEmpty([])).toBe(false);
      });
    });
  });
});

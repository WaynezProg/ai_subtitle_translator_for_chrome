/**
 * Type Guard Utilities
 *
 * Provides runtime type checking and validation:
 * - Type guard functions for primitive and complex types
 * - Assertion functions that throw on invalid types
 * - Type narrowing helpers
 * - Brand type utilities
 */

// ============================================================================
// Primitive Type Guards
// ============================================================================

/**
 * Check if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Check if value is a number (excluding NaN)
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Check if value is a finite number
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Check if value is an integer
 */
export function isInteger(value: unknown): value is number {
  return Number.isInteger(value);
}

/**
 * Check if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Check if value is null
 */
export function isNull(value: unknown): value is null {
  return value === null;
}

/**
 * Check if value is undefined
 */
export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

/**
 * Check if value is null or undefined
 */
export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Check if value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Check if value is a symbol
 */
export function isSymbol(value: unknown): value is symbol {
  return typeof value === 'symbol';
}

/**
 * Check if value is a bigint
 */
export function isBigInt(value: unknown): value is bigint {
  return typeof value === 'bigint';
}

// ============================================================================
// Object Type Guards
// ============================================================================

/**
 * Check if value is an object (excluding null)
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if value is a plain object (not a class instance)
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

/**
 * Check if value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Check if value is a typed array
 */
export function isTypedArray<T>(
  value: unknown,
  elementGuard: (item: unknown) => item is T
): value is T[] {
  return Array.isArray(value) && value.every(elementGuard);
}

/**
 * Check if value is a non-empty array
 */
export function isNonEmptyArray<T>(value: unknown): value is [T, ...T[]] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Check if value is a function
 */
export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return typeof value === 'function';
}

/**
 * Check if value is a Date
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Check if value is a RegExp
 */
export function isRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp;
}

/**
 * Check if value is a Map
 */
export function isMap<K = unknown, V = unknown>(value: unknown): value is Map<K, V> {
  return value instanceof Map;
}

/**
 * Check if value is a Set
 */
export function isSet<T = unknown>(value: unknown): value is Set<T> {
  return value instanceof Set;
}

/**
 * Check if value is a Promise
 */
export function isPromise<T = unknown>(value: unknown): value is Promise<T> {
  return (
    value instanceof Promise ||
    (isObject(value) &&
      isFunction((value as Record<string, unknown>).then) &&
      isFunction((value as Record<string, unknown>).catch))
  );
}

/**
 * Check if value is a Promise-like (thenable)
 */
export function isPromiseLike<T = unknown>(value: unknown): value is PromiseLike<T> {
  return isObject(value) && isFunction((value as Record<string, unknown>).then);
}

/**
 * Check if value is an Error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

// ============================================================================
// String Type Guards
// ============================================================================

/**
 * Check if value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if value is a non-blank string (has non-whitespace characters)
 */
export function isNonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check if value matches a pattern
 */
export function matchesPattern(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value);
}

/**
 * Check if value is a valid email format
 */
export function isEmail(value: unknown): value is string {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return matchesPattern(value, emailPattern);
}

/**
 * Check if value is a valid URL format
 */
export function isUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if value is a valid UUID format
 */
export function isUuid(value: unknown): value is string {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return matchesPattern(value, uuidPattern);
}

/**
 * Check if value is a valid JSON string
 */
export function isJsonString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Number Type Guards
// ============================================================================

/**
 * Check if value is a positive number
 */
export function isPositiveNumber(value: unknown): value is number {
  return isNumber(value) && value > 0;
}

/**
 * Check if value is a negative number
 */
export function isNegativeNumber(value: unknown): value is number {
  return isNumber(value) && value < 0;
}

/**
 * Check if value is a positive integer
 */
export function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && (value as number) > 0;
}

/**
 * Check if value is a non-negative integer
 */
export function isNonNegativeInteger(value: unknown): value is number {
  return isInteger(value) && (value as number) >= 0;
}

/**
 * Check if value is in range
 */
export function isInRange(
  value: unknown,
  min: number,
  max: number
): value is number {
  return isNumber(value) && value >= min && value <= max;
}

// ============================================================================
// Object Shape Guards
// ============================================================================

/**
 * Check if object has a specific property
 */
export function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return isObject(obj) && key in obj;
}

/**
 * Check if object has all specified properties
 */
export function hasProperties<K extends string>(
  obj: unknown,
  ...keys: K[]
): obj is Record<K, unknown> {
  return isObject(obj) && keys.every((key) => key in obj);
}

/**
 * Check if object has a property with a specific type
 */
export function hasTypedProperty<K extends string, T>(
  obj: unknown,
  key: K,
  guard: (value: unknown) => value is T
): obj is Record<K, T> {
  return hasProperty(obj, key) && guard(obj[key]);
}

/**
 * Create a type guard for an object shape
 */
export function createObjectGuard<T extends Record<string, unknown>>(
  guards: { [K in keyof T]: (value: unknown) => value is T[K] }
): (value: unknown) => value is T {
  return (value: unknown): value is T => {
    if (!isObject(value)) return false;
    for (const [key, guard] of Object.entries(guards) as Array<
      [string, (v: unknown) => boolean]
    >) {
      if (!(key in value) || !guard(value[key])) {
        return false;
      }
    }
    return true;
  };
}

// ============================================================================
// Union Type Guards
// ============================================================================

/**
 * Create a union type guard
 */
export function oneOf<T extends readonly unknown[]>(
  ...values: T
): (value: unknown) => value is T[number] {
  return (value: unknown): value is T[number] => values.includes(value);
}

/**
 * Create a type guard from multiple guards (union)
 */
export function unionOf<T extends unknown[]>(
  ...guards: { [K in keyof T]: (value: unknown) => value is T[K] }
): (value: unknown) => value is T[number] {
  return (value: unknown): value is T[number] => guards.some((guard) => guard(value));
}

/**
 * Create a type guard from multiple guards (intersection)
 */
export function intersectionOf<T extends unknown[]>(
  ...guards: { [K in keyof T]: (value: unknown) => value is T[K] }
): (value: unknown) => value is T[number] {
  return (value: unknown): value is T[number] =>
    guards.every((guard) => guard(value));
}

// ============================================================================
// Assertion Functions
// ============================================================================

/**
 * Assert that a value is of a specific type
 */
export function assert<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
  message?: string
): asserts value is T {
  if (!guard(value)) {
    throw new TypeError(message ?? `Assertion failed: value is not of expected type`);
  }
}

/**
 * Assert that a value is defined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new TypeError(message ?? 'Expected value to be defined');
  }
}

/**
 * Assert that a value is a string
 */
export function assertString(value: unknown, message?: string): asserts value is string {
  assert(value, isString, message ?? 'Expected string');
}

/**
 * Assert that a value is a number
 */
export function assertNumber(value: unknown, message?: string): asserts value is number {
  assert(value, isNumber, message ?? 'Expected number');
}

/**
 * Assert that a value is a boolean
 */
export function assertBoolean(value: unknown, message?: string): asserts value is boolean {
  assert(value, isBoolean, message ?? 'Expected boolean');
}

/**
 * Assert that a value is an object
 */
export function assertObject(
  value: unknown,
  message?: string
): asserts value is Record<string, unknown> {
  assert(value, isObject, message ?? 'Expected object');
}

/**
 * Assert that a value is an array
 */
export function assertArray(value: unknown, message?: string): asserts value is unknown[] {
  assert(value, isArray, message ?? 'Expected array');
}

/**
 * Assert that a value is a function
 */
export function assertFunction(
  value: unknown,
  message?: string
): asserts value is (...args: unknown[]) => unknown {
  assert(value, isFunction, message ?? 'Expected function');
}

// ============================================================================
// Narrowing Helpers
// ============================================================================

/**
 * Narrow unknown to a specific type or undefined
 */
export function narrow<T>(
  value: unknown,
  guard: (value: unknown) => value is T
): T | undefined {
  return guard(value) ? value : undefined;
}

/**
 * Narrow unknown to a specific type or return default
 */
export function narrowWithDefault<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
  defaultValue: T
): T {
  return guard(value) ? value : defaultValue;
}

/**
 * Filter an array to only include values of a specific type
 */
export function filterByType<T>(
  array: unknown[],
  guard: (value: unknown) => value is T
): T[] {
  return array.filter(guard);
}

/**
 * Safe property access with type narrowing
 */
export function getProperty<T>(
  obj: unknown,
  key: string,
  guard: (value: unknown) => value is T
): T | undefined {
  if (!isObject(obj)) return undefined;
  const value = obj[key];
  return guard(value) ? value : undefined;
}

/**
 * Safe property access with default
 */
export function getPropertyWithDefault<T>(
  obj: unknown,
  key: string,
  guard: (value: unknown) => value is T,
  defaultValue: T
): T {
  return getProperty(obj, key, guard) ?? defaultValue;
}

// ============================================================================
// Brand Types
// ============================================================================

/**
 * Brand type symbol
 */
declare const brand: unique symbol;

/**
 * Branded type for nominal typing
 */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/**
 * Create a brand validator
 */
export function createBrand<T, B extends string>(
  name: B,
  validator: (value: T) => boolean
): {
  is: (value: unknown) => value is Brand<T, B>;
  assert: (value: unknown) => asserts value is Brand<T, B>;
  create: (value: T) => Brand<T, B>;
} {
  const baseGuard = (value: unknown): value is T => {
    return validator(value as T);
  };

  return {
    is: (value: unknown): value is Brand<T, B> => baseGuard(value),
    assert: (value: unknown): asserts value is Brand<T, B> => {
      if (!baseGuard(value)) {
        throw new TypeError(`Value is not a valid ${name}`);
      }
    },
    create: (value: T): Brand<T, B> => {
      if (!validator(value)) {
        throw new TypeError(`Value is not a valid ${name}`);
      }
      return value as Brand<T, B>;
    },
  };
}

// ============================================================================
// Common Branded Types
// ============================================================================

/**
 * Non-empty string brand
 */
export type NonEmptyString = Brand<string, 'NonEmptyString'>;
export const NonEmptyStringBrand = createBrand<string, 'NonEmptyString'>(
  'NonEmptyString',
  (value) => typeof value === 'string' && value.length > 0
);

/**
 * Positive number brand
 */
export type PositiveNumber = Brand<number, 'PositiveNumber'>;
export const PositiveNumberBrand = createBrand<number, 'PositiveNumber'>(
  'PositiveNumber',
  (value) => typeof value === 'number' && !isNaN(value) && value > 0
);

/**
 * Non-negative number brand
 */
export type NonNegativeNumber = Brand<number, 'NonNegativeNumber'>;
export const NonNegativeNumberBrand = createBrand<number, 'NonNegativeNumber'>(
  'NonNegativeNumber',
  (value) => typeof value === 'number' && !isNaN(value) && value >= 0
);

/**
 * Email brand
 */
export type Email = Brand<string, 'Email'>;
export const EmailBrand = createBrand<string, 'Email'>(
  'Email',
  (value) => typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
);

/**
 * URL brand
 */
export type Url = Brand<string, 'Url'>;
export const UrlBrand = createBrand<string, 'Url'>('Url', (value) => {
  if (typeof value !== 'string') return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
});

/**
 * UUID brand
 */
export type Uuid = Brand<string, 'Uuid'>;
export const UuidBrand = createBrand<string, 'Uuid'>(
  'Uuid',
  (value) =>
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
);

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Extract element type from array type guard
 */
export type GuardedType<T extends (value: unknown) => value is unknown> =
  T extends (value: unknown) => value is infer U ? U : never;

/**
 * Create a type guard that always returns true (for any type)
 */
export function isAny(_value: unknown): _value is unknown {
  return true;
}

/**
 * Create a type guard that always returns false (for never type)
 */
export function isNever(_value: unknown): _value is never {
  return false;
}

/**
 * Check if a value is a record with string keys
 */
export function isRecord(
  value: unknown
): value is Record<string | number | symbol, unknown> {
  return isObject(value);
}

/**
 * Check if value is empty (null, undefined, empty string, empty array, empty object)
 */
export function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (value instanceof Map || value instanceof Set) return value.size === 0;
  if (isObject(value)) return Object.keys(value).length === 0;
  return false;
}

/**
 * Check if value is not empty
 */
export function isNotEmpty<T>(value: T | null | undefined | '' | []): value is T {
  return !isEmpty(value);
}

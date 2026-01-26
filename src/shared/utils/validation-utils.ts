/**
 * Validation utilities for input validation, type guards, and schema validation
 */

// ============================================================================
// Type Guards
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
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Check if value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
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
  itemGuard: (item: unknown) => item is T
): value is T[] {
  return Array.isArray(value) && value.every(itemGuard);
}

/**
 * Check if value is an object (not null, not array)
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if value is a plain object (created with {} or new Object())
 */
export function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  if (!isObject(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Check if value is a function
 */
export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

/**
 * Check if value is a Date object
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Check if value is a valid Date (not Invalid Date)
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Check if value is a RegExp
 */
export function isRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp;
}

/**
 * Check if value is a Promise
 */
export function isPromise(value: unknown): value is Promise<unknown> {
  return (
    value instanceof Promise ||
    (isObject(value) &&
      isFunction((value as { then?: unknown }).then) &&
      isFunction((value as { catch?: unknown }).catch))
  );
}

/**
 * Check if value is an Error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Check if value is a Map
 */
export function isMap(value: unknown): value is Map<unknown, unknown> {
  return value instanceof Map;
}

/**
 * Check if value is a Set
 */
export function isSet(value: unknown): value is Set<unknown> {
  return value instanceof Set;
}

/**
 * Check if value is a symbol
 */
export function isSymbol(value: unknown): value is symbol {
  return typeof value === 'symbol';
}

// ============================================================================
// String Validation
// ============================================================================

/**
 * Check if string is empty or whitespace only
 */
export function isEmpty(value: string): boolean {
  return value.trim().length === 0;
}

/**
 * Check if string is not empty
 */
export function isNotEmpty(value: string): boolean {
  return value.trim().length > 0;
}

/**
 * Check if string has minimum length
 */
export function hasMinLength(value: string, min: number): boolean {
  return value.length >= min;
}

/**
 * Check if string has maximum length
 */
export function hasMaxLength(value: string, max: number): boolean {
  return value.length <= max;
}

/**
 * Check if string length is within range
 */
export function hasLengthBetween(
  value: string,
  min: number,
  max: number
): boolean {
  return value.length >= min && value.length <= max;
}

/**
 * Check if string matches pattern
 */
export function matchesPattern(value: string, pattern: RegExp): boolean {
  return pattern.test(value);
}

/**
 * Check if string is a valid email
 */
export function isEmail(value: string): boolean {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(value);
}

/**
 * Check if string is a valid URL
 */
export function isUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Check if string is a valid UUID v4
 */
export function isUuid(value: string): boolean {
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidPattern.test(value);
}

/**
 * Check if string contains only alphanumeric characters
 */
export function isAlphanumeric(value: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(value);
}

/**
 * Check if string contains only letters
 */
export function isAlpha(value: string): boolean {
  return /^[a-zA-Z]+$/.test(value);
}

/**
 * Check if string contains only digits
 */
export function isNumeric(value: string): boolean {
  return /^\d+$/.test(value);
}

/**
 * Check if string is valid JSON
 */
export function isJson(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if string is a valid hex color
 */
export function isHexColor(value: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value);
}

/**
 * Check if string is a valid ISO date string
 */
export function isIsoDate(value: string): boolean {
  const date = new Date(value);
  return !isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/**
 * Check if string is a valid language code (BCP 47)
 */
export function isLanguageCode(value: string): boolean {
  // Basic BCP 47 pattern
  const langPattern = /^[a-z]{2,3}(-[A-Z]{2})?(-[a-zA-Z0-9]+)?$/i;
  return langPattern.test(value);
}

// ============================================================================
// Number Validation
// ============================================================================

/**
 * Check if number is positive
 */
export function isPositive(value: number): boolean {
  return value > 0;
}

/**
 * Check if number is negative
 */
export function isNegative(value: number): boolean {
  return value < 0;
}

/**
 * Check if number is non-negative (>= 0)
 */
export function isNonNegative(value: number): boolean {
  return value >= 0;
}

/**
 * Check if number is within range (inclusive)
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * Check if number is an integer
 */
export function isInteger(value: number): boolean {
  return Number.isInteger(value);
}

/**
 * Check if number is a safe integer
 */
export function isSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value);
}

/**
 * Check if number is finite
 */
export function isFinite(value: number): boolean {
  return Number.isFinite(value);
}

// ============================================================================
// Array Validation
// ============================================================================

/**
 * Check if array is empty
 */
export function isEmptyArray(value: unknown[]): boolean {
  return value.length === 0;
}

/**
 * Check if array is not empty
 */
export function isNotEmptyArray(value: unknown[]): boolean {
  return value.length > 0;
}

/**
 * Check if array has minimum items
 */
export function hasMinItems(value: unknown[], min: number): boolean {
  return value.length >= min;
}

/**
 * Check if array has maximum items
 */
export function hasMaxItems(value: unknown[], max: number): boolean {
  return value.length <= max;
}

/**
 * Check if array has all unique items
 */
export function hasUniqueItems<T>(
  value: T[],
  keyFn?: (item: T) => unknown
): boolean {
  if (keyFn) {
    const seen = new Set<unknown>();
    for (const item of value) {
      const key = keyFn(item);
      if (seen.has(key)) return false;
      seen.add(key);
    }
    return true;
  }
  return new Set(value).size === value.length;
}

/**
 * Check if all array items pass validation
 */
export function allItemsValid<T>(
  value: T[],
  validator: (item: T) => boolean
): boolean {
  return value.every(validator);
}

/**
 * Check if at least one array item passes validation
 */
export function someItemsValid<T>(
  value: T[],
  validator: (item: T) => boolean
): boolean {
  return value.some(validator);
}

// ============================================================================
// Object Validation
// ============================================================================

/**
 * Check if object has a property
 */
export function hasProperty<K extends string>(
  obj: unknown,
  key: K
): obj is Record<K, unknown> {
  return isObject(obj) && key in obj;
}

/**
 * Check if object has all required properties
 */
export function hasProperties<K extends string>(
  obj: unknown,
  keys: K[]
): obj is Record<K, unknown> {
  return isObject(obj) && keys.every((key) => key in obj);
}

/**
 * Check if object has property with specific type
 */
export function hasPropertyOfType<K extends string, T>(
  obj: unknown,
  key: K,
  typeGuard: (value: unknown) => value is T
): obj is Record<K, T> {
  return hasProperty(obj, key) && typeGuard(obj[key]);
}

/**
 * Check if object is empty (no own properties)
 */
export function isEmptyObject(value: Record<string, unknown>): boolean {
  return Object.keys(value).length === 0;
}

// ============================================================================
// Schema Validation
// ============================================================================

/**
 * Schema definition types
 */
export type SchemaType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'null'
  | 'any';

export interface SchemaProperty {
  type: SchemaType | SchemaType[];
  required?: boolean;
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  min?: number;
  max?: number;
  enum?: unknown[];
  items?: Schema;
  properties?: Record<string, SchemaProperty>;
  custom?: (value: unknown) => boolean;
}

export interface Schema {
  type: 'object';
  properties: Record<string, SchemaProperty>;
  additionalProperties?: boolean;
}

export interface ValidationError {
  path: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Get type of value as SchemaType
 */
function getValueType(value: unknown): SchemaType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return type;
  if (type === 'object') return 'object';
  return 'any';
}

/**
 * Check if value matches type(s)
 */
function matchesType(value: unknown, type: SchemaType | SchemaType[]): boolean {
  const valueType = getValueType(value);
  if (Array.isArray(type)) {
    return type.includes(valueType) || type.includes('any');
  }
  return type === valueType || type === 'any';
}

/**
 * Validate a single property
 */
function validateProperty(
  value: unknown,
  prop: SchemaProperty,
  path: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Type check
  if (!matchesType(value, prop.type)) {
    const expected = Array.isArray(prop.type) ? prop.type.join(' | ') : prop.type;
    errors.push({
      path,
      message: `Expected ${expected}, got ${getValueType(value)}`,
      value,
    });
    return errors;
  }

  // String validations
  if (isString(value)) {
    if (prop.minLength !== undefined && value.length < prop.minLength) {
      errors.push({
        path,
        message: `String length must be at least ${prop.minLength}`,
        value,
      });
    }
    if (prop.maxLength !== undefined && value.length > prop.maxLength) {
      errors.push({
        path,
        message: `String length must be at most ${prop.maxLength}`,
        value,
      });
    }
    if (prop.pattern && !prop.pattern.test(value)) {
      errors.push({
        path,
        message: `String must match pattern ${prop.pattern}`,
        value,
      });
    }
  }

  // Number validations
  if (isNumber(value)) {
    if (prop.min !== undefined && value < prop.min) {
      errors.push({
        path,
        message: `Number must be at least ${prop.min}`,
        value,
      });
    }
    if (prop.max !== undefined && value > prop.max) {
      errors.push({
        path,
        message: `Number must be at most ${prop.max}`,
        value,
      });
    }
  }

  // Enum validation
  if (prop.enum && !prop.enum.includes(value)) {
    errors.push({
      path,
      message: `Value must be one of: ${prop.enum.join(', ')}`,
      value,
    });
  }

  // Array validations
  if (isArray(value) && prop.items) {
    value.forEach((item, index) => {
      const itemProp: SchemaProperty = {
        type: prop.items!.type === 'object' ? 'object' : 'any',
        properties: prop.items!.properties,
      };
      errors.push(...validateProperty(item, itemProp, `${path}[${index}]`));
    });
  }

  // Nested object validation
  if (isObject(value) && prop.properties) {
    for (const [key, subProp] of Object.entries(prop.properties)) {
      const subValue = value[key];
      const subPath = path ? `${path}.${key}` : key;

      if (subValue === undefined) {
        if (subProp.required) {
          errors.push({
            path: subPath,
            message: 'Required property is missing',
          });
        }
      } else {
        errors.push(...validateProperty(subValue, subProp, subPath));
      }
    }
  }

  // Custom validation
  if (prop.custom && !prop.custom(value)) {
    errors.push({
      path,
      message: 'Custom validation failed',
      value,
    });
  }

  return errors;
}

/**
 * Validate an object against a schema
 */
export function validateSchema(
  obj: unknown,
  schema: Schema
): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isObject(obj)) {
    return {
      valid: false,
      errors: [{ path: '', message: 'Value must be an object', value: obj }],
    };
  }

  // Check required properties and validate each
  for (const [key, prop] of Object.entries(schema.properties)) {
    const value = obj[key];

    if (value === undefined) {
      if (prop.required) {
        errors.push({
          path: key,
          message: 'Required property is missing',
        });
      }
    } else {
      errors.push(...validateProperty(value, prop, key));
    }
  }

  // Check for additional properties
  if (schema.additionalProperties === false) {
    const allowedKeys = new Set(Object.keys(schema.properties));
    for (const key of Object.keys(obj)) {
      if (!allowedKeys.has(key)) {
        errors.push({
          path: key,
          message: 'Additional property not allowed',
          value: obj[key],
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create a validator function from a schema
 */
export function createValidator<T>(
  schema: Schema
): (obj: unknown) => obj is T {
  return (obj: unknown): obj is T => {
    return validateSchema(obj, schema).valid;
  };
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that a condition is true, throw error if not
 */
export function assert(
  condition: boolean,
  message: string = 'Assertion failed'
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Assert that value is defined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string = 'Value is null or undefined'
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

/**
 * Assert that value is a string
 */
export function assertString(
  value: unknown,
  message: string = 'Value is not a string'
): asserts value is string {
  if (!isString(value)) {
    throw new Error(message);
  }
}

/**
 * Assert that value is a number
 */
export function assertNumber(
  value: unknown,
  message: string = 'Value is not a number'
): asserts value is number {
  if (!isNumber(value)) {
    throw new Error(message);
  }
}

/**
 * Assert that value is an array
 */
export function assertArray(
  value: unknown,
  message: string = 'Value is not an array'
): asserts value is unknown[] {
  if (!isArray(value)) {
    throw new Error(message);
  }
}

/**
 * Assert that value is an object
 */
export function assertObject(
  value: unknown,
  message: string = 'Value is not an object'
): asserts value is Record<string, unknown> {
  if (!isObject(value)) {
    throw new Error(message);
  }
}

/**
 * Assert that value passes schema validation
 */
export function assertSchema(
  value: unknown,
  schema: Schema,
  message?: string
): asserts value is Record<string, unknown> {
  const result = validateSchema(value, schema);
  if (!result.valid) {
    const errorMessages = result.errors.map((e) => `${e.path}: ${e.message}`);
    throw new Error(message || `Schema validation failed: ${errorMessages.join(', ')}`);
  }
}

// ============================================================================
// Sanitization
// ============================================================================

/**
 * Coerce value to string
 */
export function toString(value: unknown): string {
  if (isString(value)) return value;
  if (isNull(value) || isUndefined(value)) return '';
  return String(value);
}

/**
 * Coerce value to number
 */
export function toNumber(value: unknown, defaultValue: number = 0): number {
  if (isNumber(value)) return value;
  const parsed = Number(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Coerce value to boolean
 */
export function toBoolean(value: unknown): boolean {
  if (isBoolean(value)) return value;
  if (isString(value)) {
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }
  return Boolean(value);
}

/**
 * Coerce value to array
 */
export function toArray<T>(value: T | T[]): T[] {
  if (isArray(value)) return value as T[];
  return [value as T];
}

/**
 * Set default value if undefined or null
 */
export function withDefault<T>(value: T | null | undefined, defaultValue: T): T {
  return isDefined(value) ? value : defaultValue;
}

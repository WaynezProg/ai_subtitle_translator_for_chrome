/**
 * Serialization Utilities
 *
 * Provides utilities for serializing and deserializing data:
 * - JSON with support for special types (Date, Map, Set, etc.)
 * - URL-safe encoding
 * - MessagePack-like binary format
 * - Schema-based validation
 * - Compression
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Serialization options
 */
export interface SerializeOptions {
  /** Pretty print with indentation */
  pretty?: boolean;
  /** Custom replacer function */
  replacer?: (key: string, value: unknown) => unknown;
  /** Include type markers for special types */
  preserveTypes?: boolean;
}

/**
 * Deserialization options
 */
export interface DeserializeOptions {
  /** Custom reviver function */
  reviver?: (key: string, value: unknown) => unknown;
  /** Restore special types from markers */
  restoreTypes?: boolean;
}

/**
 * Type markers for special types
 */
export const TypeMarkers = {
  DATE: '__DATE__',
  MAP: '__MAP__',
  SET: '__SET__',
  BIGINT: '__BIGINT__',
  UNDEFINED: '__UNDEFINED__',
  REGEXP: '__REGEXP__',
  ERROR: '__ERROR__',
  BUFFER: '__BUFFER__',
} as const;

/**
 * Serialized type wrapper
 */
interface TypeWrapper<T extends keyof typeof TypeMarkers> {
  __type: (typeof TypeMarkers)[T];
  value: unknown;
}

// ============================================================================
// JSON Serialization with Type Preservation
// ============================================================================

/**
 * Pre-process value to mark special types before JSON.stringify
 * This is needed because JSON.stringify converts Dates to strings before calling replacer
 */
function preprocessValue(value: unknown, visited = new WeakSet()): unknown {
  if (value === undefined) {
    return { __type: TypeMarkers.UNDEFINED, value: null };
  }

  if (value === null || typeof value !== 'object') {
    if (typeof value === 'bigint') {
      return { __type: TypeMarkers.BIGINT, value: value.toString() };
    }
    return value;
  }

  // Prevent circular reference issues
  if (visited.has(value as object)) {
    return value;
  }
  visited.add(value as object);

  // Handle Date
  if (value instanceof Date) {
    return { __type: TypeMarkers.DATE, value: value.toISOString() };
  }

  // Handle Map
  if (value instanceof Map) {
    return {
      __type: TypeMarkers.MAP,
      value: Array.from(value.entries()).map(([k, v]) => [
        preprocessValue(k, visited),
        preprocessValue(v, visited),
      ]),
    };
  }

  // Handle Set
  if (value instanceof Set) {
    return {
      __type: TypeMarkers.SET,
      value: Array.from(value).map((v) => preprocessValue(v, visited)),
    };
  }

  // Handle RegExp
  if (value instanceof RegExp) {
    return {
      __type: TypeMarkers.REGEXP,
      value: { source: value.source, flags: value.flags },
    };
  }

  // Handle Error
  if (value instanceof Error) {
    return {
      __type: TypeMarkers.ERROR,
      value: {
        name: value.name,
        message: value.message,
        stack: value.stack,
      },
    };
  }

  // Handle ArrayBuffer
  if (value instanceof ArrayBuffer) {
    return {
      __type: TypeMarkers.BUFFER,
      value: Array.from(new Uint8Array(value)),
    };
  }

  // Handle Uint8Array
  if (value instanceof Uint8Array) {
    return {
      __type: TypeMarkers.BUFFER,
      value: Array.from(value),
    };
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map((v) => preprocessValue(v, visited));
  }

  // Handle plain objects
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    result[k] = preprocessValue(v, visited);
  }
  return result;
}

/**
 * Serialize a value to JSON with type preservation
 */
export function serialize(value: unknown, options: SerializeOptions = {}): string {
  const { pretty = false, replacer, preserveTypes = true } = options;

  // Pre-process to handle special types
  const processedValue = preserveTypes ? preprocessValue(value) : value;

  const typeReplacer = preserveTypes
    ? (_key: string, val: unknown): unknown => {
        // Handle undefined (in case it wasn't pre-processed)
        if (val === undefined) {
          return { __type: TypeMarkers.UNDEFINED, value: null };
        }

        // Handle Date (fallback if not pre-processed)
        if (val instanceof Date) {
          return { __type: TypeMarkers.DATE, value: val.toISOString() };
        }

        // Handle Map
        if (val instanceof Map) {
          return { __type: TypeMarkers.MAP, value: Array.from(val.entries()) };
        }

        // Handle Set
        if (val instanceof Set) {
          return { __type: TypeMarkers.SET, value: Array.from(val) };
        }

        // Handle BigInt
        if (typeof val === 'bigint') {
          return { __type: TypeMarkers.BIGINT, value: val.toString() };
        }

        // Handle RegExp
        if (val instanceof RegExp) {
          return {
            __type: TypeMarkers.REGEXP,
            value: { source: val.source, flags: val.flags },
          };
        }

        // Handle Error
        if (val instanceof Error) {
          return {
            __type: TypeMarkers.ERROR,
            value: {
              name: val.name,
              message: val.message,
              stack: val.stack,
            },
          };
        }

        // Handle ArrayBuffer
        if (val instanceof ArrayBuffer) {
          return {
            __type: TypeMarkers.BUFFER,
            value: Array.from(new Uint8Array(val)),
          };
        }

        // Handle Uint8Array
        if (val instanceof Uint8Array) {
          return {
            __type: TypeMarkers.BUFFER,
            value: Array.from(val),
          };
        }

        return val;
      }
    : undefined;

  const finalReplacer = replacer
    ? (key: string, val: unknown) => {
        const intermediate = typeReplacer ? typeReplacer(key, val) : val;
        return replacer(key, intermediate);
      }
    : typeReplacer;

  return JSON.stringify(processedValue, finalReplacer, pretty ? 2 : undefined);
}

/**
 * Deserialize a JSON string with type restoration
 */
export function deserialize<T = unknown>(
  json: string,
  options: DeserializeOptions = {}
): T {
  const { reviver, restoreTypes = true } = options;

  const typeReviver = restoreTypes
    ? (_key: string, val: unknown): unknown => {
        if (val && typeof val === 'object' && '__type' in val) {
          const wrapper = val as TypeWrapper<keyof typeof TypeMarkers>;

          switch (wrapper.__type) {
            case TypeMarkers.UNDEFINED:
              return undefined;

            case TypeMarkers.DATE:
              return new Date(wrapper.value as string);

            case TypeMarkers.MAP:
              return new Map(wrapper.value as [unknown, unknown][]);

            case TypeMarkers.SET:
              return new Set(wrapper.value as unknown[]);

            case TypeMarkers.BIGINT:
              return BigInt(wrapper.value as string);

            case TypeMarkers.REGEXP: {
              const { source, flags } = wrapper.value as {
                source: string;
                flags: string;
              };
              return new RegExp(source, flags);
            }

            case TypeMarkers.ERROR: {
              const { name, message, stack } = wrapper.value as {
                name: string;
                message: string;
                stack?: string;
              };
              const error = new Error(message);
              error.name = name;
              if (stack) error.stack = stack;
              return error;
            }

            case TypeMarkers.BUFFER:
              return new Uint8Array(wrapper.value as number[]).buffer;
          }
        }

        return val;
      }
    : undefined;

  const finalReviver = reviver
    ? (key: string, val: unknown) => {
        const intermediate = typeReviver ? typeReviver(key, val) : val;
        return reviver(key, intermediate);
      }
    : typeReviver;

  return JSON.parse(json, finalReviver) as T;
}

// ============================================================================
// Safe JSON Operations
// ============================================================================

/**
 * Safely parse JSON, returning undefined on error
 */
export function safeParseJson<T = unknown>(json: string): T | undefined {
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
}

/**
 * Safely stringify to JSON, returning undefined on error
 */
export function safeStringifyJson(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/**
 * Parse JSON with a default value on error
 */
export function parseJsonWithDefault<T>(json: string, defaultValue: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return defaultValue;
  }
}

// ============================================================================
// URL-Safe Encoding
// ============================================================================

/**
 * Encode data to URL-safe Base64
 */
export function encodeUrlSafe(data: string): string {
  const base64 = btoa(unescape(encodeURIComponent(data)));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decode URL-safe Base64 to string
 */
export function decodeUrlSafe(encoded: string): string {
  // Restore standard Base64
  let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');

  // Add padding if needed
  const padding = base64.length % 4;
  if (padding) {
    base64 += '='.repeat(4 - padding);
  }

  return decodeURIComponent(escape(atob(base64)));
}

/**
 * Encode an object to URL-safe JSON string
 */
export function encodeObjectToUrl<T>(obj: T): string {
  return encodeUrlSafe(JSON.stringify(obj));
}

/**
 * Decode a URL-safe string to an object
 */
export function decodeObjectFromUrl<T>(encoded: string): T {
  return JSON.parse(decodeUrlSafe(encoded)) as T;
}

// ============================================================================
// Query String Serialization
// ============================================================================

/**
 * Convert an object to a query string
 */
export function toQueryString(
  params: Record<string, unknown>,
  options: { arrayFormat?: 'bracket' | 'index' | 'comma' | 'repeat' } = {}
): string {
  const { arrayFormat = 'repeat' } = options;
  const parts: string[] = [];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      switch (arrayFormat) {
        case 'bracket':
          for (const item of value) {
            parts.push(`${encodeURIComponent(key)}[]=${encodeURIComponent(String(item))}`);
          }
          break;
        case 'index':
          value.forEach((item, index) => {
            parts.push(
              `${encodeURIComponent(key)}[${index}]=${encodeURIComponent(String(item))}`
            );
          });
          break;
        case 'comma':
          parts.push(`${encodeURIComponent(key)}=${value.map(encodeURIComponent).join(',')}`);
          break;
        case 'repeat':
        default:
          for (const item of value) {
            parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(item))}`);
          }
      }
    } else if (typeof value === 'object') {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(JSON.stringify(value))}`);
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
  }

  return parts.join('&');
}

/**
 * Parse a query string to an object
 */
export function fromQueryString(
  queryString: string,
  options: { parseNumbers?: boolean; parseBooleans?: boolean } = {}
): Record<string, unknown> {
  const { parseNumbers = false, parseBooleans = false } = options;
  const result: Record<string, unknown> = {};

  // Remove leading '?' if present
  const query = queryString.startsWith('?') ? queryString.slice(1) : queryString;

  if (!query) return result;

  for (const part of query.split('&')) {
    const [encodedKey, encodedValue] = part.split('=');
    if (!encodedKey) continue;

    let key = decodeURIComponent(encodedKey);
    let value: unknown = encodedValue ? decodeURIComponent(encodedValue) : '';

    // Handle array notation
    const bracketMatch = key.match(/^(.+?)\[(\d*)\]$/);
    if (bracketMatch) {
      key = bracketMatch[1];
      const index = bracketMatch[2] ? parseInt(bracketMatch[2], 10) : undefined;

      if (!result[key]) {
        result[key] = [];
      }
      const arr = result[key] as unknown[];
      if (index !== undefined) {
        arr[index] = value;
      } else {
        arr.push(value);
      }
      continue;
    }

    // Parse numbers
    if (parseNumbers && typeof value === 'string' && value !== '') {
      const num = Number(value);
      if (!isNaN(num)) {
        value = num;
      }
    }

    // Parse booleans
    if (parseBooleans && typeof value === 'string') {
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
    }

    // Handle repeated keys
    if (key in result) {
      const existing = result[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

// ============================================================================
// Deep Clone with Serialization
// ============================================================================

/**
 * Deep clone an object using structured clone or JSON serialization
 */
export function deepClone<T>(value: T): T {
  // Use structured clone if available (modern browsers)
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall back to JSON for non-clonable types
    }
  }

  // Fall back to JSON serialization
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Deep clone with type preservation
 */
export function deepCloneWithTypes<T>(value: T): T {
  return deserialize<T>(serialize(value));
}

// ============================================================================
// Binary Serialization (Simple Format)
// ============================================================================

/**
 * Binary type tags
 */
const BinaryTags = {
  NULL: 0,
  BOOLEAN_FALSE: 1,
  BOOLEAN_TRUE: 2,
  NUMBER: 3,
  STRING: 4,
  ARRAY: 5,
  OBJECT: 6,
  UNDEFINED: 7,
  DATE: 8,
} as const;

/**
 * Encode a value to binary format (Uint8Array)
 */
export function encodeBinary(value: unknown): Uint8Array {
  const encoder = new BinaryEncoder();
  encoder.encode(value);
  return encoder.getResult();
}

/**
 * Decode binary data to a value
 */
export function decodeBinary<T = unknown>(data: Uint8Array): T {
  const decoder = new BinaryDecoder(data);
  return decoder.decode() as T;
}

class BinaryEncoder {
  private chunks: Uint8Array[] = [];
  private textEncoder = new TextEncoder();

  encode(value: unknown): void {
    if (value === null) {
      this.writeByte(BinaryTags.NULL);
    } else if (value === undefined) {
      this.writeByte(BinaryTags.UNDEFINED);
    } else if (typeof value === 'boolean') {
      this.writeByte(value ? BinaryTags.BOOLEAN_TRUE : BinaryTags.BOOLEAN_FALSE);
    } else if (typeof value === 'number') {
      this.writeByte(BinaryTags.NUMBER);
      this.writeFloat64(value);
    } else if (typeof value === 'string') {
      this.writeByte(BinaryTags.STRING);
      this.writeString(value);
    } else if (value instanceof Date) {
      this.writeByte(BinaryTags.DATE);
      this.writeFloat64(value.getTime());
    } else if (Array.isArray(value)) {
      this.writeByte(BinaryTags.ARRAY);
      this.writeUint32(value.length);
      for (const item of value) {
        this.encode(item);
      }
    } else if (typeof value === 'object') {
      this.writeByte(BinaryTags.OBJECT);
      const entries = Object.entries(value);
      this.writeUint32(entries.length);
      for (const [key, val] of entries) {
        this.writeString(key);
        this.encode(val);
      }
    }
  }

  getResult(): Uint8Array {
    const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  private writeByte(value: number): void {
    this.chunks.push(new Uint8Array([value]));
  }

  private writeUint32(value: number): void {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setUint32(0, value, true);
    this.chunks.push(new Uint8Array(buffer));
  }

  private writeFloat64(value: number): void {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, true);
    this.chunks.push(new Uint8Array(buffer));
  }

  private writeString(value: string): void {
    const encoded = this.textEncoder.encode(value);
    this.writeUint32(encoded.length);
    this.chunks.push(encoded);
  }
}

class BinaryDecoder {
  private data: DataView;
  private offset = 0;
  private textDecoder = new TextDecoder();

  constructor(data: Uint8Array) {
    this.data = new DataView(data.buffer, data.byteOffset, data.byteLength);
  }

  decode(): unknown {
    const tag = this.readByte();

    switch (tag) {
      case BinaryTags.NULL:
        return null;
      case BinaryTags.UNDEFINED:
        return undefined;
      case BinaryTags.BOOLEAN_FALSE:
        return false;
      case BinaryTags.BOOLEAN_TRUE:
        return true;
      case BinaryTags.NUMBER:
        return this.readFloat64();
      case BinaryTags.STRING:
        return this.readString();
      case BinaryTags.DATE:
        return new Date(this.readFloat64());
      case BinaryTags.ARRAY: {
        const length = this.readUint32();
        const result: unknown[] = [];
        for (let i = 0; i < length; i++) {
          result.push(this.decode());
        }
        return result;
      }
      case BinaryTags.OBJECT: {
        const length = this.readUint32();
        const result: Record<string, unknown> = {};
        for (let i = 0; i < length; i++) {
          const key = this.readString();
          result[key] = this.decode();
        }
        return result;
      }
      default:
        throw new Error(`Unknown binary tag: ${tag}`);
    }
  }

  private readByte(): number {
    return this.data.getUint8(this.offset++);
  }

  private readUint32(): number {
    const value = this.data.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  private readFloat64(): number {
    const value = this.data.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  private readString(): string {
    const length = this.readUint32();
    const bytes = new Uint8Array(
      this.data.buffer,
      this.data.byteOffset + this.offset,
      length
    );
    this.offset += length;
    return this.textDecoder.decode(bytes);
  }
}

// ============================================================================
// Schema Validation
// ============================================================================

/**
 * Schema types
 */
export type SchemaType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | 'array'
  | 'object'
  | 'any';

/**
 * Schema definition
 */
export interface Schema {
  type: SchemaType | SchemaType[];
  required?: boolean;
  properties?: Record<string, Schema>;
  items?: Schema;
  enum?: unknown[];
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a value against a schema
 */
export function validateSchema(value: unknown, schema: Schema): ValidationResult {
  const errors: string[] = [];

  function validate(val: unknown, sch: Schema, path: string): void {
    // Check type
    const types = Array.isArray(sch.type) ? sch.type : [sch.type];
    const actualType = getType(val);

    if (!types.includes(actualType) && !types.includes('any')) {
      errors.push(`${path}: expected ${types.join(' | ')}, got ${actualType}`);
      return;
    }

    // Check enum
    if (sch.enum && !sch.enum.includes(val)) {
      errors.push(`${path}: value not in enum [${sch.enum.join(', ')}]`);
    }

    // String validations
    if (typeof val === 'string') {
      if (sch.pattern && !new RegExp(sch.pattern).test(val)) {
        errors.push(`${path}: does not match pattern ${sch.pattern}`);
      }
      if (sch.minLength !== undefined && val.length < sch.minLength) {
        errors.push(`${path}: length ${val.length} is less than minimum ${sch.minLength}`);
      }
      if (sch.maxLength !== undefined && val.length > sch.maxLength) {
        errors.push(`${path}: length ${val.length} is greater than maximum ${sch.maxLength}`);
      }
    }

    // Number validations
    if (typeof val === 'number') {
      if (sch.minimum !== undefined && val < sch.minimum) {
        errors.push(`${path}: ${val} is less than minimum ${sch.minimum}`);
      }
      if (sch.maximum !== undefined && val > sch.maximum) {
        errors.push(`${path}: ${val} is greater than maximum ${sch.maximum}`);
      }
    }

    // Array validations
    if (Array.isArray(val) && sch.items) {
      for (let i = 0; i < val.length; i++) {
        validate(val[i], sch.items, `${path}[${i}]`);
      }
    }

    // Object validations
    if (typeof val === 'object' && val !== null && !Array.isArray(val) && sch.properties) {
      for (const [key, propSchema] of Object.entries(sch.properties)) {
        const propPath = path ? `${path}.${key}` : key;
        const propValue = (val as Record<string, unknown>)[key];

        if (propValue === undefined) {
          if (propSchema.required) {
            errors.push(`${propPath}: required property is missing`);
          }
        } else {
          validate(propValue, propSchema, propPath);
        }
      }
    }
  }

  validate(value, schema, '');

  return {
    valid: errors.length === 0,
    errors,
  };
}

function getType(value: unknown): SchemaType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return 'any';
}

// ============================================================================
// Compression (Simple RLE for repeated data)
// ============================================================================

/**
 * Compress a string using simple run-length encoding
 */
export function compressRLE(input: string): string {
  if (!input) return '';

  let result = '';
  let count = 1;
  let prev = input[0];

  for (let i = 1; i < input.length; i++) {
    if (input[i] === prev && count < 255) {
      count++;
    } else {
      result += count > 3 ? `${count}${prev}` : prev.repeat(count);
      prev = input[i];
      count = 1;
    }
  }

  result += count > 3 ? `${count}${prev}` : prev.repeat(count);

  return result;
}

/**
 * Decompress a run-length encoded string
 */
export function decompressRLE(input: string): string {
  if (!input) return '';

  let result = '';
  let i = 0;

  while (i < input.length) {
    // Check if current position starts with a number
    let numStr = '';
    while (i < input.length && /\d/.test(input[i])) {
      numStr += input[i];
      i++;
    }

    if (numStr && i < input.length) {
      const count = parseInt(numStr, 10);
      result += input[i].repeat(count);
      i++;
    } else if (i < input.length) {
      result += input[i];
      i++;
    }
  }

  return result;
}

// ============================================================================
// Hash Code Generation
// ============================================================================

/**
 * Generate a simple hash code for a string
 */
export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}

/**
 * Generate a simple hash code for any value
 */
export function hashValue(value: unknown): number {
  return hashCode(JSON.stringify(value));
}

// ============================================================================
// CSV Serialization
// ============================================================================

/**
 * Convert an array of objects to CSV string
 */
export function toCSV(
  data: Record<string, unknown>[],
  options: { headers?: string[]; delimiter?: string } = {}
): string {
  if (data.length === 0) return '';

  const { delimiter = ',' } = options;
  const headers = options.headers ?? Object.keys(data[0]);

  const escapeCell = (value: unknown): string => {
    const str = String(value ?? '');
    if (str.includes(delimiter) || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerRow = headers.map(escapeCell).join(delimiter);
  const dataRows = data.map((row) =>
    headers.map((h) => escapeCell(row[h])).join(delimiter)
  );

  return [headerRow, ...dataRows].join('\n');
}

/**
 * Parse a CSV string to an array of objects
 */
export function fromCSV(
  csv: string,
  options: { delimiter?: string; hasHeaders?: boolean } = {}
): Record<string, unknown>[] {
  const { delimiter = ',', hasHeaders = true } = options;

  const lines = csv.split('\n').filter((line) => line.trim());
  if (lines.length === 0) return [];

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (inQuotes) {
        if (char === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === delimiter) {
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
    }

    result.push(current);
    return result;
  };

  const headers = hasHeaders
    ? parseRow(lines[0])
    : parseRow(lines[0]).map((_, i) => `column${i}`);

  const startIndex = hasHeaders ? 1 : 0;

  return lines.slice(startIndex).map((line) => {
    const values = parseRow(line);
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });
}

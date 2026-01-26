/**
 * Tests for Serialization Utilities
 */

import { describe, it, expect } from 'vitest';
import {
  // JSON Serialization
  serialize,
  deserialize,
  safeParseJson,
  safeStringifyJson,
  parseJsonWithDefault,
  TypeMarkers,
  // URL-Safe Encoding
  encodeUrlSafe,
  decodeUrlSafe,
  encodeObjectToUrl,
  decodeObjectFromUrl,
  // Query String
  toQueryString,
  fromQueryString,
  // Deep Clone
  deepClone,
  deepCloneWithTypes,
  // Binary Serialization
  encodeBinary,
  decodeBinary,
  // Schema Validation
  validateSchema,
  type Schema,
  // Compression
  compressRLE,
  decompressRLE,
  // Hash
  hashCode,
  hashValue,
  // CSV
  toCSV,
  fromCSV,
} from '@shared/utils/serialization-utils';

describe('Serialization Utils', () => {
  describe('JSON Serialization with Type Preservation', () => {
    describe('serialize', () => {
      it('should serialize primitive values', () => {
        expect(serialize(42)).toBe('42');
        expect(serialize('hello')).toBe('"hello"');
        expect(serialize(true)).toBe('true');
        expect(serialize(null)).toBe('null');
      });

      it('should serialize arrays', () => {
        expect(serialize([1, 2, 3])).toBe('[1,2,3]');
      });

      it('should serialize objects', () => {
        const result = serialize({ a: 1, b: 2 });
        expect(JSON.parse(result)).toEqual({ a: 1, b: 2 });
      });

      it('should preserve Date type', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const serialized = serialize(date);
        const parsed = JSON.parse(serialized);

        expect(parsed.__type).toBe(TypeMarkers.DATE);
        expect(parsed.value).toBe(date.toISOString());
      });

      it('should preserve Map type', () => {
        const map = new Map([
          ['key1', 'value1'],
          ['key2', 'value2'],
        ]);
        const serialized = serialize(map);
        const parsed = JSON.parse(serialized);

        expect(parsed.__type).toBe(TypeMarkers.MAP);
        expect(parsed.value).toEqual([
          ['key1', 'value1'],
          ['key2', 'value2'],
        ]);
      });

      it('should preserve Set type', () => {
        const set = new Set([1, 2, 3]);
        const serialized = serialize(set);
        const parsed = JSON.parse(serialized);

        expect(parsed.__type).toBe(TypeMarkers.SET);
        expect(parsed.value).toEqual([1, 2, 3]);
      });

      it('should preserve BigInt type', () => {
        const bigint = BigInt('9007199254740993');
        const serialized = serialize(bigint);
        const parsed = JSON.parse(serialized);

        expect(parsed.__type).toBe(TypeMarkers.BIGINT);
        expect(parsed.value).toBe('9007199254740993');
      });

      it('should preserve RegExp type', () => {
        const regex = /test/gi;
        const serialized = serialize(regex);
        const parsed = JSON.parse(serialized);

        expect(parsed.__type).toBe(TypeMarkers.REGEXP);
        expect(parsed.value).toEqual({ source: 'test', flags: 'gi' });
      });

      it('should preserve Error type', () => {
        const error = new Error('Test error');
        error.name = 'TestError';
        const serialized = serialize(error);
        const parsed = JSON.parse(serialized);

        expect(parsed.__type).toBe(TypeMarkers.ERROR);
        expect(parsed.value.name).toBe('TestError');
        expect(parsed.value.message).toBe('Test error');
      });

      it('should preserve undefined type', () => {
        const obj = { a: 1, b: undefined };
        const serialized = serialize(obj);
        const parsed = JSON.parse(serialized);

        expect(parsed.b.__type).toBe(TypeMarkers.UNDEFINED);
      });

      it('should preserve ArrayBuffer type', () => {
        const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
        const serialized = serialize(buffer);
        const parsed = JSON.parse(serialized);

        expect(parsed.__type).toBe(TypeMarkers.BUFFER);
        expect(parsed.value).toEqual([1, 2, 3, 4]);
      });

      it('should support pretty printing', () => {
        const obj = { a: 1 };
        const serialized = serialize(obj, { pretty: true });

        expect(serialized).toContain('\n');
        expect(serialized).toContain('  ');
      });

      it('should support custom replacer', () => {
        const obj = { password: 'secret', name: 'John' };
        const serialized = serialize(obj, {
          replacer: (key, value) => (key === 'password' ? '***' : value),
          preserveTypes: false,
        });

        expect(JSON.parse(serialized)).toEqual({ password: '***', name: 'John' });
      });

      it('should skip type preservation when disabled', () => {
        const date = new Date();
        const serialized = serialize(date, { preserveTypes: false });

        expect(serialized).not.toContain('__type');
      });
    });

    describe('deserialize', () => {
      it('should deserialize primitive values', () => {
        expect(deserialize('42')).toBe(42);
        expect(deserialize('"hello"')).toBe('hello');
        expect(deserialize('true')).toBe(true);
        expect(deserialize('null')).toBe(null);
      });

      it('should restore Date type', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const serialized = serialize(date);
        const restored = deserialize(serialized);

        expect(restored).toBeInstanceOf(Date);
        expect((restored as Date).getTime()).toBe(date.getTime());
      });

      it('should restore Map type', () => {
        const map = new Map([
          ['key1', 'value1'],
          ['key2', 'value2'],
        ]);
        const serialized = serialize(map);
        const restored = deserialize<Map<string, string>>(serialized);

        expect(restored).toBeInstanceOf(Map);
        expect(restored.get('key1')).toBe('value1');
      });

      it('should restore Set type', () => {
        const set = new Set([1, 2, 3]);
        const serialized = serialize(set);
        const restored = deserialize<Set<number>>(serialized);

        expect(restored).toBeInstanceOf(Set);
        expect(restored.has(2)).toBe(true);
      });

      it('should restore BigInt type', () => {
        const bigint = BigInt('9007199254740993');
        const serialized = serialize(bigint);
        const restored = deserialize<bigint>(serialized);

        expect(typeof restored).toBe('bigint');
        expect(restored).toBe(bigint);
      });

      it('should restore RegExp type', () => {
        const regex = /test/gi;
        const serialized = serialize(regex);
        const restored = deserialize<RegExp>(serialized);

        expect(restored).toBeInstanceOf(RegExp);
        expect(restored.source).toBe('test');
        expect(restored.flags).toBe('gi');
      });

      it('should restore Error type', () => {
        const error = new Error('Test error');
        error.name = 'TestError';
        const serialized = serialize(error);
        const restored = deserialize<Error>(serialized);

        expect(restored).toBeInstanceOf(Error);
        expect(restored.name).toBe('TestError');
        expect(restored.message).toBe('Test error');
      });

      it('should restore undefined type', () => {
        const obj = { a: 1, b: undefined };
        const serialized = serialize(obj);
        const restored = deserialize<typeof obj>(serialized);

        expect(restored.b).toBe(undefined);
      });

      it('should restore ArrayBuffer type', () => {
        const buffer = new Uint8Array([1, 2, 3, 4]).buffer;
        const serialized = serialize(buffer);
        const restored = deserialize<ArrayBuffer>(serialized);

        expect(restored).toBeInstanceOf(ArrayBuffer);
        expect(new Uint8Array(restored)).toEqual(new Uint8Array([1, 2, 3, 4]));
      });

      it('should support custom reviver', () => {
        const json = '{"value": 10}';
        const result = deserialize<{ value: number }>(json, {
          reviver: (key, value) => (key === 'value' ? (value as number) * 2 : value),
          restoreTypes: false,
        });

        expect(result.value).toBe(20);
      });
    });

    describe('round-trip serialization', () => {
      it('should preserve complex nested structures', () => {
        const original = {
          date: new Date('2024-01-15'),
          map: new Map([['key', { nested: true }]]),
          set: new Set([1, 2, 3]),
          array: [1, 'two', { three: 3 }],
          regex: /pattern/i,
        };

        const serialized = serialize(original);
        const restored = deserialize<typeof original>(serialized);

        expect(restored.date.getTime()).toBe(original.date.getTime());
        expect(restored.map.get('key')).toEqual({ nested: true });
        expect(restored.set.has(2)).toBe(true);
        expect(restored.array).toEqual(original.array);
        expect(restored.regex.source).toBe(original.regex.source);
      });
    });
  });

  describe('Safe JSON Operations', () => {
    describe('safeParseJson', () => {
      it('should parse valid JSON', () => {
        expect(safeParseJson('{"a": 1}')).toEqual({ a: 1 });
      });

      it('should return undefined for invalid JSON', () => {
        expect(safeParseJson('invalid')).toBeUndefined();
        expect(safeParseJson('')).toBeUndefined();
      });
    });

    describe('safeStringifyJson', () => {
      it('should stringify valid values', () => {
        expect(safeStringifyJson({ a: 1 })).toBe('{"a":1}');
      });

      it('should return undefined for circular references', () => {
        const obj: Record<string, unknown> = {};
        obj.self = obj;
        expect(safeStringifyJson(obj)).toBeUndefined();
      });
    });

    describe('parseJsonWithDefault', () => {
      it('should parse valid JSON', () => {
        expect(parseJsonWithDefault('{"a": 1}', {})).toEqual({ a: 1 });
      });

      it('should return default for invalid JSON', () => {
        expect(parseJsonWithDefault('invalid', { default: true })).toEqual({
          default: true,
        });
      });
    });
  });

  describe('URL-Safe Encoding', () => {
    describe('encodeUrlSafe / decodeUrlSafe', () => {
      it('should encode and decode strings', () => {
        const original = 'Hello, World! 你好';
        const encoded = encodeUrlSafe(original);
        const decoded = decodeUrlSafe(encoded);

        expect(encoded).not.toContain('+');
        expect(encoded).not.toContain('/');
        expect(encoded).not.toContain('=');
        expect(decoded).toBe(original);
      });

      it('should handle special characters', () => {
        const original = '!@#$%^&*()_+-=[]{}|;\':",./<>?';
        const decoded = decodeUrlSafe(encodeUrlSafe(original));
        expect(decoded).toBe(original);
      });

      it('should handle empty string', () => {
        expect(decodeUrlSafe(encodeUrlSafe(''))).toBe('');
      });
    });

    describe('encodeObjectToUrl / decodeObjectFromUrl', () => {
      it('should encode and decode objects', () => {
        const original = { name: 'test', values: [1, 2, 3] };
        const encoded = encodeObjectToUrl(original);
        const decoded = decodeObjectFromUrl<typeof original>(encoded);

        expect(decoded).toEqual(original);
      });
    });
  });

  describe('Query String', () => {
    describe('toQueryString', () => {
      it('should convert object to query string', () => {
        const params = { name: 'John', age: 30 };
        const result = toQueryString(params);

        expect(result).toBe('name=John&age=30');
      });

      it('should handle arrays with repeat format', () => {
        const params = { tags: ['a', 'b', 'c'] };
        const result = toQueryString(params, { arrayFormat: 'repeat' });

        expect(result).toBe('tags=a&tags=b&tags=c');
      });

      it('should handle arrays with bracket format', () => {
        const params = { tags: ['a', 'b'] };
        const result = toQueryString(params, { arrayFormat: 'bracket' });

        expect(result).toBe('tags[]=a&tags[]=b');
      });

      it('should handle arrays with index format', () => {
        const params = { tags: ['a', 'b'] };
        const result = toQueryString(params, { arrayFormat: 'index' });

        expect(result).toBe('tags[0]=a&tags[1]=b');
      });

      it('should handle arrays with comma format', () => {
        const params = { tags: ['a', 'b', 'c'] };
        const result = toQueryString(params, { arrayFormat: 'comma' });

        expect(result).toBe('tags=a,b,c');
      });

      it('should skip null and undefined values', () => {
        const params = { a: 1, b: null, c: undefined, d: 2 };
        const result = toQueryString(params);

        expect(result).toBe('a=1&d=2');
      });

      it('should encode special characters', () => {
        const params = { query: 'hello world' };
        const result = toQueryString(params);

        expect(result).toBe('query=hello%20world');
      });

      it('should stringify nested objects', () => {
        const params = { filter: { min: 10, max: 100 } };
        const result = toQueryString(params);

        expect(result).toContain('filter=');
        expect(decodeURIComponent(result)).toContain('{"min":10,"max":100}');
      });
    });

    describe('fromQueryString', () => {
      it('should parse query string to object', () => {
        const result = fromQueryString('name=John&age=30');

        expect(result).toEqual({ name: 'John', age: '30' });
      });

      it('should handle leading question mark', () => {
        const result = fromQueryString('?name=John');

        expect(result).toEqual({ name: 'John' });
      });

      it('should handle empty string', () => {
        expect(fromQueryString('')).toEqual({});
        expect(fromQueryString('?')).toEqual({});
      });

      it('should handle repeated keys', () => {
        const result = fromQueryString('tag=a&tag=b&tag=c');

        expect(result.tag).toEqual(['a', 'b', 'c']);
      });

      it('should handle bracket notation', () => {
        const result = fromQueryString('tags[]=a&tags[]=b');

        expect(result.tags).toEqual(['a', 'b']);
      });

      it('should handle indexed notation', () => {
        const result = fromQueryString('tags[0]=a&tags[1]=b');

        expect(result.tags).toEqual(['a', 'b']);
      });

      it('should parse numbers when enabled', () => {
        const result = fromQueryString('count=42&name=test', { parseNumbers: true });

        expect(result.count).toBe(42);
        expect(result.name).toBe('test');
      });

      it('should parse booleans when enabled', () => {
        const result = fromQueryString('active=true&enabled=false', {
          parseBooleans: true,
        });

        expect(result.active).toBe(true);
        expect(result.enabled).toBe(false);
      });
    });
  });

  describe('Deep Clone', () => {
    describe('deepClone', () => {
      it('should clone primitive values', () => {
        expect(deepClone(42)).toBe(42);
        expect(deepClone('hello')).toBe('hello');
        expect(deepClone(true)).toBe(true);
        expect(deepClone(null)).toBe(null);
      });

      it('should clone arrays', () => {
        const original = [1, 2, { a: 3 }];
        const cloned = deepClone(original);

        expect(cloned).toEqual(original);
        expect(cloned).not.toBe(original);
        expect(cloned[2]).not.toBe(original[2]);
      });

      it('should clone objects', () => {
        const original = { a: 1, b: { c: 2 } };
        const cloned = deepClone(original);

        expect(cloned).toEqual(original);
        expect(cloned).not.toBe(original);
        expect(cloned.b).not.toBe(original.b);
      });
    });

    describe('deepCloneWithTypes', () => {
      it('should clone with type preservation', () => {
        const original = {
          date: new Date('2024-01-15'),
          set: new Set([1, 2, 3]),
        };
        const cloned = deepCloneWithTypes(original);

        expect(cloned.date).toBeInstanceOf(Date);
        expect(cloned.date.getTime()).toBe(original.date.getTime());
        expect(cloned.set).toBeInstanceOf(Set);
        expect(cloned.set.has(2)).toBe(true);
      });
    });
  });

  describe('Binary Serialization', () => {
    describe('encodeBinary / decodeBinary', () => {
      it('should encode and decode null', () => {
        const encoded = encodeBinary(null);
        expect(decodeBinary(encoded)).toBe(null);
      });

      it('should encode and decode undefined', () => {
        const encoded = encodeBinary(undefined);
        expect(decodeBinary(encoded)).toBe(undefined);
      });

      it('should encode and decode booleans', () => {
        expect(decodeBinary(encodeBinary(true))).toBe(true);
        expect(decodeBinary(encodeBinary(false))).toBe(false);
      });

      it('should encode and decode numbers', () => {
        expect(decodeBinary(encodeBinary(42))).toBe(42);
        expect(decodeBinary(encodeBinary(3.14159))).toBeCloseTo(3.14159);
        expect(decodeBinary(encodeBinary(-100))).toBe(-100);
      });

      it('should encode and decode strings', () => {
        expect(decodeBinary(encodeBinary('hello'))).toBe('hello');
        expect(decodeBinary(encodeBinary('你好'))).toBe('你好');
        expect(decodeBinary(encodeBinary(''))).toBe('');
      });

      it('should encode and decode dates', () => {
        const date = new Date('2024-01-15T12:00:00Z');
        const decoded = decodeBinary<Date>(encodeBinary(date));

        expect(decoded).toBeInstanceOf(Date);
        expect(decoded.getTime()).toBe(date.getTime());
      });

      it('should encode and decode arrays', () => {
        const original = [1, 'two', true, null];
        expect(decodeBinary(encodeBinary(original))).toEqual(original);
      });

      it('should encode and decode objects', () => {
        const original = { name: 'John', age: 30, active: true };
        expect(decodeBinary(encodeBinary(original))).toEqual(original);
      });

      it('should encode and decode nested structures', () => {
        const original = {
          users: [
            { name: 'Alice', scores: [100, 95, 88] },
            { name: 'Bob', scores: [92, 87, 91] },
          ],
          metadata: { version: 1, created: new Date('2024-01-01') },
        };
        const decoded = decodeBinary<typeof original>(encodeBinary(original));

        expect(decoded.users).toEqual(original.users);
        expect(decoded.metadata.version).toBe(1);
        expect(decoded.metadata.created.getTime()).toBe(
          original.metadata.created.getTime()
        );
      });

      it('should encode large numbers correctly', () => {
        // Our binary format uses 8 bytes per number for full float64 precision
        // This is a test for correctness, not size optimization
        const data = { values: Array.from({ length: 10 }, (_, i) => i * 1000000) };
        const decoded = decodeBinary<typeof data>(encodeBinary(data));

        expect(decoded.values).toEqual(data.values);
      });
    });
  });

  describe('Schema Validation', () => {
    describe('validateSchema', () => {
      it('should validate string type', () => {
        const schema: Schema = { type: 'string' };

        expect(validateSchema('hello', schema).valid).toBe(true);
        expect(validateSchema(123, schema).valid).toBe(false);
      });

      it('should validate number type', () => {
        const schema: Schema = { type: 'number' };

        expect(validateSchema(42, schema).valid).toBe(true);
        expect(validateSchema('42', schema).valid).toBe(false);
      });

      it('should validate boolean type', () => {
        const schema: Schema = { type: 'boolean' };

        expect(validateSchema(true, schema).valid).toBe(true);
        expect(validateSchema(1, schema).valid).toBe(false);
      });

      it('should validate null type', () => {
        const schema: Schema = { type: 'null' };

        expect(validateSchema(null, schema).valid).toBe(true);
        expect(validateSchema(undefined, schema).valid).toBe(false);
      });

      it('should validate array type', () => {
        const schema: Schema = { type: 'array' };

        expect(validateSchema([1, 2, 3], schema).valid).toBe(true);
        expect(validateSchema({}, schema).valid).toBe(false);
      });

      it('should validate object type', () => {
        const schema: Schema = { type: 'object' };

        expect(validateSchema({ a: 1 }, schema).valid).toBe(true);
        expect(validateSchema([1], schema).valid).toBe(false);
      });

      it('should validate multiple types', () => {
        const schema: Schema = { type: ['string', 'number'] };

        expect(validateSchema('hello', schema).valid).toBe(true);
        expect(validateSchema(42, schema).valid).toBe(true);
        expect(validateSchema(true, schema).valid).toBe(false);
      });

      it('should validate enum values', () => {
        const schema: Schema = { type: 'string', enum: ['red', 'green', 'blue'] };

        expect(validateSchema('red', schema).valid).toBe(true);
        expect(validateSchema('yellow', schema).valid).toBe(false);
      });

      it('should validate string pattern', () => {
        const schema: Schema = { type: 'string', pattern: '^[a-z]+$' };

        expect(validateSchema('hello', schema).valid).toBe(true);
        expect(validateSchema('Hello', schema).valid).toBe(false);
      });

      it('should validate string length', () => {
        const schema: Schema = { type: 'string', minLength: 2, maxLength: 5 };

        expect(validateSchema('abc', schema).valid).toBe(true);
        expect(validateSchema('a', schema).valid).toBe(false);
        expect(validateSchema('abcdef', schema).valid).toBe(false);
      });

      it('should validate number range', () => {
        const schema: Schema = { type: 'number', minimum: 0, maximum: 100 };

        expect(validateSchema(50, schema).valid).toBe(true);
        expect(validateSchema(-1, schema).valid).toBe(false);
        expect(validateSchema(101, schema).valid).toBe(false);
      });

      it('should validate array items', () => {
        const schema: Schema = {
          type: 'array',
          items: { type: 'number' },
        };

        expect(validateSchema([1, 2, 3], schema).valid).toBe(true);
        expect(validateSchema([1, 'two', 3], schema).valid).toBe(false);
      });

      it('should validate object properties', () => {
        const schema: Schema = {
          type: 'object',
          properties: {
            name: { type: 'string', required: true },
            age: { type: 'number' },
          },
        };

        expect(validateSchema({ name: 'John', age: 30 }, schema).valid).toBe(true);
        expect(validateSchema({ name: 'John' }, schema).valid).toBe(true);
        expect(validateSchema({ age: 30 }, schema).valid).toBe(false); // missing required
      });

      it('should collect all errors', () => {
        const schema: Schema = {
          type: 'object',
          properties: {
            name: { type: 'string', required: true, minLength: 2 },
            age: { type: 'number', minimum: 0 },
          },
        };

        const result = validateSchema({ name: 'A', age: -5 }, schema);

        expect(result.valid).toBe(false);
        expect(result.errors.length).toBe(2);
      });

      it('should validate any type', () => {
        const schema: Schema = { type: 'any' };

        expect(validateSchema('string', schema).valid).toBe(true);
        expect(validateSchema(123, schema).valid).toBe(true);
        expect(validateSchema(null, schema).valid).toBe(true);
      });
    });
  });

  describe('Compression', () => {
    describe('compressRLE / decompressRLE', () => {
      it('should compress repeated characters', () => {
        const input = 'aaaaaaaaaa';
        const compressed = compressRLE(input);

        expect(compressed.length).toBeLessThan(input.length);
        expect(decompressRLE(compressed)).toBe(input);
      });

      it('should not expand short runs', () => {
        const input = 'abc';
        const compressed = compressRLE(input);

        expect(compressed).toBe('abc');
      });

      it('should handle mixed content', () => {
        const input = 'aaabbbcccccc';
        const compressed = compressRLE(input);
        const decompressed = decompressRLE(compressed);

        expect(decompressed).toBe(input);
      });

      it('should handle empty string', () => {
        expect(compressRLE('')).toBe('');
        expect(decompressRLE('')).toBe('');
      });

      it('should handle single character', () => {
        expect(decompressRLE(compressRLE('a'))).toBe('a');
      });
    });
  });

  describe('Hash Functions', () => {
    describe('hashCode', () => {
      it('should return consistent hash for same string', () => {
        const str = 'hello world';

        expect(hashCode(str)).toBe(hashCode(str));
      });

      it('should return different hash for different strings', () => {
        expect(hashCode('hello')).not.toBe(hashCode('world'));
      });

      it('should return 0 for empty string', () => {
        expect(hashCode('')).toBe(0);
      });
    });

    describe('hashValue', () => {
      it('should hash any value', () => {
        expect(hashValue({ a: 1 })).toBe(hashValue({ a: 1 }));
        expect(hashValue([1, 2, 3])).toBe(hashValue([1, 2, 3]));
      });

      it('should return different hash for different values', () => {
        expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
      });
    });
  });

  describe('CSV Serialization', () => {
    describe('toCSV', () => {
      it('should convert array of objects to CSV', () => {
        const data = [
          { name: 'John', age: 30 },
          { name: 'Jane', age: 25 },
        ];

        const csv = toCSV(data);
        const lines = csv.split('\n');

        expect(lines[0]).toBe('name,age');
        expect(lines[1]).toBe('John,30');
        expect(lines[2]).toBe('Jane,25');
      });

      it('should escape values with delimiters', () => {
        const data = [{ name: 'John, Jr.', title: 'Developer' }];

        const csv = toCSV(data);

        expect(csv).toContain('"John, Jr."');
      });

      it('should escape values with quotes', () => {
        const data = [{ quote: 'He said "Hello"' }];

        const csv = toCSV(data);

        expect(csv).toContain('"He said ""Hello"""');
      });

      it('should use custom headers', () => {
        const data = [{ name: 'John', age: 30, city: 'NYC' }];

        const csv = toCSV(data, { headers: ['name', 'city'] });
        const lines = csv.split('\n');

        expect(lines[0]).toBe('name,city');
        expect(lines[1]).toBe('John,NYC');
      });

      it('should use custom delimiter', () => {
        const data = [{ a: 1, b: 2 }];

        const csv = toCSV(data, { delimiter: ';' });

        expect(csv).toBe('a;b\n1;2');
      });

      it('should handle empty array', () => {
        expect(toCSV([])).toBe('');
      });

      it('should handle null and undefined values', () => {
        const data = [{ a: null, b: undefined, c: 'value' }];

        const csv = toCSV(data);

        expect(csv).toContain('a,b,c');
        expect(csv).toContain(',,value');
      });
    });

    describe('fromCSV', () => {
      it('should parse CSV to array of objects', () => {
        const csv = 'name,age\nJohn,30\nJane,25';
        const result = fromCSV(csv);

        expect(result).toEqual([
          { name: 'John', age: '30' },
          { name: 'Jane', age: '25' },
        ]);
      });

      it('should handle quoted values', () => {
        const csv = 'name,description\nJohn,"Hello, World"';
        const result = fromCSV(csv);

        expect(result[0].description).toBe('Hello, World');
      });

      it('should handle escaped quotes', () => {
        const csv = 'quote\n"He said ""Hello"""';
        const result = fromCSV(csv);

        expect(result[0].quote).toBe('He said "Hello"');
      });

      it('should handle custom delimiter', () => {
        const csv = 'a;b\n1;2';
        const result = fromCSV(csv, { delimiter: ';' });

        expect(result).toEqual([{ a: '1', b: '2' }]);
      });

      it('should handle CSV without headers', () => {
        const csv = '1,2,3';
        const result = fromCSV(csv, { hasHeaders: false });

        expect(result).toEqual([{ column0: '1', column1: '2', column2: '3' }]);
      });

      it('should handle empty string', () => {
        expect(fromCSV('')).toEqual([]);
      });

      it('should handle missing values', () => {
        const csv = 'a,b,c\n1,,3';
        const result = fromCSV(csv);

        expect(result[0]).toEqual({ a: '1', b: '', c: '3' });
      });
    });

    describe('round-trip CSV', () => {
      it('should preserve data through round-trip', () => {
        const original = [
          { name: 'Alice', score: '100' },
          { name: 'Bob', score: '95' },
        ];

        const csv = toCSV(original);
        const restored = fromCSV(csv);

        expect(restored).toEqual(original);
      });
    });
  });
});

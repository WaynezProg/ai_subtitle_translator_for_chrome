/**
 * Tests for Error Handling Utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  // Custom error classes
  AppError,
  NetworkError,
  TranslationError,
  ValidationError,
  AuthError,
  StorageError,
  TimeoutError,
  ParseError,
  // Error categorization
  categorizeError,
  isRecoverableError,
  // Error normalization
  normalizeError,
  toAppError,
  // Error serialization
  serializeError,
  deserializeError,
  // Error wrapping
  wrapError,
  createErrorChain,
  // Safe execution
  ok,
  err,
  trySafe,
  trySafeAsync,
  unwrap,
  unwrapOr,
  mapResult,
  mapError,
  // Error aggregation
  aggregateResults,
  collectResults,
  // Error assertion
  assert,
  assertDefined,
  assertNever,
  // Error formatting
  formatErrorForUser,
  formatErrorForLog,
  formatStack,
  // Error handlers
  createErrorHandler,
  createUnhandledRejectionHandler,
} from '@shared/utils/error-utils';

describe('Error Utils', () => {
  describe('AppError', () => {
    it('should create an error with default values', () => {
      const error = new AppError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.name).toBe('AppError');
      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.context).toEqual({});
      expect(error.timestamp).toBeGreaterThan(0);
      expect(error.recoverable).toBe(true);
    });

    it('should create an error with custom values', () => {
      const cause = new Error('Original error');
      const error = new AppError('Test error', {
        code: 'CUSTOM_ERROR',
        context: { userId: '123' },
        recoverable: false,
        cause,
      });

      expect(error.code).toBe('CUSTOM_ERROR');
      expect(error.context).toEqual({ userId: '123' });
      expect(error.recoverable).toBe(false);
      expect(error.cause).toBe(cause);
    });

    it('should serialize to JSON', () => {
      const error = new AppError('Test error', {
        code: 'TEST_CODE',
        context: { key: 'value' },
      });

      const json = error.toJSON();

      expect(json.name).toBe('AppError');
      expect(json.message).toBe('Test error');
      expect(json.code).toBe('TEST_CODE');
      expect(json.context).toEqual({ key: 'value' });
      expect(json.timestamp).toBeGreaterThan(0);
    });

    it('should serialize cause error message', () => {
      const cause = new Error('Cause message');
      const error = new AppError('Test error', { cause });

      const json = error.toJSON();
      expect(json.cause).toBe('Cause message');
    });
  });

  describe('NetworkError', () => {
    it('should create a network error with status code', () => {
      const error = new NetworkError('Request failed', {
        statusCode: 500,
        url: 'https://api.example.com',
      });

      expect(error.name).toBe('NetworkError');
      expect(error.statusCode).toBe(500);
      expect(error.url).toBe('https://api.example.com');
      expect(error.code).toBe('SERVER_ERROR');
      expect(error.recoverable).toBe(true);
    });

    it('should set correct code for 429', () => {
      const error = new NetworkError('Rate limited', { statusCode: 429 });
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.recoverable).toBe(true);
    });

    it('should set correct code for 404', () => {
      const error = new NetworkError('Not found', { statusCode: 404 });
      expect(error.code).toBe('NOT_FOUND');
      expect(error.recoverable).toBe(false);
    });

    it('should set correct code for 401', () => {
      const error = new NetworkError('Unauthorized', { statusCode: 401 });
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.recoverable).toBe(false);
    });

    it('should set correct code for 403', () => {
      const error = new NetworkError('Forbidden', { statusCode: 403 });
      expect(error.code).toBe('FORBIDDEN');
      expect(error.recoverable).toBe(false);
    });
  });

  describe('TranslationError', () => {
    it('should create a translation error', () => {
      const error = new TranslationError('Translation failed', {
        provider: 'openai',
        targetLanguage: 'es',
      });

      expect(error.name).toBe('TranslationError');
      expect(error.provider).toBe('openai');
      expect(error.targetLanguage).toBe('es');
      expect(error.code).toBe('TRANSLATION_ERROR');
    });

    it('should allow custom code', () => {
      const error = new TranslationError('API quota exceeded', {
        code: 'QUOTA_EXCEEDED',
      });

      expect(error.code).toBe('QUOTA_EXCEEDED');
    });
  });

  describe('ValidationError', () => {
    it('should create a validation error', () => {
      const error = new ValidationError('Invalid email', {
        field: 'email',
        value: 'invalid',
      });

      expect(error.name).toBe('ValidationError');
      expect(error.field).toBe('email');
      expect(error.value).toBe('invalid');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.recoverable).toBe(false);
    });
  });

  describe('AuthError', () => {
    it('should create an auth error', () => {
      const error = new AuthError('Token expired');

      expect(error.name).toBe('AuthError');
      expect(error.code).toBe('AUTH_ERROR');
      expect(error.recoverable).toBe(false);
    });

    it('should allow custom code', () => {
      const error = new AuthError('Invalid token', { code: 'INVALID_TOKEN' });
      expect(error.code).toBe('INVALID_TOKEN');
    });
  });

  describe('StorageError', () => {
    it('should create a storage error', () => {
      const error = new StorageError('Failed to save', {
        operation: 'set',
        key: 'settings',
      });

      expect(error.name).toBe('StorageError');
      expect(error.operation).toBe('set');
      expect(error.key).toBe('settings');
      expect(error.code).toBe('STORAGE_ERROR');
    });
  });

  describe('TimeoutError', () => {
    it('should create a timeout error', () => {
      const error = new TimeoutError('Request timed out', { timeoutMs: 5000 });

      expect(error.name).toBe('TimeoutError');
      expect(error.timeoutMs).toBe(5000);
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.recoverable).toBe(true);
    });
  });

  describe('ParseError', () => {
    it('should create a parse error', () => {
      const error = new ParseError('Invalid JSON', {
        format: 'json',
        position: 42,
      });

      expect(error.name).toBe('ParseError');
      expect(error.format).toBe('json');
      expect(error.position).toBe(42);
      expect(error.code).toBe('PARSE_ERROR');
      expect(error.recoverable).toBe(false);
    });
  });

  describe('categorizeError', () => {
    it('should categorize custom error types', () => {
      expect(categorizeError(new NetworkError('test'))).toBe('network');
      expect(categorizeError(new TranslationError('test'))).toBe('translation');
      expect(categorizeError(new ValidationError('test'))).toBe('validation');
      expect(categorizeError(new AuthError('test'))).toBe('auth');
      expect(categorizeError(new StorageError('test'))).toBe('storage');
      expect(categorizeError(new TimeoutError('test', { timeoutMs: 1000 }))).toBe('timeout');
      expect(categorizeError(new ParseError('test'))).toBe('parse');
    });

    it('should categorize by message for generic errors', () => {
      expect(categorizeError(new Error('network connection failed'))).toBe('network');
      expect(categorizeError(new Error('fetch error'))).toBe('network');
      expect(categorizeError(new Error('request timed out'))).toBe('timeout');
      expect(categorizeError(new Error('unauthorized access'))).toBe('auth');
      expect(categorizeError(new Error('parse error'))).toBe('parse');
      expect(categorizeError(new Error('syntax error'))).toBe('parse');
    });

    it('should return unknown for unrecognized errors', () => {
      expect(categorizeError(new Error('something happened'))).toBe('unknown');
      expect(categorizeError('string error')).toBe('unknown');
      expect(categorizeError(null)).toBe('unknown');
    });
  });

  describe('isRecoverableError', () => {
    it('should use recoverable property for AppError', () => {
      expect(isRecoverableError(new AppError('test', { recoverable: true }))).toBe(true);
      expect(isRecoverableError(new AppError('test', { recoverable: false }))).toBe(false);
    });

    it('should determine recoverability by category', () => {
      expect(isRecoverableError(new Error('network failed'))).toBe(true);
      expect(isRecoverableError(new Error('timeout'))).toBe(true);
      expect(isRecoverableError(new Error('random error'))).toBe(false);
    });
  });

  describe('normalizeError', () => {
    it('should return Error as-is', () => {
      const error = new Error('test');
      expect(normalizeError(error)).toBe(error);
    });

    it('should convert string to Error', () => {
      const result = normalizeError('string error');
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('string error');
    });

    it('should convert object with message to Error', () => {
      const result = normalizeError({ message: 'object error' });
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('object error');
    });

    it('should convert object without message to JSON Error', () => {
      const result = normalizeError({ code: 123 });
      expect(result).toBeInstanceOf(Error);
      expect(result.message).toBe('{"code":123}');
    });

    it('should convert primitives to Error', () => {
      expect(normalizeError(42).message).toBe('42');
      expect(normalizeError(null).message).toBe('null');
      expect(normalizeError(undefined).message).toBe('undefined');
    });
  });

  describe('toAppError', () => {
    it('should return AppError as-is', () => {
      const error = new AppError('test');
      expect(toAppError(error)).toBe(error);
    });

    it('should convert Error to AppError', () => {
      const error = new Error('test');
      const result = toAppError(error);

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('test');
      expect(result.cause).toBe(error);
    });

    it('should convert string to AppError', () => {
      const result = toAppError('string error');
      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('string error');
    });
  });

  describe('serializeError', () => {
    it('should serialize AppError', () => {
      const error = new AppError('test', {
        code: 'TEST',
        context: { key: 'value' },
      });

      const serialized = serializeError(error);

      expect(serialized.name).toBe('AppError');
      expect(serialized.message).toBe('test');
      expect(serialized.code).toBe('TEST');
      expect(serialized.context).toEqual({ key: 'value' });
    });

    it('should serialize generic Error', () => {
      const error = new Error('generic error');
      const serialized = serializeError(error);

      expect(serialized.name).toBe('Error');
      expect(serialized.message).toBe('generic error');
      expect(serialized.stack).toBeDefined();
    });

    it('should serialize error cause', () => {
      const cause = new Error('cause');
      const error = new Error('main');
      error.cause = cause;

      const serialized = serializeError(error);
      expect(serialized.cause).toBeDefined();
    });
  });

  describe('deserializeError', () => {
    it('should deserialize to AppError', () => {
      const data = {
        name: 'AppError',
        message: 'test',
        code: 'TEST',
        context: { key: 'value' },
        recoverable: false,
        stack: 'Error: test\n    at test.js:1',
      };

      const error = deserializeError(data);

      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('test');
      expect(error.code).toBe('TEST');
      expect(error.context).toEqual({ key: 'value' });
      expect(error.stack).toBe('Error: test\n    at test.js:1');
    });
  });

  describe('wrapError', () => {
    it('should wrap an error with additional message', () => {
      const original = new Error('original');
      const wrapped = wrapError(original, 'wrapped message', { extra: 'context' });

      expect(wrapped.message).toBe('wrapped message');
      expect(wrapped.cause).toBe(original);
      expect(wrapped.context).toEqual({ extra: 'context' });
    });
  });

  describe('createErrorChain', () => {
    it('should return AppError for empty array', () => {
      const result = createErrorChain([]);
      expect(result.message).toBe('No errors');
    });

    it('should return single error as AppError', () => {
      const error = new Error('single');
      const result = createErrorChain([error]);

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('single');
    });

    it('should combine multiple errors', () => {
      const errors = [new Error('first'), new Error('second'), new Error('third')];
      const result = createErrorChain(errors);

      expect(result.code).toBe('MULTIPLE_ERRORS');
      expect(result.message).toBe('Multiple errors: first; second; third');
      expect(result.context.errors).toHaveLength(3);
    });
  });

  describe('Result type helpers', () => {
    describe('ok', () => {
      it('should create a success result', () => {
        const result = ok(42);
        expect(result.ok).toBe(true);
        expect(result.value).toBe(42);
      });
    });

    describe('err', () => {
      it('should create a failure result', () => {
        const error = new Error('test');
        const result = err(error);
        expect(result.ok).toBe(false);
        expect(result.error).toBe(error);
      });
    });
  });

  describe('trySafe', () => {
    it('should return success for successful function', () => {
      const result = trySafe(() => 42);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it('should return failure for throwing function', () => {
      const result = trySafe(() => {
        throw new Error('test');
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('test');
      }
    });
  });

  describe('trySafeAsync', () => {
    it('should return success for successful async function', async () => {
      const result = await trySafeAsync(async () => 42);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(42);
      }
    });

    it('should return failure for rejecting async function', async () => {
      const result = await trySafeAsync(async () => {
        throw new Error('async error');
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe('async error');
      }
    });
  });

  describe('unwrap', () => {
    it('should return value for success result', () => {
      const result = ok(42);
      expect(unwrap(result)).toBe(42);
    });

    it('should throw for failure result', () => {
      const result = err(new Error('test'));
      expect(() => unwrap(result)).toThrow('test');
    });
  });

  describe('unwrapOr', () => {
    it('should return value for success result', () => {
      const result = ok(42);
      expect(unwrapOr(result, 0)).toBe(42);
    });

    it('should return default for failure result', () => {
      const result = err(new Error('test'));
      expect(unwrapOr(result, 0)).toBe(0);
    });
  });

  describe('mapResult', () => {
    it('should map success value', () => {
      const result = ok(5);
      const mapped = mapResult(result, (x) => x * 2);

      expect(mapped.ok).toBe(true);
      if (mapped.ok) {
        expect(mapped.value).toBe(10);
      }
    });

    it('should pass through failure', () => {
      const error = new Error('test');
      const result = err(error);
      const mapped = mapResult(result, (x) => x * 2);

      expect(mapped.ok).toBe(false);
      if (!mapped.ok) {
        expect(mapped.error).toBe(error);
      }
    });
  });

  describe('mapError', () => {
    it('should pass through success', () => {
      const result = ok(42);
      const mapped = mapError(result, (e) => new Error('mapped'));

      expect(mapped.ok).toBe(true);
      if (mapped.ok) {
        expect(mapped.value).toBe(42);
      }
    });

    it('should map failure error', () => {
      const result = err(new Error('original'));
      const mapped = mapError(result, (e) => new Error('mapped: ' + e.message));

      expect(mapped.ok).toBe(false);
      if (!mapped.ok) {
        expect(mapped.error.message).toBe('mapped: original');
      }
    });
  });

  describe('aggregateResults', () => {
    it('should collect all values when all succeed', () => {
      const results = [ok(1), ok(2), ok(3)];
      const aggregated = aggregateResults(results);

      expect(aggregated.ok).toBe(true);
      if (aggregated.ok) {
        expect(aggregated.value).toEqual([1, 2, 3]);
      }
    });

    it('should collect all errors when some fail', () => {
      const results = [ok(1), err(new Error('e1')), ok(3), err(new Error('e2'))];
      const aggregated = aggregateResults(results);

      expect(aggregated.ok).toBe(false);
      if (!aggregated.ok) {
        expect(aggregated.error).toHaveLength(2);
        expect(aggregated.error[0].message).toBe('e1');
        expect(aggregated.error[1].message).toBe('e2');
      }
    });
  });

  describe('collectResults', () => {
    it('should collect all values when all succeed', () => {
      const results = [ok(1), ok(2), ok(3)];
      const collected = collectResults(results);

      expect(collected.ok).toBe(true);
      if (collected.ok) {
        expect(collected.value).toEqual([1, 2, 3]);
      }
    });

    it('should return first error when one fails', () => {
      const results = [ok(1), err(new Error('first')), err(new Error('second'))];
      const collected = collectResults(results);

      expect(collected.ok).toBe(false);
      if (!collected.ok) {
        expect(collected.error.message).toBe('first');
      }
    });
  });

  describe('assert', () => {
    it('should not throw for truthy condition', () => {
      expect(() => assert(true, 'should not throw')).not.toThrow();
      expect(() => assert(1, 'should not throw')).not.toThrow();
      expect(() => assert('test', 'should not throw')).not.toThrow();
    });

    it('should throw for falsy condition', () => {
      expect(() => assert(false, 'assertion failed')).toThrow('assertion failed');
      expect(() => assert(0, 'assertion failed')).toThrow('assertion failed');
      expect(() => assert('', 'assertion failed')).toThrow('assertion failed');
      expect(() => assert(null, 'assertion failed')).toThrow('assertion failed');
    });

    it('should throw AppError with ASSERTION_ERROR code', () => {
      try {
        assert(false, 'test');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('ASSERTION_ERROR');
        expect((error as AppError).recoverable).toBe(false);
      }
    });
  });

  describe('assertDefined', () => {
    it('should not throw for defined values', () => {
      expect(() => assertDefined(0, 'should not throw')).not.toThrow();
      expect(() => assertDefined('', 'should not throw')).not.toThrow();
      expect(() => assertDefined(false, 'should not throw')).not.toThrow();
      expect(() => assertDefined({}, 'should not throw')).not.toThrow();
    });

    it('should throw for null or undefined', () => {
      expect(() => assertDefined(null, 'is null')).toThrow('is null');
      expect(() => assertDefined(undefined, 'is undefined')).toThrow('is undefined');
    });
  });

  describe('assertNever', () => {
    it('should always throw', () => {
      expect(() => assertNever('test' as never)).toThrow('Unexpected value: test');
    });

    it('should use custom message if provided', () => {
      expect(() => assertNever('test' as never, 'Custom message')).toThrow('Custom message');
    });
  });

  describe('formatErrorForUser', () => {
    it('should format network errors', () => {
      const result = formatErrorForUser(new NetworkError('Connection failed'));
      expect(result).toContain('internet connection');
    });

    it('should format timeout errors', () => {
      const result = formatErrorForUser(new TimeoutError('Timed out', { timeoutMs: 1000 }));
      expect(result).toContain('too long');
    });

    it('should format auth errors', () => {
      const result = formatErrorForUser(new AuthError('Unauthorized'));
      expect(result).toContain('sign in');
    });

    it('should format validation errors with message', () => {
      const result = formatErrorForUser(new ValidationError('Email is invalid'));
      expect(result).toBe('Email is invalid');
    });

    it('should format translation errors', () => {
      const result = formatErrorForUser(new TranslationError('API failed'));
      expect(result).toContain('Translation failed');
    });

    it('should format storage errors', () => {
      const result = formatErrorForUser(new StorageError('Write failed'));
      expect(result).toContain('save data');
    });

    it('should format parse errors', () => {
      const result = formatErrorForUser(new ParseError('Invalid JSON'));
      expect(result).toContain('process');
    });

    it('should format unknown errors', () => {
      const result = formatErrorForUser(new Error('Random error'));
      expect(result).toContain('unexpected error');
    });
  });

  describe('formatErrorForLog', () => {
    it('should format with name and message', () => {
      const result = formatErrorForLog(new Error('test message'));
      expect(result).toContain('[Error]');
      expect(result).toContain('test message');
    });

    it('should include code for AppError', () => {
      const result = formatErrorForLog(new AppError('test', { code: 'TEST_CODE' }));
      expect(result).toContain('(TEST_CODE)');
    });

    it('should include context', () => {
      const result = formatErrorForLog(
        new AppError('test', { context: { userId: '123' } })
      );
      expect(result).toContain('context:');
      expect(result).toContain('userId');
    });
  });

  describe('formatStack', () => {
    it('should extract stack trace lines', () => {
      const error = new Error('test');
      const lines = formatStack(error);

      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]).toMatch(/^at /);
    });

    it('should return empty array for error without stack', () => {
      const error = new Error('test');
      error.stack = undefined;

      const lines = formatStack(error);
      expect(lines).toEqual([]);
    });
  });

  describe('createErrorHandler', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should log error with name prefix', () => {
      const handler = createErrorHandler('TestHandler');
      handler(new Error('test error'));

      expect(console.error).toHaveBeenCalledWith(
        '[TestHandler]',
        expect.stringContaining('test error')
      );
    });

    it('should call custom error callback', () => {
      const callback = vi.fn();
      const handler = createErrorHandler('Test', callback);
      const error = new Error('test');

      handler(error);

      expect(callback).toHaveBeenCalledWith(error);
    });
  });

  describe('createUnhandledRejectionHandler', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should log unhandled rejection', () => {
      const handler = createUnhandledRejectionHandler();
      const event = { reason: new Error('unhandled') } as PromiseRejectionEvent;

      handler(event);

      expect(console.error).toHaveBeenCalledWith(
        '[UnhandledRejection]',
        expect.stringContaining('unhandled')
      );
    });

    it('should call custom error callback', () => {
      const callback = vi.fn();
      const handler = createUnhandledRejectionHandler(callback);
      const error = new Error('test');
      const event = { reason: error } as PromiseRejectionEvent;

      handler(event);

      expect(callback).toHaveBeenCalledWith(error);
    });
  });
});

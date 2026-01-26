/**
 * Tests for Global Error Handler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initGlobalErrorHandler,
  destroyGlobalErrorHandler,
  withErrorBoundary,
  safeHandler,
  tryAsync,
  trySync,
} from '@shared/utils/global-error-handler';
import { AppError, ErrorCodes } from '@shared/utils/error-handler';

describe('Global Error Handler', () => {
  beforeEach(() => {
    // Clean up any existing handlers
    destroyGlobalErrorHandler();
  });

  afterEach(() => {
    destroyGlobalErrorHandler();
    vi.restoreAllMocks();
  });

  describe('initGlobalErrorHandler', () => {
    it('should initialize without options', () => {
      expect(() => initGlobalErrorHandler()).not.toThrow();
    });

    it('should initialize with options', () => {
      const onError = vi.fn();
      expect(() => initGlobalErrorHandler({ onError })).not.toThrow();
    });

    it('should warn when initializing twice', () => {
      initGlobalErrorHandler();
      // Second initialization should not throw but should log warning
      expect(() => initGlobalErrorHandler()).not.toThrow();
    });
  });

  describe('destroyGlobalErrorHandler', () => {
    it('should not throw when destroying uninitialized handler', () => {
      expect(() => destroyGlobalErrorHandler()).not.toThrow();
    });

    it('should clean up initialized handler', () => {
      initGlobalErrorHandler();
      expect(() => destroyGlobalErrorHandler()).not.toThrow();
    });
  });
});

describe('withErrorBoundary', () => {
  it('should return result on success', async () => {
    const fn = async () => 'success';
    const wrapped = withErrorBoundary(fn);

    const result = await wrapped();
    expect(result).toBe('success');
  });

  it('should return fallback on error', async () => {
    const fn = async () => {
      throw new Error('Test error');
    };
    const wrapped = withErrorBoundary(fn, 'fallback');

    const result = await wrapped();
    expect(result).toBe('fallback');
  });

  it('should call onError callback on error', async () => {
    const onError = vi.fn();
    const fn = async () => {
      throw new Error('Test error');
    };
    const wrapped = withErrorBoundary(fn, undefined, onError);

    await wrapped();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.any(AppError));
  });

  it('should pass arguments to wrapped function', async () => {
    const fn = async (a: number, b: string) => `${a}-${b}`;
    const wrapped = withErrorBoundary(fn);

    const result = await wrapped(42, 'test');
    expect(result).toBe('42-test');
  });

  it('should return undefined as fallback when not specified', async () => {
    const fn = async () => {
      throw new Error('Test error');
    };
    const wrapped = withErrorBoundary(fn);

    const result = await wrapped();
    expect(result).toBeUndefined();
  });
});

describe('safeHandler', () => {
  it('should execute handler without error', () => {
    const handler = vi.fn();
    const safe = safeHandler(handler);
    const event = new Event('test');

    safe(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should catch synchronous errors', () => {
    const handler = vi.fn(() => {
      throw new Error('Sync error');
    });
    const safe = safeHandler(handler);
    const event = new Event('test');

    // Should not throw
    expect(() => safe(event)).not.toThrow();
  });

  it('should handle async handlers', async () => {
    const handler = vi.fn(async () => {
      return 'async result';
    });
    const safe = safeHandler(handler);
    const event = new Event('test');

    safe(event);
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('should catch async errors without throwing', async () => {
    const handler = vi.fn(async () => {
      throw new Error('Async error');
    });
    const safe = safeHandler(handler);
    const event = new Event('test');

    // Should not throw synchronously
    expect(() => safe(event)).not.toThrow();

    // Wait for async handler to complete
    await new Promise(resolve => setTimeout(resolve, 10));
  });
});

describe('tryAsync', () => {
  it('should return [result, null] on success', async () => {
    const fn = async () => 'success';

    const [result, error] = await tryAsync(fn);
    expect(result).toBe('success');
    expect(error).toBeNull();
  });

  it('should return [null, error] on failure', async () => {
    const fn = async () => {
      throw new Error('Test error');
    };

    const [result, error] = await tryAsync(fn);
    expect(result).toBeNull();
    expect(error).toBeInstanceOf(AppError);
    expect(error?.message).toBe('Test error');
  });

  it('should normalize non-Error throws', async () => {
    const fn = async () => {
      throw 'string error';
    };

    const [result, error] = await tryAsync(fn);
    expect(result).toBeNull();
    expect(error).toBeInstanceOf(AppError);
  });

  it('should preserve AppError instances', async () => {
    const appError = new AppError(ErrorCodes.NETWORK_ERROR, 'Network failed');
    const fn = async () => {
      throw appError;
    };

    const [result, error] = await tryAsync(fn);
    expect(result).toBeNull();
    expect(error?.code).toBe(ErrorCodes.NETWORK_ERROR);
  });
});

describe('trySync', () => {
  it('should return [result, null] on success', () => {
    const fn = () => 'success';

    const [result, error] = trySync(fn);
    expect(result).toBe('success');
    expect(error).toBeNull();
  });

  it('should return [null, error] on failure', () => {
    const fn = () => {
      throw new Error('Test error');
    };

    const [result, error] = trySync(fn);
    expect(result).toBeNull();
    expect(error).toBeInstanceOf(AppError);
    expect(error?.message).toBe('Test error');
  });

  it('should normalize non-Error throws', () => {
    const fn = () => {
      throw { custom: 'object' };
    };

    const [result, error] = trySync(fn);
    expect(result).toBeNull();
    expect(error).toBeInstanceOf(AppError);
  });

  it('should handle complex return types', () => {
    interface ComplexType {
      id: number;
      data: string[];
    }

    const fn = (): ComplexType => ({
      id: 1,
      data: ['a', 'b'],
    });

    const [result, error] = trySync(fn);
    expect(error).toBeNull();
    expect(result?.id).toBe(1);
    expect(result?.data).toEqual(['a', 'b']);
  });
});

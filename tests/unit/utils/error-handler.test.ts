/**
 * Error Handler Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AppError,
  ErrorCodes,
  classifyError,
  normalizeError,
  createNetworkError,
  createAuthError,
  createProviderError,
  createPlatformError,
  calculateRetryDelay,
  withRetry,
  getRecoverySuggestions,
  RetryStrategies,
} from '../../../src/shared/utils/error-handler';

describe('AppError', () => {
  it('should create an error with all properties', () => {
    const error = new AppError('TEST_ERROR', 'Test message', {
      category: 'network',
      severity: 'high',
      userMessage: 'User-friendly message',
      retryable: true,
      context: { key: 'value' },
    });

    expect(error.code).toBe('TEST_ERROR');
    expect(error.message).toBe('Test message');
    expect(error.category).toBe('network');
    expect(error.severity).toBe('high');
    expect(error.userMessage).toBe('User-friendly message');
    expect(error.retryable).toBe(true);
    expect(error.context).toEqual({ key: 'value' });
    expect(error.timestamp).toBeDefined();
  });

  it('should use default values when options not provided', () => {
    const error = new AppError('TEST_ERROR', 'Test message');

    expect(error.category).toBe('unknown');
    expect(error.severity).toBe('medium');
    expect(error.retryable).toBe(false);
    expect(error.context).toEqual({});
  });

  it('should convert to ErrorInfo', () => {
    const cause = new Error('Original error');
    const error = new AppError('TEST_ERROR', 'Test message', {
      category: 'provider',
      cause,
    });

    const info = error.toInfo();

    expect(info.code).toBe('TEST_ERROR');
    expect(info.message).toBe('Test message');
    expect(info.category).toBe('provider');
    expect(info.originalError).toBe(cause);
  });

  it('should get default user message from error code', () => {
    const error = new AppError(ErrorCodes.NETWORK_OFFLINE, 'Technical message');

    expect(error.userMessage).toBe('No internet connection. Please check your network and try again.');
  });
});

describe('classifyError', () => {
  it('should classify AppError correctly', () => {
    const error = new AppError('TEST', 'test', {
      category: 'auth',
      severity: 'high',
      retryable: false,
    });

    const result = classifyError(error);

    expect(result.category).toBe('auth');
    expect(result.severity).toBe('high');
    expect(result.retryable).toBe(false);
  });

  it('should classify network errors', () => {
    const error = new Error('Network connection failed');
    const result = classifyError(error);

    expect(result.category).toBe('network');
    expect(result.retryable).toBe(true);
  });

  it('should classify auth errors', () => {
    const error = new Error('401 Unauthorized');
    const result = classifyError(error);

    expect(result.category).toBe('auth');
    expect(result.retryable).toBe(false);
  });

  it('should classify rate limit errors', () => {
    const error = new Error('Rate limit exceeded');
    const result = classifyError(error);

    expect(result.category).toBe('provider');
    expect(result.retryable).toBe(true);
  });

  it('should classify parse errors', () => {
    const error = new Error('Invalid format');
    const result = classifyError(error);

    expect(result.category).toBe('parse');
    expect(result.retryable).toBe(false);
  });

  it('should classify unknown errors', () => {
    const error = new Error('Some random error');
    const result = classifyError(error);

    expect(result.category).toBe('unknown');
  });

  it('should handle non-Error types', () => {
    const result = classifyError('string error');

    expect(result.category).toBe('unknown');
    expect(result.retryable).toBe(false);
  });
});

describe('normalizeError', () => {
  it('should return AppError unchanged', () => {
    const original = new AppError('TEST', 'test');
    const normalized = normalizeError(original);

    expect(normalized).toBe(original);
  });

  it('should convert Error to AppError', () => {
    const original = new Error('Test error');
    const normalized = normalizeError(original, ErrorCodes.NETWORK_ERROR);

    expect(normalized).toBeInstanceOf(AppError);
    expect(normalized.code).toBe(ErrorCodes.NETWORK_ERROR);
    expect(normalized.message).toBe('Test error');
  });

  it('should convert string to AppError', () => {
    const normalized = normalizeError('String error');

    expect(normalized).toBeInstanceOf(AppError);
    expect(normalized.message).toBe('String error');
  });
});

describe('Error factory functions', () => {
  describe('createNetworkError', () => {
    it('should create a network error', () => {
      const error = createNetworkError('Connection failed');

      expect(error.category).toBe('network');
      expect(error.retryable).toBe(true);
      expect(error.retryStrategy).toBeDefined();
    });
  });

  describe('createAuthError', () => {
    it('should create an auth error', () => {
      const error = createAuthError(ErrorCodes.AUTH_TOKEN_EXPIRED, 'Token expired');

      expect(error.category).toBe('auth');
      expect(error.severity).toBe('high');
      expect(error.retryable).toBe(false);
    });
  });

  describe('createProviderError', () => {
    it('should create a provider error', () => {
      const error = createProviderError(ErrorCodes.PROVIDER_UNAVAILABLE, 'Service down', {
        retryable: true,
        context: { provider: 'claude-api' },
      });

      expect(error.category).toBe('provider');
      expect(error.retryable).toBe(true);
      expect(error.context).toEqual({ provider: 'claude-api' });
    });
  });

  describe('createPlatformError', () => {
    it('should create a platform error', () => {
      const error = createPlatformError(ErrorCodes.PLATFORM_VIDEO_NOT_FOUND, 'No video', {
        platform: 'youtube',
      });

      expect(error.category).toBe('platform');
      expect(error.context).toEqual({ platform: 'youtube' });
    });
  });
});

describe('calculateRetryDelay', () => {
  it('should calculate base delay for first attempt', () => {
    const strategy = { ...RetryStrategies.network, baseDelayMs: 1000, backoffMultiplier: 2 };

    // First attempt should be close to base delay (with jitter)
    const delay = calculateRetryDelay(1, strategy);

    expect(delay).toBeGreaterThanOrEqual(900); // 1000 - 10%
    expect(delay).toBeLessThanOrEqual(1100); // 1000 + 10%
  });

  it('should apply exponential backoff', () => {
    const strategy = { ...RetryStrategies.network, baseDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 100000 };

    const delay1 = calculateRetryDelay(1, strategy);
    const delay2 = calculateRetryDelay(2, strategy);
    const delay3 = calculateRetryDelay(3, strategy);

    // Delays should roughly double (allowing for jitter)
    expect(delay2).toBeGreaterThan(delay1 * 1.5);
    expect(delay3).toBeGreaterThan(delay2 * 1.5);
  });

  it('should respect max delay', () => {
    const strategy = { ...RetryStrategies.network, baseDelayMs: 1000, backoffMultiplier: 10, maxDelayMs: 5000 };

    const delay = calculateRetryDelay(5, strategy);

    expect(delay).toBeLessThanOrEqual(5000 * 1.1); // Max + jitter
  });
});

describe('withRetry', () => {
  it('should succeed on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn, RetryStrategies.network);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, { ...RetryStrategies.network, baseDelayMs: 10 });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Network error'));

    await expect(
      withRetry(fn, { ...RetryStrategies.network, maxAttempts: 2, baseDelayMs: 10 })
    ).rejects.toThrow('Network error');

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('401 Unauthorized'));

    await expect(withRetry(fn, { ...RetryStrategies.network, baseDelayMs: 10 })).rejects.toThrow(
      '401 Unauthorized'
    );

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should call onRetry callback', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce('success');

    const onRetry = vi.fn();

    await withRetry(fn, { ...RetryStrategies.network, baseDelayMs: 10 }, onRetry);

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
  });
});

describe('getRecoverySuggestions', () => {
  it('should provide network error suggestions', () => {
    const error = new AppError('TEST', 'test', { category: 'network' });

    const suggestions = getRecoverySuggestions(error);

    expect(suggestions).toContain('Check your internet connection');
  });

  it('should provide auth error suggestions', () => {
    const error = new AppError('TEST', 'test', { category: 'auth' });

    const suggestions = getRecoverySuggestions(error);

    expect(suggestions).toContain('Verify your API key in settings');
  });

  it('should provide provider error suggestions', () => {
    const error = new AppError('TEST', 'test', { category: 'provider' });

    const suggestions = getRecoverySuggestions(error);

    expect(suggestions).toContain('Try a different translation provider');
  });

  it('should provide platform error suggestions', () => {
    const error = new AppError('TEST', 'test', { category: 'platform' });

    const suggestions = getRecoverySuggestions(error);

    expect(suggestions).toContain('Refresh the page');
  });

  it('should provide cache error suggestions', () => {
    const error = new AppError('TEST', 'test', { category: 'cache' });

    const suggestions = getRecoverySuggestions(error);

    expect(suggestions).toContain('Clear the translation cache');
  });

  it('should provide default suggestions for unknown errors', () => {
    const error = new AppError('TEST', 'test', { category: 'unknown' });

    const suggestions = getRecoverySuggestions(error);

    expect(suggestions.length).toBeGreaterThan(0);
  });
});

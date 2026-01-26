/**
 * Tests for Rate Limiter Utility
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  RateLimiter,
  RateLimitError,
  getRateLimiter,
  clearRateLimiters,
  withRateLimit,
  rateLimited,
  ProviderRateLimits,
} from '@shared/utils/rate-limiter';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 1000,
      minDelayMs: 0,
      queueExcess: true,
    });
  });

  describe('canRequest', () => {
    it('should return true when tokens available', () => {
      expect(limiter.canRequest()).toBe(true);
    });

    it('should return false after exhausting tokens', () => {
      // Exhaust all tokens
      for (let i = 0; i < 5; i++) {
        limiter.acquire();
      }
      expect(limiter.canRequest()).toBe(false);
    });
  });

  describe('acquire', () => {
    it('should acquire tokens successfully', () => {
      expect(limiter.acquire()).toBe(true);
      expect(limiter.acquire()).toBe(true);
    });

    it('should fail when no tokens available', () => {
      // Exhaust all tokens
      for (let i = 0; i < 5; i++) {
        limiter.acquire();
      }
      expect(limiter.acquire()).toBe(false);
    });

    it('should track request timestamps', () => {
      limiter.acquire();
      const stats = limiter.getStats();
      expect(stats.requestsInWindow).toBe(1);
    });
  });

  describe('execute', () => {
    it('should execute function when tokens available', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const result = await limiter.execute(fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should queue when tokens exhausted', async () => {
      const results: number[] = [];

      // Create more requests than tokens
      const promises = Array.from({ length: 7 }, (_, i) =>
        limiter.execute(async () => {
          results.push(i);
          return i;
        })
      );

      // First 5 should execute immediately
      await Promise.race([
        Promise.all(promises),
        new Promise((resolve) => setTimeout(resolve, 100)),
      ]);

      // Should have at least started processing
      expect(results.length).toBeGreaterThan(0);
    });

    it('should throw when queue disabled and rate limited', async () => {
      const strictLimiter = new RateLimiter({
        maxRequests: 1,
        windowMs: 10000,
        queueExcess: false,
      });

      await strictLimiter.execute(async () => 'first');

      await expect(strictLimiter.execute(async () => 'second')).rejects.toThrow(
        RateLimitError
      );
    });
  });

  describe('executeAll', () => {
    it('should execute all functions with rate limiting', async () => {
      const fns = [
        async () => 1,
        async () => 2,
        async () => 3,
      ];

      const results = await limiter.executeAll(fns);
      expect(results).toEqual([1, 2, 3]);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const stats = limiter.getStats();

      expect(stats.availableTokens).toBe(5);
      expect(stats.requestsInWindow).toBe(0);
      expect(stats.queuedRequests).toBe(0);
      expect(stats.isLimited).toBe(false);
    });

    it('should update after requests', () => {
      limiter.acquire();
      limiter.acquire();

      const stats = limiter.getStats();
      expect(stats.availableTokens).toBeLessThan(5);
      expect(stats.requestsInWindow).toBe(2);
    });

    it('should show limited status when exhausted', () => {
      for (let i = 0; i < 5; i++) {
        limiter.acquire();
      }

      const stats = limiter.getStats();
      expect(stats.isLimited).toBe(true);
    });
  });

  describe('reset', () => {
    it('should restore all tokens', () => {
      limiter.acquire();
      limiter.acquire();
      limiter.reset();

      const stats = limiter.getStats();
      expect(stats.availableTokens).toBe(5);
      expect(stats.requestsInWindow).toBe(0);
    });

    it('should clear the queue', async () => {
      // Exhaust tokens
      for (let i = 0; i < 5; i++) {
        limiter.acquire();
      }

      // Queue a request (will be rejected on reset)
      const promise = limiter.execute(async () => 'queued');

      limiter.reset();

      await expect(promise).rejects.toThrow('Rate limiter reset');
    });
  });

  describe('onRateLimitError', () => {
    it('should deplete tokens on rate limit error', () => {
      limiter.acquire();
      limiter.onRateLimitError();

      const stats = limiter.getStats();
      expect(stats.availableTokens).toBe(0);
      expect(stats.isLimited).toBe(true);
    });

    it('should handle retry-after header', () => {
      limiter.onRateLimitError(5000);

      const stats = limiter.getStats();
      expect(stats.isLimited).toBe(true);
    });
  });

  describe('token refill', () => {
    it('should refill tokens over time', async () => {
      const fastLimiter = new RateLimiter({
        maxRequests: 5,
        windowMs: 100, // 100ms window
      });

      // Exhaust tokens
      for (let i = 0; i < 5; i++) {
        fastLimiter.acquire();
      }

      expect(fastLimiter.getStats().availableTokens).toBe(0);

      // Wait for refill
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should have tokens again
      expect(fastLimiter.getStats().availableTokens).toBeGreaterThan(0);
    });
  });

  describe('minimum delay', () => {
    it('should enforce minimum delay between requests', async () => {
      const delayedLimiter = new RateLimiter({
        maxRequests: 10,
        windowMs: 10000,
        minDelayMs: 50,
      });

      const start = Date.now();

      await delayedLimiter.execute(async () => 'first');
      await delayedLimiter.execute(async () => 'second');

      const elapsed = Date.now() - start;

      // Should have waited at least minDelayMs
      expect(elapsed).toBeGreaterThanOrEqual(40); // Allow some margin
    });
  });
});

describe('RateLimitError', () => {
  it('should have correct properties', () => {
    const error = new RateLimitError('Test error', 5000);

    expect(error.message).toBe('Test error');
    expect(error.name).toBe('RateLimitError');
    expect(error.retryAfterMs).toBe(5000);
    expect(error).toBeInstanceOf(Error);
  });
});

describe('ProviderRateLimits', () => {
  it('should have configurations for known providers', () => {
    expect(ProviderRateLimits['openai-free']).toBeDefined();
    expect(ProviderRateLimits['openai-paid']).toBeDefined();
    expect(ProviderRateLimits['claude-api']).toBeDefined();
    expect(ProviderRateLimits['google-translate']).toBeDefined();
    expect(ProviderRateLimits['ollama']).toBeDefined();
    expect(ProviderRateLimits['default']).toBeDefined();
  });

  it('should have valid configuration values', () => {
    for (const [, config] of Object.entries(ProviderRateLimits)) {
      expect(config.maxRequests).toBeGreaterThan(0);
      expect(config.windowMs).toBeGreaterThan(0);
    }
  });
});

describe('getRateLimiter', () => {
  beforeEach(() => {
    clearRateLimiters();
  });

  it('should return same instance for same provider', () => {
    const limiter1 = getRateLimiter('openai-free');
    const limiter2 = getRateLimiter('openai-free');

    expect(limiter1).toBe(limiter2);
  });

  it('should use provider-specific config', () => {
    const limiter = getRateLimiter('openai-free');
    const stats = limiter.getStats();

    expect(stats.availableTokens).toBe(ProviderRateLimits['openai-free'].maxRequests);
  });

  it('should use default config for unknown providers', () => {
    const limiter = getRateLimiter('unknown-provider');
    const stats = limiter.getStats();

    expect(stats.availableTokens).toBe(ProviderRateLimits['default'].maxRequests);
  });

  it('should allow custom configuration override', () => {
    const limiter = getRateLimiter('openai-free', { maxRequests: 100 });
    const stats = limiter.getStats();

    expect(stats.availableTokens).toBe(100);
  });
});

describe('clearRateLimiters', () => {
  it('should clear all rate limiters', () => {
    const limiter = getRateLimiter('test-provider');
    limiter.acquire();

    clearRateLimiters();

    // Getting same provider should return fresh limiter
    const newLimiter = getRateLimiter('test-provider');
    const stats = newLimiter.getStats();

    expect(stats.requestsInWindow).toBe(0);
  });
});

describe('withRateLimit', () => {
  it('should wrap function with rate limiting', async () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 1000,
    });

    const fn = vi.fn().mockResolvedValue('result');
    const wrapped = withRateLimit(fn, limiter);

    const result = await wrapped('arg1', 'arg2');

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });
});

describe('rateLimited', () => {
  beforeEach(() => {
    clearRateLimiters();
  });

  it('should create rate-limited function', async () => {
    const fn = vi.fn().mockResolvedValue('result');
    const limited = rateLimited('default', fn);

    const result = await limited('arg');

    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledWith('arg');
  });

  it('should share rate limiter across wrapped functions', async () => {
    const fn1 = vi.fn().mockResolvedValue('result1');
    const fn2 = vi.fn().mockResolvedValue('result2');

    const limited1 = rateLimited('test-shared', fn1);
    const limited2 = rateLimited('test-shared', fn2);

    await limited1();
    await limited2();

    const limiter = getRateLimiter('test-shared');
    const stats = limiter.getStats();

    expect(stats.requestsInWindow).toBe(2);
  });
});

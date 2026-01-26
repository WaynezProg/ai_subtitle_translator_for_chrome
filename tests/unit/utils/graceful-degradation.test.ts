/**
 * Tests for Graceful Degradation Utility
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CircuitBreaker,
  ProviderHealthTracker,
  FailoverManager,
  StaleWhileRevalidateCache,
  handlePartialResults,
  processWithPartialFailure,
  getTranslationFailoverManager,
  resetTranslationFailoverManager,
} from '@shared/utils/graceful-degradation';

// ============================================================================
// CircuitBreaker Tests
// ============================================================================

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker(3, 1000, 2);
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      expect(breaker.getState()).toBe('closed');
      expect(breaker.canRequest()).toBe(true);
    });
  });

  describe('failure handling', () => {
    it('should open after max failures', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('closed');

      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');
      expect(breaker.canRequest()).toBe(false);
    });

    it('should reset failure count on success', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordSuccess();

      // Should need 3 more failures to open
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('closed');

      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');
    });
  });

  describe('recovery', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should transition to half-open after reset time', () => {
      // Open the circuit
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');

      // Advance past reset time
      vi.advanceTimersByTime(1500);

      expect(breaker.getState()).toBe('half-open');
      expect(breaker.canRequest()).toBe(true);
    });

    it('should close after successes in half-open', () => {
      // Open and transition to half-open
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      vi.advanceTimersByTime(1500);
      expect(breaker.getState()).toBe('half-open');

      // Record successes
      breaker.recordSuccess();
      expect(breaker.getState()).toBe('half-open');

      breaker.recordSuccess();
      expect(breaker.getState()).toBe('closed');
    });

    it('should reopen on failure in half-open', () => {
      // Open and transition to half-open
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      vi.advanceTimersByTime(1500);
      expect(breaker.getState()).toBe('half-open');

      // Failure in half-open reopens
      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');
    });
  });

  describe('reset', () => {
    it('should reset to initial state', () => {
      breaker.recordFailure();
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('open');

      breaker.reset();
      expect(breaker.getState()).toBe('closed');
      expect(breaker.getFailureCount()).toBe(0);
    });
  });
});

// ============================================================================
// ProviderHealthTracker Tests
// ============================================================================

describe('ProviderHealthTracker', () => {
  let tracker: ProviderHealthTracker;

  beforeEach(() => {
    tracker = new ProviderHealthTracker([
      { id: 'primary', priority: 1 },
      { id: 'secondary', priority: 2 },
      { id: 'tertiary', priority: 3 },
    ]);
  });

  describe('initialization', () => {
    it('should initialize providers with default health', () => {
      const health = tracker.getHealth('primary');
      expect(health).toBeDefined();
      expect(health?.isAvailable).toBe(true);
      expect(health?.circuitState).toBe('closed');
    });

    it('should auto-initialize unknown providers', () => {
      tracker.recordSuccess('unknown', 100);
      const health = tracker.getHealth('unknown');
      expect(health).toBeDefined();
    });
  });

  describe('recording success', () => {
    it('should update health on success', () => {
      tracker.recordSuccess('primary', 150);

      const health = tracker.getHealth('primary');
      expect(health?.lastSuccessAt).toBeDefined();
      expect(health?.avgResponseTimeMs).toBe(150);
      expect(health?.consecutiveFailures).toBe(0);
    });

    it('should calculate average response time', () => {
      tracker.recordSuccess('primary', 100);
      tracker.recordSuccess('primary', 200);
      tracker.recordSuccess('primary', 300);

      const health = tracker.getHealth('primary');
      expect(health?.avgResponseTimeMs).toBe(200);
    });
  });

  describe('recording failure', () => {
    it('should update health on failure', () => {
      tracker.recordFailure('primary');

      const health = tracker.getHealth('primary');
      expect(health?.lastFailureAt).toBeDefined();
      expect(health?.consecutiveFailures).toBe(1);
      expect(health?.failureCount).toBe(1);
    });

    it('should mark unavailable after circuit opens', () => {
      // 5 failures to open default circuit
      for (let i = 0; i < 5; i++) {
        tracker.recordFailure('primary');
      }

      expect(tracker.isAvailable('primary')).toBe(false);
    });
  });

  describe('getAvailableProviders', () => {
    it('should return providers sorted by priority', () => {
      const available = tracker.getAvailableProviders();
      expect(available).toEqual(['primary', 'secondary', 'tertiary']);
    });

    it('should exclude unavailable providers', () => {
      // Open primary's circuit
      for (let i = 0; i < 5; i++) {
        tracker.recordFailure('primary');
      }

      const available = tracker.getAvailableProviders();
      expect(available).not.toContain('primary');
      expect(available[0]).toBe('secondary');
    });
  });

  describe('reset', () => {
    it('should reset all health tracking', () => {
      tracker.recordFailure('primary');
      tracker.recordFailure('primary');
      tracker.recordSuccess('secondary', 100);

      tracker.reset();

      const primaryHealth = tracker.getHealth('primary');
      expect(primaryHealth?.consecutiveFailures).toBe(0);
      expect(primaryHealth?.failureCount).toBe(0);
    });
  });
});

// ============================================================================
// FailoverManager Tests
// ============================================================================

describe('FailoverManager', () => {
  let manager: FailoverManager<string>;

  beforeEach(() => {
    manager = new FailoverManager<string>([
      { id: 'primary', priority: 1 },
      { id: 'fallback', priority: 2 },
    ]);
  });

  describe('execute', () => {
    it('should use primary provider on success', async () => {
      const executor = vi.fn().mockResolvedValue('result');

      const result = await manager.execute(executor);

      expect(result.result).toBe('result');
      expect(result.providerId).toBe('primary');
      expect(result.isFallback).toBe(false);
      expect(result.providersTried).toBe(1);
      expect(executor).toHaveBeenCalledWith('primary');
    });

    it('should failover to secondary on primary failure', async () => {
      const executor = vi.fn()
        .mockRejectedValueOnce(new Error('Primary failed'))
        .mockResolvedValueOnce('fallback-result');

      const result = await manager.execute(executor);

      expect(result.result).toBe('fallback-result');
      expect(result.providerId).toBe('fallback');
      expect(result.isFallback).toBe(true);
      expect(result.providersTried).toBe(2);
    });

    it('should throw when all providers fail', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('All failed'));

      await expect(manager.execute(executor)).rejects.toThrow('All failed');
    });

    it('should skip unavailable providers', async () => {
      // Make primary unavailable by opening circuit
      const healthTracker = manager.getHealthTracker();
      for (let i = 0; i < 5; i++) {
        healthTracker.recordFailure('primary');
      }

      const executor = vi.fn().mockResolvedValue('result');

      const result = await manager.execute(executor);

      expect(result.providerId).toBe('fallback');
      expect(executor).not.toHaveBeenCalledWith('primary');
    });
  });

  describe('statistics', () => {
    it('should track primary successes', async () => {
      const executor = vi.fn().mockResolvedValue('result');

      await manager.execute(executor);
      await manager.execute(executor);

      const stats = manager.getStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.primarySuccesses).toBe(2);
      expect(stats.fallbackSuccesses).toBe(0);
    });

    it('should track fallback successes', async () => {
      const executor = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('result');

      await manager.execute(executor);

      const stats = manager.getStats();
      expect(stats.fallbackSuccesses).toBe(1);
    });

    it('should track total failures', async () => {
      const executor = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(manager.execute(executor)).rejects.toThrow();

      const stats = manager.getStats();
      expect(stats.totalFailures).toBe(1);
    });
  });

  describe('reset', () => {
    it('should reset statistics and health', async () => {
      const executor = vi.fn().mockResolvedValue('result');
      await manager.execute(executor);

      manager.reset();

      const stats = manager.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.primarySuccesses).toBe(0);
    });
  });
});

// ============================================================================
// Partial Results Tests
// ============================================================================

describe('handlePartialResults', () => {
  it('should handle all successful results', () => {
    const items = ['a', 'b', 'c'];
    const results = [
      { success: true, value: 'A', index: 0 },
      { success: true, value: 'B', index: 1 },
      { success: true, value: 'C', index: 2 },
    ];

    const { results: finalResults, successRate, accepted } =
      handlePartialResults(items, results);

    expect(finalResults).toEqual(['A', 'B', 'C']);
    expect(successRate).toBe(1);
    expect(accepted).toBe(true);
  });

  it('should include error markers for failed items', () => {
    const items = ['a', 'b', 'c'];
    const results = [
      { success: true, value: 'A', index: 0 },
      { success: false, error: new Error('fail'), index: 1 },
      { success: true, value: 'C', index: 2 },
    ];

    const { results: finalResults, successRate } = handlePartialResults(items, results);

    expect(finalResults).toEqual(['A', '[Translation unavailable]', 'C']);
    expect(successRate).toBeCloseTo(2 / 3);
  });

  it('should reject when success rate is too low', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const results = [
      { success: true, value: 'A', index: 0 },
      { success: false, error: new Error('fail'), index: 1 },
      { success: false, error: new Error('fail'), index: 2 },
      { success: false, error: new Error('fail'), index: 3 },
      { success: false, error: new Error('fail'), index: 4 },
    ];

    const { accepted } = handlePartialResults(items, results, { minSuccessRate: 0.5 });

    expect(accepted).toBe(false);
  });

  it('should use custom error marker', () => {
    const items = ['a'];
    const results = [{ success: false, error: new Error('fail'), index: 0 }];

    const { results: finalResults } = handlePartialResults(items, results, {
      errorMarker: '???',
    });

    expect(finalResults).toEqual(['???']);
  });
});

describe('processWithPartialFailure', () => {
  it('should process all items', async () => {
    const items = [1, 2, 3];
    const processor = vi.fn().mockImplementation(async (n: number) => n * 2);

    const { results, successRate } = await processWithPartialFailure(items, processor);

    expect(results).toEqual([2, 4, 6]);
    expect(successRate).toBe(1);
  });

  it('should handle partial failures', async () => {
    const items = [1, 2, 3];
    const processor = vi.fn()
      .mockResolvedValueOnce(2)
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(6);

    const { results, successRate, accepted } = await processWithPartialFailure(
      items,
      processor,
      { minSuccessRate: 0.5 }
    );

    expect(results).toEqual([2, '[Translation unavailable]', 6]);
    expect(successRate).toBeCloseTo(2 / 3);
    expect(accepted).toBe(true);
  });
});

// ============================================================================
// StaleWhileRevalidateCache Tests
// ============================================================================

describe('StaleWhileRevalidateCache', () => {
  let cache: StaleWhileRevalidateCache<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new StaleWhileRevalidateCache<string>(1000, 5000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('get', () => {
    it('should fetch and cache value', async () => {
      const fetcher = vi.fn().mockResolvedValue('value');

      const result = await cache.get('key', fetcher);

      expect(result.value).toBe('value');
      expect(result.isStale).toBe(false);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('should return cached value when fresh', async () => {
      const fetcher = vi.fn().mockResolvedValue('value');

      await cache.get('key', fetcher);

      // Second call within fresh period
      vi.advanceTimersByTime(500);
      const result = await cache.get('key', fetcher);

      expect(result.value).toBe('value');
      expect(result.isStale).toBe(false);
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('should return stale value and revalidate', async () => {
      const fetcher = vi.fn()
        .mockResolvedValueOnce('original')
        .mockResolvedValueOnce('updated');

      await cache.get('key', fetcher);

      // Advance past fresh but within stale
      vi.advanceTimersByTime(2000);

      const result = await cache.get('key', fetcher);

      expect(result.value).toBe('original');
      expect(result.isStale).toBe(true);

      // Wait for background revalidation
      await vi.runAllTimersAsync();

      // Next call should get updated value
      const fresh = await cache.get('key', fetcher);
      expect(fresh.value).toBe('updated');
      expect(fresh.isStale).toBe(false);
    });

    it('should fetch fresh when expired', async () => {
      const fetcher = vi.fn()
        .mockResolvedValueOnce('original')
        .mockResolvedValueOnce('fresh');

      await cache.get('key', fetcher);

      // Advance past stale period
      vi.advanceTimersByTime(6000);

      const result = await cache.get('key', fetcher);

      expect(result.value).toBe('fresh');
      expect(result.isStale).toBe(false);
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidate', () => {
    it('should remove cached entry', async () => {
      const fetcher = vi.fn()
        .mockResolvedValueOnce('first')
        .mockResolvedValueOnce('second');

      await cache.get('key', fetcher);
      cache.invalidate('key');

      const result = await cache.get('key', fetcher);
      expect(result.value).toBe('second');
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      const fetcher = vi.fn().mockResolvedValue('value');

      await cache.get('key1', fetcher);
      await cache.get('key2', fetcher);

      expect(cache.size()).toBe(2);

      cache.clear();

      expect(cache.size()).toBe(0);
    });
  });
});

// ============================================================================
// Singleton Tests
// ============================================================================

describe('Translation Failover Manager Singleton', () => {
  beforeEach(() => {
    resetTranslationFailoverManager();
  });

  it('should return singleton instance', () => {
    const instance1 = getTranslationFailoverManager();
    const instance2 = getTranslationFailoverManager();
    expect(instance1).toBe(instance2);
  });

  it('should create with default providers', async () => {
    const manager = getTranslationFailoverManager<string>();
    const executor = vi.fn().mockResolvedValue('result');

    const result = await manager.execute(executor);

    // Default first provider is 'claude-api'
    expect(result.providerId).toBe('claude-api');
  });

  it('should allow custom providers', () => {
    const manager = getTranslationFailoverManager([
      { id: 'custom1', priority: 1 },
      { id: 'custom2', priority: 2 },
    ]);

    const available = manager.getHealthTracker().getAvailableProviders();
    expect(available).toContain('custom1');
    expect(available).toContain('custom2');
  });
});

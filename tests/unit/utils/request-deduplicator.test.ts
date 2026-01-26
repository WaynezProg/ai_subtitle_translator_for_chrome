/**
 * Tests for Request Deduplication Utility
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  RequestDeduplicator,
  BatchDeduplicator,
  createTranslationKey,
  hashContent,
  getTranslationDeduplicator,
  deduplicateTranslation,
  isTranslationPending,
  getTranslationDeduplicatorStats,
  clearTranslationDeduplicator,
  resetTranslationDeduplicator,
} from '@shared/utils/request-deduplicator';

// ============================================================================
// RequestDeduplicator Tests
// ============================================================================

describe('RequestDeduplicator', () => {
  let deduplicator: RequestDeduplicator<string>;

  beforeEach(() => {
    deduplicator = new RequestDeduplicator<string>();
  });

  describe('execute', () => {
    it('should execute the request and return result', async () => {
      const executor = vi.fn().mockResolvedValue('result');

      const result = await deduplicator.execute('key1', executor);

      expect(result).toBe('result');
      expect(executor).toHaveBeenCalledTimes(1);
    });

    it('should deduplicate concurrent requests with same key', async () => {
      let resolveExecutor: (value: string) => void;
      const executorPromise = new Promise<string>((resolve) => {
        resolveExecutor = resolve;
      });
      const executor = vi.fn().mockReturnValue(executorPromise);

      // Start two concurrent requests with the same key
      const promise1 = deduplicator.execute('key1', executor);
      const promise2 = deduplicator.execute('key1', executor);

      // Executor should only be called once
      expect(executor).toHaveBeenCalledTimes(1);

      // Resolve the executor
      resolveExecutor!('shared-result');

      // Both promises should resolve to the same result
      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toBe('shared-result');
      expect(result2).toBe('shared-result');
    });

    it('should execute different keys independently', async () => {
      const executor1 = vi.fn().mockResolvedValue('result1');
      const executor2 = vi.fn().mockResolvedValue('result2');

      const [result1, result2] = await Promise.all([
        deduplicator.execute('key1', executor1),
        deduplicator.execute('key2', executor2),
      ]);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(executor1).toHaveBeenCalledTimes(1);
      expect(executor2).toHaveBeenCalledTimes(1);
    });

    it('should allow new request after previous completes', async () => {
      const executor = vi.fn()
        .mockResolvedValueOnce('result1')
        .mockResolvedValueOnce('result2');

      const result1 = await deduplicator.execute('key1', executor);
      const result2 = await deduplicator.execute('key1', executor);

      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it('should handle executor errors', async () => {
      const error = new Error('Request failed');
      const executor = vi.fn().mockRejectedValue(error);

      await expect(deduplicator.execute('key1', executor)).rejects.toThrow('Request failed');
    });

    it('should propagate errors to all waiters', async () => {
      let rejectExecutor: (error: Error) => void;
      const executorPromise = new Promise<string>((_, reject) => {
        rejectExecutor = reject;
      });
      const executor = vi.fn().mockReturnValue(executorPromise);

      const promise1 = deduplicator.execute('key1', executor);
      const promise2 = deduplicator.execute('key1', executor);

      const error = new Error('Shared error');
      rejectExecutor!(error);

      await expect(promise1).rejects.toThrow('Shared error');
      await expect(promise2).rejects.toThrow('Shared error');
    });

    it('should clean up after error', async () => {
      const executor = vi.fn()
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce('second-success');

      await expect(deduplicator.execute('key1', executor)).rejects.toThrow('First failed');

      // Should be able to retry after error
      const result = await deduplicator.execute('key1', executor);
      expect(result).toBe('second-success');
    });
  });

  describe('isPending', () => {
    it('should return true for pending request', async () => {
      let resolveExecutor: () => void;
      const executorPromise = new Promise<string>((resolve) => {
        resolveExecutor = () => resolve('done');
      });
      const executor = vi.fn().mockReturnValue(executorPromise);

      const promise = deduplicator.execute('key1', executor);
      expect(deduplicator.isPending('key1')).toBe(true);

      resolveExecutor!();
      await promise;

      expect(deduplicator.isPending('key1')).toBe(false);
    });

    it('should return false for non-existent key', () => {
      expect(deduplicator.isPending('unknown')).toBe(false);
    });
  });

  describe('getWaiters', () => {
    it('should return number of waiters', async () => {
      let resolveExecutor: () => void;
      const executorPromise = new Promise<string>((resolve) => {
        resolveExecutor = () => resolve('done');
      });
      const executor = vi.fn().mockReturnValue(executorPromise);

      deduplicator.execute('key1', executor);
      expect(deduplicator.getWaiters('key1')).toBe(1);

      deduplicator.execute('key1', executor);
      expect(deduplicator.getWaiters('key1')).toBe(2);

      deduplicator.execute('key1', executor);
      expect(deduplicator.getWaiters('key1')).toBe(3);

      resolveExecutor!();
    });

    it('should return 0 for non-existent key', () => {
      expect(deduplicator.getWaiters('unknown')).toBe(0);
    });
  });

  describe('cancel', () => {
    it('should remove pending request', async () => {
      let resolveExecutor: () => void;
      const executorPromise = new Promise<string>((resolve) => {
        resolveExecutor = () => resolve('done');
      });
      const executor = vi.fn().mockReturnValue(executorPromise);

      deduplicator.execute('key1', executor);
      expect(deduplicator.isPending('key1')).toBe(true);

      const cancelled = deduplicator.cancel('key1');
      expect(cancelled).toBe(true);
      expect(deduplicator.isPending('key1')).toBe(false);

      resolveExecutor!();
    });

    it('should return false for non-existent key', () => {
      const cancelled = deduplicator.cancel('unknown');
      expect(cancelled).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all pending requests', async () => {
      const executor = vi.fn().mockImplementation(
        () => new Promise<string>(() => {}) // Never resolves
      );

      deduplicator.execute('key1', executor);
      deduplicator.execute('key2', executor);
      deduplicator.execute('key3', executor);

      expect(deduplicator.isPending('key1')).toBe(true);
      expect(deduplicator.isPending('key2')).toBe(true);
      expect(deduplicator.isPending('key3')).toBe(true);

      deduplicator.clear();

      expect(deduplicator.isPending('key1')).toBe(false);
      expect(deduplicator.isPending('key2')).toBe(false);
      expect(deduplicator.isPending('key3')).toBe(false);
    });
  });

  describe('statistics', () => {
    it('should track total and deduplicated requests', async () => {
      let resolveExecutor: () => void;
      const executorPromise = new Promise<string>((resolve) => {
        resolveExecutor = () => resolve('done');
      });
      const executor = vi.fn().mockReturnValue(executorPromise);

      // First request executes
      deduplicator.execute('key1', executor);
      // Second and third are deduplicated
      deduplicator.execute('key1', executor);
      deduplicator.execute('key1', executor);

      const stats = deduplicator.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.executedRequests).toBe(1);
      expect(stats.deduplicatedRequests).toBe(2);
      expect(stats.deduplicationRate).toBeCloseTo(2 / 3);
      expect(stats.pendingRequests).toBe(1);

      resolveExecutor!();
    });

    it('should update pendingRequests when completed', async () => {
      const executor = vi.fn().mockResolvedValue('done');

      await deduplicator.execute('key1', executor);

      const stats = deduplicator.getStats();
      expect(stats.pendingRequests).toBe(0);
    });

    it('should reset statistics', async () => {
      const executor = vi.fn().mockResolvedValue('done');
      await deduplicator.execute('key1', executor);

      deduplicator.resetStats();

      const stats = deduplicator.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.executedRequests).toBe(0);
      expect(stats.deduplicatedRequests).toBe(0);
    });
  });

  describe('maxPendingAge', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should not deduplicate expired pending requests', async () => {
      const shortAgeDeduplicator = new RequestDeduplicator<string>({
        maxPendingAge: 1000,
      });

      const executor = vi.fn().mockImplementation(
        () => new Promise<string>(() => {}) // Never resolves
      );

      shortAgeDeduplicator.execute('key1', executor);
      expect(executor).toHaveBeenCalledTimes(1);

      // Advance time past maxPendingAge
      vi.advanceTimersByTime(1500);

      // New request should execute because old one expired
      shortAgeDeduplicator.execute('key1', executor);
      expect(executor).toHaveBeenCalledTimes(2);
    });
  });
});

// ============================================================================
// BatchDeduplicator Tests
// ============================================================================

describe('BatchDeduplicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should batch multiple items', async () => {
    const executor = vi.fn().mockImplementation((batch: number[]) =>
      Promise.resolve(batch.map((n) => n * 2))
    );

    const batcher = new BatchDeduplicator<number, number>(executor, {
      batchSize: 3,
      batchDelayMs: 100,
    });

    const promise1 = batcher.add(1);
    const promise2 = batcher.add(2);
    const promise3 = batcher.add(3);

    // Batch should execute immediately when full
    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith([1, 2, 3]);
    expect(result1).toBe(2);
    expect(result2).toBe(4);
    expect(result3).toBe(6);
  });

  it('should execute batch after delay', async () => {
    const executor = vi.fn().mockImplementation((batch: number[]) =>
      Promise.resolve(batch.map((n) => n * 2))
    );

    const batcher = new BatchDeduplicator<number, number>(executor, {
      batchSize: 10,
      batchDelayMs: 100,
    });

    const promise1 = batcher.add(1);
    const promise2 = batcher.add(2);

    expect(executor).not.toHaveBeenCalled();

    // Advance time to trigger batch
    vi.advanceTimersByTime(100);

    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(executor).toHaveBeenCalledTimes(1);
    expect(result1).toBe(2);
    expect(result2).toBe(4);
  });

  it('should handle executor errors', async () => {
    const executor = vi.fn().mockRejectedValue(new Error('Batch failed'));

    const batcher = new BatchDeduplicator<number, number>(executor, {
      batchSize: 2,
      batchDelayMs: 100,
    });

    const promise1 = batcher.add(1);
    const promise2 = batcher.add(2);

    await expect(promise1).rejects.toThrow('Batch failed');
    await expect(promise2).rejects.toThrow('Batch failed');
  });

  it('should flush pending batch', async () => {
    const executor = vi.fn().mockImplementation((batch: number[]) =>
      Promise.resolve(batch.map((n) => n * 2))
    );

    const batcher = new BatchDeduplicator<number, number>(executor, {
      batchSize: 10,
      batchDelayMs: 1000,
    });

    const promise1 = batcher.add(1);
    expect(executor).not.toHaveBeenCalled();

    await batcher.flush();

    expect(executor).toHaveBeenCalledTimes(1);
    const result = await promise1;
    expect(result).toBe(2);
  });

  it('should report pending count', () => {
    const executor = vi.fn().mockImplementation((batch: number[]) =>
      Promise.resolve(batch.map((n) => n * 2))
    );

    const batcher = new BatchDeduplicator<number, number>(executor, {
      batchSize: 10,
      batchDelayMs: 1000,
    });

    expect(batcher.getPendingCount()).toBe(0);

    batcher.add(1);
    expect(batcher.getPendingCount()).toBe(1);

    batcher.add(2);
    expect(batcher.getPendingCount()).toBe(2);
  });

  it('should clear pending batch', async () => {
    const executor = vi.fn().mockImplementation((batch: number[]) =>
      Promise.resolve(batch.map((n) => n * 2))
    );

    const batcher = new BatchDeduplicator<number, number>(executor, {
      batchSize: 10,
      batchDelayMs: 1000,
    });

    const promise1 = batcher.add(1);
    const promise2 = batcher.add(2);

    batcher.clear();

    expect(batcher.getPendingCount()).toBe(0);
    await expect(promise1).rejects.toThrow('Batch cleared');
    await expect(promise2).rejects.toThrow('Batch cleared');
  });
});

// ============================================================================
// Helper Function Tests
// ============================================================================

describe('Helper Functions', () => {
  describe('createTranslationKey', () => {
    it('should create key from components', () => {
      const key = createTranslationKey('video123', 'en', 'zh-TW');
      expect(key).toBe('video123:en:zh-TW');
    });

    it('should include content hash if provided', () => {
      const key = createTranslationKey('video123', 'en', 'zh-TW', 'abc123');
      expect(key).toBe('video123:en:zh-TW:abc123');
    });
  });

  describe('hashContent', () => {
    it('should generate consistent hash for same content', () => {
      const hash1 = hashContent('Hello World');
      const hash2 = hashContent('Hello World');
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different content', () => {
      const hash1 = hashContent('Hello World');
      const hash2 = hashContent('Hello World!');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = hashContent('');
      expect(hash).toBe('0');
    });
  });
});

// ============================================================================
// Translation Deduplicator Singleton Tests
// ============================================================================

describe('Translation Deduplicator Singleton', () => {
  beforeEach(() => {
    resetTranslationDeduplicator();
  });

  it('should return singleton instance', () => {
    const instance1 = getTranslationDeduplicator();
    const instance2 = getTranslationDeduplicator();
    expect(instance1).toBe(instance2);
  });

  it('should deduplicate translation requests', async () => {
    const executor = vi.fn().mockResolvedValue('translated');

    const promise1 = deduplicateTranslation('video1', 'en', 'zh-TW', 'hash1', executor);
    const promise2 = deduplicateTranslation('video1', 'en', 'zh-TW', 'hash1', executor);

    const [result1, result2] = await Promise.all([promise1, promise2]);

    expect(result1).toBe('translated');
    expect(result2).toBe('translated');
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('should check if translation is pending', async () => {
    let resolveExecutor: () => void;
    const executorPromise = new Promise<string>((resolve) => {
      resolveExecutor = () => resolve('done');
    });
    const executor = vi.fn().mockReturnValue(executorPromise);

    const promise = deduplicateTranslation('video1', 'en', 'zh-TW', 'hash1', executor);
    expect(isTranslationPending('video1', 'en', 'zh-TW', 'hash1')).toBe(true);

    resolveExecutor!();
    await promise;

    expect(isTranslationPending('video1', 'en', 'zh-TW', 'hash1')).toBe(false);
  });

  it('should return statistics', async () => {
    const executor = vi.fn().mockResolvedValue('translated');

    await deduplicateTranslation('video1', 'en', 'zh-TW', 'hash1', executor);

    const stats = getTranslationDeduplicatorStats();
    expect(stats.totalRequests).toBe(1);
    expect(stats.executedRequests).toBe(1);
  });

  it('should clear deduplicator', async () => {
    const executor = vi.fn().mockImplementation(
      () => new Promise<string>(() => {})
    );

    deduplicateTranslation('video1', 'en', 'zh-TW', 'hash1', executor);
    expect(isTranslationPending('video1', 'en', 'zh-TW', 'hash1')).toBe(true);

    clearTranslationDeduplicator();
    expect(isTranslationPending('video1', 'en', 'zh-TW', 'hash1')).toBe(false);
  });
});

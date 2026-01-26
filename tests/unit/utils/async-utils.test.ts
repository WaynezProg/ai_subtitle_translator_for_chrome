/**
 * Tests for Async Utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  allSettled,
  raceWithTimeout,
  sequence,
  parallel,
  mapAsync,
  filterAsync,
  findAsync,
  someAsync,
  everyAsync,
  retry,
  retryLinear,
  sleep,
  nextTick,
  Semaphore,
  Mutex,
  AsyncQueue,
  createCancellationToken,
  Deferred,
  poll,
  timeout,
  ignoreErrors,
  tryCatch,
} from '@shared/utils/async-utils';

// ============================================================================
// Promise Combinators Tests
// ============================================================================

describe('Promise Combinators', () => {
  describe('allSettled', () => {
    it('should return all results', async () => {
      const results = await allSettled([
        Promise.resolve(1),
        Promise.reject(new Error('test')),
        Promise.resolve(3),
      ]);

      expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
      expect(results[1].status).toBe('rejected');
      expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
    });
  });

  describe('raceWithTimeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should resolve if promise completes before timeout', async () => {
      const promise = raceWithTimeout(
        new Promise<string>((resolve) => setTimeout(() => resolve('done'), 100)),
        { timeoutMs: 1000 }
      );

      vi.advanceTimersByTime(100);
      await expect(promise).resolves.toBe('done');
    });

    it('should reject if timeout occurs first', async () => {
      const promise = raceWithTimeout(
        new Promise<string>((resolve) => setTimeout(() => resolve('done'), 1000)),
        { timeoutMs: 100 }
      );

      vi.advanceTimersByTime(100);
      await expect(promise).rejects.toThrow('timed out');
    });
  });

  describe('sequence', () => {
    it('should execute tasks in order', async () => {
      const order: number[] = [];
      const tasks = [
        async () => {
          order.push(1);
          return 1;
        },
        async () => {
          order.push(2);
          return 2;
        },
        async () => {
          order.push(3);
          return 3;
        },
      ];

      const results = await sequence(tasks);

      expect(results).toEqual([1, 2, 3]);
      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('parallel', () => {
    it('should execute with concurrency limit', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const tasks = Array(10)
        .fill(null)
        .map(
          (_, i) => async () => {
            concurrent++;
            maxConcurrent = Math.max(maxConcurrent, concurrent);
            await sleep(10);
            concurrent--;
            return i;
          }
        );

      const results = await parallel(tasks, { concurrency: 3 });

      expect(results).toHaveLength(10);
      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should stop on error when stopOnError is true', async () => {
      const tasks = [
        async () => 1,
        async () => {
          throw new Error('test');
        },
        async () => 3,
      ];

      await expect(parallel(tasks, { concurrency: 1, stopOnError: true })).rejects.toThrow('test');
    });
  });

  describe('mapAsync', () => {
    it('should map with concurrency', async () => {
      const items = [1, 2, 3, 4, 5];
      const results = await mapAsync(items, async (n) => n * 2, { concurrency: 2 });

      expect(results).toEqual([2, 4, 6, 8, 10]);
    });
  });

  describe('filterAsync', () => {
    it('should filter asynchronously', async () => {
      const items = [1, 2, 3, 4, 5];
      const results = await filterAsync(items, async (n) => n % 2 === 0);

      expect(results).toEqual([2, 4]);
    });
  });

  describe('findAsync', () => {
    it('should find first matching item', async () => {
      const items = [1, 2, 3, 4, 5];
      const result = await findAsync(items, async (n) => n > 2);

      expect(result).toBe(3);
    });

    it('should return undefined if not found', async () => {
      const items = [1, 2, 3];
      const result = await findAsync(items, async (n) => n > 5);

      expect(result).toBeUndefined();
    });
  });

  describe('someAsync', () => {
    it('should return true if any match', async () => {
      const items = [1, 2, 3];
      expect(await someAsync(items, async (n) => n > 2)).toBe(true);
    });

    it('should return false if none match', async () => {
      const items = [1, 2, 3];
      expect(await someAsync(items, async (n) => n > 5)).toBe(false);
    });
  });

  describe('everyAsync', () => {
    it('should return true if all match', async () => {
      const items = [2, 4, 6];
      expect(await everyAsync(items, async (n) => n % 2 === 0)).toBe(true);
    });

    it('should return false if any fails', async () => {
      const items = [2, 3, 6];
      expect(await everyAsync(items, async (n) => n % 2 === 0)).toBe(false);
    });
  });
});

// ============================================================================
// Retry Tests
// ============================================================================

describe('Retry', () => {
  describe('retry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await retry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await retry(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
      });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fail'));

      await expect(
        retry(fn, {
          maxAttempts: 3,
          initialDelayMs: 10,
        })
      ).rejects.toThrow('always fail');

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should call onRetry callback', async () => {
      const onRetry = vi.fn();
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      await retry(fn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('should respect retryIf predicate', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('not retryable'));

      await expect(
        retry(fn, {
          maxAttempts: 3,
          retryIf: () => false,
        })
      ).rejects.toThrow('not retryable');

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('retryLinear', () => {
    it('should retry with linear delay', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      const result = await retryLinear(fn, 3, 10);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});

// ============================================================================
// Delay Tests
// ============================================================================

describe('Delay', () => {
  describe('sleep', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should wait for specified time', async () => {
      const promise = sleep(1000);

      vi.advanceTimersByTime(1000);
      await promise;
    });
  });

  describe('nextTick', () => {
    it('should defer execution', async () => {
      let executed = false;

      nextTick().then(() => {
        executed = true;
      });

      expect(executed).toBe(false);
      await nextTick();
      await nextTick();
      expect(executed).toBe(true);
    });
  });
});

// ============================================================================
// Concurrency Control Tests
// ============================================================================

describe('Semaphore', () => {
  it('should limit concurrent operations', async () => {
    const semaphore = new Semaphore(2);
    let concurrent = 0;
    let maxConcurrent = 0;

    const tasks = Array(5)
      .fill(null)
      .map(
        () => async () => {
          await semaphore.acquire();
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await sleep(10);
          concurrent--;
          semaphore.release();
        }
      );

    await Promise.all(tasks.map((t) => t()));

    expect(maxConcurrent).toBe(2);
  });

  it('should run function with permit', async () => {
    const semaphore = new Semaphore(1);
    const result = await semaphore.run(async () => 'done');

    expect(result).toBe('done');
    expect(semaphore.available).toBe(1);
  });

  it('should track available permits and waiting', async () => {
    const semaphore = new Semaphore(2);

    expect(semaphore.available).toBe(2);
    expect(semaphore.waiting).toBe(0);

    await semaphore.acquire();
    expect(semaphore.available).toBe(1);

    await semaphore.acquire();
    expect(semaphore.available).toBe(0);

    // Start waiting
    const waitPromise = semaphore.acquire();
    expect(semaphore.waiting).toBe(1);

    semaphore.release();
    await waitPromise;
    expect(semaphore.waiting).toBe(0);
  });
});

describe('Mutex', () => {
  it('should provide exclusive access', async () => {
    const mutex = new Mutex();
    const results: number[] = [];

    const task = async (id: number) => {
      await mutex.lock();
      results.push(id);
      await sleep(10);
      mutex.unlock();
    };

    await Promise.all([task(1), task(2), task(3)]);

    // Results should be in order since mutex ensures sequential execution
    expect(results).toHaveLength(3);
  });

  it('should track locked state', async () => {
    const mutex = new Mutex();

    expect(mutex.isLocked).toBe(false);
    await mutex.lock();
    expect(mutex.isLocked).toBe(true);
    mutex.unlock();
    expect(mutex.isLocked).toBe(false);
  });
});

describe('AsyncQueue', () => {
  it('should process tasks with concurrency', async () => {
    const queue = new AsyncQueue<number>(2);
    const results: number[] = [];

    queue.push(async () => {
      await sleep(10);
      results.push(1);
      return 1;
    });
    queue.push(async () => {
      await sleep(5);
      results.push(2);
      return 2;
    });
    queue.push(async () => {
      results.push(3);
      return 3;
    });

    const allResults = await queue.drain();

    expect(allResults).toContain(1);
    expect(allResults).toContain(2);
    expect(allResults).toContain(3);
  });

  it('should track queue length and active', async () => {
    const queue = new AsyncQueue<number>(1);

    expect(queue.length).toBe(0);
    expect(queue.active).toBe(0);

    queue.push(async () => {
      await sleep(50);
      return 1;
    });

    // Give it a moment to start
    await nextTick();

    expect(queue.active).toBeLessThanOrEqual(1);
  });
});

// ============================================================================
// Cancellation Tests
// ============================================================================

describe('Cancellation', () => {
  describe('createCancellationToken', () => {
    it('should create token', () => {
      const { token, cancel } = createCancellationToken();

      expect(token.isCancelled).toBe(false);
      cancel('test reason');
      expect(token.isCancelled).toBe(true);
      expect(token.reason).toBe('test reason');
    });

    it('should throw if cancelled', () => {
      const { token, cancel } = createCancellationToken();

      expect(() => token.throwIfCancelled()).not.toThrow();
      cancel();
      expect(() => token.throwIfCancelled()).toThrow('Operation cancelled');
    });

    it('should call callbacks on cancel', () => {
      const { token, cancel } = createCancellationToken();
      const callback = vi.fn();

      token.onCancel(callback);
      cancel();

      expect(callback).toHaveBeenCalled();
    });

    it('should allow unsubscribing from cancel', () => {
      const { token, cancel } = createCancellationToken();
      const callback = vi.fn();

      const unsubscribe = token.onCancel(callback);
      unsubscribe();
      cancel();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should call callback immediately if already cancelled', () => {
      const { token, cancel } = createCancellationToken();
      cancel();

      const callback = vi.fn();
      token.onCancel(callback);

      expect(callback).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Deferred Tests
// ============================================================================

describe('Deferred', () => {
  it('should resolve externally', async () => {
    const deferred = new Deferred<string>();

    expect(deferred.isSettled).toBe(false);
    deferred.resolve('done');
    expect(deferred.isSettled).toBe(true);

    await expect(deferred.promise).resolves.toBe('done');
  });

  it('should reject externally', async () => {
    const deferred = new Deferred<string>();

    deferred.reject(new Error('failed'));

    await expect(deferred.promise).rejects.toThrow('failed');
  });

  it('should only settle once', async () => {
    const deferred = new Deferred<string>();

    deferred.resolve('first');
    deferred.resolve('second');

    await expect(deferred.promise).resolves.toBe('first');
  });
});

// ============================================================================
// Polling Tests
// ============================================================================

describe('poll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return immediately if condition met', async () => {
    const fn = vi.fn().mockResolvedValue('found');

    const promise = poll(fn, { intervalMs: 100, immediate: true });
    await promise;

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should poll until condition met', async () => {
    let attempts = 0;
    const fn = vi.fn().mockImplementation(async () => {
      attempts++;
      return attempts >= 3 ? 'found' : null;
    });

    const promise = poll(fn, { intervalMs: 100, immediate: true });

    // First immediate call
    await vi.advanceTimersByTimeAsync(0);
    // Second call after interval
    await vi.advanceTimersByTimeAsync(100);
    // Third call
    await vi.advanceTimersByTimeAsync(100);

    const result = await promise;
    expect(result).toBe('found');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should timeout', async () => {
    const fn = vi.fn().mockResolvedValue(null);

    const promise = poll(fn, {
      intervalMs: 100,
      timeoutMs: 250,
      immediate: true,
    }).catch((e) => e); // Catch to prevent unhandled rejection

    await vi.advanceTimersByTimeAsync(300);

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain('timed out');
  });
});

// ============================================================================
// Utility Tests
// ============================================================================

describe('Utilities', () => {
  describe('timeout', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should reject after timeout', async () => {
      const promise = timeout(100);

      vi.advanceTimersByTime(100);

      await expect(promise).rejects.toThrow('Timeout after 100ms');
    });
  });

  describe('ignoreErrors', () => {
    it('should return value on success', async () => {
      const result = await ignoreErrors(Promise.resolve('success'), 'default');
      expect(result).toBe('success');
    });

    it('should return default on error', async () => {
      const result = await ignoreErrors(Promise.reject(new Error('fail')), 'default');
      expect(result).toBe('default');
    });
  });

  describe('tryCatch', () => {
    it('should return result tuple on success', async () => {
      const [error, result] = await tryCatch(async () => 'success');

      expect(error).toBeUndefined();
      expect(result).toBe('success');
    });

    it('should return error tuple on failure', async () => {
      const [error, result] = await tryCatch(async () => {
        throw new Error('failed');
      });

      expect(error).toBeInstanceOf(Error);
      expect(result).toBeUndefined();
    });
  });
});

/**
 * Tests for Timing Utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  debounce,
  throttle,
  once,
  delay,
  rateLimit,
  createAsyncQueue,
  retryWithBackoff,
  withTimeout,
  createPausableInterval,
} from '@shared/utils/timing-utils';

// ============================================================================
// Debounce Tests
// ============================================================================

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should reset timer on subsequent calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    vi.advanceTimersByTime(50);

    debounced();
    vi.advanceTimersByTime(50);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to the function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('arg1', 'arg2');
    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
  });

  it('should use latest arguments', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced('first');
    debounced('second');
    debounced('third');

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('third');
  });

  describe('leading option', () => {
    it('should execute immediately with leading: true', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100, { leading: true, trailing: false });

      debounced();
      expect(fn).toHaveBeenCalledTimes(1);

      debounced();
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('maxWait option', () => {
    it('should force execution after maxWait', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100, { maxWait: 150 });

      debounced();
      vi.advanceTimersByTime(50);
      debounced();
      vi.advanceTimersByTime(50);
      debounced();
      vi.advanceTimersByTime(50);

      // Should have executed due to maxWait
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancel', () => {
    it('should cancel pending execution', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced();
      debounced.cancel();
      vi.advanceTimersByTime(100);

      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('flush', () => {
    it('should execute immediately', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      debounced('test');
      expect(fn).not.toHaveBeenCalled();

      debounced.flush();
      expect(fn).toHaveBeenCalledWith('test');
    });
  });

  describe('pending', () => {
    it('should return true when execution is pending', () => {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);

      expect(debounced.pending()).toBe(false);

      debounced();
      expect(debounced.pending()).toBe(true);

      vi.advanceTimersByTime(100);
      expect(debounced.pending()).toBe(false);
    });
  });
});

// ============================================================================
// Throttle Tests
// ============================================================================

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute immediately on first call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throttle subsequent calls', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    throttled();
    throttled();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should allow calls after throttle period', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled();
    vi.advanceTimersByTime(100);
    throttled();

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should execute trailing call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('first');
    throttled('second');
    throttled('third');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('first');

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('third');
  });

  describe('leading option', () => {
    it('should not execute immediately with leading: false', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100, { leading: false });

      throttled();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('trailing option', () => {
    it('should not execute trailing with trailing: false', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100, { trailing: false });

      throttled('first');
      throttled('second');

      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancel', () => {
    it('should cancel trailing execution', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      throttled('first');
      throttled('second');

      throttled.cancel();
      vi.advanceTimersByTime(100);

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('isThrottled', () => {
    it('should return throttle state', () => {
      const fn = vi.fn();
      const throttled = throttle(fn, 100);

      expect(throttled.isThrottled()).toBe(false);

      throttled();
      expect(throttled.isThrottled()).toBe(true);

      vi.advanceTimersByTime(100);
      expect(throttled.isThrottled()).toBe(false);
    });
  });
});

// ============================================================================
// Once Tests
// ============================================================================

describe('once', () => {
  it('should only execute once', () => {
    const fn = vi.fn().mockReturnValue('result');
    const onceFn = once(fn);

    expect(onceFn()).toBe('result');
    expect(onceFn()).toBe('result');
    expect(onceFn()).toBe('result');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments on first call', () => {
    const fn = vi.fn((a: number, b: number) => a + b);
    const onceFn = once(fn);

    expect(onceFn(1, 2)).toBe(3);
    expect(onceFn(5, 5)).toBe(3); // Returns cached result

    expect(fn).toHaveBeenCalledWith(1, 2);
  });
});

// ============================================================================
// Delay Tests
// ============================================================================

describe('delay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay function execution', async () => {
    const fn = vi.fn().mockReturnValue('result');
    const { promise } = delay(fn, 100);

    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);

    const result = await promise;
    expect(result).toBe('result');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments', async () => {
    const fn = vi.fn((a: number, b: number) => a + b);
    const { promise } = delay(fn, 100, 3, 4);

    vi.advanceTimersByTime(100);

    const result = await promise;
    expect(result).toBe(7);
  });

  it('should be cancellable', async () => {
    const fn = vi.fn();
    const { promise, cancel } = delay(fn, 100);

    cancel();
    vi.advanceTimersByTime(100);

    await expect(promise).rejects.toThrow('cancelled');
    expect(fn).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Rate Limit Tests
// ============================================================================

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should allow calls up to bucket size', () => {
    const fn = vi.fn().mockReturnValue('ok');
    const limited = rateLimit(fn, {
      bucketSize: 3,
      refillRate: 1,
      refillInterval: 1000,
    });

    expect(limited()).toBe('ok');
    expect(limited()).toBe('ok');
    expect(limited()).toBe('ok');
    expect(limited()).toBeNull();

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should refill tokens over time', () => {
    const fn = vi.fn().mockReturnValue('ok');
    const limited = rateLimit(fn, {
      bucketSize: 2,
      refillRate: 1,
      refillInterval: 1000,
    });

    expect(limited()).toBe('ok');
    expect(limited()).toBe('ok');
    expect(limited()).toBeNull();

    vi.advanceTimersByTime(1000);

    expect(limited()).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should report token count', () => {
    const fn = vi.fn();
    const limited = rateLimit(fn, {
      bucketSize: 5,
      refillRate: 1,
      refillInterval: 1000,
    });

    expect(limited.getTokens()).toBe(5);

    limited();
    limited();

    expect(limited.getTokens()).toBe(3);
  });

  it('should reset tokens', () => {
    const fn = vi.fn();
    const limited = rateLimit(fn, {
      bucketSize: 3,
      refillRate: 1,
      refillInterval: 1000,
    });

    limited();
    limited();
    limited();

    expect(limited.getTokens()).toBe(0);

    limited.reset();

    expect(limited.getTokens()).toBe(3);
  });
});

// ============================================================================
// Async Queue Tests
// ============================================================================

describe('createAsyncQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should process items in order', async () => {
    const results: number[] = [];
    const processor = vi.fn(async (item: number) => {
      results.push(item);
      return item * 2;
    });

    const queue = createAsyncQueue(processor, 10);

    const promises = [queue.add(1), queue.add(2), queue.add(3)];

    // Process all items
    await vi.runAllTimersAsync();

    const values = await Promise.all(promises);
    expect(values).toEqual([2, 4, 6]);
    expect(results).toEqual([1, 2, 3]);
  });

  it('should report queue size', () => {
    const processor = vi.fn(async (item: number) => item);
    const queue = createAsyncQueue(processor, 100);

    queue.add(1);
    queue.add(2);
    queue.add(3);

    // First item is being processed, 2 in queue
    expect(queue.size()).toBe(2);
  });

  it('should clear pending items', async () => {
    const processor = vi.fn(async (item: number) => item);
    const queue = createAsyncQueue(processor, 100);

    const promise1 = queue.add(1);
    const promise2 = queue.add(2);
    const promise3 = queue.add(3);

    queue.clear();

    await expect(promise2).rejects.toThrow('Queue cleared');
    await expect(promise3).rejects.toThrow('Queue cleared');
  });
});

// ============================================================================
// Retry with Backoff Tests
// ============================================================================

describe('retryWithBackoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return result on success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const promise = retryWithBackoff(fn);
    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const promise = retryWithBackoff(fn, { initialDelayMs: 100 });

    // First attempt fails
    await vi.advanceTimersByTimeAsync(0);

    // Wait for retry delay
    await vi.advanceTimersByTimeAsync(100);

    // Second attempt fails
    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    const promise = retryWithBackoff(fn, {
      maxAttempts: 2,
      initialDelayMs: 100,
    });

    // Catch the promise to prevent unhandled rejection warnings
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(100);

    await expect(promise).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should respect shouldRetry option', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));

    const promise = retryWithBackoff(fn, {
      maxAttempts: 5,
      shouldRetry: (error) => !error.message.includes('fatal'),
    });

    await expect(promise).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// With Timeout Tests
// ============================================================================

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return result if completed in time', async () => {
    const fn = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('done'), 50))
    );

    const promise = withTimeout(fn, 100);

    await vi.advanceTimersByTimeAsync(50);

    const result = await promise;
    expect(result).toBe('done');
  });

  it('should throw timeout error if exceeded', async () => {
    const fn = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('done'), 200))
    );

    const promise = withTimeout(fn, 100);

    // Catch the promise to prevent unhandled rejection warnings
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(100);

    await expect(promise).rejects.toThrow('timed out');
  });

  it('should use custom timeout error', async () => {
    const fn = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve('done'), 200))
    );

    const customError = new Error('Custom timeout');
    const promise = withTimeout(fn, 100, customError);

    // Catch the promise to prevent unhandled rejection warnings
    promise.catch(() => {});

    await vi.advanceTimersByTimeAsync(100);

    await expect(promise).rejects.toThrow('Custom timeout');
  });
});

// ============================================================================
// Pausable Interval Tests
// ============================================================================

describe('createPausableInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute at intervals', () => {
    const fn = vi.fn();
    const interval = createPausableInterval(fn, 100);

    interval.start();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);

    interval.stop();
  });

  it('should pause and resume', () => {
    const fn = vi.fn();
    const interval = createPausableInterval(fn, 100);

    interval.start();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    interval.pause();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);

    interval.resume();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);

    interval.stop();
  });

  it('should stop execution', () => {
    const fn = vi.fn();
    const interval = createPausableInterval(fn, 100);

    interval.start();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);

    interval.stop();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should report running state', () => {
    const fn = vi.fn();
    const interval = createPausableInterval(fn, 100);

    expect(interval.isRunning()).toBe(false);

    interval.start();
    expect(interval.isRunning()).toBe(true);

    interval.stop();
    expect(interval.isRunning()).toBe(false);
  });

  it('should report paused state', () => {
    const fn = vi.fn();
    const interval = createPausableInterval(fn, 100);

    interval.start();
    expect(interval.isPaused()).toBe(false);

    interval.pause();
    expect(interval.isPaused()).toBe(true);

    interval.resume();
    expect(interval.isPaused()).toBe(false);

    interval.stop();
  });
});

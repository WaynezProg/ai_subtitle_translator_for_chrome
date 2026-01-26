/**
 * Tests for Retry Utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  // Delay strategies
  exponentialBackoff,
  addJitter,
  calculateDelay,
  // Core retry functions
  sleep,
  withTimeout,
  retry,
  retryWithResult,
  // Retry with fallback
  retryWithFallback,
  retryWithFallbacks,
  // Conditional retry
  retryOnErrorTypes,
  retryOnErrorMessages,
  retryOnHttpStatus,
  combineRetryConditions,
  // Circuit breaker
  CircuitBreaker,
  withCircuitBreaker,
  // Batch retry
  batchRetry,
  raceRetry,
  // Utility functions
  makeRetryable,
  Retryable,
  waitFor,
  retryLinear,
  retryFixed,
} from '@shared/utils/retry-utils';

describe('Retry Utils', () => {
  describe('Delay Strategies', () => {
    describe('exponentialBackoff', () => {
      it('should calculate correct delay for first attempt', () => {
        expect(exponentialBackoff(1, 1000, 30000, 2)).toBe(1000);
      });

      it('should double delay for each attempt', () => {
        expect(exponentialBackoff(2, 1000, 30000, 2)).toBe(2000);
        expect(exponentialBackoff(3, 1000, 30000, 2)).toBe(4000);
        expect(exponentialBackoff(4, 1000, 30000, 2)).toBe(8000);
      });

      it('should respect maxDelay', () => {
        expect(exponentialBackoff(10, 1000, 30000, 2)).toBe(30000);
      });

      it('should support custom multiplier', () => {
        expect(exponentialBackoff(2, 1000, 30000, 3)).toBe(3000);
        expect(exponentialBackoff(3, 1000, 30000, 3)).toBe(9000);
      });
    });

    describe('addJitter', () => {
      it('should add jitter within range', () => {
        const delay = 1000;
        const factor = 0.1;

        for (let i = 0; i < 100; i++) {
          const result = addJitter(delay, factor);
          expect(result).toBeGreaterThanOrEqual(delay * (1 - factor));
          expect(result).toBeLessThanOrEqual(delay * (1 + factor));
        }
      });

      it('should return non-negative values', () => {
        expect(addJitter(0, 0.5)).toBeGreaterThanOrEqual(0);
      });
    });

    describe('calculateDelay', () => {
      it('should calculate delay with defaults', () => {
        const delay = calculateDelay(1, {});
        expect(delay).toBeGreaterThan(0);
      });

      it('should calculate delay without jitter', () => {
        const delay = calculateDelay(2, {
          initialDelay: 100,
          backoffMultiplier: 2,
          jitter: false,
        });
        expect(delay).toBe(200);
      });

      it('should round to integer', () => {
        const delay = calculateDelay(1, { jitter: true });
        expect(Number.isInteger(delay)).toBe(true);
      });
    });
  });

  describe('Core Retry Functions', () => {
    describe('sleep', () => {
      it('should sleep for specified duration', async () => {
        const start = Date.now();
        await sleep(50);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(45);
      });

      it('should abort on signal', async () => {
        const controller = new AbortController();

        setTimeout(() => controller.abort(), 10);

        await expect(sleep(100, controller.signal)).rejects.toThrow('Aborted');
      });

      it('should reject immediately if already aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(sleep(100, controller.signal)).rejects.toThrow('Aborted');
      });
    });

    describe('withTimeout', () => {
      it('should return result if completed within timeout', async () => {
        const result = await withTimeout(
          () => Promise.resolve('success'),
          100
        );
        expect(result).toBe('success');
      });

      it('should reject if timeout exceeded', async () => {
        await expect(
          withTimeout(
            () => new Promise((resolve) => setTimeout(resolve, 100)),
            10
          )
        ).rejects.toThrow('timed out');
      });

      it('should abort on signal', async () => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 10);

        await expect(
          withTimeout(
            () => new Promise((resolve) => setTimeout(resolve, 100)),
            200,
            controller.signal
          )
        ).rejects.toThrow('Aborted');
      });
    });

    describe('retry', () => {
      it('should return result on success', async () => {
        const fn = vi.fn().mockResolvedValue('success');

        const result = await retry(fn);

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should retry on failure', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('fail 1'))
          .mockRejectedValueOnce(new Error('fail 2'))
          .mockResolvedValue('success');

        const result = await retry(fn, { initialDelay: 10, maxAttempts: 3 });

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(3);
      });

      it('should throw after max attempts', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('always fails'));

        await expect(
          retry(fn, { maxAttempts: 3, initialDelay: 10 })
        ).rejects.toThrow('always fails');

        expect(fn).toHaveBeenCalledTimes(3);
      });

      it('should call onRetry callback', async () => {
        const onRetry = vi.fn();
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('fail'))
          .mockResolvedValue('success');

        await retry(fn, { onRetry, initialDelay: 10 });

        expect(onRetry).toHaveBeenCalledTimes(1);
        expect(onRetry).toHaveBeenCalledWith(
          expect.any(Error),
          1,
          expect.any(Number)
        );
      });

      it('should respect shouldRetry predicate', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('permanent error'));

        await expect(
          retry(fn, {
            maxAttempts: 5,
            initialDelay: 10,
            shouldRetry: (error) => !error.message.includes('permanent'),
          })
        ).rejects.toThrow('permanent error');

        expect(fn).toHaveBeenCalledTimes(1);
      });

      it('should abort on signal', async () => {
        const controller = new AbortController();
        const fn = vi.fn().mockRejectedValue(new Error('fail'));

        setTimeout(() => controller.abort(), 20);

        await expect(
          retry(fn, {
            maxAttempts: 10,
            initialDelay: 50,
            signal: controller.signal,
          })
        ).rejects.toThrow('Aborted');
      });

      it('should apply timeout per attempt', async () => {
        const fn = vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('late'), 100))
        );

        await expect(
          retry(fn, { maxAttempts: 2, timeout: 10, initialDelay: 10 })
        ).rejects.toThrow('timed out');

        expect(fn).toHaveBeenCalledTimes(2);
      });
    });

    describe('retryWithResult', () => {
      it('should return success result', async () => {
        const fn = vi.fn().mockResolvedValue('success');

        const result = await retryWithResult(fn);

        expect(result.success).toBe(true);
        expect(result.value).toBe('success');
        expect(result.attempts).toBe(1);
      });

      it('should return failure result after max attempts', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'));

        const result = await retryWithResult(fn, { maxAttempts: 3, initialDelay: 10 });

        expect(result.success).toBe(false);
        expect(result.error?.message).toBe('fail');
        expect(result.attempts).toBe(3);
      });

      it('should track total time', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('fail'))
          .mockResolvedValue('success');

        const result = await retryWithResult(fn, { initialDelay: 20 });

        expect(result.totalTime).toBeGreaterThan(0);
      });
    });
  });

  describe('Retry with Fallback', () => {
    describe('retryWithFallback', () => {
      it('should return result on success', async () => {
        const fn = vi.fn().mockResolvedValue('success');

        const result = await retryWithFallback(fn, 'fallback');

        expect(result).toBe('success');
      });

      it('should return fallback value on failure', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'));

        const result = await retryWithFallback(fn, 'fallback', {
          maxAttempts: 2,
          initialDelay: 10,
        });

        expect(result).toBe('fallback');
      });

      it('should call fallback function', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'));
        const fallbackFn = vi.fn().mockReturnValue('computed fallback');

        const result = await retryWithFallback(fn, fallbackFn, {
          maxAttempts: 1,
          initialDelay: 10,
        });

        expect(result).toBe('computed fallback');
        expect(fallbackFn).toHaveBeenCalled();
      });

      it('should support async fallback function', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('fail'));
        const fallbackFn = vi.fn().mockResolvedValue('async fallback');

        const result = await retryWithFallback(fn, fallbackFn, {
          maxAttempts: 1,
          initialDelay: 10,
        });

        expect(result).toBe('async fallback');
      });
    });

    describe('retryWithFallbacks', () => {
      it('should try strategies in order', async () => {
        const strategies = [
          vi.fn().mockRejectedValue(new Error('strategy 1 failed')),
          vi.fn().mockResolvedValue('strategy 2 success'),
          vi.fn().mockResolvedValue('strategy 3 success'),
        ];

        const result = await retryWithFallbacks(strategies, {
          maxAttempts: 1,
          initialDelay: 10,
        });

        expect(result).toBe('strategy 2 success');
        expect(strategies[0]).toHaveBeenCalled();
        expect(strategies[1]).toHaveBeenCalled();
        expect(strategies[2]).not.toHaveBeenCalled();
      });

      it('should throw AggregateError if all fail', async () => {
        const strategies = [
          vi.fn().mockRejectedValue(new Error('fail 1')),
          vi.fn().mockRejectedValue(new Error('fail 2')),
        ];

        await expect(
          retryWithFallbacks(strategies, { maxAttempts: 1, initialDelay: 10 })
        ).rejects.toThrow('All strategies failed');
      });
    });
  });

  describe('Conditional Retry', () => {
    describe('retryOnErrorTypes', () => {
      it('should retry on matching error type', () => {
        class CustomError extends Error {}
        const shouldRetry = retryOnErrorTypes(CustomError);

        expect(shouldRetry(new CustomError('test'))).toBe(true);
        expect(shouldRetry(new Error('test'))).toBe(false);
      });

      it('should match multiple error types', () => {
        class ErrorA extends Error {}
        class ErrorB extends Error {}
        const shouldRetry = retryOnErrorTypes(ErrorA, ErrorB);

        expect(shouldRetry(new ErrorA())).toBe(true);
        expect(shouldRetry(new ErrorB())).toBe(true);
        expect(shouldRetry(new Error())).toBe(false);
      });
    });

    describe('retryOnErrorMessages', () => {
      it('should retry on matching message string', () => {
        const shouldRetry = retryOnErrorMessages('timeout', 'Network');

        expect(shouldRetry(new Error('Connection timeout'))).toBe(true);
        expect(shouldRetry(new Error('Network error'))).toBe(true);
        expect(shouldRetry(new Error('Invalid input'))).toBe(false);
      });

      it('should retry on matching regex', () => {
        const shouldRetry = retryOnErrorMessages(/^(5\d\d|4\d\d)/);

        expect(shouldRetry(new Error('500 Internal Server Error'))).toBe(true);
        expect(shouldRetry(new Error('200 OK'))).toBe(false);
      });
    });

    describe('retryOnHttpStatus', () => {
      it('should retry on matching status code', () => {
        const shouldRetry = retryOnHttpStatus(500, 502, 503);

        const error500 = Object.assign(new Error('Server Error'), { status: 500 });
        const error404 = Object.assign(new Error('Not Found'), { status: 404 });

        expect(shouldRetry(error500)).toBe(true);
        expect(shouldRetry(error404)).toBe(false);
      });

      it('should check message for status code if status property missing', () => {
        const shouldRetry = retryOnHttpStatus(503);

        expect(shouldRetry(new Error('503 Service Unavailable'))).toBe(true);
        expect(shouldRetry(new Error('404 Not Found'))).toBe(false);
      });
    });

    describe('combineRetryConditions', () => {
      it('should combine conditions with OR logic', () => {
        const condition1 = (error: Error) => error.message.includes('timeout');
        const condition2 = (error: Error) => error.message.includes('network');
        const combined = combineRetryConditions(condition1, condition2);

        expect(combined(new Error('timeout'), 1)).toBe(true);
        expect(combined(new Error('network'), 1)).toBe(true);
        expect(combined(new Error('invalid'), 1)).toBe(false);
      });
    });
  });

  describe('Circuit Breaker', () => {
    describe('CircuitBreaker', () => {
      let breaker: CircuitBreaker;

      beforeEach(() => {
        breaker = new CircuitBreaker({
          failureThreshold: 3,
          successThreshold: 2,
          resetTimeout: 100,
        });
      });

      it('should start in closed state', () => {
        expect(breaker.getState()).toBe('closed');
      });

      it('should execute successfully', async () => {
        const result = await breaker.execute(() => Promise.resolve('success'));
        expect(result).toBe('success');
        expect(breaker.getState()).toBe('closed');
      });

      it('should open after failure threshold', async () => {
        const failingFn = () => Promise.reject(new Error('fail'));

        for (let i = 0; i < 3; i++) {
          await breaker.execute(failingFn).catch(() => {});
        }

        expect(breaker.getState()).toBe('open');
      });

      it('should reject when open', async () => {
        // Open the circuit
        for (let i = 0; i < 3; i++) {
          await breaker.execute(() => Promise.reject(new Error())).catch(() => {});
        }

        await expect(
          breaker.execute(() => Promise.resolve('success'))
        ).rejects.toThrow('Circuit breaker is open');
      });

      it('should transition to half-open after reset timeout', async () => {
        // Open the circuit
        for (let i = 0; i < 3; i++) {
          await breaker.execute(() => Promise.reject(new Error())).catch(() => {});
        }

        await sleep(150);

        // This should transition to half-open and attempt execution
        await breaker.execute(() => Promise.resolve('success'));

        expect(breaker.getState()).toBe('half-open');
      });

      it('should close after success threshold in half-open', async () => {
        // Open the circuit
        for (let i = 0; i < 3; i++) {
          await breaker.execute(() => Promise.reject(new Error())).catch(() => {});
        }

        await sleep(150);

        // Succeed twice to close
        await breaker.execute(() => Promise.resolve('success'));
        await breaker.execute(() => Promise.resolve('success'));

        expect(breaker.getState()).toBe('closed');
      });

      it('should return to open on failure in half-open', async () => {
        // Open the circuit
        for (let i = 0; i < 3; i++) {
          await breaker.execute(() => Promise.reject(new Error())).catch(() => {});
        }

        await sleep(150);

        // Succeed once, then fail
        await breaker.execute(() => Promise.resolve('success'));
        await breaker.execute(() => Promise.reject(new Error())).catch(() => {});

        expect(breaker.getState()).toBe('open');
      });

      it('should reset manually', () => {
        // Open the circuit
        for (let i = 0; i < 3; i++) {
          breaker.execute(() => Promise.reject(new Error())).catch(() => {});
        }

        breaker.reset();

        expect(breaker.getState()).toBe('closed');
        expect(breaker.getStats().failures).toBe(0);
      });

      it('should call onStateChange callback', async () => {
        const onStateChange = vi.fn();
        const breaker = new CircuitBreaker({
          failureThreshold: 2,
          onStateChange,
        });

        await breaker.execute(() => Promise.reject(new Error())).catch(() => {});
        await breaker.execute(() => Promise.reject(new Error())).catch(() => {});

        expect(onStateChange).toHaveBeenCalledWith('closed', 'open');
      });

      it('should respect isFailure predicate', async () => {
        const breaker = new CircuitBreaker({
          failureThreshold: 2,
          isFailure: (error) => !error.message.includes('ignore'),
        });

        await breaker.execute(() => Promise.reject(new Error('ignore me'))).catch(() => {});
        await breaker.execute(() => Promise.reject(new Error('ignore me'))).catch(() => {});

        expect(breaker.getState()).toBe('closed'); // Should not open
      });
    });

    describe('withCircuitBreaker', () => {
      it('should wrap function with circuit breaker', async () => {
        const fn = vi.fn().mockResolvedValue('success');
        const wrapped = withCircuitBreaker(fn);

        const result = await wrapped();

        expect(result).toBe('success');
        expect(wrapped.getState()).toBe('closed');
      });

      it('should expose getState and reset methods', () => {
        const fn = vi.fn().mockResolvedValue('success');
        const wrapped = withCircuitBreaker(fn);

        expect(typeof wrapped.getState).toBe('function');
        expect(typeof wrapped.reset).toBe('function');
      });
    });
  });

  describe('Batch Retry', () => {
    describe('batchRetry', () => {
      it('should process all items', async () => {
        const items = [1, 2, 3];
        const fn = vi.fn((item: number) => Promise.resolve(item * 2));

        const results = await batchRetry(items, fn);

        expect(results).toHaveLength(3);
        expect(results.every((r) => r.success)).toBe(true);
        expect(results.map((r) => r.value)).toEqual([2, 4, 6]);
      });

      it('should retry failed items', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('fail'))
          .mockResolvedValue('success');

        const results = await batchRetry([1], fn, {
          maxAttempts: 2,
          initialDelay: 10,
        });

        expect(results[0].success).toBe(true);
        expect(results[0].attempts).toBe(2);
      });

      it('should return failures without throwing', async () => {
        const fn = vi.fn().mockRejectedValue(new Error('always fails'));

        const results = await batchRetry([1, 2], fn, {
          maxAttempts: 2,
          initialDelay: 10,
        });

        expect(results.every((r) => !r.success)).toBe(true);
        expect(results.every((r) => r.error?.message === 'always fails')).toBe(true);
      });

      it('should respect concurrency', async () => {
        let concurrent = 0;
        let maxConcurrent = 0;

        const fn = vi.fn(async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await sleep(20);
          concurrent--;
          return 'done';
        });

        await batchRetry([1, 2, 3, 4, 5], fn, { concurrency: 2 });

        expect(maxConcurrent).toBeLessThanOrEqual(2);
      });
    });

    describe('raceRetry', () => {
      it('should return first success', async () => {
        const fns = [
          vi.fn(() => new Promise((_, reject) => setTimeout(() => reject(new Error()), 50))),
          vi.fn(() => Promise.resolve('fast')),
          vi.fn(() => new Promise((resolve) => setTimeout(() => resolve('slow'), 100))),
        ];

        const result = await raceRetry(fns);

        expect(result).toBe('fast');
      });

      it('should throw if all fail', async () => {
        const fns = [
          vi.fn().mockRejectedValue(new Error('fail 1')),
          vi.fn().mockRejectedValue(new Error('fail 2')),
        ];

        await expect(
          raceRetry(fns, { maxAttempts: 1, initialDelay: 10 })
        ).rejects.toThrow('All operations failed');
      });
    });
  });

  describe('Utility Functions', () => {
    describe('makeRetryable', () => {
      it('should create a retryable function', async () => {
        const fn = vi
          .fn()
          .mockRejectedValueOnce(new Error('fail'))
          .mockResolvedValue('success');

        const retryableFn = makeRetryable(fn, {
          maxAttempts: 2,
          initialDelay: 10,
        });

        const result = await retryableFn();

        expect(result).toBe('success');
        expect(fn).toHaveBeenCalledTimes(2);
      });
    });

    describe('Retryable decorator', () => {
      it('should create decorator function', () => {
        // Test that Retryable returns a decorator function
        const decorator = Retryable({ maxAttempts: 3, initialDelay: 10 });
        expect(typeof decorator).toBe('function');
      });

      it('should decorate method manually', async () => {
        class Service {
          callCount = 0;

          async fetch(): Promise<string> {
            this.callCount++;
            if (this.callCount < 3) {
              throw new Error('fail');
            }
            return 'success';
          }
        }

        const service = new Service();

        // Manually apply decorator behavior using makeRetryable
        const retryableFetch = makeRetryable(
          () => service.fetch(),
          { maxAttempts: 3, initialDelay: 10 }
        );

        const result = await retryableFetch();

        expect(result).toBe('success');
        expect(service.callCount).toBe(3);
      });
    });

    describe('waitFor', () => {
      it('should resolve when condition becomes true', async () => {
        let counter = 0;
        const condition = () => {
          counter++;
          return counter >= 3;
        };

        await waitFor(condition, { interval: 10 });

        expect(counter).toBe(3);
      });

      it('should support async condition', async () => {
        let counter = 0;
        const condition = async () => {
          counter++;
          return counter >= 2;
        };

        await waitFor(condition, { interval: 10 });

        expect(counter).toBe(2);
      });

      it('should timeout if condition never true', async () => {
        await expect(
          waitFor(() => false, { timeout: 50, interval: 10 })
        ).rejects.toThrow('Timeout');
      });

      it('should use custom message', async () => {
        await expect(
          waitFor(() => false, { timeout: 50, interval: 10, message: 'Custom message' })
        ).rejects.toThrow('Custom message');
      });
    });

    describe('retryLinear', () => {
      it('should use linear backoff', async () => {
        const delays: number[] = [];
        const fn = vi.fn().mockRejectedValue(new Error('fail'));

        await retryLinear(fn, {
          maxAttempts: 3,
          initialDelay: 100,
          delayIncrement: 100,
          onRetry: (_, __, delay) => delays.push(delay),
        }).catch(() => {});

        expect(delays[0]).toBe(100);
        expect(delays[1]).toBe(200);
      });
    });

    describe('retryFixed', () => {
      it('should use fixed delay', async () => {
        const delays: number[] = [];
        const fn = vi.fn().mockRejectedValue(new Error('fail'));

        await retryFixed(fn, {
          maxAttempts: 3,
          initialDelay: 100,
          onRetry: (_, __, delay) => delays.push(delay),
        }).catch(() => {});

        expect(delays.every((d) => d === 100)).toBe(true);
      });
    });
  });
});

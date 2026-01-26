/**
 * Async Utilities
 *
 * Provides comprehensive async/promise utilities:
 * - Promise combinators (allSettled, race with timeout, etc.)
 * - Concurrency control (semaphore, mutex, queue)
 * - Retry strategies with backoff
 * - Async iteration helpers
 * - Cancellation support
 */

import { createLogger } from './logger';

const logger = createLogger('AsyncUtils');

// ============================================================================
// Types
// ============================================================================

/**
 * Result of a settled promise
 */
export type SettledResult<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown };

/**
 * Retry options
 */
export interface RetryOptions {
  /** Maximum number of attempts */
  maxAttempts?: number;
  /** Initial delay in milliseconds */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds */
  maxDelayMs?: number;
  /** Backoff multiplier */
  backoffMultiplier?: number;
  /** Whether to add jitter */
  jitter?: boolean;
  /** Predicate to determine if error is retryable */
  retryIf?: (error: unknown, attempt: number) => boolean;
  /** Called before each retry */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Timeout options
 */
export interface TimeoutOptions {
  /** Timeout in milliseconds */
  timeoutMs: number;
  /** Custom error message */
  message?: string;
}

/**
 * Concurrency pool options
 */
export interface PoolOptions {
  /** Maximum concurrent operations */
  concurrency: number;
  /** Whether to stop on first error */
  stopOnError?: boolean;
}

/**
 * Cancellation token
 */
export interface CancellationToken {
  readonly isCancelled: boolean;
  readonly reason?: string;
  throwIfCancelled(): void;
  onCancel(callback: () => void): () => void;
}

// ============================================================================
// Promise Combinators
// ============================================================================

/**
 * Wait for all promises to settle (fulfilled or rejected)
 */
export async function allSettled<T>(promises: Promise<T>[]): Promise<SettledResult<T>[]> {
  return Promise.allSettled(promises) as Promise<SettledResult<T>[]>;
}

/**
 * Wait for first promise to fulfill (ignores rejections until all reject)
 */
export async function any<T>(promises: Promise<T>[]): Promise<T> {
  return Promise.any(promises);
}

/**
 * Race promises with a timeout
 */
export async function raceWithTimeout<T>(
  promise: Promise<T>,
  options: TimeoutOptions
): Promise<T> {
  const { timeoutMs, message = `Operation timed out after ${timeoutMs}ms` } = options;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Execute promises in sequence
 */
export async function sequence<T>(
  tasks: (() => Promise<T>)[]
): Promise<T[]> {
  const results: T[] = [];
  for (const task of tasks) {
    results.push(await task());
  }
  return results;
}

/**
 * Execute promises with limited concurrency
 */
export async function parallel<T>(
  tasks: (() => Promise<T>)[],
  options: PoolOptions
): Promise<T[]> {
  const { concurrency, stopOnError = false } = options;
  const results: T[] = new Array(tasks.length);
  let currentIndex = 0;
  let hasError = false;
  let firstError: unknown;

  async function runNext(): Promise<void> {
    while (currentIndex < tasks.length && !hasError) {
      const index = currentIndex++;
      try {
        results[index] = await tasks[index]();
      } catch (error) {
        if (stopOnError) {
          hasError = true;
          firstError = error;
        } else {
          throw error;
        }
      }
    }
  }

  const workers = Array(Math.min(concurrency, tasks.length))
    .fill(null)
    .map(() => runNext());

  await Promise.all(workers);

  if (hasError) {
    throw firstError;
  }

  return results;
}

/**
 * Map array with concurrency limit
 */
export async function mapAsync<T, U>(
  items: T[],
  mapper: (item: T, index: number) => Promise<U>,
  options: PoolOptions
): Promise<U[]> {
  const tasks = items.map((item, index) => () => mapper(item, index));
  return parallel(tasks, options);
}

/**
 * Filter array asynchronously
 */
export async function filterAsync<T>(
  items: T[],
  predicate: (item: T, index: number) => Promise<boolean>,
  options?: PoolOptions
): Promise<T[]> {
  const results = await mapAsync(
    items,
    async (item, index) => ({ item, include: await predicate(item, index) }),
    options || { concurrency: Infinity }
  );
  return results.filter((r) => r.include).map((r) => r.item);
}

/**
 * Find first matching item asynchronously
 */
export async function findAsync<T>(
  items: T[],
  predicate: (item: T, index: number) => Promise<boolean>
): Promise<T | undefined> {
  for (let i = 0; i < items.length; i++) {
    if (await predicate(items[i], i)) {
      return items[i];
    }
  }
  return undefined;
}

/**
 * Check if any item matches predicate asynchronously
 */
export async function someAsync<T>(
  items: T[],
  predicate: (item: T, index: number) => Promise<boolean>
): Promise<boolean> {
  for (let i = 0; i < items.length; i++) {
    if (await predicate(items[i], i)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if all items match predicate asynchronously
 */
export async function everyAsync<T>(
  items: T[],
  predicate: (item: T, index: number) => Promise<boolean>
): Promise<boolean> {
  for (let i = 0; i < items.length; i++) {
    if (!(await predicate(items[i], i))) {
      return false;
    }
  }
  return true;
}

// ============================================================================
// Retry Logic
// ============================================================================

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffMultiplier = 2,
    jitter = true,
    retryIf = () => true,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts || !retryIf(error, attempt)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      let delay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);
      delay = Math.min(delay, maxDelayMs);

      // Add jitter
      if (jitter) {
        delay = delay * (0.5 + Math.random());
      }

      onRetry?.(error, attempt, delay);
      logger.debug('Retrying operation', { attempt, delay, error });

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Retry with simple linear delay
 */
export async function retryLinear<T>(
  fn: (attempt: number) => Promise<T>,
  maxAttempts: number,
  delayMs: number
): Promise<T> {
  return retry(fn, {
    maxAttempts,
    initialDelayMs: delayMs,
    backoffMultiplier: 1,
    jitter: false,
  });
}

// ============================================================================
// Delay and Sleep
// ============================================================================

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Sleep with cancellation support
 */
export function sleepCancellable(
  ms: number,
  token?: CancellationToken
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);

    if (token) {
      const unsubscribe = token.onCancel(() => {
        clearTimeout(timer);
        reject(new Error(token.reason || 'Cancelled'));
      });

      // Clean up subscription after sleep completes
      setTimeout(() => unsubscribe(), ms + 1);
    }
  });
}

/**
 * Defer execution to next tick
 */
export function nextTick(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof setImmediate !== 'undefined') {
      setImmediate(resolve);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Wait for next animation frame
 */
export function nextFrame(): Promise<DOMHighResTimeStamp> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(resolve);
    } else {
      setTimeout(() => resolve(performance.now()), 16);
    }
  });
}

// ============================================================================
// Concurrency Control
// ============================================================================

/**
 * Semaphore for limiting concurrent operations
 */
export class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  /**
   * Acquire a permit
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  /**
   * Release a permit
   */
  release(): void {
    const next = this.queue.shift();
    if (next) {
      next();
    } else {
      this.permits++;
    }
  }

  /**
   * Run function with acquired permit
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  /**
   * Get available permits
   */
  get available(): number {
    return this.permits;
  }

  /**
   * Get queue length
   */
  get waiting(): number {
    return this.queue.length;
  }
}

/**
 * Mutex for exclusive access
 */
export class Mutex {
  private semaphore = new Semaphore(1);

  async lock(): Promise<void> {
    return this.semaphore.acquire();
  }

  unlock(): void {
    this.semaphore.release();
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    return this.semaphore.run(fn);
  }

  get isLocked(): boolean {
    return this.semaphore.available === 0;
  }
}

/**
 * Async queue with concurrency control
 */
export class AsyncQueue<T> {
  private queue: Array<() => Promise<T>> = [];
  private running = 0;
  private readonly concurrency: number;
  private readonly results: T[] = [];
  private resolveAll?: (results: T[]) => void;
  private rejectAll?: (error: unknown) => void;
  private completed = false;

  constructor(concurrency = 1) {
    this.concurrency = concurrency;
  }

  /**
   * Add task to queue
   */
  push(task: () => Promise<T>): void {
    if (this.completed) {
      throw new Error('Queue is completed');
    }
    this.queue.push(task);
    this.processNext();
  }

  /**
   * Wait for all tasks to complete
   */
  async drain(): Promise<T[]> {
    if (this.queue.length === 0 && this.running === 0) {
      return this.results;
    }

    return new Promise<T[]>((resolve, reject) => {
      this.resolveAll = resolve;
      this.rejectAll = reject;
    });
  }

  /**
   * Get queue length
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Get number of running tasks
   */
  get active(): number {
    return this.running;
  }

  private async processNext(): Promise<void> {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift();
    if (!task) return;

    this.running++;

    try {
      const result = await task();
      this.results.push(result);
    } catch (error) {
      this.completed = true;
      this.rejectAll?.(error);
      return;
    } finally {
      this.running--;
    }

    if (this.queue.length === 0 && this.running === 0) {
      this.completed = true;
      this.resolveAll?.(this.results);
    } else {
      this.processNext();
    }
  }
}

// ============================================================================
// Cancellation
// ============================================================================

/**
 * Create a cancellation token source
 */
export function createCancellationToken(): {
  token: CancellationToken;
  cancel: (reason?: string) => void;
} {
  let isCancelled = false;
  let cancelReason: string | undefined;
  const callbacks: Array<() => void> = [];

  const token: CancellationToken = {
    get isCancelled() {
      return isCancelled;
    },
    get reason() {
      return cancelReason;
    },
    throwIfCancelled() {
      if (isCancelled) {
        throw new Error(cancelReason || 'Operation cancelled');
      }
    },
    onCancel(callback: () => void) {
      if (isCancelled) {
        callback();
        return () => {};
      }
      callbacks.push(callback);
      return () => {
        const index = callbacks.indexOf(callback);
        if (index !== -1) {
          callbacks.splice(index, 1);
        }
      };
    },
  };

  const cancel = (reason?: string) => {
    if (isCancelled) return;
    isCancelled = true;
    cancelReason = reason;
    for (const callback of callbacks) {
      try {
        callback();
      } catch (error) {
        logger.error('Error in cancellation callback', { error });
      }
    }
    callbacks.length = 0;
  };

  return { token, cancel };
}

/**
 * Run function with cancellation support
 */
export async function withCancellation<T>(
  fn: (token: CancellationToken) => Promise<T>,
  timeoutMs?: number
): Promise<{ result: T; cancel: () => void }> {
  const { token, cancel } = createCancellationToken();

  let timer: ReturnType<typeof setTimeout> | undefined;
  if (timeoutMs) {
    timer = setTimeout(() => cancel('Timeout'), timeoutMs);
  }

  try {
    const result = await fn(token);
    return { result, cancel };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

// ============================================================================
// Deferred Promise
// ============================================================================

/**
 * Deferred promise that can be resolved/rejected externally
 */
export class Deferred<T> {
  readonly promise: Promise<T>;
  private _resolve!: (value: T) => void;
  private _reject!: (reason: unknown) => void;
  private _isSettled = false;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  resolve(value: T): void {
    if (!this._isSettled) {
      this._isSettled = true;
      this._resolve(value);
    }
  }

  reject(reason: unknown): void {
    if (!this._isSettled) {
      this._isSettled = true;
      this._reject(reason);
    }
  }

  get isSettled(): boolean {
    return this._isSettled;
  }
}

// ============================================================================
// Async Event Handling
// ============================================================================

/**
 * Create a promise that resolves on event
 */
export function once<T>(
  emitter: { addEventListener: (event: string, handler: (e: T) => void) => void; removeEventListener: (event: string, handler: (e: T) => void) => void },
  event: string,
  options?: TimeoutOptions
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const handler = (e: T) => {
      if (timer) clearTimeout(timer);
      emitter.removeEventListener(event, handler);
      resolve(e);
    };

    emitter.addEventListener(event, handler);

    if (options?.timeoutMs) {
      timer = setTimeout(() => {
        emitter.removeEventListener(event, handler);
        reject(new Error(options.message || `Event ${event} timed out`));
      }, options.timeoutMs);
    }
  });
}

/**
 * Poll until condition is met
 */
export async function poll<T>(
  fn: () => Promise<T | null | undefined>,
  options: {
    intervalMs: number;
    timeoutMs?: number;
    immediate?: boolean;
  }
): Promise<T> {
  const { intervalMs, timeoutMs, immediate = true } = options;
  const startTime = Date.now();

  if (immediate) {
    const result = await fn();
    if (result !== null && result !== undefined) {
      return result;
    }
  }

  while (true) {
    if (timeoutMs && Date.now() - startTime > timeoutMs) {
      throw new Error('Polling timed out');
    }

    await sleep(intervalMs);

    const result = await fn();
    if (result !== null && result !== undefined) {
      return result;
    }
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Wrap callback-based function as promise
 */
export function promisify<T>(
  fn: (callback: (error: Error | null, result: T) => void) => void
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    fn((error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Create a timeout promise that rejects after specified time
 */
export function timeout(ms: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message || `Timeout after ${ms}ms`));
    }, ms);
  });
}

/**
 * Ignore errors from a promise
 */
export async function ignoreErrors<T>(
  promise: Promise<T>,
  defaultValue: T
): Promise<T> {
  try {
    return await promise;
  } catch {
    return defaultValue;
  }
}

/**
 * Log errors but don't throw
 */
export async function logErrors<T>(
  promise: Promise<T>,
  context?: string
): Promise<T | undefined> {
  try {
    return await promise;
  } catch (error) {
    logger.error('Async operation failed', { context, error });
    return undefined;
  }
}

/**
 * Run async function and return tuple [error, result]
 */
export async function tryCatch<T>(
  fn: () => Promise<T>
): Promise<[Error, undefined] | [undefined, T]> {
  try {
    const result = await fn();
    return [undefined, result];
  } catch (error) {
    return [error instanceof Error ? error : new Error(String(error)), undefined];
  }
}

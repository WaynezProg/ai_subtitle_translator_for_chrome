/**
 * Retry Utilities
 *
 * Provides comprehensive retry patterns for handling transient failures:
 * - Exponential backoff with jitter
 * - Fixed delay retries
 * - Conditional retries based on error type
 * - Circuit breaker pattern
 * - Retry with fallback
 * - Batch retry for multiple operations
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Retry configuration options
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in ms (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in ms (default: 30000) */
  maxDelay?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Add random jitter to delays (default: true) */
  jitter?: boolean;
  /** Jitter factor 0-1 (default: 0.1) */
  jitterFactor?: number;
  /** Function to determine if error should be retried */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** Callback called before each retry */
  onRetry?: (error: Error, attempt: number, delay: number) => void;
  /** Timeout per attempt in ms (optional) */
  timeout?: number;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Retry result with metadata
 */
export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: Error;
  attempts: number;
  totalTime: number;
}

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker options
 */
export interface CircuitBreakerOptions {
  /** Failure threshold to open circuit (default: 5) */
  failureThreshold?: number;
  /** Success threshold to close circuit (default: 2) */
  successThreshold?: number;
  /** Time to wait before half-open in ms (default: 30000) */
  resetTimeout?: number;
  /** Function to determine if error should count as failure */
  isFailure?: (error: Error) => boolean;
  /** Callback when state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

// ============================================================================
// Delay Strategies
// ============================================================================

/**
 * Calculate exponential backoff delay
 */
export function exponentialBackoff(
  attempt: number,
  initialDelay: number,
  maxDelay: number,
  multiplier: number
): number {
  const delay = initialDelay * Math.pow(multiplier, attempt - 1);
  return Math.min(delay, maxDelay);
}

/**
 * Add jitter to a delay
 */
export function addJitter(delay: number, factor: number = 0.1): number {
  const jitter = delay * factor * (Math.random() * 2 - 1);
  return Math.max(0, delay + jitter);
}

/**
 * Calculate delay for a retry attempt
 */
export function calculateDelay(
  attempt: number,
  options: Pick<
    RetryOptions,
    'initialDelay' | 'maxDelay' | 'backoffMultiplier' | 'jitter' | 'jitterFactor'
  >
): number {
  const {
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    jitter = true,
    jitterFactor = 0.1,
  } = options;

  let delay = exponentialBackoff(attempt, initialDelay, maxDelay, backoffMultiplier);

  if (jitter) {
    delay = addJitter(delay, jitterFactor);
  }

  return Math.round(delay);
}

// ============================================================================
// Core Retry Functions
// ============================================================================

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const timeoutId = setTimeout(resolve, ms);

    signal?.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      reject(new Error('Aborted'));
    });
  });
}

/**
 * Execute a function with timeout
 */
export function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }

    const timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const cleanup = () => clearTimeout(timeoutId);

    signal?.addEventListener('abort', () => {
      cleanup();
      reject(new Error('Aborted'));
    });

    fn()
      .then((result) => {
        cleanup();
        resolve(result);
      })
      .catch((error) => {
        cleanup();
        reject(error);
      });
  });
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    shouldRetry = () => true,
    onRetry,
    timeout,
    signal,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new Error('Aborted');
    }

    try {
      const operation = timeout ? withTimeout(fn, timeout, signal) : fn();
      return await operation;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts || !shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      const delay = calculateDelay(attempt, options);

      if (onRetry) {
        onRetry(lastError, attempt, delay);
      }

      await sleep(delay, signal);
    }
  }

  throw lastError ?? new Error('Retry failed');
}

/**
 * Retry with detailed result (doesn't throw)
 */
export async function retryWithResult<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const startTime = Date.now();
  let attempts = 0;

  const { maxAttempts = 3, shouldRetry = () => true, onRetry, timeout, signal } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;

    if (signal?.aborted) {
      return {
        success: false,
        error: new Error('Aborted'),
        attempts,
        totalTime: Date.now() - startTime,
      };
    }

    try {
      const operation = timeout ? withTimeout(fn, timeout, signal) : fn();
      const value = await operation;
      return {
        success: true,
        value,
        attempts,
        totalTime: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts || !shouldRetry(lastError, attempt)) {
        return {
          success: false,
          error: lastError,
          attempts,
          totalTime: Date.now() - startTime,
        };
      }

      const delay = calculateDelay(attempt, options);

      if (onRetry) {
        onRetry(lastError, attempt, delay);
      }

      await sleep(delay, signal);
    }
  }

  return {
    success: false,
    error: lastError ?? new Error('Retry failed'),
    attempts,
    totalTime: Date.now() - startTime,
  };
}

// ============================================================================
// Retry with Fallback
// ============================================================================

/**
 * Retry with fallback value on failure
 */
export async function retryWithFallback<T>(
  fn: () => Promise<T>,
  fallback: T | (() => T | Promise<T>),
  options: RetryOptions = {}
): Promise<T> {
  try {
    return await retry(fn, options);
  } catch {
    return typeof fallback === 'function' ? (fallback as () => T | Promise<T>)() : fallback;
  }
}

/**
 * Retry with multiple fallback strategies
 */
export async function retryWithFallbacks<T>(
  strategies: Array<() => Promise<T>>,
  options: RetryOptions = {}
): Promise<T> {
  const errors: Error[] = [];

  for (const strategy of strategies) {
    try {
      return await retry(strategy, options);
    } catch (error) {
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }

  throw new AggregateError(errors, 'All strategies failed');
}

// ============================================================================
// Conditional Retry
// ============================================================================

/**
 * Create a shouldRetry function that retries on specific error types
 */
export function retryOnErrorTypes(
  ...errorTypes: Array<new (...args: unknown[]) => Error>
): (error: Error) => boolean {
  return (error: Error) => errorTypes.some((type) => error instanceof type);
}

/**
 * Create a shouldRetry function that retries on specific error messages
 */
export function retryOnErrorMessages(
  ...patterns: Array<string | RegExp>
): (error: Error) => boolean {
  return (error: Error) =>
    patterns.some((pattern) =>
      pattern instanceof RegExp ? pattern.test(error.message) : error.message.includes(pattern)
    );
}

/**
 * Create a shouldRetry function that retries on HTTP status codes
 */
export function retryOnHttpStatus(
  ...statusCodes: number[]
): (error: Error & { status?: number }) => boolean {
  return (error: Error & { status?: number }) => {
    if (error.status !== undefined) {
      return statusCodes.includes(error.status);
    }
    // Check message for status codes
    return statusCodes.some((code) => error.message.includes(String(code)));
  };
}

/**
 * Combine multiple shouldRetry functions with OR logic
 */
export function combineRetryConditions(
  ...conditions: Array<(error: Error, attempt: number) => boolean>
): (error: Error, attempt: number) => boolean {
  return (error: Error, attempt: number) =>
    conditions.some((condition) => condition(error, attempt));
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Circuit breaker for protecting against cascading failures
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime?: number;
  private readonly failureThreshold: number;
  private readonly successThreshold: number;
  private readonly resetTimeout: number;
  private readonly isFailure: (error: Error) => boolean;
  private readonly onStateChange?: (from: CircuitState, to: CircuitState) => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.successThreshold = options.successThreshold ?? 2;
    this.resetTimeout = options.resetTimeout ?? 30000;
    this.isFailure = options.isFailure ?? (() => true);
    this.onStateChange = options.onStateChange;
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('half-open');
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this.isFailure(err)) {
        this.recordFailure();
      }
      throw error;
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats(): {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureTime?: number;
  } {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
    };
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.transitionTo('closed');
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = undefined;
  }

  private recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.reset();
      }
    } else if (this.state === 'closed') {
      this.failures = 0;
    }
  }

  private recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.transitionTo('open');
      this.successes = 0;
    } else if (this.state === 'closed' && this.failures >= this.failureThreshold) {
      this.transitionTo('open');
    }
  }

  private shouldAttemptReset(): boolean {
    return (
      this.lastFailureTime !== undefined &&
      Date.now() - this.lastFailureTime >= this.resetTimeout
    );
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state !== newState) {
      const from = this.state;
      this.state = newState;
      this.onStateChange?.(from, newState);
    }
  }
}

/**
 * Create a function wrapped with circuit breaker protection
 */
export function withCircuitBreaker<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: CircuitBreakerOptions = {}
): T & { getState: () => CircuitState; reset: () => void } {
  const breaker = new CircuitBreaker(options);

  const wrapped = ((...args: Parameters<T>) =>
    breaker.execute(() => fn(...args))) as T & {
    getState: () => CircuitState;
    reset: () => void;
  };

  wrapped.getState = () => breaker.getState();
  wrapped.reset = () => breaker.reset();

  return wrapped;
}

// ============================================================================
// Batch Retry
// ============================================================================

/**
 * Result of a batch operation
 */
export interface BatchResult<T> {
  index: number;
  success: boolean;
  value?: T;
  error?: Error;
  attempts: number;
}

/**
 * Execute multiple operations with retry, returning results for all
 */
export async function batchRetry<T, A>(
  items: A[],
  fn: (item: A, index: number) => Promise<T>,
  options: RetryOptions & { concurrency?: number } = {}
): Promise<BatchResult<T>[]> {
  const { concurrency = items.length, ...retryOptions } = options;
  const results: BatchResult<T>[] = new Array(items.length);
  const executing = new Set<Promise<void>>();

  for (let i = 0; i < items.length; i++) {
    const index = i;
    const item = items[i];

    const promise = retryWithResult(() => fn(item, index), retryOptions).then((result) => {
      results[index] = {
        index,
        success: result.success,
        value: result.value,
        error: result.error,
        attempts: result.attempts,
      };
      executing.delete(promise);
    });

    executing.add(promise);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * Execute operations with retry, stopping on first success
 */
export async function raceRetry<T>(
  fns: Array<() => Promise<T>>,
  options: RetryOptions = {}
): Promise<T> {
  const errors: Error[] = [];

  const promises = fns.map((fn, index) =>
    retryWithResult(fn, options).then((result) => {
      if (result.success) {
        return { success: true, value: result.value, index };
      }
      errors[index] = result.error!;
      return { success: false, index };
    })
  );

  const results = await Promise.all(promises);
  const successResult = results.find((r) => r.success);

  if (successResult && successResult.success) {
    return successResult.value as T;
  }

  throw new AggregateError(errors, 'All operations failed');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a retryable version of any async function
 */
export function makeRetryable<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: RetryOptions = {}
): T {
  return ((...args: Parameters<T>) => retry(() => fn(...args), options)) as T;
}

/**
 * Retry decorator for methods
 */
export function Retryable(options: RetryOptions = {}) {
  return function (
    _target: unknown,
    _propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: unknown[]) {
      return retry(() => originalMethod.apply(this, args), options);
    };

    return descriptor;
  };
}

/**
 * Wait for a condition to be true with retry
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: {
    timeout?: number;
    interval?: number;
    message?: string;
  } = {}
): Promise<void> {
  const { timeout = 10000, interval = 100, message = 'Condition not met' } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await condition();
    if (result) {
      return;
    }
    await sleep(interval);
  }

  throw new Error(`Timeout: ${message}`);
}

/**
 * Retry with linear backoff
 */
export async function retryLinear<T>(
  fn: () => Promise<T>,
  options: Omit<RetryOptions, 'backoffMultiplier'> & { delayIncrement?: number } = {}
): Promise<T> {
  const { delayIncrement = 1000, initialDelay = 1000, ...rest } = options;

  return retry(fn, {
    ...rest,
    initialDelay,
    backoffMultiplier: 1 + delayIncrement / initialDelay,
    jitter: false,
  });
}

/**
 * Retry with fixed delay
 */
export async function retryFixed<T>(
  fn: () => Promise<T>,
  options: Omit<RetryOptions, 'backoffMultiplier' | 'maxDelay'> = {}
): Promise<T> {
  const { initialDelay = 1000, ...rest } = options;

  return retry(fn, {
    ...rest,
    initialDelay,
    maxDelay: initialDelay,
    backoffMultiplier: 1,
    jitter: false,
  });
}

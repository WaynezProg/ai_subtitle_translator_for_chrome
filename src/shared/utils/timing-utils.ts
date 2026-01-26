/**
 * Timing Utilities
 *
 * Provides debounce, throttle, and other timing-related utilities
 * for controlling the rate of function execution.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Generic function type
 */
export type AnyFunction = (...args: unknown[]) => unknown;

/**
 * Debounced function with cancel and flush methods
 */
export interface DebouncedFunction<T extends AnyFunction> {
  (...args: Parameters<T>): void;
  /** Cancel pending execution */
  cancel: () => void;
  /** Execute immediately if pending */
  flush: () => void;
  /** Check if there's a pending execution */
  pending: () => boolean;
}

/**
 * Throttled function with cancel method
 */
export interface ThrottledFunction<T extends AnyFunction> {
  (...args: Parameters<T>): ReturnType<T> | undefined;
  /** Cancel pending trailing execution */
  cancel: () => void;
  /** Check if currently throttled */
  isThrottled: () => boolean;
}

/**
 * Debounce options
 */
export interface DebounceOptions {
  /** Execute on the leading edge instead of trailing */
  leading?: boolean;
  /** Execute on the trailing edge (default: true) */
  trailing?: boolean;
  /** Maximum time to wait before forced execution */
  maxWait?: number;
}

/**
 * Throttle options
 */
export interface ThrottleOptions {
  /** Execute on the leading edge (default: true) */
  leading?: boolean;
  /** Execute on the trailing edge (default: true) */
  trailing?: boolean;
}

// ============================================================================
// Debounce
// ============================================================================

/**
 * Creates a debounced function that delays invoking the provided function
 * until after the specified wait time has elapsed since the last invocation.
 *
 * @param fn - The function to debounce
 * @param wait - The number of milliseconds to delay
 * @param options - Debounce options
 * @returns A debounced version of the function
 *
 * @example
 * const debouncedSearch = debounce((query: string) => {
 *   performSearch(query);
 * }, 300);
 *
 * // Called rapidly, but search only executes 300ms after last call
 * inputElement.addEventListener('input', (e) => debouncedSearch(e.target.value));
 */
export function debounce<T extends AnyFunction>(
  fn: T,
  wait: number,
  options: DebounceOptions = {}
): DebouncedFunction<T> {
  const { leading = false, trailing = true, maxWait } = options;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let maxTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastCallTime: number | null = null;
  let lastInvokeTime = 0;
  let result: ReturnType<T> | undefined;

  const invokeFunc = (time: number): ReturnType<T> => {
    const args = lastArgs!;
    lastArgs = null;
    lastInvokeTime = time;
    result = fn(...args) as ReturnType<T>;
    return result;
  };

  const startTimer = (pendingFunc: () => void, wait: number): ReturnType<typeof setTimeout> => {
    return setTimeout(pendingFunc, wait);
  };

  const cancelTimer = (id: ReturnType<typeof setTimeout> | null): void => {
    if (id !== null) {
      clearTimeout(id);
    }
  };

  const leadingEdge = (time: number): ReturnType<T> | undefined => {
    lastInvokeTime = time;

    if (maxWait !== undefined) {
      maxTimeoutId = startTimer(timerExpired, maxWait);
    }

    return leading ? invokeFunc(time) : result;
  };

  const remainingWait = (time: number): number => {
    const timeSinceLastCall = time - (lastCallTime ?? 0);
    const timeSinceLastInvoke = time - lastInvokeTime;
    const timeWaiting = wait - timeSinceLastCall;

    return maxWait !== undefined
      ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke)
      : timeWaiting;
  };

  const shouldInvoke = (time: number): boolean => {
    const timeSinceLastCall = time - (lastCallTime ?? 0);
    const timeSinceLastInvoke = time - lastInvokeTime;

    return (
      lastCallTime === null ||
      timeSinceLastCall >= wait ||
      timeSinceLastCall < 0 ||
      (maxWait !== undefined && timeSinceLastInvoke >= maxWait)
    );
  };

  const timerExpired = (): void => {
    const time = Date.now();

    if (shouldInvoke(time)) {
      trailingEdge(time);
      return;
    }

    timeoutId = startTimer(timerExpired, remainingWait(time));
  };

  const trailingEdge = (time: number): ReturnType<T> | undefined => {
    timeoutId = null;
    cancelTimer(maxTimeoutId);
    maxTimeoutId = null;

    if (trailing && lastArgs) {
      return invokeFunc(time);
    }

    lastArgs = null;
    return result;
  };

  const cancel = (): void => {
    cancelTimer(timeoutId);
    cancelTimer(maxTimeoutId);
    timeoutId = null;
    maxTimeoutId = null;
    lastArgs = null;
    lastCallTime = null;
    lastInvokeTime = 0;
  };

  const flush = (): void => {
    if (timeoutId !== null && lastArgs) {
      trailingEdge(Date.now());
    }
  };

  const pending = (): boolean => {
    return timeoutId !== null;
  };

  const debounced = (...args: Parameters<T>): void => {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastCallTime = time;

    if (isInvoking) {
      if (timeoutId === null) {
        leadingEdge(time);
        if (!trailing) return;
      }
    }

    if (timeoutId === null) {
      timeoutId = startTimer(timerExpired, wait);
    }
  };

  debounced.cancel = cancel;
  debounced.flush = flush;
  debounced.pending = pending;

  return debounced;
}

// ============================================================================
// Throttle
// ============================================================================

/**
 * Creates a throttled function that only invokes the provided function
 * at most once per specified time period.
 *
 * @param fn - The function to throttle
 * @param wait - The number of milliseconds to throttle
 * @param options - Throttle options
 * @returns A throttled version of the function
 *
 * @example
 * const throttledScroll = throttle(() => {
 *   updateScrollPosition();
 * }, 100);
 *
 * window.addEventListener('scroll', throttledScroll);
 */
export function throttle<T extends AnyFunction>(
  fn: T,
  wait: number,
  options: ThrottleOptions = {}
): ThrottledFunction<T> {
  const { leading = true, trailing = true } = options;

  let lastCallTime: number | null = null;
  let lastInvokeTime = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let result: ReturnType<T> | undefined;

  const invokeFunc = (): ReturnType<T> | undefined => {
    const args = lastArgs;
    lastArgs = null;
    lastInvokeTime = Date.now();

    if (args) {
      result = fn(...args) as ReturnType<T>;
    }

    return result;
  };

  const shouldInvoke = (time: number): boolean => {
    const timeSinceLastCall = time - (lastCallTime ?? 0);
    const timeSinceLastInvoke = time - lastInvokeTime;

    return (
      lastCallTime === null ||
      timeSinceLastCall >= wait ||
      timeSinceLastInvoke >= wait
    );
  };

  const trailingEdge = (): void => {
    timeoutId = null;

    if (trailing && lastArgs) {
      invokeFunc();
    } else {
      lastArgs = null;
    }
  };

  const cancel = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
    lastCallTime = null;
  };

  const isThrottled = (): boolean => {
    const time = Date.now();
    return !shouldInvoke(time);
  };

  const throttled = (...args: Parameters<T>): ReturnType<T> | undefined => {
    const time = Date.now();
    const isInvoking = shouldInvoke(time);

    lastArgs = args;
    lastCallTime = time;

    if (isInvoking) {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (leading) {
        return invokeFunc();
      }
    }

    if (timeoutId === null && trailing) {
      const remaining = wait - (time - lastInvokeTime);
      timeoutId = setTimeout(trailingEdge, Math.max(0, remaining));
    }

    return result;
  };

  throttled.cancel = cancel;
  throttled.isThrottled = isThrottled;

  return throttled;
}

// ============================================================================
// Additional Timing Utilities
// ============================================================================

/**
 * Creates a function that can only be called once.
 * Subsequent calls return the result of the first call.
 */
export function once<T extends AnyFunction>(fn: T): T {
  let called = false;
  let result: ReturnType<T>;

  return ((...args: Parameters<T>): ReturnType<T> => {
    if (!called) {
      called = true;
      result = fn(...args) as ReturnType<T>;
    }
    return result;
  }) as T;
}

/**
 * Delays execution of a function by the specified time.
 */
export function delay<T extends AnyFunction>(
  fn: T,
  wait: number,
  ...args: Parameters<T>
): { promise: Promise<ReturnType<T>>; cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let rejectFn: ((reason: Error) => void) | null = null;

  const promise = new Promise<ReturnType<T>>((resolve, reject) => {
    rejectFn = reject;
    timeoutId = setTimeout(() => {
      timeoutId = null;
      resolve(fn(...args) as ReturnType<T>);
    }, wait);
  });

  const cancel = (): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
      rejectFn?.(new Error('Delayed execution cancelled'));
    }
  };

  return { promise, cancel };
}

/**
 * Creates a function that rate-limits calls using a token bucket algorithm.
 * Allows bursts up to the bucket size, then limits to the refill rate.
 */
export function rateLimit<T extends AnyFunction>(
  fn: T,
  options: {
    /** Maximum tokens (burst size) */
    bucketSize: number;
    /** Tokens added per interval */
    refillRate: number;
    /** Refill interval in ms */
    refillInterval: number;
  }
): {
  (...args: Parameters<T>): ReturnType<T> | null;
  getTokens: () => number;
  reset: () => void;
} {
  const { bucketSize, refillRate, refillInterval } = options;

  let tokens = bucketSize;
  let lastRefill = Date.now();

  const refill = (): void => {
    const now = Date.now();
    const elapsed = now - lastRefill;
    const refills = Math.floor(elapsed / refillInterval);

    if (refills > 0) {
      tokens = Math.min(bucketSize, tokens + refills * refillRate);
      lastRefill = now - (elapsed % refillInterval);
    }
  };

  const rateLimited = (...args: Parameters<T>): ReturnType<T> | null => {
    refill();

    if (tokens > 0) {
      tokens--;
      return fn(...args) as ReturnType<T>;
    }

    return null;
  };

  rateLimited.getTokens = (): number => {
    refill();
    return tokens;
  };

  rateLimited.reset = (): void => {
    tokens = bucketSize;
    lastRefill = Date.now();
  };

  return rateLimited;
}

/**
 * Creates an async queue that processes items with a delay between each.
 */
export function createAsyncQueue<T, R>(
  processor: (item: T) => Promise<R>,
  delayMs: number
): {
  add: (item: T) => Promise<R>;
  clear: () => void;
  size: () => number;
} {
  const queue: Array<{
    item: T;
    resolve: (value: R) => void;
    reject: (error: Error) => void;
  }> = [];
  let processing = false;

  const processNext = async (): Promise<void> => {
    if (processing || queue.length === 0) return;

    processing = true;
    const { item, resolve, reject } = queue.shift()!;

    try {
      const result = await processor(item);
      resolve(result);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }

    if (queue.length > 0) {
      setTimeout(() => {
        processing = false;
        processNext();
      }, delayMs);
    } else {
      processing = false;
    }
  };

  return {
    add: (item: T): Promise<R> => {
      return new Promise((resolve, reject) => {
        queue.push({ item, resolve, reject });
        processNext();
      });
    },
    clear: (): void => {
      const items = queue.splice(0);
      for (const { reject } of items) {
        reject(new Error('Queue cleared'));
      }
    },
    size: (): number => queue.length,
  };
}

/**
 * Retry a function with exponential backoff.
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
    shouldRetry?: (error: Error, attempt: number) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    maxDelayMs = 30000,
    backoffFactor = 2,
    shouldRetry = () => true,
  } = options;

  let lastError: Error | null = null;
  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxAttempts || !shouldRetry(lastError, attempt)) {
        throw lastError;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffFactor, maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Execute a function with a timeout.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  timeoutError?: Error
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(timeoutError ?? new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

/**
 * Create an interval that can be paused and resumed.
 */
export function createPausableInterval(
  fn: () => void,
  intervalMs: number
): {
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isRunning: () => boolean;
  isPaused: () => boolean;
} {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let paused = false;

  return {
    start: (): void => {
      if (intervalId === null) {
        paused = false;
        intervalId = setInterval(() => {
          if (!paused) {
            fn();
          }
        }, intervalMs);
      }
    },
    stop: (): void => {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
        paused = false;
      }
    },
    pause: (): void => {
      paused = true;
    },
    resume: (): void => {
      paused = false;
    },
    isRunning: (): boolean => intervalId !== null,
    isPaused: (): boolean => paused,
  };
}

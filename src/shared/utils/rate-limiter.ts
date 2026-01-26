/**
 * Rate Limiter Utility
 *
 * Provides rate limiting capabilities for API calls to prevent
 * hitting rate limits and ensure smooth operation.
 *
 * Features:
 * - Token bucket algorithm
 * - Sliding window rate limiting
 * - Per-provider configuration
 * - Automatic backoff on rate limit errors
 */

import { createLogger } from './logger';

const log = createLogger('RateLimiter');

// ============================================================================
// Types
// ============================================================================

export interface RateLimiterConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Minimum delay between requests in milliseconds */
  minDelayMs?: number;
  /** Whether to queue requests that exceed the limit */
  queueExcess?: boolean;
  /** Maximum queue size (0 = unlimited) */
  maxQueueSize?: number;
}

export interface RateLimiterStats {
  /** Current number of tokens available */
  availableTokens: number;
  /** Requests made in current window */
  requestsInWindow: number;
  /** Queued requests count */
  queuedRequests: number;
  /** Time until next token available (ms) */
  nextTokenMs: number;
  /** Whether currently rate limited */
  isLimited: boolean;
}

interface QueuedRequest<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  addedAt: number;
}

// ============================================================================
// Token Bucket Rate Limiter
// ============================================================================

export class RateLimiter {
  private config: Required<RateLimiterConfig>;
  private tokens: number;
  private lastRefill: number;
  private requestTimestamps: number[] = [];
  private queue: QueuedRequest<unknown>[] = [];
  private processing = false;

  constructor(config: RateLimiterConfig) {
    this.config = {
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      minDelayMs: config.minDelayMs ?? 0,
      queueExcess: config.queueExcess ?? true,
      maxQueueSize: config.maxQueueSize ?? 100,
    };
    this.tokens = this.config.maxRequests;
    this.lastRefill = Date.now();
  }

  /**
   * Check if a request can be made immediately
   */
  canRequest(): boolean {
    this.refillTokens();
    this.cleanOldTimestamps();
    return this.tokens > 0 && this.requestTimestamps.length < this.config.maxRequests;
  }

  /**
   * Wait until a request can be made
   */
  async waitForToken(): Promise<void> {
    this.refillTokens();

    if (this.tokens > 0) {
      return;
    }

    // Calculate wait time
    const waitTime = this.getWaitTime();
    if (waitTime > 0) {
      log.debug(`Rate limited, waiting ${waitTime}ms`);
      await this.delay(waitTime);
      this.refillTokens();
    }
  }

  /**
   * Acquire a token for making a request
   * Returns true if token acquired, false if rate limited
   */
  acquire(): boolean {
    this.refillTokens();
    this.cleanOldTimestamps();

    if (this.tokens <= 0) {
      return false;
    }

    this.tokens--;
    this.requestTimestamps.push(Date.now());
    return true;
  }

  /**
   * Execute a function with rate limiting
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Try to acquire immediately
    if (this.acquire()) {
      // Apply minimum delay if configured
      if (this.config.minDelayMs > 0) {
        const lastRequest = this.requestTimestamps[this.requestTimestamps.length - 2];
        if (lastRequest) {
          const elapsed = Date.now() - lastRequest;
          if (elapsed < this.config.minDelayMs) {
            await this.delay(this.config.minDelayMs - elapsed);
          }
        }
      }
      return fn();
    }

    // Queue if enabled
    if (this.config.queueExcess) {
      return this.enqueue(fn);
    }

    throw new RateLimitError('Rate limit exceeded', this.getWaitTime());
  }

  /**
   * Execute multiple functions with rate limiting
   */
  async executeAll<T>(fns: Array<() => Promise<T>>): Promise<T[]> {
    const results: T[] = [];

    for (const fn of fns) {
      results.push(await this.execute(fn));
    }

    return results;
  }

  /**
   * Get current statistics
   */
  getStats(): RateLimiterStats {
    this.refillTokens();
    this.cleanOldTimestamps();

    return {
      availableTokens: this.tokens,
      requestsInWindow: this.requestTimestamps.length,
      queuedRequests: this.queue.length,
      nextTokenMs: this.getWaitTime(),
      isLimited: this.tokens <= 0,
    };
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.tokens = this.config.maxRequests;
    this.lastRefill = Date.now();
    this.requestTimestamps = [];

    // Reject all queued requests
    for (const item of this.queue) {
      item.reject(new Error('Rate limiter reset'));
    }
    this.queue = [];
  }

  /**
   * Handle a rate limit error from API
   * Temporarily reduces available tokens
   */
  onRateLimitError(retryAfterMs?: number): void {
    this.tokens = 0;

    if (retryAfterMs) {
      // Adjust last refill to account for retry-after
      this.lastRefill = Date.now() - this.config.windowMs + retryAfterMs;
    }

    log.warn('Rate limit hit, tokens depleted', { retryAfterMs });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.config.windowMs) {
      // Full refill
      this.tokens = this.config.maxRequests;
      this.lastRefill = now;
    } else {
      // Partial refill based on time elapsed
      const tokensToAdd = Math.floor(
        (elapsed / this.config.windowMs) * this.config.maxRequests
      );
      if (tokensToAdd > 0) {
        this.tokens = Math.min(this.tokens + tokensToAdd, this.config.maxRequests);
        this.lastRefill = now;
      }
    }
  }

  private cleanOldTimestamps(): void {
    const cutoff = Date.now() - this.config.windowMs;
    this.requestTimestamps = this.requestTimestamps.filter((ts) => ts > cutoff);
  }

  private getWaitTime(): number {
    if (this.tokens > 0) return 0;

    const elapsed = Date.now() - this.lastRefill;
    const timeForOneToken = this.config.windowMs / this.config.maxRequests;

    return Math.max(0, timeForOneToken - elapsed);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    if (this.config.maxQueueSize > 0 && this.queue.length >= this.config.maxQueueSize) {
      throw new RateLimitError('Rate limit queue full', this.getWaitTime());
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        addedAt: Date.now(),
      });

      void this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      await this.waitForToken();

      if (!this.acquire()) {
        continue;
      }

      const item = this.queue.shift();
      if (!item) break;

      try {
        const result = await item.fn();
        item.resolve(result);
      } catch (error) {
        item.reject(error instanceof Error ? error : new Error(String(error)));
      }

      // Apply minimum delay
      if (this.config.minDelayMs > 0) {
        await this.delay(this.config.minDelayMs);
      }
    }

    this.processing = false;
  }
}

// ============================================================================
// Rate Limit Error
// ============================================================================

export class RateLimitError extends Error {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

// ============================================================================
// Pre-configured Rate Limiters
// ============================================================================

/**
 * Default rate limiter configurations for known providers
 */
export const ProviderRateLimits: Record<string, RateLimiterConfig> = {
  // OpenAI: 3 RPM for free tier, higher for paid
  'openai-free': {
    maxRequests: 3,
    windowMs: 60000,
    minDelayMs: 1000,
  },
  'openai-paid': {
    maxRequests: 60,
    windowMs: 60000,
    minDelayMs: 100,
  },

  // Anthropic Claude
  'claude-api': {
    maxRequests: 50,
    windowMs: 60000,
    minDelayMs: 200,
  },

  // Google Translate (free tier)
  'google-translate': {
    maxRequests: 100,
    windowMs: 60000,
    minDelayMs: 50,
  },

  // Ollama (local, generous limits)
  ollama: {
    maxRequests: 1000,
    windowMs: 60000,
    minDelayMs: 10,
  },

  // Default conservative limits
  default: {
    maxRequests: 30,
    windowMs: 60000,
    minDelayMs: 500,
  },
};

// ============================================================================
// Rate Limiter Factory
// ============================================================================

const rateLimiters = new Map<string, RateLimiter>();

/**
 * Get or create a rate limiter for a provider
 */
export function getRateLimiter(
  providerId: string,
  customConfig?: Partial<RateLimiterConfig>
): RateLimiter {
  const key = customConfig ? `${providerId}-custom` : providerId;

  if (!rateLimiters.has(key)) {
    const baseConfig = ProviderRateLimits[providerId] || ProviderRateLimits.default;
    const config = { ...baseConfig, ...customConfig };
    rateLimiters.set(key, new RateLimiter(config));
  }

  return rateLimiters.get(key)!;
}

/**
 * Clear all rate limiters
 */
export function clearRateLimiters(): void {
  for (const limiter of rateLimiters.values()) {
    limiter.reset();
  }
  rateLimiters.clear();
}

// ============================================================================
// Decorators / Wrappers
// ============================================================================

/**
 * Wrap a function with rate limiting
 */
export function withRateLimit<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  limiter: RateLimiter
): (...args: T) => Promise<R> {
  return (...args: T) => limiter.execute(() => fn(...args));
}

/**
 * Create a rate-limited version of an async function
 */
export function rateLimited<T extends unknown[], R>(
  providerId: string,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  const limiter = getRateLimiter(providerId);
  return withRateLimit(fn, limiter);
}

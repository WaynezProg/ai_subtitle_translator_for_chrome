/**
 * Graceful Degradation Utility
 *
 * Provides fallback mechanisms when primary services fail,
 * including provider failover, cached content serving, and
 * partial result handling.
 */

import { createLogger } from './logger';

const logger = createLogger('GracefulDegradation');

// ============================================================================
// Types
// ============================================================================

/**
 * Provider health status
 */
export interface ProviderHealth {
  /** Provider identifier */
  providerId: string;
  /** Whether the provider is currently available */
  isAvailable: boolean;
  /** Last successful request timestamp */
  lastSuccessAt: number | null;
  /** Last failure timestamp */
  lastFailureAt: number | null;
  /** Consecutive failure count */
  consecutiveFailures: number;
  /** Total failure count in the current window */
  failureCount: number;
  /** Average response time in ms */
  avgResponseTimeMs: number;
  /** Circuit breaker state */
  circuitState: 'closed' | 'open' | 'half-open';
}

/**
 * Provider configuration for failover
 */
export interface ProviderConfig {
  /** Provider identifier */
  id: string;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Whether this is a fallback-only provider */
  fallbackOnly?: boolean;
  /** Maximum consecutive failures before circuit opens */
  maxFailures?: number;
  /** Time in ms before circuit half-opens */
  circuitResetMs?: number;
}

/**
 * Failover result
 */
export interface FailoverResult<T> {
  /** The result value */
  result: T;
  /** Provider that produced the result */
  providerId: string;
  /** Whether this was a fallback provider */
  isFallback: boolean;
  /** Total time taken including retries */
  totalTimeMs: number;
  /** Number of providers tried */
  providersTried: number;
}

/**
 * Partial result handling options
 */
export interface PartialResultOptions {
  /** Minimum percentage of successful items to accept (0-1) */
  minSuccessRate?: number;
  /** Whether to include failed items with error markers */
  includeFailedItems?: boolean;
  /** Custom error marker for failed items */
  errorMarker?: string;
}

/**
 * Degradation statistics
 */
export interface DegradationStats {
  /** Total requests through the system */
  totalRequests: number;
  /** Requests that succeeded on primary */
  primarySuccesses: number;
  /** Requests that used fallback */
  fallbackSuccesses: number;
  /** Requests that failed completely */
  totalFailures: number;
  /** Provider-specific stats */
  providerStats: Map<string, ProviderHealth>;
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Circuit breaker for a single provider
 */
export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private maxFailures: number = 5,
    private resetTimeMs: number = 30000,
    private halfOpenSuccesses: number = 2
  ) {}

  /**
   * Check if the circuit allows requests
   */
  canRequest(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetTimeMs) {
        this.state = 'half-open';
        this.successCount = 0;
        logger.debug('Circuit half-opened');
        return true;
      }
      return false;
    }

    // half-open: allow limited requests
    return true;
  }

  /**
   * Record a successful request
   */
  recordSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccesses) {
        this.state = 'closed';
        this.failureCount = 0;
        logger.debug('Circuit closed after recovery');
      }
    } else if (this.state === 'closed') {
      // Reset failure count on success
      this.failureCount = 0;
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      logger.debug('Circuit opened from half-open');
    } else if (this.failureCount >= this.maxFailures) {
      this.state = 'open';
      logger.debug('Circuit opened after max failures', { failures: this.failureCount });
    }
  }

  /**
   * Get current state
   */
  getState(): 'closed' | 'open' | 'half-open' {
    // Check if should transition from open to half-open
    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetTimeMs) {
        this.state = 'half-open';
        this.successCount = 0;
      }
    }
    return this.state;
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Get failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }
}

// ============================================================================
// Provider Health Tracker
// ============================================================================

/**
 * Tracks health metrics for multiple providers
 */
export class ProviderHealthTracker {
  private health = new Map<string, ProviderHealth>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private responseTimes = new Map<string, number[]>();
  private readonly maxResponseSamples = 100;

  constructor(private configs: ProviderConfig[] = []) {
    for (const config of configs) {
      this.initializeProvider(config);
    }
  }

  /**
   * Initialize health tracking for a provider
   */
  initializeProvider(config: ProviderConfig): void {
    const health: ProviderHealth = {
      providerId: config.id,
      isAvailable: true,
      lastSuccessAt: null,
      lastFailureAt: null,
      consecutiveFailures: 0,
      failureCount: 0,
      avgResponseTimeMs: 0,
      circuitState: 'closed',
    };

    this.health.set(config.id, health);
    this.circuitBreakers.set(
      config.id,
      new CircuitBreaker(
        config.maxFailures ?? 5,
        config.circuitResetMs ?? 30000
      )
    );
    this.responseTimes.set(config.id, []);
  }

  /**
   * Record a successful request
   */
  recordSuccess(providerId: string, responseTimeMs: number): void {
    const health = this.health.get(providerId);
    const circuit = this.circuitBreakers.get(providerId);

    if (!health || !circuit) {
      this.initializeProvider({ id: providerId, priority: 99 });
      return this.recordSuccess(providerId, responseTimeMs);
    }

    health.isAvailable = true;
    health.lastSuccessAt = Date.now();
    health.consecutiveFailures = 0;

    circuit.recordSuccess();
    health.circuitState = circuit.getState();

    // Update response time average
    const times = this.responseTimes.get(providerId) || [];
    times.push(responseTimeMs);
    if (times.length > this.maxResponseSamples) {
      times.shift();
    }
    this.responseTimes.set(providerId, times);
    health.avgResponseTimeMs = times.reduce((a, b) => a + b, 0) / times.length;
  }

  /**
   * Record a failed request
   */
  recordFailure(providerId: string): void {
    const health = this.health.get(providerId);
    const circuit = this.circuitBreakers.get(providerId);

    if (!health || !circuit) {
      this.initializeProvider({ id: providerId, priority: 99 });
      return this.recordFailure(providerId);
    }

    health.lastFailureAt = Date.now();
    health.consecutiveFailures++;
    health.failureCount++;

    circuit.recordFailure();
    health.circuitState = circuit.getState();
    health.isAvailable = circuit.getState() !== 'open';
  }

  /**
   * Check if a provider is available
   */
  isAvailable(providerId: string): boolean {
    const circuit = this.circuitBreakers.get(providerId);
    return circuit ? circuit.canRequest() : true;
  }

  /**
   * Get health status for a provider
   */
  getHealth(providerId: string): ProviderHealth | null {
    const health = this.health.get(providerId);
    if (health) {
      const circuit = this.circuitBreakers.get(providerId);
      if (circuit) {
        health.circuitState = circuit.getState();
        health.isAvailable = circuit.canRequest();
      }
    }
    return health || null;
  }

  /**
   * Get all provider health statuses
   */
  getAllHealth(): ProviderHealth[] {
    return Array.from(this.health.values()).map((health) => {
      const circuit = this.circuitBreakers.get(health.providerId);
      if (circuit) {
        health.circuitState = circuit.getState();
        health.isAvailable = circuit.canRequest();
      }
      return { ...health };
    });
  }

  /**
   * Get available providers sorted by priority and health
   */
  getAvailableProviders(): string[] {
    return this.configs
      .filter((config) => this.isAvailable(config.id))
      .sort((a, b) => {
        // Primary sort by priority
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        // Secondary sort by failure count (fewer is better)
        const healthA = this.health.get(a.id);
        const healthB = this.health.get(b.id);
        return (healthA?.failureCount ?? 0) - (healthB?.failureCount ?? 0);
      })
      .map((config) => config.id);
  }

  /**
   * Reset all health tracking
   */
  reset(): void {
    for (const [id, circuit] of this.circuitBreakers) {
      circuit.reset();
      const health = this.health.get(id);
      if (health) {
        health.isAvailable = true;
        health.consecutiveFailures = 0;
        health.failureCount = 0;
        health.circuitState = 'closed';
      }
    }
    for (const times of this.responseTimes.values()) {
      times.length = 0;
    }
  }
}

// ============================================================================
// Failover Manager
// ============================================================================

/**
 * Manages automatic failover between providers
 */
export class FailoverManager<T> {
  private healthTracker: ProviderHealthTracker;
  private stats: DegradationStats = {
    totalRequests: 0,
    primarySuccesses: 0,
    fallbackSuccesses: 0,
    totalFailures: 0,
    providerStats: new Map(),
  };

  constructor(providers: ProviderConfig[]) {
    this.healthTracker = new ProviderHealthTracker(providers);
  }

  /**
   * Execute with automatic failover
   */
  async execute(
    executor: (providerId: string) => Promise<T>
  ): Promise<FailoverResult<T>> {
    const startTime = Date.now();
    this.stats.totalRequests++;

    const availableProviders = this.healthTracker.getAvailableProviders();
    if (availableProviders.length === 0) {
      this.stats.totalFailures++;
      throw new Error('No providers available');
    }

    let lastError: Error | null = null;
    let providersTried = 0;

    for (const providerId of availableProviders) {
      providersTried++;
      const requestStart = Date.now();

      try {
        const result = await executor(providerId);
        const responseTime = Date.now() - requestStart;

        this.healthTracker.recordSuccess(providerId, responseTime);

        const isPrimary = providersTried === 1;
        if (isPrimary) {
          this.stats.primarySuccesses++;
        } else {
          this.stats.fallbackSuccesses++;
        }

        return {
          result,
          providerId,
          isFallback: !isPrimary,
          totalTimeMs: Date.now() - startTime,
          providersTried,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.healthTracker.recordFailure(providerId);
        logger.debug('Provider failed, trying next', { providerId, error: lastError.message });
      }
    }

    this.stats.totalFailures++;
    throw lastError || new Error('All providers failed');
  }

  /**
   * Get provider health tracker
   */
  getHealthTracker(): ProviderHealthTracker {
    return this.healthTracker;
  }

  /**
   * Get degradation statistics
   */
  getStats(): DegradationStats {
    return {
      ...this.stats,
      providerStats: new Map(
        this.healthTracker.getAllHealth().map((h) => [h.providerId, h])
      ),
    };
  }

  /**
   * Reset statistics and health
   */
  reset(): void {
    this.stats = {
      totalRequests: 0,
      primarySuccesses: 0,
      fallbackSuccesses: 0,
      totalFailures: 0,
      providerStats: new Map(),
    };
    this.healthTracker.reset();
  }
}

// ============================================================================
// Partial Result Handler
// ============================================================================

/**
 * Handle partial results when some items fail
 */
export function handlePartialResults<T, R>(
  items: T[],
  results: Array<{ success: boolean; value?: R; error?: Error; index: number }>,
  options: PartialResultOptions = {}
): { results: Array<R | string>; successRate: number; accepted: boolean } {
  const {
    minSuccessRate = 0.5,
    includeFailedItems = true,
    errorMarker = '[Translation unavailable]',
  } = options;

  const successCount = results.filter((r) => r.success).length;
  const successRate = items.length > 0 ? successCount / items.length : 0;
  const accepted = successRate >= minSuccessRate;

  const finalResults: Array<R | string> = new Array(items.length);

  for (const result of results) {
    if (result.success && result.value !== undefined) {
      finalResults[result.index] = result.value;
    } else if (includeFailedItems) {
      finalResults[result.index] = errorMarker;
    }
  }

  // Fill any missing indices
  for (let i = 0; i < items.length; i++) {
    if (finalResults[i] === undefined) {
      finalResults[i] = includeFailedItems ? errorMarker : ('' as R | string);
    }
  }

  return { results: finalResults, successRate, accepted };
}

/**
 * Process items with partial failure tolerance
 */
export async function processWithPartialFailure<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  options: PartialResultOptions & { concurrency?: number } = {}
): Promise<{ results: Array<R | string>; successRate: number; accepted: boolean }> {
  const { concurrency = 5, ...partialOptions } = options;

  const results: Array<{ success: boolean; value?: R; error?: Error; index: number }> = [];

  // Process in batches for concurrency control
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(async (item, batchIndex) => {
        const index = i + batchIndex;
        try {
          const value = await processor(item, index);
          return { success: true, value, index };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            index,
          };
        }
      })
    );
    results.push(...batchResults);
  }

  return handlePartialResults(items, results, partialOptions);
}

// ============================================================================
// Stale-While-Revalidate
// ============================================================================

/**
 * Cache entry with staleness tracking
 */
interface StaleEntry<T> {
  value: T;
  timestamp: number;
  isStale: boolean;
}

/**
 * Stale-while-revalidate cache
 */
export class StaleWhileRevalidateCache<T> {
  private cache = new Map<string, StaleEntry<T>>();
  private revalidating = new Set<string>();

  constructor(
    private freshMs: number = 60000,
    private staleMs: number = 300000
  ) {}

  /**
   * Get a value, returning stale if available while revalidating
   */
  async get(
    key: string,
    fetcher: () => Promise<T>
  ): Promise<{ value: T; isStale: boolean }> {
    const entry = this.cache.get(key);
    const now = Date.now();

    if (entry) {
      const age = now - entry.timestamp;

      // Fresh: return immediately
      if (age < this.freshMs) {
        return { value: entry.value, isStale: false };
      }

      // Stale but usable: return and revalidate in background
      if (age < this.staleMs) {
        if (!this.revalidating.has(key)) {
          this.revalidateInBackground(key, fetcher);
        }
        return { value: entry.value, isStale: true };
      }
    }

    // Expired or not in cache: fetch fresh
    const value = await fetcher();
    this.cache.set(key, { value, timestamp: now, isStale: false });
    return { value, isStale: false };
  }

  /**
   * Revalidate in background
   */
  private async revalidateInBackground(key: string, fetcher: () => Promise<T>): Promise<void> {
    this.revalidating.add(key);
    try {
      const value = await fetcher();
      this.cache.set(key, { value, timestamp: Date.now(), isStale: false });
    } catch (error) {
      logger.debug('Background revalidation failed', { key, error });
    } finally {
      this.revalidating.delete(key);
    }
  }

  /**
   * Invalidate a cache entry
   */
  invalidate(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.revalidating.clear();
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }
}

// ============================================================================
// Singleton Instance for Translation Failover
// ============================================================================

let translationFailoverManager: FailoverManager<unknown> | null = null;

/**
 * Get or create the translation failover manager
 */
export function getTranslationFailoverManager<T = unknown>(
  providers?: ProviderConfig[]
): FailoverManager<T> {
  if (!translationFailoverManager && providers) {
    translationFailoverManager = new FailoverManager<unknown>(providers);
  }
  if (!translationFailoverManager) {
    // Default configuration
    translationFailoverManager = new FailoverManager<unknown>([
      { id: 'claude-api', priority: 1 },
      { id: 'openai-api', priority: 2 },
      { id: 'gemini-api', priority: 3 },
      { id: 'ollama', priority: 4, fallbackOnly: true },
    ]);
  }
  return translationFailoverManager as FailoverManager<T>;
}

/**
 * Reset the translation failover manager (for testing)
 */
export function resetTranslationFailoverManager(): void {
  if (translationFailoverManager) {
    translationFailoverManager.reset();
  }
  translationFailoverManager = null;
}

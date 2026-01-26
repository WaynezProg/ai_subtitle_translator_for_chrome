/**
 * Request Deduplication Utility
 *
 * Prevents duplicate concurrent requests for the same resource.
 * When multiple requests for the same key are made simultaneously,
 * only one actual request is executed and all callers receive the same result.
 */

import { createLogger } from './logger';

const logger = createLogger('RequestDeduplicator');

// ============================================================================
// Types
// ============================================================================

/**
 * Pending request entry
 */
interface PendingRequest<T> {
  /** Promise that resolves when the request completes */
  promise: Promise<T>;
  /** Number of callers waiting for this request */
  waiters: number;
  /** Timestamp when the request was initiated */
  startedAt: number;
}

/**
 * Deduplicator statistics
 */
export interface DeduplicatorStats {
  /** Total requests received */
  totalRequests: number;
  /** Requests that were deduplicated (returned cached promise) */
  deduplicatedRequests: number;
  /** Requests that were actually executed */
  executedRequests: number;
  /** Currently pending requests */
  pendingRequests: number;
  /** Deduplication rate (0-1) */
  deduplicationRate: number;
}

/**
 * Options for the deduplicator
 */
export interface DeduplicatorOptions {
  /** Maximum time a pending request can be reused (ms). Default: 30000 */
  maxPendingAge?: number;
  /** Whether to log debug information. Default: false */
  debug?: boolean;
}

// ============================================================================
// Request Deduplicator Class
// ============================================================================

/**
 * Generic request deduplicator that coalesces identical concurrent requests
 */
export class RequestDeduplicator<T> {
  private pendingRequests = new Map<string, PendingRequest<T>>();
  private stats: DeduplicatorStats = {
    totalRequests: 0,
    deduplicatedRequests: 0,
    executedRequests: 0,
    pendingRequests: 0,
    deduplicationRate: 0,
  };
  private maxPendingAge: number;
  private debug: boolean;

  constructor(options: DeduplicatorOptions = {}) {
    this.maxPendingAge = options.maxPendingAge ?? 30000;
    this.debug = options.debug ?? false;
  }

  /**
   * Execute a request with deduplication
   * If a request with the same key is already pending, return the same promise
   *
   * @param key - Unique key identifying the request
   * @param executor - Function that performs the actual request
   * @returns Promise that resolves with the request result
   */
  async execute(key: string, executor: () => Promise<T>): Promise<T> {
    this.stats.totalRequests++;

    // Check for existing pending request
    const existing = this.pendingRequests.get(key);
    if (existing) {
      const age = Date.now() - existing.startedAt;
      if (age < this.maxPendingAge) {
        existing.waiters++;
        this.stats.deduplicatedRequests++;
        this.updateDeduplicationRate();

        if (this.debug) {
          logger.debug('Deduplicated request', { key, waiters: existing.waiters });
        }

        return existing.promise;
      } else {
        // Pending request is too old, remove it
        this.pendingRequests.delete(key);
      }
    }

    // Create new request
    this.stats.executedRequests++;
    this.updateDeduplicationRate();

    const promise = this.executeWithCleanup(key, executor);
    const pendingRequest: PendingRequest<T> = {
      promise,
      waiters: 1,
      startedAt: Date.now(),
    };

    this.pendingRequests.set(key, pendingRequest);
    this.stats.pendingRequests = this.pendingRequests.size;

    if (this.debug) {
      logger.debug('Executing new request', { key });
    }

    return promise;
  }

  /**
   * Execute the request and clean up after completion
   */
  private async executeWithCleanup(key: string, executor: () => Promise<T>): Promise<T> {
    try {
      const result = await executor();
      return result;
    } finally {
      this.pendingRequests.delete(key);
      this.stats.pendingRequests = this.pendingRequests.size;
    }
  }

  /**
   * Check if a request with the given key is pending
   */
  isPending(key: string): boolean {
    const existing = this.pendingRequests.get(key);
    if (!existing) return false;

    const age = Date.now() - existing.startedAt;
    return age < this.maxPendingAge;
  }

  /**
   * Get the number of waiters for a pending request
   */
  getWaiters(key: string): number {
    return this.pendingRequests.get(key)?.waiters ?? 0;
  }

  /**
   * Cancel a pending request by key
   * Note: This only removes it from the deduplicator, doesn't cancel the actual request
   */
  cancel(key: string): boolean {
    const existed = this.pendingRequests.has(key);
    this.pendingRequests.delete(key);
    this.stats.pendingRequests = this.pendingRequests.size;
    return existed;
  }

  /**
   * Clear all pending requests
   */
  clear(): void {
    this.pendingRequests.clear();
    this.stats.pendingRequests = 0;
  }

  /**
   * Get current statistics
   */
  getStats(): DeduplicatorStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      deduplicatedRequests: 0,
      executedRequests: 0,
      pendingRequests: this.pendingRequests.size,
      deduplicationRate: 0,
    };
  }

  /**
   * Update the deduplication rate
   */
  private updateDeduplicationRate(): void {
    if (this.stats.totalRequests > 0) {
      this.stats.deduplicationRate =
        this.stats.deduplicatedRequests / this.stats.totalRequests;
    }
  }
}

// ============================================================================
// Translation Request Deduplicator
// ============================================================================

/**
 * Translation request key generator
 */
export function createTranslationKey(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  contentHash?: string
): string {
  const parts = [videoId, sourceLanguage, targetLanguage];
  if (contentHash) {
    parts.push(contentHash);
  }
  return parts.join(':');
}

/**
 * Generate a simple hash for content
 */
export function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// ============================================================================
// Singleton Instance for Translation Requests
// ============================================================================

let translationDeduplicator: RequestDeduplicator<unknown> | null = null;

/**
 * Get the translation request deduplicator singleton
 */
export function getTranslationDeduplicator<T = unknown>(): RequestDeduplicator<T> {
  if (!translationDeduplicator) {
    translationDeduplicator = new RequestDeduplicator<unknown>({
      maxPendingAge: 60000, // 1 minute for translation requests
      debug: false,
    });
  }
  return translationDeduplicator as RequestDeduplicator<T>;
}

/**
 * Execute a translation request with deduplication
 */
export async function deduplicateTranslation<T>(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  contentHash: string,
  executor: () => Promise<T>
): Promise<T> {
  const key = createTranslationKey(videoId, sourceLanguage, targetLanguage, contentHash);
  const deduplicator = getTranslationDeduplicator<T>();
  return deduplicator.execute(key, executor);
}

/**
 * Check if a translation request is already pending
 */
export function isTranslationPending(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  contentHash?: string
): boolean {
  const key = createTranslationKey(videoId, sourceLanguage, targetLanguage, contentHash);
  const deduplicator = getTranslationDeduplicator();
  return deduplicator.isPending(key);
}

/**
 * Get translation deduplicator statistics
 */
export function getTranslationDeduplicatorStats(): DeduplicatorStats {
  return getTranslationDeduplicator().getStats();
}

/**
 * Clear the translation deduplicator
 */
export function clearTranslationDeduplicator(): void {
  if (translationDeduplicator) {
    translationDeduplicator.clear();
    translationDeduplicator.resetStats();
  }
}

/**
 * Reset the translation deduplicator singleton (for testing)
 */
export function resetTranslationDeduplicator(): void {
  if (translationDeduplicator) {
    translationDeduplicator.clear();
  }
  translationDeduplicator = null;
}

// ============================================================================
// Batch Request Deduplicator
// ============================================================================

/**
 * Batch deduplicator for grouping multiple requests into batches
 */
export class BatchDeduplicator<TInput, TOutput> {
  private pendingBatch: TInput[] = [];
  private batchPromise: Promise<TOutput[]> | null = null;
  private batchTimeout: ReturnType<typeof setTimeout> | null = null;
  private resolvers: Array<{
    resolve: (value: TOutput) => void;
    reject: (error: Error) => void;
    index: number;
  }> = [];

  private batchSize: number;
  private batchDelayMs: number;
  private executor: (batch: TInput[]) => Promise<TOutput[]>;

  constructor(
    executor: (batch: TInput[]) => Promise<TOutput[]>,
    options: { batchSize?: number; batchDelayMs?: number } = {}
  ) {
    this.executor = executor;
    this.batchSize = options.batchSize ?? 10;
    this.batchDelayMs = options.batchDelayMs ?? 50;
  }

  /**
   * Add an item to the batch and get a promise for its result
   */
  async add(item: TInput): Promise<TOutput> {
    const index = this.pendingBatch.length;
    this.pendingBatch.push(item);

    const promise = new Promise<TOutput>((resolve, reject) => {
      this.resolvers.push({ resolve, reject, index });
    });

    // Execute batch if it's full
    if (this.pendingBatch.length >= this.batchSize) {
      this.executeBatch();
    } else if (!this.batchTimeout) {
      // Schedule batch execution after delay
      this.batchTimeout = setTimeout(() => {
        this.executeBatch();
      }, this.batchDelayMs);
    }

    return promise;
  }

  /**
   * Execute the current batch
   */
  private async executeBatch(): Promise<void> {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    if (this.pendingBatch.length === 0) {
      return;
    }

    const batch = this.pendingBatch;
    const resolvers = this.resolvers;

    this.pendingBatch = [];
    this.resolvers = [];

    try {
      const results = await this.executor(batch);

      for (const { resolve, index } of resolvers) {
        if (index < results.length) {
          resolve(results[index]);
        } else {
          resolve(undefined as TOutput);
        }
      }
    } catch (error) {
      for (const { reject } of resolvers) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Flush any pending batch immediately
   */
  async flush(): Promise<void> {
    await this.executeBatch();
  }

  /**
   * Get the current batch size
   */
  getPendingCount(): number {
    return this.pendingBatch.length;
  }

  /**
   * Clear pending batch without executing
   */
  clear(): void {
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    for (const { reject } of this.resolvers) {
      reject(new Error('Batch cleared'));
    }

    this.pendingBatch = [];
    this.resolvers = [];
  }
}

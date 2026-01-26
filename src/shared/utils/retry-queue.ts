/**
 * Retry Queue Utility
 *
 * Provides a persistent queue for failed operations that can be retried
 * automatically with exponential backoff or manually triggered.
 *
 * Features:
 * - Persistent storage (survives page refresh)
 * - Automatic retry with exponential backoff
 * - Manual retry capability
 * - Priority-based ordering
 * - Dead letter queue for permanently failed items
 * - Integration with rate limiter
 */

import { createLogger } from './logger';
import { RateLimiter, getRateLimiter } from './rate-limiter';

const log = createLogger('RetryQueue');

// ============================================================================
// Types
// ============================================================================

export interface RetryQueueConfig {
  /** Maximum retry attempts before moving to dead letter queue */
  maxRetries: number;
  /** Base delay for exponential backoff (ms) */
  baseDelayMs: number;
  /** Maximum delay between retries (ms) */
  maxDelayMs: number;
  /** Maximum age of items in queue (ms) - items older than this are removed */
  maxAgeMs: number;
  /** Maximum queue size */
  maxQueueSize: number;
  /** Whether to persist to storage */
  persistent: boolean;
  /** Storage key prefix */
  storageKey: string;
  /** Enable automatic retry processing */
  autoProcess: boolean;
  /** Interval for auto-processing (ms) */
  autoProcessIntervalMs: number;
}

export interface RetryItem<T = unknown> {
  /** Unique item ID */
  id: string;
  /** Item type/category for filtering */
  type: string;
  /** The payload to retry */
  payload: T;
  /** Number of retry attempts made */
  attempts: number;
  /** Last error message */
  lastError?: string;
  /** Error code if available */
  errorCode?: string;
  /** Time when item was first added */
  createdAt: number;
  /** Time of last retry attempt */
  lastAttemptAt?: number;
  /** Scheduled time for next retry */
  nextRetryAt: number;
  /** Priority (higher = more important) */
  priority: number;
  /** Metadata for context */
  metadata?: Record<string, unknown>;
}

export interface RetryQueueStats {
  /** Total items in queue */
  queueSize: number;
  /** Items ready for retry */
  readyCount: number;
  /** Items in dead letter queue */
  deadLetterCount: number;
  /** Items by type */
  byType: Record<string, number>;
  /** Average retry attempts */
  avgAttempts: number;
  /** Oldest item age (ms) */
  oldestItemAge: number;
}

export interface RetryResult<T = unknown> {
  /** Item that was retried */
  item: RetryItem<T>;
  /** Whether retry was successful */
  success: boolean;
  /** Error if failed */
  error?: Error;
  /** Result if successful */
  result?: unknown;
}

type RetryHandler<T> = (item: RetryItem<T>) => Promise<unknown>;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: RetryQueueConfig = {
  maxRetries: 5,
  baseDelayMs: 1000,
  maxDelayMs: 300000, // 5 minutes
  maxAgeMs: 86400000, // 24 hours
  maxQueueSize: 100,
  persistent: true,
  storageKey: 'retry_queue',
  autoProcess: false,
  autoProcessIntervalMs: 60000, // 1 minute
};

// ============================================================================
// Retry Queue Class
// ============================================================================

export class RetryQueue<T = unknown> {
  private config: RetryQueueConfig;
  private queue: RetryItem<T>[] = [];
  private deadLetter: RetryItem<T>[] = [];
  private handlers = new Map<string, RetryHandler<T>>();
  private processing = false;
  private autoProcessTimer: ReturnType<typeof setInterval> | null = null;
  private rateLimiter?: RateLimiter;
  private initialized = false;

  constructor(config: Partial<RetryQueueConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the queue (load from storage if persistent)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.persistent) {
      await this.loadFromStorage();
    }

    if (this.config.autoProcess) {
      this.startAutoProcess();
    }

    this.initialized = true;
    log.debug('Retry queue initialized', { queueSize: this.queue.length });
  }

  /**
   * Set rate limiter for processing
   */
  setRateLimiter(limiter: RateLimiter): void {
    this.rateLimiter = limiter;
  }

  /**
   * Register a handler for a specific item type
   */
  registerHandler(type: string, handler: RetryHandler<T>): void {
    this.handlers.set(type, handler);
    log.debug(`Handler registered for type: ${type}`);
  }

  /**
   * Add an item to the retry queue
   */
  async add(
    type: string,
    payload: T,
    options: {
      id?: string;
      priority?: number;
      errorCode?: string;
      errorMessage?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): Promise<RetryItem<T>> {
    // Check queue size limit
    if (this.queue.length >= this.config.maxQueueSize) {
      // Remove oldest low-priority item
      this.removeOldestLowPriority();
    }

    const now = Date.now();
    const item: RetryItem<T> = {
      id: options.id || this.generateId(),
      type,
      payload,
      attempts: 0,
      lastError: options.errorMessage,
      errorCode: options.errorCode,
      createdAt: now,
      nextRetryAt: now + this.config.baseDelayMs,
      priority: options.priority ?? 0,
      metadata: options.metadata,
    };

    this.queue.push(item);
    this.sortQueue();

    if (this.config.persistent) {
      await this.saveToStorage();
    }

    log.debug('Item added to retry queue', { id: item.id, type: item.type });
    return item;
  }

  /**
   * Add or update an existing item (useful for re-queueing after failure)
   */
  async addOrUpdate(
    type: string,
    payload: T,
    options: {
      id: string;
      priority?: number;
      errorCode?: string;
      errorMessage?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<RetryItem<T>> {
    const existing = this.queue.find((item) => item.id === options.id);

    if (existing) {
      existing.attempts++;
      existing.lastError = options.errorMessage;
      existing.errorCode = options.errorCode;
      existing.lastAttemptAt = Date.now();
      existing.nextRetryAt = this.calculateNextRetry(existing.attempts);

      if (options.priority !== undefined) {
        existing.priority = options.priority;
      }
      if (options.metadata) {
        existing.metadata = { ...existing.metadata, ...options.metadata };
      }

      // Check if should move to dead letter
      if (existing.attempts >= this.config.maxRetries) {
        return this.moveToDeadLetter(existing);
      }

      this.sortQueue();

      if (this.config.persistent) {
        await this.saveToStorage();
      }

      return existing;
    }

    return this.add(type, payload, options);
  }

  /**
   * Get an item by ID
   */
  get(id: string): RetryItem<T> | undefined {
    return this.queue.find((item) => item.id === id);
  }

  /**
   * Get all items of a specific type
   */
  getByType(type: string): RetryItem<T>[] {
    return this.queue.filter((item) => item.type === type);
  }

  /**
   * Get items ready for retry
   */
  getReadyItems(): RetryItem<T>[] {
    const now = Date.now();
    return this.queue.filter((item) => item.nextRetryAt <= now);
  }

  /**
   * Remove an item from the queue
   */
  async remove(id: string): Promise<boolean> {
    const index = this.queue.findIndex((item) => item.id === id);
    if (index === -1) return false;

    this.queue.splice(index, 1);

    if (this.config.persistent) {
      await this.saveToStorage();
    }

    log.debug('Item removed from retry queue', { id });
    return true;
  }

  /**
   * Clear all items from the queue
   */
  async clear(): Promise<void> {
    this.queue = [];

    if (this.config.persistent) {
      await this.saveToStorage();
    }

    log.debug('Retry queue cleared');
  }

  /**
   * Clear dead letter queue
   */
  async clearDeadLetter(): Promise<void> {
    this.deadLetter = [];

    if (this.config.persistent) {
      await this.saveToStorage();
    }

    log.debug('Dead letter queue cleared');
  }

  /**
   * Process a single item
   */
  async processItem(id: string): Promise<RetryResult<T>> {
    const item = this.get(id);
    if (!item) {
      throw new Error(`Item not found: ${id}`);
    }

    const handler = this.handlers.get(item.type);
    if (!handler) {
      throw new Error(`No handler registered for type: ${item.type}`);
    }

    return this.executeRetry(item, handler);
  }

  /**
   * Process all ready items
   */
  async processReady(): Promise<RetryResult<T>[]> {
    if (this.processing) {
      log.debug('Already processing, skipping');
      return [];
    }

    this.processing = true;
    const results: RetryResult<T>[] = [];

    try {
      // Clean up old items first
      await this.cleanup();

      const readyItems = this.getReadyItems();
      log.debug(`Processing ${readyItems.length} ready items`);

      for (const item of readyItems) {
        const handler = this.handlers.get(item.type);
        if (!handler) {
          log.warn(`No handler for type: ${item.type}, skipping`);
          continue;
        }

        // Respect rate limiter if set
        if (this.rateLimiter) {
          await this.rateLimiter.waitForToken();
          this.rateLimiter.acquire();
        }

        const result = await this.executeRetry(item, handler);
        results.push(result);

        // Small delay between items
        await this.delay(100);
      }
    } finally {
      this.processing = false;
    }

    return results;
  }

  /**
   * Get queue statistics
   */
  getStats(): RetryQueueStats {
    const now = Date.now();
    const byType: Record<string, number> = {};

    for (const item of this.queue) {
      byType[item.type] = (byType[item.type] || 0) + 1;
    }

    const totalAttempts = this.queue.reduce((sum, item) => sum + item.attempts, 0);
    const oldestItem = this.queue.reduce(
      (oldest, item) => (item.createdAt < oldest ? item.createdAt : oldest),
      now
    );

    return {
      queueSize: this.queue.length,
      readyCount: this.getReadyItems().length,
      deadLetterCount: this.deadLetter.length,
      byType,
      avgAttempts: this.queue.length > 0 ? totalAttempts / this.queue.length : 0,
      oldestItemAge: now - oldestItem,
    };
  }

  /**
   * Get dead letter queue items
   */
  getDeadLetterItems(): RetryItem<T>[] {
    return [...this.deadLetter];
  }

  /**
   * Move item from dead letter back to main queue for retry
   */
  async resurrect(id: string): Promise<RetryItem<T> | null> {
    const index = this.deadLetter.findIndex((item) => item.id === id);
    if (index === -1) return null;

    const item = this.deadLetter.splice(index, 1)[0];
    item.attempts = 0;
    item.nextRetryAt = Date.now();

    this.queue.push(item);
    this.sortQueue();

    if (this.config.persistent) {
      await this.saveToStorage();
    }

    log.debug('Item resurrected from dead letter', { id });
    return item;
  }

  /**
   * Stop auto-processing
   */
  stopAutoProcess(): void {
    if (this.autoProcessTimer) {
      clearInterval(this.autoProcessTimer);
      this.autoProcessTimer = null;
    }
  }

  /**
   * Destroy the queue and clean up resources
   */
  destroy(): void {
    this.stopAutoProcess();
    this.handlers.clear();
    this.queue = [];
    this.deadLetter = [];
    this.initialized = false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async executeRetry(
    item: RetryItem<T>,
    handler: RetryHandler<T>
  ): Promise<RetryResult<T>> {
    item.lastAttemptAt = Date.now();
    item.attempts++;

    try {
      const result = await handler(item);

      // Success - remove from queue
      await this.remove(item.id);

      log.debug('Retry successful', { id: item.id, attempts: item.attempts });
      return { item, success: true, result };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      item.lastError = err.message;

      // Check if should move to dead letter
      if (item.attempts >= this.config.maxRetries) {
        await this.moveToDeadLetter(item);
        log.warn('Item moved to dead letter after max retries', {
          id: item.id,
          attempts: item.attempts,
        });
      } else {
        // Schedule next retry
        item.nextRetryAt = this.calculateNextRetry(item.attempts);

        if (this.config.persistent) {
          await this.saveToStorage();
        }

        log.debug('Retry failed, scheduled for later', {
          id: item.id,
          attempts: item.attempts,
          nextRetryAt: new Date(item.nextRetryAt).toISOString(),
        });
      }

      return { item, success: false, error: err };
    }
  }

  private async moveToDeadLetter(item: RetryItem<T>): Promise<RetryItem<T>> {
    // Remove from main queue
    const index = this.queue.findIndex((i) => i.id === item.id);
    if (index !== -1) {
      this.queue.splice(index, 1);
    }

    // Add to dead letter
    this.deadLetter.push(item);

    // Limit dead letter size
    while (this.deadLetter.length > this.config.maxQueueSize) {
      this.deadLetter.shift();
    }

    if (this.config.persistent) {
      await this.saveToStorage();
    }

    return item;
  }

  private calculateNextRetry(attempts: number): number {
    // Exponential backoff with jitter
    const baseDelay = this.config.baseDelayMs * Math.pow(2, attempts - 1);
    const jitter = Math.random() * 0.3 * baseDelay; // 30% jitter
    const delay = Math.min(baseDelay + jitter, this.config.maxDelayMs);

    return Date.now() + delay;
  }

  private sortQueue(): void {
    // Sort by priority (descending) then by nextRetryAt (ascending)
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.nextRetryAt - b.nextRetryAt;
    });
  }

  private removeOldestLowPriority(): void {
    // Find the oldest item with the lowest priority
    let targetIndex = -1;
    let lowestPriority = Infinity;
    let oldestTime = Infinity;

    for (let i = 0; i < this.queue.length; i++) {
      const item = this.queue[i];
      if (
        item.priority < lowestPriority ||
        (item.priority === lowestPriority && item.createdAt < oldestTime)
      ) {
        lowestPriority = item.priority;
        oldestTime = item.createdAt;
        targetIndex = i;
      }
    }

    if (targetIndex >= 0) {
      const removed = this.queue.splice(targetIndex, 1)[0];
      log.debug('Removed oldest low-priority item to make room', { id: removed.id });
    }
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    const maxAge = this.config.maxAgeMs;

    // Remove items older than maxAge
    const oldItems = this.queue.filter((item) => now - item.createdAt > maxAge);
    for (const item of oldItems) {
      await this.remove(item.id);
      log.debug('Removed expired item', { id: item.id, age: now - item.createdAt });
    }

    // Also clean up dead letter
    this.deadLetter = this.deadLetter.filter((item) => now - item.createdAt <= maxAge);
  }

  private startAutoProcess(): void {
    if (this.autoProcessTimer) return;

    this.autoProcessTimer = setInterval(() => {
      this.processReady().catch((error: unknown) => {
        log.error('Auto-process failed', error instanceof Error ? error : new Error(String(error)));
      });
    }, this.config.autoProcessIntervalMs);
  }

  private async loadFromStorage(): Promise<void> {
    try {
      const data = await chrome.storage.local.get([
        `${this.config.storageKey}_queue`,
        `${this.config.storageKey}_deadletter`,
      ]);

      this.queue = (data[`${this.config.storageKey}_queue`] as RetryItem<T>[]) || [];
      this.deadLetter = (data[`${this.config.storageKey}_deadletter`] as RetryItem<T>[]) || [];

      log.debug('Loaded from storage', {
        queueSize: this.queue.length,
        deadLetterSize: this.deadLetter.length,
      });
    } catch (error: unknown) {
      log.error('Failed to load from storage', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async saveToStorage(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [`${this.config.storageKey}_queue`]: this.queue,
        [`${this.config.storageKey}_deadletter`]: this.deadLetter,
      });
    } catch (error: unknown) {
      log.error('Failed to save to storage', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Translation Retry Queue (Specialized)
// ============================================================================

export interface TranslationRetryPayload {
  /** Video ID */
  videoId: string;
  /** Platform (youtube, netflix, etc.) */
  platform: string;
  /** Source language */
  sourceLanguage: string;
  /** Target language */
  targetLanguage: string;
  /** Provider type */
  provider: string;
  /** Cue indices that failed */
  failedCueIndices?: number[];
  /** Tab ID that initiated the translation */
  tabId?: number;
}

let translationRetryQueue: RetryQueue<TranslationRetryPayload> | null = null;

/**
 * Get or create the translation retry queue singleton
 */
export function getTranslationRetryQueue(): RetryQueue<TranslationRetryPayload> {
  if (!translationRetryQueue) {
    translationRetryQueue = new RetryQueue<TranslationRetryPayload>({
      maxRetries: 3,
      baseDelayMs: 5000,
      maxDelayMs: 300000, // 5 minutes
      maxAgeMs: 3600000, // 1 hour
      maxQueueSize: 50,
      persistent: true,
      storageKey: 'translation_retry',
      autoProcess: false, // Manual trigger for translations
    });
  }

  return translationRetryQueue;
}

/**
 * Add a failed translation to the retry queue
 */
export async function queueFailedTranslation(
  payload: TranslationRetryPayload,
  options: {
    errorCode?: string;
    errorMessage?: string;
    priority?: number;
  } = {}
): Promise<RetryItem<TranslationRetryPayload>> {
  const queue = getTranslationRetryQueue();
  await queue.initialize();

  const id = `${payload.platform}:${payload.videoId}:${payload.sourceLanguage}:${payload.targetLanguage}`;

  return queue.addOrUpdate('translation', payload, {
    id,
    priority: options.priority ?? 0,
    errorCode: options.errorCode,
    errorMessage: options.errorMessage,
    metadata: {
      provider: payload.provider,
      failedCueCount: payload.failedCueIndices?.length ?? 0,
    },
  });
}

/**
 * Process pending translation retries
 */
export async function processTranslationRetries(
  handler: RetryHandler<TranslationRetryPayload>
): Promise<RetryResult<TranslationRetryPayload>[]> {
  const queue = getTranslationRetryQueue();
  await queue.initialize();

  // Register handler if not already registered
  queue.registerHandler('translation', handler);

  // Use provider rate limiter if available
  const rateLimiter = getRateLimiter('default');
  queue.setRateLimiter(rateLimiter);

  return queue.processReady();
}

/**
 * Get translation retry queue statistics
 */
export async function getTranslationRetryStats(): Promise<RetryQueueStats> {
  const queue = getTranslationRetryQueue();
  await queue.initialize();

  return queue.getStats();
}

/**
 * Clear the translation retry queue
 */
export async function clearTranslationRetryQueue(): Promise<void> {
  const queue = getTranslationRetryQueue();
  await queue.initialize();

  await queue.clear();
}

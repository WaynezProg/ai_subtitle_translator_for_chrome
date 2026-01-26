/**
 * Memory Management Utilities
 *
 * Provides tools for managing memory efficiently in the extension:
 * - WeakRef-based caching to prevent memory leaks
 * - Object pooling for frequent allocations
 * - LRU cache with size limits
 * - Automatic cleanup of stale references
 * - Memory pressure monitoring
 */

import { createLogger } from './logger';

const logger = createLogger('MemoryManager');

// ============================================================================
// Types
// ============================================================================

/**
 * Options for LRU cache
 */
export interface LRUCacheOptions<K, V> {
  /** Maximum number of entries */
  maxSize: number;
  /** Time-to-live in milliseconds (0 = no expiry) */
  ttl?: number;
  /** Called when an entry is evicted */
  onEvict?: (key: K, value: V) => void;
  /** Custom size calculator (defaults to 1 per entry) */
  sizeCalculator?: (value: V, key: K) => number;
}

/**
 * Cache entry with metadata
 */
interface CacheEntry<V> {
  value: V;
  size: number;
  createdAt: number;
  lastAccessedAt: number;
}

/**
 * Options for object pool
 */
export interface ObjectPoolOptions<T> {
  /** Factory function to create new objects */
  create: () => T;
  /** Function to reset object before reuse */
  reset?: (obj: T) => void;
  /** Maximum pool size */
  maxSize?: number;
  /** Initial pool size */
  initialSize?: number;
}

/**
 * Options for WeakValueMap
 */
export interface WeakValueMapOptions {
  /** Cleanup interval in milliseconds */
  cleanupInterval?: number;
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  heapUsed?: number;
  heapTotal?: number;
  external?: number;
  arrayBuffers?: number;
  usedPercentage?: number;
}

// ============================================================================
// LRU Cache Implementation
// ============================================================================

/**
 * Least Recently Used (LRU) cache with size limits and TTL support
 */
export class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private currentSize = 0;
  private readonly maxSize: number;
  private readonly ttl: number;
  private readonly onEvict?: (key: K, value: V) => void;
  private readonly sizeCalculator: (value: V, key: K) => number;

  // Stats
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(options: LRUCacheOptions<K, V>) {
    this.maxSize = options.maxSize;
    this.ttl = options.ttl || 0;
    this.onEvict = options.onEvict;
    this.sizeCalculator = options.sizeCalculator || (() => 1);
  }

  /**
   * Get a value from the cache
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    if (this.ttl > 0 && Date.now() - entry.createdAt > this.ttl) {
      this.delete(key);
      this.misses++;
      return undefined;
    }

    // Update access time and move to end (most recently used)
    entry.lastAccessedAt = Date.now();
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.hits++;
    return entry.value;
  }

  /**
   * Set a value in the cache
   */
  set(key: K, value: V): this {
    // Delete existing entry if present
    if (this.cache.has(key)) {
      this.delete(key);
    }

    const size = this.sizeCalculator(value, key);

    // Evict entries if necessary
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      this.evictOldest();
    }

    // Add new entry
    const now = Date.now();
    this.cache.set(key, {
      value,
      size,
      createdAt: now,
      lastAccessedAt: now,
    });
    this.currentSize += size;

    return this;
  }

  /**
   * Check if key exists
   */
  has(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check TTL
    if (this.ttl > 0 && Date.now() - entry.createdAt > this.ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from the cache
   */
  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.cache.delete(key);
    this.currentSize -= entry.size;
    this.onEvict?.(key, entry.value);

    return true;
  }

  /**
   * Clear the cache
   */
  clear(): void {
    if (this.onEvict) {
      for (const [key, entry] of this.cache) {
        this.onEvict(key, entry.value);
      }
    }
    this.cache.clear();
    this.currentSize = 0;
  }

  /**
   * Get current entry count
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get current size (sum of all entry sizes)
   */
  get totalSize(): number {
    return this.currentSize;
  }

  /**
   * Evict expired entries
   */
  pruneExpired(): number {
    if (this.ttl === 0) return 0;

    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.createdAt > this.ttl) {
        this.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    totalSize: number;
    maxSize: number;
    hits: number;
    misses: number;
    evictions: number;
    hitRate: number;
  } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      totalSize: this.currentSize,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: total > 0 ? this.hits / total : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get all keys
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get all values
   */
  values(): V[] {
    return Array.from(this.cache.values()).map((e) => e.value);
  }

  /**
   * Iterate over entries
   */
  forEach(callback: (value: V, key: K) => void): void {
    for (const [key, entry] of this.cache) {
      callback(entry.value, key);
    }
  }

  /**
   * Evict the oldest (least recently used) entry
   */
  private evictOldest(): void {
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey !== undefined) {
      this.delete(oldestKey);
      this.evictions++;
    }
  }
}

// ============================================================================
// Object Pool Implementation
// ============================================================================

/**
 * Object pool for reusing frequently allocated objects
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private readonly create: () => T;
  private readonly reset?: (obj: T) => void;
  private readonly maxSize: number;

  // Stats
  private created = 0;
  private reused = 0;
  private returned = 0;

  constructor(options: ObjectPoolOptions<T>) {
    this.create = options.create;
    this.reset = options.reset;
    this.maxSize = options.maxSize || 100;

    // Pre-populate pool
    const initialSize = options.initialSize || 0;
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.create());
      this.created++;
    }
  }

  /**
   * Acquire an object from the pool
   */
  acquire(): T {
    if (this.pool.length > 0) {
      this.reused++;
      return this.pool.pop()!;
    }

    this.created++;
    return this.create();
  }

  /**
   * Release an object back to the pool
   */
  release(obj: T): void {
    if (this.pool.length >= this.maxSize) {
      // Pool is full, discard the object
      return;
    }

    this.reset?.(obj);
    this.pool.push(obj);
    this.returned++;
  }

  /**
   * Get current pool size
   */
  get size(): number {
    return this.pool.length;
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.pool = [];
  }

  /**
   * Get pool statistics
   */
  getStats(): {
    poolSize: number;
    maxSize: number;
    created: number;
    reused: number;
    returned: number;
    reuseRate: number;
  } {
    const total = this.created + this.reused;
    return {
      poolSize: this.pool.length,
      maxSize: this.maxSize,
      created: this.created,
      reused: this.reused,
      returned: this.returned,
      reuseRate: total > 0 ? this.reused / total : 0,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.created = 0;
    this.reused = 0;
    this.returned = 0;
  }
}

// ============================================================================
// WeakValueMap Implementation
// ============================================================================

/**
 * Map with weak references to values, allowing garbage collection
 */
export class WeakValueMap<K, V extends object> {
  private map = new Map<K, WeakRef<V>>();
  private cleanupInterval?: ReturnType<typeof setInterval>;
  private readonly registry = new FinalizationRegistry<K>((key) => {
    this.map.delete(key);
  });

  constructor(options: WeakValueMapOptions = {}) {
    if (options.cleanupInterval && options.cleanupInterval > 0) {
      this.cleanupInterval = setInterval(() => {
        this.cleanup();
      }, options.cleanupInterval);
    }
  }

  /**
   * Get a value from the map
   */
  get(key: K): V | undefined {
    const ref = this.map.get(key);
    if (!ref) return undefined;

    const value = ref.deref();
    if (!value) {
      this.map.delete(key);
      return undefined;
    }

    return value;
  }

  /**
   * Set a value in the map
   */
  set(key: K, value: V): this {
    // Unregister old value if exists
    const oldRef = this.map.get(key);
    if (oldRef) {
      const oldValue = oldRef.deref();
      if (oldValue) {
        this.registry.unregister(oldValue);
      }
    }

    // Register new value
    this.registry.register(value, key, value);
    this.map.set(key, new WeakRef(value));

    return this;
  }

  /**
   * Check if key exists and value is still alive
   */
  has(key: K): boolean {
    const ref = this.map.get(key);
    if (!ref) return false;

    const value = ref.deref();
    if (!value) {
      this.map.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from the map
   */
  delete(key: K): boolean {
    const ref = this.map.get(key);
    if (!ref) return false;

    const value = ref.deref();
    if (value) {
      this.registry.unregister(value);
    }

    return this.map.delete(key);
  }

  /**
   * Get current entry count (may include dead references)
   */
  get size(): number {
    return this.map.size;
  }

  /**
   * Clear the map
   */
  clear(): void {
    for (const [, ref] of this.map) {
      const value = ref.deref();
      if (value) {
        this.registry.unregister(value);
      }
    }
    this.map.clear();
  }

  /**
   * Clean up dead references
   */
  cleanup(): number {
    let cleaned = 0;
    for (const [key, ref] of this.map) {
      if (!ref.deref()) {
        this.map.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * Get actual size (only live references)
   */
  get liveSize(): number {
    let count = 0;
    for (const [, ref] of this.map) {
      if (ref.deref()) {
        count++;
      }
    }
    return count;
  }

  /**
   * Dispose of the map and stop cleanup interval
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.clear();
  }
}

// ============================================================================
// Resource Tracker
// ============================================================================

/**
 * Tracks disposable resources and ensures cleanup
 */
export class ResourceTracker {
  private resources = new Set<{ dispose: () => void }>();
  private isDisposed = false;

  /**
   * Track a resource for cleanup
   */
  track<T extends { dispose: () => void }>(resource: T): T {
    if (this.isDisposed) {
      throw new Error('ResourceTracker is disposed');
    }
    this.resources.add(resource);
    return resource;
  }

  /**
   * Track a function as a cleanup action
   */
  trackFunction(cleanup: () => void): void {
    this.track({ dispose: cleanup });
  }

  /**
   * Untrack a resource
   */
  untrack(resource: { dispose: () => void }): boolean {
    return this.resources.delete(resource);
  }

  /**
   * Get number of tracked resources
   */
  get size(): number {
    return this.resources.size;
  }

  /**
   * Check if disposed
   */
  get disposed(): boolean {
    return this.isDisposed;
  }

  /**
   * Dispose all tracked resources
   */
  dispose(): void {
    if (this.isDisposed) return;

    this.isDisposed = true;

    for (const resource of this.resources) {
      try {
        resource.dispose();
      } catch (error) {
        logger.error('Error disposing resource', { error });
      }
    }

    this.resources.clear();
  }
}

// ============================================================================
// Memory Pressure Monitor
// ============================================================================

type MemoryPressureLevel = 'low' | 'moderate' | 'high' | 'critical';

/**
 * Monitor memory pressure and trigger callbacks
 */
export class MemoryPressureMonitor {
  private listeners = new Map<MemoryPressureLevel, Set<() => void>>();
  private currentLevel: MemoryPressureLevel = 'low';
  private checkInterval?: ReturnType<typeof setInterval>;
  private readonly thresholds = {
    moderate: 0.6,
    high: 0.8,
    critical: 0.95,
  };

  constructor() {
    this.listeners.set('low', new Set());
    this.listeners.set('moderate', new Set());
    this.listeners.set('high', new Set());
    this.listeners.set('critical', new Set());
  }

  /**
   * Start monitoring memory pressure
   */
  start(intervalMs = 5000): void {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      this.checkPressure();
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }

  /**
   * Register callback for pressure level
   */
  onPressure(level: MemoryPressureLevel, callback: () => void): () => void {
    this.listeners.get(level)?.add(callback);
    return () => this.listeners.get(level)?.delete(callback);
  }

  /**
   * Get current pressure level
   */
  get level(): MemoryPressureLevel {
    return this.currentLevel;
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): MemoryStats {
    // Check if we're in a Node.js environment with process.memoryUsage
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const usage = process.memoryUsage();
      return {
        heapUsed: usage.heapUsed,
        heapTotal: usage.heapTotal,
        external: usage.external,
        arrayBuffers: usage.arrayBuffers,
        usedPercentage: usage.heapUsed / usage.heapTotal,
      };
    }

    // Check if we're in a browser with performance.memory
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const memory = (performance as Performance & { memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      }}).memory;
      if (memory) {
        return {
          heapUsed: memory.usedJSHeapSize,
          heapTotal: memory.totalJSHeapSize,
          usedPercentage: memory.usedJSHeapSize / memory.jsHeapSizeLimit,
        };
      }
    }

    return {};
  }

  /**
   * Check current memory pressure
   */
  private checkPressure(): void {
    const stats = this.getMemoryStats();
    const usage = stats.usedPercentage || 0;

    let newLevel: MemoryPressureLevel;

    if (usage >= this.thresholds.critical) {
      newLevel = 'critical';
    } else if (usage >= this.thresholds.high) {
      newLevel = 'high';
    } else if (usage >= this.thresholds.moderate) {
      newLevel = 'moderate';
    } else {
      newLevel = 'low';
    }

    if (newLevel !== this.currentLevel) {
      const previousLevel = this.currentLevel;
      this.currentLevel = newLevel;

      logger.debug('Memory pressure changed', {
        from: previousLevel,
        to: newLevel,
        usage: Math.round(usage * 100),
      });

      // Notify listeners for the new level
      this.listeners.get(newLevel)?.forEach((callback) => {
        try {
          callback();
        } catch (error) {
          logger.error('Error in memory pressure callback', { error });
        }
      });
    }
  }

  /**
   * Manually trigger a pressure check
   */
  check(): MemoryPressureLevel {
    this.checkPressure();
    return this.currentLevel;
  }
}

// ============================================================================
// Auto-Disposing Cache
// ============================================================================

/**
 * Cache that automatically disposes old entries under memory pressure
 */
export class AutoDisposingCache<K, V> {
  private cache: LRUCache<K, V>;
  private monitor: MemoryPressureMonitor;
  private unsubscribers: (() => void)[] = [];

  constructor(
    options: LRUCacheOptions<K, V>,
    monitorOptions?: { monitor?: MemoryPressureMonitor }
  ) {
    this.cache = new LRUCache(options);
    this.monitor = monitorOptions?.monitor || new MemoryPressureMonitor();

    // Register pressure handlers
    this.unsubscribers.push(
      this.monitor.onPressure('high', () => {
        // Remove 25% of entries under high pressure
        this.evictPercentage(0.25);
      })
    );

    this.unsubscribers.push(
      this.monitor.onPressure('critical', () => {
        // Remove 50% of entries under critical pressure
        this.evictPercentage(0.5);
      })
    );
  }

  /**
   * Get a value from the cache
   */
  get(key: K): V | undefined {
    return this.cache.get(key);
  }

  /**
   * Set a value in the cache
   */
  set(key: K, value: V): this {
    this.cache.set(key, value);
    return this;
  }

  /**
   * Check if key exists
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * Delete a key from the cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get current entry count
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      ...this.cache.getStats(),
      memoryPressure: this.monitor.level,
    };
  }

  /**
   * Evict a percentage of entries
   */
  private evictPercentage(percentage: number): void {
    const toEvict = Math.floor(this.cache.size * percentage);
    const keys = this.cache.keys();

    for (let i = 0; i < toEvict && i < keys.length; i++) {
      this.cache.delete(keys[i]);
    }

    logger.debug('Evicted entries due to memory pressure', {
      evicted: toEvict,
      remaining: this.cache.size,
    });
  }

  /**
   * Start memory monitoring
   */
  startMonitoring(intervalMs = 5000): void {
    this.monitor.start(intervalMs);
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring(): void {
    this.monitor.stop();
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
    this.monitor.stop();
    this.cache.clear();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a cache key from multiple values
 */
export function createCacheKey(...parts: (string | number | boolean | null | undefined)[]): string {
  return parts.map((p) => String(p ?? '')).join(':');
}

/**
 * Estimate the size of an object in bytes
 */
export function estimateObjectSize(obj: unknown): number {
  const seen = new WeakSet();

  function calculate(value: unknown): number {
    // Primitive types
    if (value === null || value === undefined) return 0;
    if (typeof value === 'boolean') return 4;
    if (typeof value === 'number') return 8;
    if (typeof value === 'string') return value.length * 2;

    // Objects
    if (typeof value === 'object') {
      if (seen.has(value)) return 0;
      seen.add(value);

      if (Array.isArray(value)) {
        return value.reduce((acc, item) => acc + calculate(item), 0);
      }

      if (value instanceof Map) {
        let size = 0;
        for (const [k, v] of value) {
          size += calculate(k) + calculate(v);
        }
        return size;
      }

      if (value instanceof Set) {
        let size = 0;
        for (const item of value) {
          size += calculate(item);
        }
        return size;
      }

      // Regular object
      let size = 0;
      for (const key of Object.keys(value)) {
        size += key.length * 2;
        size += calculate((value as Record<string, unknown>)[key]);
      }
      return size;
    }

    return 0;
  }

  return calculate(obj);
}

/**
 * Memoize a function with LRU cache
 */
export function memoize<T extends (...args: unknown[]) => unknown>(
  fn: T,
  options: {
    maxSize?: number;
    ttl?: number;
    keyGenerator?: (...args: Parameters<T>) => string;
  } = {}
): T & { cache: LRUCache<string, ReturnType<T>>; clear: () => void } {
  const { maxSize = 100, ttl = 0, keyGenerator = (...args) => JSON.stringify(args) } = options;

  const cache = new LRUCache<string, ReturnType<T>>({
    maxSize,
    ttl,
  });

  const memoized = function (this: unknown, ...args: Parameters<T>): ReturnType<T> {
    const key = keyGenerator(...args);
    const cached = cache.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const result = fn.apply(this, args) as ReturnType<T>;
    cache.set(key, result);
    return result;
  } as T & { cache: LRUCache<string, ReturnType<T>>; clear: () => void };

  memoized.cache = cache;
  memoized.clear = () => cache.clear();

  return memoized;
}

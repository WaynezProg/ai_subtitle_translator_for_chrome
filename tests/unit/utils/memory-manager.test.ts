/**
 * Tests for Memory Management Utilities
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  LRUCache,
  ObjectPool,
  WeakValueMap,
  ResourceTracker,
  MemoryPressureMonitor,
  AutoDisposingCache,
  createCacheKey,
  estimateObjectSize,
  memoize,
} from '@shared/utils/memory-manager';

// ============================================================================
// LRUCache Tests
// ============================================================================

describe('LRUCache', () => {
  let cache: LRUCache<string, number>;

  beforeEach(() => {
    cache = new LRUCache<string, number>({ maxSize: 3 });
  });

  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      cache.set('a', 1);
      cache.set('b', 2);

      expect(cache.get('a')).toBe(1);
      expect(cache.get('b')).toBe(2);
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should check if key exists', () => {
      cache.set('a', 1);

      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });

    it('should delete keys', () => {
      cache.set('a', 1);
      expect(cache.delete('a')).toBe(true);
      expect(cache.has('a')).toBe(false);
      expect(cache.delete('a')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.has('a')).toBe(false);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when full', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // Should evict 'a'

      expect(cache.has('a')).toBe(false);
      expect(cache.has('b')).toBe(true);
      expect(cache.has('c')).toBe(true);
      expect(cache.has('d')).toBe(true);
    });

    it('should update access time on get', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);

      // Access 'a' to make it recently used
      cache.get('a');

      // Add new entry, should evict 'b' (now oldest)
      cache.set('d', 4);

      expect(cache.has('a')).toBe(true);
      expect(cache.has('b')).toBe(false);
    });

    it('should call onEvict callback', () => {
      const onEvict = vi.fn();
      const evictCache = new LRUCache<string, number>({ maxSize: 2, onEvict });

      evictCache.set('a', 1);
      evictCache.set('b', 2);
      evictCache.set('c', 3);

      expect(onEvict).toHaveBeenCalledWith('a', 1);
    });
  });

  describe('TTL support', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire entries after TTL', () => {
      const ttlCache = new LRUCache<string, number>({ maxSize: 10, ttl: 1000 });

      ttlCache.set('a', 1);
      expect(ttlCache.get('a')).toBe(1);

      vi.advanceTimersByTime(1001);
      expect(ttlCache.get('a')).toBeUndefined();
    });

    it('should prune expired entries', () => {
      const ttlCache = new LRUCache<string, number>({ maxSize: 10, ttl: 1000 });

      ttlCache.set('a', 1);
      ttlCache.set('b', 2);

      vi.advanceTimersByTime(1001);

      const pruned = ttlCache.pruneExpired();
      expect(pruned).toBe(2);
      expect(ttlCache.size).toBe(0);
    });
  });

  describe('custom size calculator', () => {
    it('should respect size calculator', () => {
      const sizedCache = new LRUCache<string, string>({
        maxSize: 10,
        sizeCalculator: (value) => value.length,
      });

      sizedCache.set('a', 'hello'); // size 5
      sizedCache.set('b', 'world'); // size 5
      sizedCache.set('c', 'hi'); // size 2, should evict 'a' or both to fit

      expect(sizedCache.totalSize).toBeLessThanOrEqual(10);
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      cache.set('a', 1);

      cache.get('a'); // hit
      cache.get('a'); // hit
      cache.get('b'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('should track evictions', () => {
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.set('d', 4); // eviction
      cache.set('e', 5); // eviction

      const stats = cache.getStats();
      expect(stats.evictions).toBe(2);
    });

    it('should reset statistics', () => {
      cache.set('a', 1);
      cache.get('a');

      cache.resetStats();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('iteration', () => {
    it('should return all keys', () => {
      cache.set('a', 1);
      cache.set('b', 2);

      const keys = cache.keys();
      expect(keys).toContain('a');
      expect(keys).toContain('b');
    });

    it('should return all values', () => {
      cache.set('a', 1);
      cache.set('b', 2);

      const values = cache.values();
      expect(values).toContain(1);
      expect(values).toContain(2);
    });

    it('should iterate with forEach', () => {
      cache.set('a', 1);
      cache.set('b', 2);

      const entries: [string, number][] = [];
      cache.forEach((value, key) => entries.push([key, value]));

      expect(entries).toHaveLength(2);
    });
  });
});

// ============================================================================
// ObjectPool Tests
// ============================================================================

describe('ObjectPool', () => {
  interface TestObject {
    value: number;
  }

  let pool: ObjectPool<TestObject>;

  beforeEach(() => {
    pool = new ObjectPool<TestObject>({
      create: () => ({ value: 0 }),
      reset: (obj) => {
        obj.value = 0;
      },
      maxSize: 5,
    });
  });

  it('should create new objects when pool is empty', () => {
    const obj = pool.acquire();
    expect(obj).toEqual({ value: 0 });
  });

  it('should reuse objects from pool', () => {
    const obj1 = pool.acquire();
    obj1.value = 42;
    pool.release(obj1);

    const obj2 = pool.acquire();
    expect(obj2).toBe(obj1);
    expect(obj2.value).toBe(0); // Reset was called
  });

  it('should respect max pool size', () => {
    const objects = [];
    for (let i = 0; i < 10; i++) {
      objects.push(pool.acquire());
    }

    for (const obj of objects) {
      pool.release(obj);
    }

    expect(pool.size).toBe(5); // Only maxSize objects kept
  });

  it('should pre-populate pool with initialSize', () => {
    const prePool = new ObjectPool<TestObject>({
      create: () => ({ value: 0 }),
      initialSize: 3,
    });

    expect(prePool.size).toBe(3);
  });

  it('should track statistics', () => {
    const obj1 = pool.acquire();
    const obj2 = pool.acquire();
    pool.release(obj1);
    pool.acquire(); // Reuse

    const stats = pool.getStats();
    expect(stats.created).toBe(2);
    expect(stats.reused).toBe(1);
    expect(stats.returned).toBe(1);
    expect(stats.reuseRate).toBeCloseTo(1 / 3);
  });

  it('should clear the pool', () => {
    pool.acquire();
    pool.release({ value: 0 });

    pool.clear();
    expect(pool.size).toBe(0);
  });
});

// ============================================================================
// WeakValueMap Tests
// ============================================================================

describe('WeakValueMap', () => {
  let map: WeakValueMap<string, object>;

  beforeEach(() => {
    map = new WeakValueMap<string, object>();
  });

  afterEach(() => {
    map.dispose();
  });

  it('should store and retrieve values', () => {
    const obj = { name: 'test' };
    map.set('key', obj);

    expect(map.get('key')).toBe(obj);
  });

  it('should return undefined for missing keys', () => {
    expect(map.get('nonexistent')).toBeUndefined();
  });

  it('should check if key exists', () => {
    const obj = { name: 'test' };
    map.set('key', obj);

    expect(map.has('key')).toBe(true);
    expect(map.has('missing')).toBe(false);
  });

  it('should delete keys', () => {
    const obj = { name: 'test' };
    map.set('key', obj);

    expect(map.delete('key')).toBe(true);
    expect(map.has('key')).toBe(false);
    expect(map.delete('key')).toBe(false);
  });

  it('should clear all entries', () => {
    map.set('a', { value: 1 });
    map.set('b', { value: 2 });

    map.clear();
    expect(map.size).toBe(0);
  });

  it('should report size', () => {
    map.set('a', { value: 1 });
    map.set('b', { value: 2 });

    expect(map.size).toBe(2);
  });

  it('should cleanup dead references', () => {
    map.set('a', { value: 1 });
    map.set('b', { value: 2 });

    // Live size should match size when all refs are alive
    expect(map.liveSize).toBe(2);
  });
});

// ============================================================================
// ResourceTracker Tests
// ============================================================================

describe('ResourceTracker', () => {
  let tracker: ResourceTracker;

  beforeEach(() => {
    tracker = new ResourceTracker();
  });

  it('should track resources', () => {
    const dispose1 = vi.fn();
    const dispose2 = vi.fn();

    tracker.track({ dispose: dispose1 });
    tracker.track({ dispose: dispose2 });

    expect(tracker.size).toBe(2);
  });

  it('should dispose all resources', () => {
    const dispose1 = vi.fn();
    const dispose2 = vi.fn();

    tracker.track({ dispose: dispose1 });
    tracker.track({ dispose: dispose2 });

    tracker.dispose();

    expect(dispose1).toHaveBeenCalled();
    expect(dispose2).toHaveBeenCalled();
    expect(tracker.size).toBe(0);
    expect(tracker.disposed).toBe(true);
  });

  it('should track functions as cleanup actions', () => {
    const cleanup = vi.fn();

    tracker.trackFunction(cleanup);
    tracker.dispose();

    expect(cleanup).toHaveBeenCalled();
  });

  it('should untrack resources', () => {
    const dispose = vi.fn();
    const resource = { dispose };

    tracker.track(resource);
    expect(tracker.untrack(resource)).toBe(true);

    tracker.dispose();
    expect(dispose).not.toHaveBeenCalled();
  });

  it('should throw when tracking after dispose', () => {
    tracker.dispose();

    expect(() => tracker.track({ dispose: vi.fn() })).toThrow('ResourceTracker is disposed');
  });

  it('should handle errors during dispose', () => {
    const dispose1 = vi.fn(() => {
      throw new Error('Dispose error');
    });
    const dispose2 = vi.fn();

    tracker.track({ dispose: dispose1 });
    tracker.track({ dispose: dispose2 });

    // Should not throw
    tracker.dispose();

    // Both should have been called despite error
    expect(dispose1).toHaveBeenCalled();
    expect(dispose2).toHaveBeenCalled();
  });
});

// ============================================================================
// MemoryPressureMonitor Tests
// ============================================================================

describe('MemoryPressureMonitor', () => {
  let monitor: MemoryPressureMonitor;

  beforeEach(() => {
    monitor = new MemoryPressureMonitor();
  });

  afterEach(() => {
    monitor.stop();
  });

  it('should start with low pressure', () => {
    expect(monitor.level).toBe('low');
  });

  it('should register pressure callbacks', () => {
    const callback = vi.fn();

    const unsubscribe = monitor.onPressure('high', callback);

    expect(typeof unsubscribe).toBe('function');
  });

  it('should get memory stats', () => {
    const stats = monitor.getMemoryStats();

    // May have stats or not depending on environment
    expect(typeof stats).toBe('object');
  });

  it('should check pressure level', () => {
    const level = monitor.check();

    expect(['low', 'moderate', 'high', 'critical']).toContain(level);
  });

  it('should start and stop monitoring', () => {
    vi.useFakeTimers();

    monitor.start(1000);
    vi.advanceTimersByTime(1000);

    monitor.stop();

    vi.useRealTimers();
  });
});

// ============================================================================
// AutoDisposingCache Tests
// ============================================================================

describe('AutoDisposingCache', () => {
  let cache: AutoDisposingCache<string, number>;

  beforeEach(() => {
    cache = new AutoDisposingCache<string, number>({ maxSize: 10 });
  });

  afterEach(() => {
    cache.dispose();
  });

  it('should work like a regular cache', () => {
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.get('a')).toBe(1);
    expect(cache.get('b')).toBe(2);
    expect(cache.has('a')).toBe(true);
    expect(cache.size).toBe(2);
  });

  it('should delete keys', () => {
    cache.set('a', 1);
    expect(cache.delete('a')).toBe(true);
    expect(cache.has('a')).toBe(false);
  });

  it('should clear all entries', () => {
    cache.set('a', 1);
    cache.set('b', 2);
    cache.clear();

    expect(cache.size).toBe(0);
  });

  it('should provide stats with memory pressure', () => {
    cache.set('a', 1);

    const stats = cache.getStats();
    expect(stats.size).toBe(1);
    expect(stats.memoryPressure).toBeDefined();
  });

  it('should start and stop monitoring', () => {
    cache.startMonitoring(1000);
    cache.stopMonitoring();
    // Should not throw
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('createCacheKey', () => {
  it('should create key from strings', () => {
    expect(createCacheKey('a', 'b', 'c')).toBe('a:b:c');
  });

  it('should handle numbers', () => {
    expect(createCacheKey('user', 123)).toBe('user:123');
  });

  it('should handle null and undefined', () => {
    expect(createCacheKey('a', null, undefined, 'b')).toBe('a:::b');
  });

  it('should handle booleans', () => {
    expect(createCacheKey('flag', true, false)).toBe('flag:true:false');
  });
});

describe('estimateObjectSize', () => {
  it('should estimate primitive sizes', () => {
    expect(estimateObjectSize(null)).toBe(0);
    expect(estimateObjectSize(undefined)).toBe(0);
    expect(estimateObjectSize(true)).toBe(4);
    expect(estimateObjectSize(42)).toBe(8);
    expect(estimateObjectSize('hello')).toBe(10); // 5 chars * 2 bytes
  });

  it('should estimate array sizes', () => {
    const size = estimateObjectSize([1, 2, 3]);
    expect(size).toBe(24); // 3 numbers * 8 bytes
  });

  it('should estimate object sizes', () => {
    const obj = { name: 'test', count: 42 };
    const size = estimateObjectSize(obj);
    expect(size).toBeGreaterThan(0);
  });

  it('should handle nested objects', () => {
    const obj = { outer: { inner: 'value' } };
    const size = estimateObjectSize(obj);
    expect(size).toBeGreaterThan(0);
  });

  it('should handle circular references', () => {
    const obj: Record<string, unknown> = { name: 'test' };
    obj.self = obj;

    // Should not throw or infinite loop
    const size = estimateObjectSize(obj);
    expect(size).toBeGreaterThan(0);
  });

  it('should handle Map and Set', () => {
    const map = new Map([
      ['a', 1],
      ['b', 2],
    ]);
    const set = new Set([1, 2, 3]);

    expect(estimateObjectSize(map)).toBeGreaterThan(0);
    expect(estimateObjectSize(set)).toBeGreaterThan(0);
  });
});

describe('memoize', () => {
  it('should cache function results', () => {
    const fn = vi.fn((x: number) => x * 2);
    const memoized = memoize(fn);

    expect(memoized(5)).toBe(10);
    expect(memoized(5)).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should differentiate by arguments', () => {
    const fn = vi.fn((x: number) => x * 2);
    const memoized = memoize(fn);

    expect(memoized(5)).toBe(10);
    expect(memoized(10)).toBe(20);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should use custom key generator', () => {
    const fn = vi.fn((obj: { id: number }) => obj.id * 2);
    const memoized = memoize(fn, {
      keyGenerator: (obj) => String(obj.id),
    });

    expect(memoized({ id: 5 })).toBe(10);
    expect(memoized({ id: 5 })).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should respect maxSize', () => {
    const fn = vi.fn((x: number) => x * 2);
    const memoized = memoize(fn, { maxSize: 2 });

    memoized(1);
    memoized(2);
    memoized(3); // Should evict 1

    expect(memoized.cache.has(JSON.stringify([1]))).toBe(false);
    expect(memoized.cache.has(JSON.stringify([2]))).toBe(true);
    expect(memoized.cache.has(JSON.stringify([3]))).toBe(true);
  });

  it('should clear cache', () => {
    const fn = vi.fn((x: number) => x * 2);
    const memoized = memoize(fn);

    memoized(5);
    memoized.clear();

    expect(memoized.cache.size).toBe(0);
  });

  it('should respect TTL', () => {
    vi.useFakeTimers();

    const fn = vi.fn((x: number) => x * 2);
    const memoized = memoize(fn, { ttl: 1000 });

    expect(memoized(5)).toBe(10);
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1001);

    expect(memoized(5)).toBe(10);
    expect(fn).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('should preserve this context', () => {
    const obj = {
      multiplier: 3,
      multiply(x: number) {
        return x * this.multiplier;
      },
    };

    const memoized = memoize(obj.multiply.bind(obj));

    expect(memoized(5)).toBe(15);
  });
});

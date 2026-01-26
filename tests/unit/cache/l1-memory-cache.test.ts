/**
 * Tests for L1 Memory Cache
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { L1MemoryCache } from '@shared/cache/l1-memory-cache';
import type { Subtitle } from '@shared/types/subtitle';
import type { CacheKey } from '@shared/types/translation';

// Helper to create cache keys
function createCacheKey(
  videoId: string,
  sourceLanguage = 'en',
  targetLanguage = 'zh-TW',
  providerModel = 'test-provider:model'
): CacheKey {
  return {
    platform: 'youtube',
    videoId,
    sourceLanguage,
    targetLanguage,
    providerModel,
  };
}

// Helper to create subtitle data
function createSubtitle(cueCount: number = 3): Subtitle {
  const cues = Array.from({ length: cueCount }, (_, i) => ({
    index: i,
    startTime: i * 1000,
    endTime: (i + 1) * 1000,
    text: `Cue ${i}`,
    translatedText: `翻譯 ${i}`,
  }));

  return {
    videoId: 'test-video',
    sourceLanguage: 'en',
    cues,
    metadata: {
      platform: 'youtube',
      capturedAt: new Date().toISOString(),
    },
  };
}

describe('L1MemoryCache', () => {
  let cache: L1MemoryCache;

  beforeEach(() => {
    cache = new L1MemoryCache(10); // Small limit for testing
  });

  describe('set and get', () => {
    it('should store and retrieve a subtitle', () => {
      const key = createCacheKey('video-1');
      const subtitle = createSubtitle();

      cache.set(key, subtitle);
      const result = cache.get(key);

      expect(result).toEqual(subtitle);
    });

    it('should return null for non-existent key', () => {
      const key = createCacheKey('non-existent');
      const result = cache.get(key);

      expect(result).toBeNull();
    });

    it('should update access metadata on get', () => {
      const key = createCacheKey('video-1');
      const subtitle = createSubtitle();

      cache.set(key, subtitle);

      // First access
      cache.get(key);

      // Second access
      cache.get(key);

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
    });

    it('should increment misses on failed get', () => {
      const key = createCacheKey('non-existent');

      cache.get(key);
      cache.get(key);

      const stats = cache.getStats();
      expect(stats.misses).toBe(2);
    });
  });

  describe('has', () => {
    it('should return true for existing key', () => {
      const key = createCacheKey('video-1');
      cache.set(key, createSubtitle());

      expect(cache.has(key)).toBe(true);
    });

    it('should return false for non-existent key', () => {
      const key = createCacheKey('non-existent');

      expect(cache.has(key)).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove entry from cache', () => {
      const key = createCacheKey('video-1');
      cache.set(key, createSubtitle());

      const deleted = cache.delete(key);

      expect(deleted).toBe(true);
      expect(cache.has(key)).toBe(false);
    });

    it('should return false when deleting non-existent key', () => {
      const key = createCacheKey('non-existent');

      const deleted = cache.delete(key);

      expect(deleted).toBe(false);
    });
  });

  describe('deleteByVideoId', () => {
    it('should delete all entries for a specific video', () => {
      const key1 = createCacheKey('video-1', 'en', 'zh-TW');
      const key2 = createCacheKey('video-1', 'en', 'ja');
      const key3 = createCacheKey('video-2', 'en', 'zh-TW');

      cache.set(key1, createSubtitle());
      cache.set(key2, createSubtitle());
      cache.set(key3, createSubtitle());

      const deleted = cache.deleteByVideoId('video-1');

      expect(deleted).toBe(2);
      expect(cache.has(key1)).toBe(false);
      expect(cache.has(key2)).toBe(false);
      expect(cache.has(key3)).toBe(true);
    });

    it('should return 0 when no entries match', () => {
      cache.set(createCacheKey('video-1'), createSubtitle());

      const deleted = cache.deleteByVideoId('non-existent');

      expect(deleted).toBe(0);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set(createCacheKey('video-1'), createSubtitle());
      cache.set(createCacheKey('video-2'), createSubtitle());

      cache.clear();

      expect(cache.size).toBe(0);
    });

    it('should reset hit/miss counters', () => {
      const key = createCacheKey('video-1');
      cache.set(key, createSubtitle());
      cache.get(key);
      cache.get(createCacheKey('non-existent'));

      cache.clear();

      const stats = cache.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('getAll', () => {
    it('should return all cached entries', () => {
      cache.set(createCacheKey('video-1'), createSubtitle());
      cache.set(createCacheKey('video-2'), createSubtitle());

      const all = cache.getAll();

      expect(all).toHaveLength(2);
      expect(all[0]).toHaveProperty('key');
      expect(all[0]).toHaveProperty('subtitle');
      expect(all[0]).toHaveProperty('createdAt');
    });

    it('should return empty array when cache is empty', () => {
      const all = cache.getAll();

      expect(all).toHaveLength(0);
    });
  });

  describe('getKeys', () => {
    it('should return all cache keys', () => {
      const key1 = createCacheKey('video-1');
      const key2 = createCacheKey('video-2');

      cache.set(key1, createSubtitle());
      cache.set(key2, createSubtitle());

      const keys = cache.getKeys();

      expect(keys).toHaveLength(2);
      expect(keys).toContainEqual(key1);
      expect(keys).toContainEqual(key2);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', () => {
      const key1 = createCacheKey('video-1');
      const key2 = createCacheKey('video-2');

      cache.set(key1, createSubtitle());
      cache.set(key2, createSubtitle());

      // 2 hits
      cache.get(key1);
      cache.get(key2);

      // 1 miss
      cache.get(createCacheKey('non-existent'));

      const stats = cache.getStats();

      expect(stats.count).toBe(2);
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
      expect(stats.totalSize).toBeGreaterThan(0);
    });

    it('should return 0 hit rate when no requests made', () => {
      const stats = cache.getStats();

      expect(stats.hitRate).toBe(0);
    });
  });

  describe('size', () => {
    it('should return current cache size', () => {
      expect(cache.size).toBe(0);

      cache.set(createCacheKey('video-1'), createSubtitle());
      expect(cache.size).toBe(1);

      cache.set(createCacheKey('video-2'), createSubtitle());
      expect(cache.size).toBe(2);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entry when at capacity', async () => {
      const smallCache = new L1MemoryCache(3);

      const key1 = createCacheKey('video-1');
      const key2 = createCacheKey('video-2');
      const key3 = createCacheKey('video-3');
      const key4 = createCacheKey('video-4');

      smallCache.set(key1, createSubtitle());

      // Add small delays to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 5));
      smallCache.set(key2, createSubtitle());

      await new Promise(resolve => setTimeout(resolve, 5));
      smallCache.set(key3, createSubtitle());

      // Access key1 to make it more recently used
      await new Promise(resolve => setTimeout(resolve, 5));
      smallCache.get(key1);

      // Adding key4 should evict key2 (least recently accessed)
      await new Promise(resolve => setTimeout(resolve, 5));
      smallCache.set(key4, createSubtitle());

      expect(smallCache.size).toBe(3);
      expect(smallCache.has(key1)).toBe(true); // Was accessed
      expect(smallCache.has(key2)).toBe(false); // Should be evicted
      expect(smallCache.has(key3)).toBe(true);
      expect(smallCache.has(key4)).toBe(true);
    });

    it('should not evict when updating existing entry', () => {
      const smallCache = new L1MemoryCache(2);

      const key1 = createCacheKey('video-1');
      const key2 = createCacheKey('video-2');

      smallCache.set(key1, createSubtitle(2));
      smallCache.set(key2, createSubtitle(2));

      // Update existing entry
      smallCache.set(key1, createSubtitle(5));

      expect(smallCache.size).toBe(2);
      expect(smallCache.has(key1)).toBe(true);
      expect(smallCache.has(key2)).toBe(true);
    });
  });

  describe('different cache keys', () => {
    it('should treat different languages as different entries', () => {
      const keyEN = createCacheKey('video-1', 'en', 'zh-TW');
      const keyJA = createCacheKey('video-1', 'en', 'ja');

      cache.set(keyEN, createSubtitle());
      cache.set(keyJA, createSubtitle());

      expect(cache.size).toBe(2);
      expect(cache.has(keyEN)).toBe(true);
      expect(cache.has(keyJA)).toBe(true);
    });

    it('should treat different providers as different entries', () => {
      const keyClaude = createCacheKey('video-1', 'en', 'zh-TW', 'claude:haiku');
      const keyGPT = createCacheKey('video-1', 'en', 'zh-TW', 'chatgpt:gpt-4');

      cache.set(keyClaude, createSubtitle());
      cache.set(keyGPT, createSubtitle());

      expect(cache.size).toBe(2);
    });
  });
});

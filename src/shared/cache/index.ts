/**
 * Cache Module Exports
 * 
 * @see specs/001-ai-subtitle-translator/data-model.md
 */

// L1 Memory Cache
export { L1MemoryCache, l1Cache } from './l1-memory-cache';
export type { CacheEntry, CacheStats } from './l1-memory-cache';

// L2 IndexedDB Cache
export { L2IndexedDBCache, l2Cache } from './l2-indexeddb-cache';
export type { L2CacheStats } from './l2-indexeddb-cache';

// Cache Manager
export { CacheManager, cacheManager } from './cache-manager';
export type { CacheManagerStats, CacheResult } from './cache-manager';

// Cache Utilities
export {
  createCacheKey,
  createSerializedCacheKey,
  serializeCacheKey,
  parseCacheKey,
  isValidCacheKey,
  isValidSerializedKey,
  cacheKeysMatch,
  cacheKeyMatchesPartial,
  estimateByteSize,
  formatBytes,
} from './cache-utils';

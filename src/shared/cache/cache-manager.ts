/**
 * Cache Manager
 * 
 * Combines L1 (memory) and L2 (IndexedDB) caches for optimal performance.
 * 
 * Cache Strategy:
 * - Read: Check L1 first, then L2. Promote L2 hits to L1.
 * - Write: Write to both L1 and L2.
 * - Delete: Delete from both L1 and L2.
 * 
 * @see specs/001-ai-subtitle-translator/data-model.md
 * @see FR-014, FR-015: Cache Architecture
 */

import type { Subtitle } from '../types/subtitle';
import type { CacheKey, TranslationCache } from '../types/translation';
import type { ProviderType } from '../types/auth';
import { L1MemoryCache, l1Cache, type CacheStats as L1CacheStats } from './l1-memory-cache';
import { L2IndexedDBCache, l2Cache, type L2CacheStats } from './l2-indexeddb-cache';
import { createCacheKey } from './cache-utils';

// ============================================================================
// Types
// ============================================================================

export interface CacheManagerStats {
  l1: L1CacheStats;
  l2: L2CacheStats;
  combinedHitRate: number;
}

export interface CacheResult {
  /** Cached subtitle (null if not found) */
  subtitle: Subtitle | null;
  
  /** Whether this was a cache hit */
  hit: boolean;
  
  /** Which cache layer served the result */
  source: 'l1' | 'l2' | 'none';
}

// ============================================================================
// Cache Manager
// ============================================================================

export class CacheManager {
  private l1: L1MemoryCache;
  private l2: L2IndexedDBCache;
  private initialized = false;
  
  constructor(l1?: L1MemoryCache, l2?: L2IndexedDBCache) {
    this.l1 = l1 || l1Cache;
    this.l2 = l2 || l2Cache;
  }
  
  /**
   * Initialize cache (mainly L2 IndexedDB)
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    
    try {
      await this.l2.init();
      this.initialized = true;
      console.log('[CacheManager] Initialized');
      
      // Run expired entry cleanup in background
      this.cleanupExpired().catch(console.error);
    } catch (error) {
      console.error('[CacheManager] Initialization failed:', error);
      // Continue without L2 - L1 will still work
      this.initialized = true;
    }
  }
  
  // ============================================================================
  // Cache Operations
  // ============================================================================
  
  /**
   * Get cached subtitle
   * Checks L1 first, then L2. Promotes L2 hits to L1.
   */
  async get(key: CacheKey): Promise<CacheResult> {
    await this.init();
    
    // Check L1 first (fast path)
    const l1Result = this.l1.get(key);
    if (l1Result) {
      return {
        subtitle: l1Result,
        hit: true,
        source: 'l1',
      };
    }
    
    // Check L2
    try {
      const l2Result = await this.l2.get(key);
      if (l2Result) {
        // Promote to L1 for faster access next time
        this.l1.set(key, l2Result);
        return {
          subtitle: l2Result,
          hit: true,
          source: 'l2',
        };
      }
    } catch (error) {
      console.error('[CacheManager] L2 get failed:', error);
    }
    
    return {
      subtitle: null,
      hit: false,
      source: 'none',
    };
  }
  
  /**
   * Get cached subtitle by components (convenience method)
   */
  async getByComponents(
    videoId: string,
    sourceLanguage: string,
    targetLanguage: string,
    provider: ProviderType,
    model?: string
  ): Promise<CacheResult> {
    const key = createCacheKey(videoId, sourceLanguage, targetLanguage, provider, model);
    return this.get(key);
  }
  
  /**
   * Check if key exists in cache
   */
  async has(key: CacheKey): Promise<boolean> {
    await this.init();
    
    if (this.l1.has(key)) {
      return true;
    }
    
    try {
      return await this.l2.has(key);
    } catch (error) {
      console.error('[CacheManager] L2 has check failed:', error);
      return false;
    }
  }
  
  /**
   * Check if cache exists by components (convenience method)
   */
  async hasByComponents(
    videoId: string,
    sourceLanguage: string,
    targetLanguage: string,
    provider: ProviderType,
    model?: string
  ): Promise<boolean> {
    const key = createCacheKey(videoId, sourceLanguage, targetLanguage, provider, model);
    return this.has(key);
  }
  
  /**
   * Store subtitle in cache
   * Writes to both L1 and L2.
   */
  async set(key: CacheKey, subtitle: Subtitle): Promise<void> {
    await this.init();
    
    // Write to L1 (synchronous)
    this.l1.set(key, subtitle);
    
    // Write to L2 (async, don't wait)
    this.l2.set(key, subtitle).catch(error => {
      console.error('[CacheManager] L2 set failed:', error);
    });
  }
  
  /**
   * Store subtitle by components (convenience method)
   */
  async setByComponents(
    videoId: string,
    sourceLanguage: string,
    targetLanguage: string,
    provider: ProviderType,
    model: string | undefined,
    subtitle: Subtitle
  ): Promise<void> {
    const key = createCacheKey(videoId, sourceLanguage, targetLanguage, provider, model);
    return this.set(key, subtitle);
  }
  
  /**
   * Delete entry from cache
   */
  async delete(key: CacheKey): Promise<boolean> {
    await this.init();
    
    const l1Deleted = this.l1.delete(key);
    
    let l2Deleted = false;
    try {
      l2Deleted = await this.l2.delete(key);
    } catch (error) {
      console.error('[CacheManager] L2 delete failed:', error);
    }
    
    return l1Deleted || l2Deleted;
  }
  
  /**
   * Delete all entries for a video
   */
  async deleteByVideoId(videoId: string): Promise<number> {
    await this.init();
    
    const l1Deleted = this.l1.deleteByVideoId(videoId);
    
    let l2Deleted = 0;
    try {
      l2Deleted = await this.l2.deleteByVideoId(videoId);
    } catch (error) {
      console.error('[CacheManager] L2 deleteByVideoId failed:', error);
    }
    
    return Math.max(l1Deleted, l2Deleted);
  }
  
  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    await this.init();
    
    this.l1.clear();
    
    try {
      await this.l2.clear();
    } catch (error) {
      console.error('[CacheManager] L2 clear failed:', error);
    }
  }
  
  // ============================================================================
  // Query Operations
  // ============================================================================
  
  /**
   * Get all cached entries (from L2, which is persistent)
   */
  async getAll(): Promise<TranslationCache[]> {
    await this.init();
    
    try {
      return await this.l2.getAll();
    } catch (error) {
      console.error('[CacheManager] L2 getAll failed:', error);
      return this.l1.getAll();
    }
  }
  
  /**
   * Get all cache keys
   */
  async getKeys(): Promise<CacheKey[]> {
    await this.init();
    
    try {
      return await this.l2.getKeys();
    } catch (error) {
      console.error('[CacheManager] L2 getKeys failed:', error);
      return this.l1.getKeys();
    }
  }
  
  /**
   * Get entries for a specific video
   */
  async getByVideoId(videoId: string): Promise<TranslationCache[]> {
    await this.init();
    
    try {
      return await this.l2.getByVideoId(videoId);
    } catch (error) {
      console.error('[CacheManager] L2 getByVideoId failed:', error);
      // Fallback to L1
      return this.l1.getAll().filter(entry => entry.key.videoId === videoId);
    }
  }
  
  // ============================================================================
  // Statistics
  // ============================================================================
  
  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheManagerStats> {
    await this.init();
    
    const l1Stats = this.l1.getStats();
    
    let l2Stats: L2CacheStats;
    try {
      l2Stats = await this.l2.getStats();
    } catch (error) {
      console.error('[CacheManager] L2 getStats failed:', error);
      l2Stats = {
        count: 0,
        totalSize: 0,
        dbName: 'unknown',
        storeName: 'unknown',
      };
    }
    
    // Combined hit rate calculation
    // L1 hits are the primary indicator, L2 hits are secondary
    const totalRequests = l1Stats.hits + l1Stats.misses;
    const combinedHitRate = totalRequests > 0 ? l1Stats.hitRate : 0;
    
    return {
      l1: l1Stats,
      l2: l2Stats,
      combinedHitRate,
    };
  }
  
  // ============================================================================
  // Maintenance
  // ============================================================================
  
  /**
   * Cleanup expired entries
   */
  private async cleanupExpired(): Promise<void> {
    try {
      const evicted = await this.l2.evictExpired();
      if (evicted > 0) {
        console.log(`[CacheManager] Cleaned up ${evicted} expired entries`);
      }
    } catch (error) {
      console.error('[CacheManager] Expired cleanup failed:', error);
    }
  }
  
  /**
   * Warm L1 cache from L2 (optional optimization)
   */
  async warmL1FromL2(videoId?: string): Promise<void> {
    await this.init();
    
    try {
      const entries = videoId 
        ? await this.l2.getByVideoId(videoId)
        : await this.l2.getAll();
      
      // Load most recent entries into L1
      const sorted = entries.sort((a, b) => 
        new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime()
      );
      
      // Load up to L1 capacity
      for (const entry of sorted.slice(0, this.l1.size)) {
        this.l1.set(entry.key, entry.subtitle);
      }
      
      console.log(`[CacheManager] Warmed L1 with ${Math.min(sorted.length, this.l1.size)} entries`);
    } catch (error) {
      console.error('[CacheManager] L1 warm failed:', error);
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const cacheManager = new CacheManager();

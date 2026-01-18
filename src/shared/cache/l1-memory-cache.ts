/**
 * L1 Memory Cache
 * 
 * In-memory cache for translated subtitles within a browser session.
 * Uses Map-based storage with automatic expiration.
 * 
 * @see specs/001-ai-subtitle-translator/data-model.md
 * @see FR-014: L1 Memory Cache
 */

import type { Subtitle } from '../types/subtitle';
import type { CacheKey, TranslationCache, SerializedCacheKey } from '../types/translation';
import { serializeCacheKey } from '../types/translation';
import { CACHE_CONFIG } from '../utils/constants';

// ============================================================================
// Types
// ============================================================================

export interface CacheEntry {
  /** Cached subtitle data */
  subtitle: Subtitle;
  
  /** Cache key */
  key: CacheKey;
  
  /** Creation timestamp */
  createdAt: number;
  
  /** Last access timestamp */
  lastAccessedAt: number;
  
  /** Access count */
  accessCount: number;
  
  /** Estimated size in bytes */
  size: number;
}

export interface CacheStats {
  /** Number of entries */
  count: number;
  
  /** Total size in bytes */
  totalSize: number;
  
  /** Number of cache hits */
  hits: number;
  
  /** Number of cache misses */
  misses: number;
  
  /** Hit rate percentage */
  hitRate: number;
}

// ============================================================================
// L1 Memory Cache
// ============================================================================

export class L1MemoryCache {
  private cache: Map<SerializedCacheKey, CacheEntry> = new Map();
  private maxEntries: number;
  private hits = 0;
  private misses = 0;
  
  constructor(maxEntries: number = CACHE_CONFIG.MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }
  
  /**
   * Get cached subtitle by key
   */
  get(key: CacheKey): Subtitle | null {
    const serialized = serializeCacheKey(key);
    const entry = this.cache.get(serialized);
    
    if (!entry) {
      this.misses++;
      return null;
    }
    
    // Update access metadata
    entry.lastAccessedAt = Date.now();
    entry.accessCount++;
    this.hits++;
    
    return entry.subtitle;
  }
  
  /**
   * Check if key exists in cache
   */
  has(key: CacheKey): boolean {
    const serialized = serializeCacheKey(key);
    return this.cache.has(serialized);
  }
  
  /**
   * Store subtitle in cache
   */
  set(key: CacheKey, subtitle: Subtitle): void {
    const serialized = serializeCacheKey(key);
    const now = Date.now();
    
    // Calculate approximate size
    const size = this.estimateSize(subtitle);
    
    const entry: CacheEntry = {
      subtitle,
      key,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      size,
    };
    
    // Evict if at capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(serialized)) {
      this.evictLRU();
    }
    
    this.cache.set(serialized, entry);
  }
  
  /**
   * Delete entry from cache
   */
  delete(key: CacheKey): boolean {
    const serialized = serializeCacheKey(key);
    return this.cache.delete(serialized);
  }
  
  /**
   * Delete all entries for a specific video
   */
  deleteByVideoId(videoId: string): number {
    let deleted = 0;
    
    for (const [serialized, entry] of this.cache.entries()) {
      if (entry.key.videoId === videoId) {
        this.cache.delete(serialized);
        deleted++;
      }
    }
    
    return deleted;
  }
  
  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }
  
  /**
   * Get all cache entries
   */
  getAll(): TranslationCache[] {
    return Array.from(this.cache.values()).map(entry => ({
      key: entry.key,
      subtitle: entry.subtitle,
      createdAt: new Date(entry.createdAt).toISOString(),
      lastAccessedAt: new Date(entry.lastAccessedAt).toISOString(),
      accessCount: entry.accessCount,
      size: entry.size,
    }));
  }
  
  /**
   * Get all cache keys
   */
  getKeys(): CacheKey[] {
    return Array.from(this.cache.values()).map(entry => entry.key);
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.size;
    }
    
    const totalRequests = this.hits + this.misses;
    
    return {
      count: this.cache.size,
      totalSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: totalRequests > 0 ? (this.hits / totalRequests) * 100 : 0,
    };
  }
  
  /**
   * Get number of cached entries
   */
  get size(): number {
    return this.cache.size;
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldest: { key: SerializedCacheKey; time: number } | null = null;
    
    for (const [serialized, entry] of this.cache.entries()) {
      if (!oldest || entry.lastAccessedAt < oldest.time) {
        oldest = { key: serialized, time: entry.lastAccessedAt };
      }
    }
    
    if (oldest) {
      this.cache.delete(oldest.key);
    }
  }
  
  /**
   * Estimate size of subtitle in bytes
   */
  private estimateSize(subtitle: Subtitle): number {
    // Rough estimation: stringify and get length
    // This is approximate but sufficient for memory management
    try {
      return JSON.stringify(subtitle).length * 2; // UTF-16 chars = 2 bytes
    } catch {
      // Fallback: estimate based on cue count
      return (subtitle.cues?.length || 0) * 200; // ~200 bytes per cue
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const l1Cache = new L1MemoryCache();

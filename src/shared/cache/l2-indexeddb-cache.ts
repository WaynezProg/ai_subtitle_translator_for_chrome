/**
 * L2 IndexedDB Cache
 * 
 * Persistent cache for translated subtitles using IndexedDB.
 * Implements LRU eviction when storage exceeds limit.
 * 
 * @see specs/001-ai-subtitle-translator/data-model.md
 * @see FR-015: L2 IndexedDB Cache
 * @see FR-016: LRU Eviction
 */

import type { Subtitle } from '../types/subtitle';
import type { CacheKey, TranslationCache, SerializedCacheKey } from '../types/translation';
import { serializeCacheKey } from '../types/translation';
import { CACHE_CONFIG } from '../utils/constants';
import { estimateByteSize } from './cache-utils';

// ============================================================================
// Types
// ============================================================================

interface StoredCacheEntry {
  /** Serialized cache key (primary key) */
  key: SerializedCacheKey;
  
  /** Cache key components */
  keyComponents: CacheKey;
  
  /** Cached subtitle data */
  subtitle: Subtitle;
  
  /** Creation timestamp (ms) */
  createdAt: number;
  
  /** Last access timestamp (ms) - used for LRU */
  lastAccessedAt: number;
  
  /** Access count */
  accessCount: number;
  
  /** Estimated size in bytes */
  size: number;
  
  /** Video ID index */
  videoId: string;
}

export interface L2CacheStats {
  /** Number of entries */
  count: number;
  
  /** Total size in bytes */
  totalSize: number;
  
  /** Database name */
  dbName: string;
  
  /** Store name */
  storeName: string;
}

// ============================================================================
// L2 IndexedDB Cache
// ============================================================================

export class L2IndexedDBCache {
  private dbName: string;
  private storeName: string;
  private dbVersion: number;
  private maxEntries: number;
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  
  constructor(
    dbName: string = CACHE_CONFIG.DB_NAME,
    storeName: string = CACHE_CONFIG.STORE_NAME,
    dbVersion: number = CACHE_CONFIG.DB_VERSION,
    maxEntries: number = CACHE_CONFIG.MAX_ENTRIES
  ) {
    this.dbName = dbName;
    this.storeName = storeName;
    this.dbVersion = dbVersion;
    this.maxEntries = maxEntries;
  }
  
  // ============================================================================
  // Initialization
  // ============================================================================
  
  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    if (this.db) {
      return;
    }
    
    if (this.initPromise) {
      return this.initPromise;
    }
    
    this.initPromise = this.openDatabase();
    return this.initPromise;
  }
  
  private async openDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = (): void => {
        console.error('[L2Cache] Failed to open database:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = (): void => {
        this.db = request.result;
        console.log('[L2Cache] Database opened successfully');
        resolve();
      };
      
      request.onupgradeneeded = (event): void => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createSchema(db);
      };
    });
  }
  
  /**
   * Create database schema
   */
  private createSchema(db: IDBDatabase): void {
    // Create object store if it doesn't exist
    if (!db.objectStoreNames.contains(this.storeName)) {
      const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
      
      // Create indexes for efficient queries
      store.createIndex('videoId', 'videoId', { unique: false });
      store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
      store.createIndex('createdAt', 'createdAt', { unique: false });
      
      console.log('[L2Cache] Schema created');
    }
  }
  
  // ============================================================================
  // CRUD Operations
  // ============================================================================
  
  /**
   * Get cached subtitle by key
   */
  async get(key: CacheKey): Promise<Subtitle | null> {
    await this.init();
    
    const serialized = serializeCacheKey(key);
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(serialized);
      
      request.onerror = (): void => {
        console.error('[L2Cache] Get failed:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = (): void => {
        const entry = request.result as StoredCacheEntry | undefined;
        
        if (!entry) {
          resolve(null);
          return;
        }
        
        // Update access metadata
        entry.lastAccessedAt = Date.now();
        entry.accessCount++;
        store.put(entry);
        
        resolve(entry.subtitle);
      };
    });
  }
  
  /**
   * Check if key exists in cache
   */
  async has(key: CacheKey): Promise<boolean> {
    await this.init();
    
    const serialized = serializeCacheKey(key);
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count(IDBKeyRange.only(serialized));
      
      request.onerror = (): void => {
        console.error('[L2Cache] Has check failed:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = (): void => {
        resolve(request.result > 0);
      };
    });
  }
  
  /**
   * Store subtitle in cache
   */
  async set(key: CacheKey, subtitle: Subtitle): Promise<void> {
    await this.init();
    
    const serialized = serializeCacheKey(key);
    const now = Date.now();
    const size = estimateByteSize(subtitle);
    
    const entry: StoredCacheEntry = {
      key: serialized,
      keyComponents: key,
      subtitle,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 1,
      size,
      videoId: key.videoId,
    };
    
    // Check if we need to evict before adding
    const count = await this.getCount();
    if (count >= this.maxEntries) {
      await this.evictLRU();
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(entry);
      
      request.onerror = (): void => {
        console.error('[L2Cache] Set failed:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = (): void => {
        resolve();
      };
    });
  }
  
  /**
   * Delete entry from cache
   */
  async delete(key: CacheKey): Promise<boolean> {
    await this.init();
    
    const serialized = serializeCacheKey(key);
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(serialized);
      
      request.onerror = (): void => {
        console.error('[L2Cache] Delete failed:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = (): void => {
        resolve(true);
      };
    });
  }
  
  /**
   * Delete all entries for a specific video
   */
  async deleteByVideoId(videoId: string): Promise<number> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('videoId');
      const request = index.openCursor(IDBKeyRange.only(videoId));
      
      let deleted = 0;
      
      request.onerror = (): void => {
        console.error('[L2Cache] Delete by videoId failed:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = (): void => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          deleted++;
          cursor.continue();
        } else {
          resolve(deleted);
        }
      };
    });
  }
  
  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      
      request.onerror = (): void => {
        console.error('[L2Cache] Clear failed:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = (): void => {
        resolve();
      };
    });
  }
  
  // ============================================================================
  // Query Operations
  // ============================================================================
  
  /**
   * Get all cache entries
   */
  async getAll(): Promise<TranslationCache[]> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onerror = (): void => {
        console.error('[L2Cache] GetAll failed:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = (): void => {
        const entries = request.result as StoredCacheEntry[];
        resolve(entries.map(entry => ({
          key: entry.keyComponents,
          subtitle: entry.subtitle,
          createdAt: new Date(entry.createdAt).toISOString(),
          lastAccessedAt: new Date(entry.lastAccessedAt).toISOString(),
          accessCount: entry.accessCount,
          size: entry.size,
        })));
      };
    });
  }
  
  /**
   * Get all cache keys
   */
  async getKeys(): Promise<CacheKey[]> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onerror = (): void => {
        console.error('[L2Cache] GetKeys failed:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = (): void => {
        const entries = request.result as StoredCacheEntry[];
        resolve(entries.map(entry => entry.keyComponents));
      };
    });
  }
  
  /**
   * Get entries for a specific video
   */
  async getByVideoId(videoId: string): Promise<TranslationCache[]> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('videoId');
      const request = index.getAll(IDBKeyRange.only(videoId));
      
      request.onerror = (): void => {
        console.error('[L2Cache] GetByVideoId failed:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = (): void => {
        const entries = request.result as StoredCacheEntry[];
        resolve(entries.map(entry => ({
          key: entry.keyComponents,
          subtitle: entry.subtitle,
          createdAt: new Date(entry.createdAt).toISOString(),
          lastAccessedAt: new Date(entry.lastAccessedAt).toISOString(),
          accessCount: entry.accessCount,
          size: entry.size,
        })));
      };
    });
  }
  
  // ============================================================================
  // Statistics
  // ============================================================================
  
  /**
   * Get cache entry count
   */
  async getCount(): Promise<number> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count();
      
      request.onerror = (): void => {
        console.error('[L2Cache] Count failed:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = (): void => {
        resolve(request.result);
      };
    });
  }
  
  /**
   * Get cache statistics
   */
  async getStats(): Promise<L2CacheStats> {
    await this.init();
    
    const entries = await this.getAll();
    const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
    
    return {
      count: entries.length,
      totalSize,
      dbName: this.dbName,
      storeName: this.storeName,
    };
  }
  
  // ============================================================================
  // LRU Eviction
  // ============================================================================
  
  /**
   * Evict least recently used entries
   */
  private async evictLRU(countToEvict = 1): Promise<void> {
    await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('lastAccessedAt');
      
      // Get entries sorted by lastAccessedAt (ascending = oldest first)
      const request = index.openCursor();
      let evicted = 0;
      
      request.onerror = (): void => {
        console.error('[L2Cache] LRU eviction failed:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = (): void => {
        const cursor = request.result;
        if (cursor && evicted < countToEvict) {
          const entry = cursor.value as StoredCacheEntry;
          console.log(`[L2Cache] Evicting LRU entry: ${entry.key}`);
          cursor.delete();
          evicted++;
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  }
  
  /**
   * Evict entries older than TTL
   */
  async evictExpired(): Promise<number> {
    await this.init();
    
    const cutoff = Date.now() - CACHE_CONFIG.ENTRY_TTL_MS;
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('createdAt');
      
      // Get entries created before cutoff
      const request = index.openCursor(IDBKeyRange.upperBound(cutoff));
      let evicted = 0;
      
      request.onerror = (): void => {
        console.error('[L2Cache] Expired eviction failed:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = (): void => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          evicted++;
          cursor.continue();
        } else {
          console.log(`[L2Cache] Evicted ${evicted} expired entries`);
          resolve(evicted);
        }
      };
    });
  }
  
  // ============================================================================
  // Cleanup
  // ============================================================================
  
  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initPromise = null;
    }
  }
  
  /**
   * Delete the entire database
   */
  async deleteDatabase(): Promise<void> {
    this.close();
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(this.dbName);
      
      request.onerror = (): void => {
        console.error('[L2Cache] Database deletion failed:', request.error);
        reject(request.error);
      };
      
      request.onsuccess = (): void => {
        console.log('[L2Cache] Database deleted');
        resolve();
      };
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const l2Cache = new L2IndexedDBCache();

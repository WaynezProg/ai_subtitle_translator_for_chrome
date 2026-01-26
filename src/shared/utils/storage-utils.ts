/**
 * Storage utilities for Chrome extension
 * Provides typed wrappers around Chrome's storage API with caching,
 * migrations, and reactive updates
 */

// ============================================================================
// Types
// ============================================================================

export type StorageArea = 'local' | 'sync' | 'session';

export interface StorageOptions {
  area?: StorageArea;
  defaultValue?: unknown;
}

export interface StorageChange<T> {
  oldValue?: T;
  newValue?: T;
}

export type StorageListener<T> = (change: StorageChange<T>, key: string) => void;

export interface StorageSchema<T> {
  key: string;
  defaultValue: T;
  area?: StorageArea;
  validate?: (value: unknown) => value is T;
  migrate?: (oldValue: unknown, version: number) => T;
  version?: number;
}

// ============================================================================
// Core Storage Functions
// ============================================================================

/**
 * Get storage area instance
 */
function getStorageArea(area: StorageArea = 'local'): chrome.storage.StorageArea {
  switch (area) {
    case 'sync':
      return chrome.storage.sync;
    case 'session':
      return chrome.storage.session;
    default:
      return chrome.storage.local;
  }
}

/**
 * Get a value from storage
 */
export async function getStorageItem<T>(
  key: string,
  options?: StorageOptions
): Promise<T | undefined> {
  const { area = 'local', defaultValue } = options || {};
  const storage = getStorageArea(area);

  return new Promise((resolve, reject) => {
    storage.get(key, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      const value = result[key];
      resolve(value !== undefined ? value : (defaultValue as T | undefined));
    });
  });
}

/**
 * Get multiple values from storage
 */
export async function getStorageItems<T extends Record<string, unknown>>(
  keys: (keyof T)[],
  options?: StorageOptions
): Promise<Partial<T>> {
  const { area = 'local' } = options || {};
  const storage = getStorageArea(area);

  return new Promise((resolve, reject) => {
    storage.get(keys as string[], (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result as Partial<T>);
    });
  });
}

/**
 * Get all values from storage
 */
export async function getAllStorageItems<T extends Record<string, unknown>>(
  options?: StorageOptions
): Promise<T> {
  const { area = 'local' } = options || {};
  const storage = getStorageArea(area);

  return new Promise((resolve, reject) => {
    storage.get(null, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(result as T);
    });
  });
}

/**
 * Set a value in storage
 */
export async function setStorageItem<T>(
  key: string,
  value: T,
  options?: StorageOptions
): Promise<void> {
  const { area = 'local' } = options || {};
  const storage = getStorageArea(area);

  return new Promise((resolve, reject) => {
    storage.set({ [key]: value }, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

/**
 * Set multiple values in storage
 */
export async function setStorageItems(
  items: Record<string, unknown>,
  options?: StorageOptions
): Promise<void> {
  const { area = 'local' } = options || {};
  const storage = getStorageArea(area);

  return new Promise((resolve, reject) => {
    storage.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

/**
 * Remove a value from storage
 */
export async function removeStorageItem(
  key: string,
  options?: StorageOptions
): Promise<void> {
  const { area = 'local' } = options || {};
  const storage = getStorageArea(area);

  return new Promise((resolve, reject) => {
    storage.remove(key, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

/**
 * Remove multiple values from storage
 */
export async function removeStorageItems(
  keys: string[],
  options?: StorageOptions
): Promise<void> {
  const { area = 'local' } = options || {};
  const storage = getStorageArea(area);

  return new Promise((resolve, reject) => {
    storage.remove(keys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

/**
 * Clear all values from storage
 */
export async function clearStorage(options?: StorageOptions): Promise<void> {
  const { area = 'local' } = options || {};
  const storage = getStorageArea(area);

  return new Promise((resolve, reject) => {
    storage.clear(() => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

/**
 * Get storage usage bytes
 */
export async function getStorageUsage(
  options?: StorageOptions
): Promise<number> {
  const { area = 'local' } = options || {};
  const storage = getStorageArea(area);

  return new Promise((resolve, reject) => {
    storage.getBytesInUse(null, (bytesInUse) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(bytesInUse);
    });
  });
}

/**
 * Check if key exists in storage
 */
export async function hasStorageItem(
  key: string,
  options?: StorageOptions
): Promise<boolean> {
  const value = await getStorageItem(key, options);
  return value !== undefined;
}

// ============================================================================
// Storage Listeners
// ============================================================================

const listeners = new Map<string, Set<StorageListener<unknown>>>();

/**
 * Add storage change listener for a specific key
 */
export function onStorageChange<T>(
  key: string,
  listener: StorageListener<T>,
  options?: StorageOptions
): () => void {
  const { area = 'local' } = options || {};
  const listenerKey = `${area}:${key}`;

  if (!listeners.has(listenerKey)) {
    listeners.set(listenerKey, new Set());
  }

  listeners.get(listenerKey)!.add(listener as StorageListener<unknown>);

  // Return unsubscribe function
  return () => {
    listeners.get(listenerKey)?.delete(listener as StorageListener<unknown>);
  };
}

/**
 * Initialize global storage listener
 */
export function initStorageListener(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    for (const [key, change] of Object.entries(changes)) {
      const listenerKey = `${areaName}:${key}`;
      const keyListeners = listeners.get(listenerKey);

      if (keyListeners) {
        for (const listener of keyListeners) {
          try {
            listener(change, key);
          } catch (error) {
            console.error(`Storage listener error for ${key}:`, error);
          }
        }
      }
    }
  });
}

// ============================================================================
// Typed Storage Item
// ============================================================================

/**
 * Create a typed storage item with schema validation
 */
export function createStorageItem<T>(schema: StorageSchema<T>) {
  const {
    key,
    defaultValue,
    area = 'local',
    validate,
    migrate,
    version = 1,
  } = schema;

  const versionKey = `${key}__version`;

  return {
    /**
     * Get the storage item value
     */
    async get(): Promise<T> {
      const [value, storedVersion] = await Promise.all([
        getStorageItem<T>(key, { area }),
        getStorageItem<number>(versionKey, { area }),
      ]);

      // Handle migration
      if (value !== undefined && migrate && storedVersion !== version) {
        const migrated = migrate(value, storedVersion ?? 0);
        await this.set(migrated);
        return migrated;
      }

      // Validate
      if (value !== undefined && validate && !validate(value)) {
        console.warn(`Invalid storage value for ${key}, using default`);
        return defaultValue;
      }

      return value !== undefined ? value : defaultValue;
    },

    /**
     * Set the storage item value
     */
    async set(value: T): Promise<void> {
      if (validate && !validate(value)) {
        throw new Error(`Invalid value for storage key: ${key}`);
      }
      await setStorageItems(
        { [key]: value, [versionKey]: version },
        { area }
      );
    },

    /**
     * Update the storage item value
     */
    async update(updater: (current: T) => T): Promise<T> {
      const current = await this.get();
      const updated = updater(current);
      await this.set(updated);
      return updated;
    },

    /**
     * Reset to default value
     */
    async reset(): Promise<void> {
      await this.set(defaultValue);
    },

    /**
     * Remove from storage
     */
    async remove(): Promise<void> {
      await removeStorageItems([key, versionKey], { area });
    },

    /**
     * Subscribe to changes
     */
    subscribe(listener: StorageListener<T>): () => void {
      return onStorageChange<T>(key, listener, { area });
    },

    /**
     * Get the storage key
     */
    getKey(): string {
      return key;
    },

    /**
     * Get the default value
     */
    getDefault(): T {
      return defaultValue;
    },
  };
}

// ============================================================================
// Storage Namespace
// ============================================================================

/**
 * Create a namespaced storage interface
 */
export function createStorageNamespace(
  namespace: string,
  options?: StorageOptions
) {
  const { area = 'local' } = options || {};

  const prefixKey = (key: string) => `${namespace}:${key}`;

  return {
    /**
     * Get namespaced item
     */
    async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
      return getStorageItem<T>(prefixKey(key), { area, defaultValue });
    },

    /**
     * Set namespaced item
     */
    async set<T>(key: string, value: T): Promise<void> {
      return setStorageItem(prefixKey(key), value, { area });
    },

    /**
     * Remove namespaced item
     */
    async remove(key: string): Promise<void> {
      return removeStorageItem(prefixKey(key), { area });
    },

    /**
     * Check if namespaced item exists
     */
    async has(key: string): Promise<boolean> {
      return hasStorageItem(prefixKey(key), { area });
    },

    /**
     * Get all items in namespace
     */
    async getAll<T extends Record<string, unknown>>(): Promise<T> {
      const all = await getAllStorageItems({ area });
      const prefix = `${namespace}:`;
      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(all)) {
        if (key.startsWith(prefix)) {
          result[key.slice(prefix.length)] = value;
        }
      }

      return result as T;
    },

    /**
     * Clear all items in namespace
     */
    async clear(): Promise<void> {
      const all = await getAllStorageItems({ area });
      const prefix = `${namespace}:`;
      const keysToRemove = Object.keys(all).filter((k) => k.startsWith(prefix));
      if (keysToRemove.length > 0) {
        await removeStorageItems(keysToRemove, { area });
      }
    },

    /**
     * Subscribe to namespace changes
     */
    subscribe<T>(
      key: string,
      listener: StorageListener<T>
    ): () => void {
      return onStorageChange<T>(prefixKey(key), listener, { area });
    },
  };
}

// ============================================================================
// Cache Layer
// ============================================================================

/**
 * Create a cached storage interface
 */
export function createCachedStorage<T extends Record<string, unknown>>(
  keys: (keyof T)[],
  options?: StorageOptions & { ttl?: number }
) {
  const { area = 'local', ttl } = options || {};
  const cache = new Map<keyof T, { value: unknown; timestamp: number }>();
  let initialized = false;

  const isExpired = (timestamp: number) => {
    if (!ttl) return false;
    return Date.now() - timestamp > ttl;
  };

  return {
    /**
     * Initialize cache from storage
     */
    async init(): Promise<void> {
      if (initialized) return;

      const items = await getStorageItems<T>(keys, { area });
      const now = Date.now();

      for (const key of keys) {
        if (items[key] !== undefined) {
          cache.set(key, { value: items[key], timestamp: now });
        }
      }

      initialized = true;
    },

    /**
     * Get cached value
     */
    async get<K extends keyof T>(key: K): Promise<T[K] | undefined> {
      const cached = cache.get(key);

      if (cached && !isExpired(cached.timestamp)) {
        return cached.value as T[K];
      }

      // Fetch from storage
      const value = await getStorageItem<T[K]>(key as string, { area });
      if (value !== undefined) {
        cache.set(key, { value, timestamp: Date.now() });
      }

      return value;
    },

    /**
     * Set cached value
     */
    async set<K extends keyof T>(key: K, value: T[K]): Promise<void> {
      await setStorageItem(key as string, value, { area });
      cache.set(key, { value, timestamp: Date.now() });
    },

    /**
     * Remove cached value
     */
    async remove<K extends keyof T>(key: K): Promise<void> {
      await removeStorageItem(key as string, { area });
      cache.delete(key);
    },

    /**
     * Clear all cached values
     */
    async clear(): Promise<void> {
      await removeStorageItems(keys as string[], { area });
      cache.clear();
    },

    /**
     * Invalidate cache (force re-fetch)
     */
    invalidate<K extends keyof T>(key?: K): void {
      if (key) {
        cache.delete(key);
      } else {
        cache.clear();
        initialized = false;
      }
    },

    /**
     * Get all cached values
     */
    getAll(): Partial<T> {
      const result: Partial<T> = {};
      for (const [key, { value, timestamp }] of cache) {
        if (!isExpired(timestamp)) {
          result[key] = value as T[keyof T];
        }
      }
      return result;
    },

    /**
     * Check if cache is initialized
     */
    isInitialized(): boolean {
      return initialized;
    },
  };
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Batch storage operations for better performance
 */
export function createStorageBatch(options?: StorageOptions) {
  const { area = 'local' } = options || {};
  const pendingSets: Record<string, unknown> = {};
  const pendingRemoves = new Set<string>();

  return {
    /**
     * Queue a set operation
     */
    set<T>(key: string, value: T): this {
      pendingSets[key] = value;
      pendingRemoves.delete(key);
      return this;
    },

    /**
     * Queue a remove operation
     */
    remove(key: string): this {
      pendingRemoves.add(key);
      delete pendingSets[key];
      return this;
    },

    /**
     * Execute all pending operations
     */
    async commit(): Promise<void> {
      const promises: Promise<void>[] = [];

      if (Object.keys(pendingSets).length > 0) {
        promises.push(setStorageItems(pendingSets, { area }));
      }

      if (pendingRemoves.size > 0) {
        promises.push(removeStorageItems([...pendingRemoves], { area }));
      }

      await Promise.all(promises);

      // Clear pending operations
      Object.keys(pendingSets).forEach((k) => delete pendingSets[k]);
      pendingRemoves.clear();
    },

    /**
     * Discard all pending operations
     */
    rollback(): void {
      Object.keys(pendingSets).forEach((k) => delete pendingSets[k]);
      pendingRemoves.clear();
    },

    /**
     * Get pending set operations
     */
    getPendingSets(): Record<string, unknown> {
      return { ...pendingSets };
    },

    /**
     * Get pending remove operations
     */
    getPendingRemoves(): string[] {
      return [...pendingRemoves];
    },
  };
}

// ============================================================================
// Storage Migration
// ============================================================================

export interface Migration {
  version: number;
  migrate: (data: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>;
}

/**
 * Run storage migrations
 */
export async function runStorageMigrations(
  migrations: Migration[],
  options?: StorageOptions & { versionKey?: string }
): Promise<void> {
  const { area = 'local', versionKey = '__storage_version__' } = options || {};

  // Sort migrations by version
  const sortedMigrations = [...migrations].sort((a, b) => a.version - b.version);

  // Get current version
  const currentVersion = (await getStorageItem<number>(versionKey, { area })) ?? 0;

  // Get pending migrations
  const pendingMigrations = sortedMigrations.filter(
    (m) => m.version > currentVersion
  );

  if (pendingMigrations.length === 0) {
    return;
  }

  // Get all data
  let data = await getAllStorageItems<Record<string, unknown>>({ area });

  // Run migrations
  for (const migration of pendingMigrations) {
    try {
      data = await migration.migrate(data);
    } catch (error) {
      console.error(`Migration to v${migration.version} failed:`, error);
      throw error;
    }
  }

  // Save migrated data
  const lastVersion = pendingMigrations[pendingMigrations.length - 1].version;
  await setStorageItems({ ...data, [versionKey]: lastVersion }, { area });
}

// ============================================================================
// Storage Quota
// ============================================================================

/**
 * Get storage quota information
 */
export async function getStorageQuota(area: StorageArea = 'local'): Promise<{
  bytesUsed: number;
  quotaBytes: number;
  percentUsed: number;
}> {
  const bytesUsed = await getStorageUsage({ area });

  // Chrome storage quotas
  const quotaBytes =
    area === 'sync'
      ? chrome.storage.sync.QUOTA_BYTES
      : area === 'local'
      ? chrome.storage.local.QUOTA_BYTES
      : 10485760; // 10MB for session

  return {
    bytesUsed,
    quotaBytes,
    percentUsed: (bytesUsed / quotaBytes) * 100,
  };
}

/**
 * Estimate item size in bytes
 */
export function estimateStorageSize(value: unknown): number {
  const json = JSON.stringify(value);
  // UTF-8 encoding estimate
  return new Blob([json]).size;
}

/**
 * Check if value fits in storage quota
 */
export async function canStoreItem(
  value: unknown,
  options?: StorageOptions
): Promise<boolean> {
  const size = estimateStorageSize(value);
  const { bytesUsed, quotaBytes } = await getStorageQuota(options?.area);
  return bytesUsed + size < quotaBytes;
}

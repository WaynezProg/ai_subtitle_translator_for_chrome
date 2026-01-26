import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getStorageItem,
  getStorageItems,
  getAllStorageItems,
  setStorageItem,
  setStorageItems,
  removeStorageItem,
  removeStorageItems,
  clearStorage,
  getStorageUsage,
  hasStorageItem,
  onStorageChange,
  createStorageItem,
  createStorageNamespace,
  createCachedStorage,
  createStorageBatch,
  runStorageMigrations,
  getStorageQuota,
  estimateStorageSize,
  canStoreItem,
} from '@shared/utils/storage-utils';

// Helper storage for mocking
const mockStorage = new Map<string, unknown>();

// Setup mock chrome.storage with callback-based API
const setupChromeMock = () => {
  const storageMock = {
    local: {
      get: vi.fn((keys: string | string[] | null, callback: (items: Record<string, unknown>) => void) => {
        if (keys === null) {
          const result = Object.fromEntries(mockStorage);
          callback(result);
        } else {
          const keyArray = Array.isArray(keys) ? keys : [keys];
          const result: Record<string, unknown> = {};
          for (const key of keyArray) {
            if (mockStorage.has(key)) {
              result[key] = mockStorage.get(key);
            }
          }
          callback(result);
        }
      }),
      set: vi.fn((items: Record<string, unknown>, callback?: () => void) => {
        for (const [key, value] of Object.entries(items)) {
          mockStorage.set(key, value);
        }
        callback?.();
      }),
      remove: vi.fn((keys: string | string[], callback?: () => void) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        for (const key of keyArray) {
          mockStorage.delete(key);
        }
        callback?.();
      }),
      clear: vi.fn((callback?: () => void) => {
        mockStorage.clear();
        callback?.();
      }),
      getBytesInUse: vi.fn((keys: string | string[] | null, callback: (bytesInUse: number) => void) => {
        let size = 0;
        const items = keys === null
          ? [...mockStorage.keys()]
          : (Array.isArray(keys) ? keys : [keys]);
        for (const key of items) {
          const value = mockStorage.get(key);
          if (value !== undefined) {
            size += JSON.stringify({ [key]: value }).length;
          }
        }
        callback(size);
      }),
      QUOTA_BYTES: 5242880, // 5MB
    },
    sync: {
      get: vi.fn((keys: unknown, callback: (items: Record<string, unknown>) => void) => callback({})),
      set: vi.fn((items: unknown, callback?: () => void) => callback?.()),
      remove: vi.fn((keys: unknown, callback?: () => void) => callback?.()),
      clear: vi.fn((callback?: () => void) => callback?.()),
      getBytesInUse: vi.fn((keys: unknown, callback: (bytesInUse: number) => void) => callback(0)),
      QUOTA_BYTES: 102400, // 100KB
    },
    session: {
      get: vi.fn((keys: unknown, callback: (items: Record<string, unknown>) => void) => callback({})),
      set: vi.fn((items: unknown, callback?: () => void) => callback?.()),
      remove: vi.fn((keys: unknown, callback?: () => void) => callback?.()),
      clear: vi.fn((callback?: () => void) => callback?.()),
      getBytesInUse: vi.fn((keys: unknown, callback: (bytesInUse: number) => void) => callback(0)),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  };

  // Extend chrome mock
  (globalThis as { chrome: typeof chrome }).chrome = {
    ...chrome,
    storage: storageMock as unknown as typeof chrome.storage,
    runtime: {
      ...chrome.runtime,
      lastError: undefined,
    },
  };
};

beforeEach(() => {
  mockStorage.clear();
  vi.clearAllMocks();
  setupChromeMock();
});

describe('Core Storage Functions', () => {
  describe('getStorageItem', () => {
    it('should get existing item', async () => {
      mockStorage.set('testKey', 'testValue');
      const value = await getStorageItem<string>('testKey');
      expect(value).toBe('testValue');
    });

    it('should return undefined for non-existing item', async () => {
      const value = await getStorageItem<string>('nonExistent');
      expect(value).toBeUndefined();
    });

    it('should return default value for non-existing item', async () => {
      const value = await getStorageItem<string>('nonExistent', {
        defaultValue: 'default',
      });
      expect(value).toBe('default');
    });

    it('should handle storage errors', async () => {
      const originalGet = chrome.storage.local.get;
      (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
        (keys, callback) => {
          (chrome.runtime as { lastError?: { message: string } }).lastError = {
            message: 'Storage error',
          };
          callback({});
          (chrome.runtime as { lastError?: { message: string } }).lastError = undefined;
        }
      );

      await expect(getStorageItem('key')).rejects.toThrow('Storage error');
    });
  });

  describe('getStorageItems', () => {
    it('should get multiple items', async () => {
      mockStorage.set('key1', 'value1');
      mockStorage.set('key2', 'value2');

      const result = await getStorageItems<{ key1: string; key2: string }>([
        'key1',
        'key2',
      ]);

      expect(result).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should return partial result for missing keys', async () => {
      mockStorage.set('key1', 'value1');

      const result = await getStorageItems<{ key1: string; key2: string }>([
        'key1',
        'key2',
      ]);

      expect(result).toEqual({ key1: 'value1' });
    });
  });

  describe('getAllStorageItems', () => {
    it('should get all items', async () => {
      mockStorage.set('key1', 'value1');
      mockStorage.set('key2', 'value2');
      mockStorage.set('key3', { nested: true });

      const result = await getAllStorageItems();

      expect(result).toEqual({
        key1: 'value1',
        key2: 'value2',
        key3: { nested: true },
      });
    });

    it('should return empty object for empty storage', async () => {
      const result = await getAllStorageItems();
      expect(result).toEqual({});
    });
  });

  describe('setStorageItem', () => {
    it('should set item', async () => {
      await setStorageItem('newKey', 'newValue');
      expect(mockStorage.get('newKey')).toBe('newValue');
    });

    it('should update existing item', async () => {
      mockStorage.set('existingKey', 'oldValue');
      await setStorageItem('existingKey', 'newValue');
      expect(mockStorage.get('existingKey')).toBe('newValue');
    });

    it('should handle complex values', async () => {
      const complexValue = { array: [1, 2, 3], nested: { a: 'b' } };
      await setStorageItem('complex', complexValue);
      expect(mockStorage.get('complex')).toEqual(complexValue);
    });
  });

  describe('setStorageItems', () => {
    it('should set multiple items', async () => {
      await setStorageItems({ key1: 'value1', key2: 'value2' });
      expect(mockStorage.get('key1')).toBe('value1');
      expect(mockStorage.get('key2')).toBe('value2');
    });
  });

  describe('removeStorageItem', () => {
    it('should remove item', async () => {
      mockStorage.set('toRemove', 'value');
      await removeStorageItem('toRemove');
      expect(mockStorage.has('toRemove')).toBe(false);
    });
  });

  describe('removeStorageItems', () => {
    it('should remove multiple items', async () => {
      mockStorage.set('key1', 'value1');
      mockStorage.set('key2', 'value2');
      mockStorage.set('key3', 'value3');

      await removeStorageItems(['key1', 'key2']);

      expect(mockStorage.has('key1')).toBe(false);
      expect(mockStorage.has('key2')).toBe(false);
      expect(mockStorage.has('key3')).toBe(true);
    });
  });

  describe('clearStorage', () => {
    it('should clear all items', async () => {
      mockStorage.set('key1', 'value1');
      mockStorage.set('key2', 'value2');

      await clearStorage();

      expect(mockStorage.size).toBe(0);
    });
  });

  describe('getStorageUsage', () => {
    it('should return bytes in use', async () => {
      mockStorage.set('key', 'value');
      const bytes = await getStorageUsage();
      expect(bytes).toBeGreaterThan(0);
    });
  });

  describe('hasStorageItem', () => {
    it('should return true for existing item', async () => {
      mockStorage.set('exists', 'value');
      expect(await hasStorageItem('exists')).toBe(true);
    });

    it('should return false for non-existing item', async () => {
      expect(await hasStorageItem('notExists')).toBe(false);
    });
  });
});

describe('Storage Listeners', () => {
  describe('onStorageChange', () => {
    it('should add listener and return unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = onStorageChange('testKey', listener);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });
});

describe('Typed Storage Item', () => {
  describe('createStorageItem', () => {
    it('should create typed storage item', async () => {
      const item = createStorageItem({
        key: 'typedItem',
        defaultValue: { count: 0 },
      });

      expect(item.getKey()).toBe('typedItem');
      expect(item.getDefault()).toEqual({ count: 0 });
    });

    it('should get default value when not set', async () => {
      const item = createStorageItem({
        key: 'newItem',
        defaultValue: 'default',
      });

      const value = await item.get();
      expect(value).toBe('default');
    });

    it('should get stored value', async () => {
      mockStorage.set('storedItem', 'stored');

      const item = createStorageItem({
        key: 'storedItem',
        defaultValue: 'default',
      });

      const value = await item.get();
      expect(value).toBe('stored');
    });

    it('should set value', async () => {
      const item = createStorageItem({
        key: 'settableItem',
        defaultValue: 0,
      });

      await item.set(42);
      expect(mockStorage.get('settableItem')).toBe(42);
    });

    it('should update value', async () => {
      mockStorage.set('updatableItem', 10);

      const item = createStorageItem({
        key: 'updatableItem',
        defaultValue: 0,
      });

      const result = await item.update((current) => current + 5);
      expect(result).toBe(15);
      expect(mockStorage.get('updatableItem')).toBe(15);
    });

    it('should reset to default', async () => {
      mockStorage.set('resettableItem', 100);

      const item = createStorageItem({
        key: 'resettableItem',
        defaultValue: 0,
      });

      await item.reset();
      expect(mockStorage.get('resettableItem')).toBe(0);
    });

    it('should remove item', async () => {
      mockStorage.set('removableItem', 'value');
      mockStorage.set('removableItem__version', 1);

      const item = createStorageItem({
        key: 'removableItem',
        defaultValue: 'default',
      });

      await item.remove();
      expect(mockStorage.has('removableItem')).toBe(false);
      expect(mockStorage.has('removableItem__version')).toBe(false);
    });

    it('should validate value on get', async () => {
      mockStorage.set('validatedItem', 'invalid');

      const item = createStorageItem({
        key: 'validatedItem',
        defaultValue: 42,
        validate: (value): value is number => typeof value === 'number',
      });

      const value = await item.get();
      expect(value).toBe(42); // Returns default due to validation failure
    });

    it('should throw on set with invalid value', async () => {
      const item = createStorageItem({
        key: 'strictItem',
        defaultValue: 0,
        validate: (value): value is number =>
          typeof value === 'number' && value >= 0,
      });

      await expect(item.set(-1 as number)).rejects.toThrow('Invalid value');
    });

    it('should migrate old values', async () => {
      mockStorage.set('migratedItem', { oldFormat: true });
      mockStorage.set('migratedItem__version', 1);

      const item = createStorageItem({
        key: 'migratedItem',
        defaultValue: { newFormat: true, data: '' },
        version: 2,
        migrate: (oldValue) => ({
          newFormat: true,
          data: (oldValue as { oldFormat: boolean }).oldFormat ? 'migrated' : '',
        }),
      });

      const value = await item.get();
      expect(value).toEqual({ newFormat: true, data: 'migrated' });
    });

    it('should subscribe to changes', () => {
      const item = createStorageItem({
        key: 'observedItem',
        defaultValue: 'default',
      });

      const listener = vi.fn();
      const unsubscribe = item.subscribe(listener);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });
});

describe('Storage Namespace', () => {
  describe('createStorageNamespace', () => {
    it('should create namespaced storage', async () => {
      const ns = createStorageNamespace('myApp');

      await ns.set('setting', 'value');
      expect(mockStorage.get('myApp:setting')).toBe('value');
    });

    it('should get namespaced item', async () => {
      mockStorage.set('myApp:setting', 'stored');

      const ns = createStorageNamespace('myApp');
      const value = await ns.get('setting');

      expect(value).toBe('stored');
    });

    it('should remove namespaced item', async () => {
      mockStorage.set('myApp:toRemove', 'value');

      const ns = createStorageNamespace('myApp');
      await ns.remove('toRemove');

      expect(mockStorage.has('myApp:toRemove')).toBe(false);
    });

    it('should check if namespaced item exists', async () => {
      mockStorage.set('myApp:exists', 'value');

      const ns = createStorageNamespace('myApp');

      expect(await ns.has('exists')).toBe(true);
      expect(await ns.has('notExists')).toBe(false);
    });

    it('should get all items in namespace', async () => {
      mockStorage.set('myApp:key1', 'value1');
      mockStorage.set('myApp:key2', 'value2');
      mockStorage.set('otherApp:key3', 'value3');

      const ns = createStorageNamespace('myApp');
      const all = await ns.getAll();

      expect(all).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should clear all items in namespace', async () => {
      mockStorage.set('myApp:key1', 'value1');
      mockStorage.set('myApp:key2', 'value2');
      mockStorage.set('otherApp:key3', 'value3');

      const ns = createStorageNamespace('myApp');
      await ns.clear();

      expect(mockStorage.has('myApp:key1')).toBe(false);
      expect(mockStorage.has('myApp:key2')).toBe(false);
      expect(mockStorage.has('otherApp:key3')).toBe(true);
    });
  });
});

describe('Cached Storage', () => {
  describe('createCachedStorage', () => {
    it('should create cached storage', () => {
      const cache = createCachedStorage(['key1', 'key2']);
      expect(cache.isInitialized()).toBe(false);
    });

    it('should initialize from storage', async () => {
      mockStorage.set('key1', 'value1');
      mockStorage.set('key2', 'value2');

      const cache = createCachedStorage<{ key1: string; key2: string }>([
        'key1',
        'key2',
      ]);

      await cache.init();
      expect(cache.isInitialized()).toBe(true);
    });

    it('should get cached value', async () => {
      mockStorage.set('key1', 'value1');

      const cache = createCachedStorage<{ key1: string }>(['key1']);
      await cache.init();

      const value = await cache.get('key1');
      expect(value).toBe('value1');
    });

    it('should set and cache value', async () => {
      const cache = createCachedStorage<{ key1: string }>(['key1']);
      await cache.init();

      await cache.set('key1', 'newValue');

      expect(mockStorage.get('key1')).toBe('newValue');
      expect(await cache.get('key1')).toBe('newValue');
    });

    it('should remove cached value', async () => {
      mockStorage.set('key1', 'value1');

      const cache = createCachedStorage<{ key1: string }>(['key1']);
      await cache.init();

      await cache.remove('key1');

      expect(mockStorage.has('key1')).toBe(false);
      expect(await cache.get('key1')).toBeUndefined();
    });

    it('should invalidate cache', async () => {
      mockStorage.set('key1', 'value1');

      const cache = createCachedStorage<{ key1: string }>(['key1']);
      await cache.init();

      cache.invalidate('key1');
      expect(cache.getAll()).toEqual({});
    });

    it('should invalidate all cache', async () => {
      mockStorage.set('key1', 'value1');
      mockStorage.set('key2', 'value2');

      const cache = createCachedStorage<{ key1: string; key2: string }>([
        'key1',
        'key2',
      ]);
      await cache.init();

      cache.invalidate();
      expect(cache.isInitialized()).toBe(false);
    });

    it('should respect TTL', async () => {
      mockStorage.set('key1', 'value1');

      const cache = createCachedStorage<{ key1: string }>(['key1'], {
        ttl: 100,
      });
      await cache.init();

      // Value should be cached
      expect(await cache.get('key1')).toBe('value1');

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Should re-fetch from storage
      mockStorage.set('key1', 'updatedValue');
      expect(await cache.get('key1')).toBe('updatedValue');
    });

    it('should get all cached values', async () => {
      mockStorage.set('key1', 'value1');
      mockStorage.set('key2', 'value2');

      const cache = createCachedStorage<{ key1: string; key2: string }>([
        'key1',
        'key2',
      ]);
      await cache.init();

      expect(cache.getAll()).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should clear cache', async () => {
      mockStorage.set('key1', 'value1');
      mockStorage.set('key2', 'value2');

      const cache = createCachedStorage<{ key1: string; key2: string }>([
        'key1',
        'key2',
      ]);
      await cache.init();

      await cache.clear();

      expect(mockStorage.has('key1')).toBe(false);
      expect(mockStorage.has('key2')).toBe(false);
    });
  });
});

describe('Storage Batch', () => {
  describe('createStorageBatch', () => {
    it('should create batch operations', () => {
      const batch = createStorageBatch();
      expect(batch.getPendingSets()).toEqual({});
      expect(batch.getPendingRemoves()).toEqual([]);
    });

    it('should queue set operations', () => {
      const batch = createStorageBatch();

      batch.set('key1', 'value1').set('key2', 'value2');

      expect(batch.getPendingSets()).toEqual({
        key1: 'value1',
        key2: 'value2',
      });
    });

    it('should queue remove operations', () => {
      const batch = createStorageBatch();

      batch.remove('key1').remove('key2');

      expect(batch.getPendingRemoves()).toEqual(['key1', 'key2']);
    });

    it('should handle set then remove for same key', () => {
      const batch = createStorageBatch();

      batch.set('key1', 'value1').remove('key1');

      expect(batch.getPendingSets()).toEqual({});
      expect(batch.getPendingRemoves()).toEqual(['key1']);
    });

    it('should handle remove then set for same key', () => {
      const batch = createStorageBatch();

      batch.remove('key1').set('key1', 'value1');

      expect(batch.getPendingSets()).toEqual({ key1: 'value1' });
      expect(batch.getPendingRemoves()).toEqual([]);
    });

    it('should commit operations', async () => {
      const batch = createStorageBatch();

      mockStorage.set('toRemove', 'value');

      batch.set('newKey', 'newValue').remove('toRemove');

      await batch.commit();

      expect(mockStorage.get('newKey')).toBe('newValue');
      expect(mockStorage.has('toRemove')).toBe(false);
      expect(batch.getPendingSets()).toEqual({});
      expect(batch.getPendingRemoves()).toEqual([]);
    });

    it('should rollback operations', () => {
      const batch = createStorageBatch();

      batch.set('key1', 'value1').remove('key2');
      batch.rollback();

      expect(batch.getPendingSets()).toEqual({});
      expect(batch.getPendingRemoves()).toEqual([]);
    });
  });
});

describe('Storage Migrations', () => {
  describe('runStorageMigrations', () => {
    it('should run migrations in order', async () => {
      mockStorage.set('data', { old: true });

      const migrations = [
        {
          version: 1,
          migrate: (data: Record<string, unknown>) => ({
            ...data,
            v1: true,
          }),
        },
        {
          version: 2,
          migrate: (data: Record<string, unknown>) => ({
            ...data,
            v2: true,
          }),
        },
      ];

      await runStorageMigrations(migrations);

      const result = await getAllStorageItems();
      expect(result).toMatchObject({ data: { old: true }, v1: true, v2: true });
      expect(result.__storage_version__).toBe(2);
    });

    it('should skip migrations already applied', async () => {
      mockStorage.set('__storage_version__', 1);
      mockStorage.set('data', { old: true });

      const migrateFn = vi.fn((data) => ({ ...data, v1: true }));

      const migrations = [{ version: 1, migrate: migrateFn }];

      await runStorageMigrations(migrations);

      expect(migrateFn).not.toHaveBeenCalled();
    });

    it('should use custom version key', async () => {
      mockStorage.set('data', { value: 1 });

      const migrations = [
        {
          version: 1,
          migrate: (data: Record<string, unknown>) => ({
            ...data,
            migrated: true,
          }),
        },
      ];

      await runStorageMigrations(migrations, { versionKey: 'customVersion' });

      expect(mockStorage.get('customVersion')).toBe(1);
    });

    it('should handle migration errors', async () => {
      mockStorage.set('data', { value: 1 });

      const migrations = [
        {
          version: 1,
          migrate: () => {
            throw new Error('Migration failed');
          },
        },
      ];

      await expect(runStorageMigrations(migrations)).rejects.toThrow(
        'Migration failed'
      );
    });

    it('should handle async migrations', async () => {
      mockStorage.set('data', { value: 1 });

      const migrations = [
        {
          version: 1,
          migrate: async (data: Record<string, unknown>) => {
            await new Promise((resolve) => setTimeout(resolve, 10));
            return { ...data, async: true };
          },
        },
      ];

      await runStorageMigrations(migrations);

      const result = await getAllStorageItems();
      expect(result).toMatchObject({ async: true });
    });
  });
});

describe('Storage Quota', () => {
  describe('getStorageQuota', () => {
    it('should return quota information', async () => {
      mockStorage.set('data', { large: 'value'.repeat(100) });

      const quota = await getStorageQuota('local');

      expect(quota.bytesUsed).toBeGreaterThan(0);
      expect(quota.quotaBytes).toBe(5242880); // 5MB (our mock value)
      expect(quota.percentUsed).toBeGreaterThan(0);
      expect(quota.percentUsed).toBeLessThan(100);
    });
  });

  describe('estimateStorageSize', () => {
    it('should estimate string size', () => {
      const size = estimateStorageSize('hello');
      expect(size).toBeGreaterThan(0);
    });

    it('should estimate object size', () => {
      const obj = { key: 'value', array: [1, 2, 3] };
      const size = estimateStorageSize(obj);
      expect(size).toBeGreaterThan(0);
    });

    it('should return larger size for larger objects', () => {
      const small = estimateStorageSize({ a: 1 });
      const large = estimateStorageSize({ a: 1, b: 2, c: 3, d: 4, e: 5 });
      expect(large).toBeGreaterThan(small);
    });
  });

  describe('canStoreItem', () => {
    it('should return true for small items', async () => {
      const result = await canStoreItem({ small: 'value' });
      expect(result).toBe(true);
    });

    it('should return false when quota would be exceeded', async () => {
      // Create a very large value that would exceed quota (5MB)
      const largeValue = 'x'.repeat(5242880 + 1);
      const result = await canStoreItem(largeValue);
      expect(result).toBe(false);
    });
  });
});

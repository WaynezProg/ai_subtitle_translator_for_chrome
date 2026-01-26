/**
 * Tests for AdapterRegistry
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AdapterRegistry, adapterRegistry } from '../../../src/content/adapters/registry';
import type { PlatformAdapter, URLPattern } from '../../../src/content/adapters/types';
import type { Platform } from '../../../src/shared/types/subtitle';

// Mock logger to avoid console noise
vi.mock('../../../src/shared/utils/logger', () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Helper to create mock adapters
function createMockAdapter(
  platform: Platform,
  urlPatterns: URLPattern[] = [],
  canHandleUrls: string[] = []
): PlatformAdapter {
  return {
    platform,
    urlPatterns,
    canHandle: (url: string) => canHandleUrls.some(u => url.includes(u)),
    initialize: vi.fn().mockResolvedValue(undefined),
    getVideoId: vi.fn().mockReturnValue(null),
    getSubtitleTracks: vi.fn().mockResolvedValue([]),
    fetchSubtitle: vi.fn().mockResolvedValue({ content: '', format: 'webvtt' }),
    injectSubtitles: vi.fn(),
    removeSubtitles: vi.fn(),
    getVideoElement: vi.fn().mockReturnValue(null),
    onVideoEvent: vi.fn().mockReturnValue(() => {}),
    destroy: vi.fn(),
  };
}

describe('AdapterRegistry', () => {
  let registry: AdapterRegistry;

  beforeEach(() => {
    registry = new AdapterRegistry();
  });

  describe('registerAdapter', () => {
    it('should register an adapter', () => {
      const adapter = createMockAdapter('youtube', [], ['youtube.com']);

      registry.registerAdapter(adapter);

      expect(registry.getAllAdapters()).toHaveLength(1);
      expect(registry.getAllAdapters()[0]).toBe(adapter);
    });

    it('should register multiple adapters', () => {
      const youtubeAdapter = createMockAdapter('youtube', [], ['youtube.com']);
      const netflixAdapter = createMockAdapter('netflix', [], ['netflix.com']);

      registry.registerAdapter(youtubeAdapter);
      registry.registerAdapter(netflixAdapter);

      expect(registry.getAllAdapters()).toHaveLength(2);
    });

    it('should replace existing adapter for same platform', () => {
      const adapter1 = createMockAdapter('youtube', [], ['youtube.com']);
      const adapter2 = createMockAdapter('youtube', [], ['youtube.com']);

      registry.registerAdapter(adapter1);
      registry.registerAdapter(adapter2);

      expect(registry.getAllAdapters()).toHaveLength(1);
      expect(registry.getAllAdapters()[0]).toBe(adapter2);
    });
  });

  describe('unregisterAdapter', () => {
    it('should unregister an adapter by platform', () => {
      const adapter = createMockAdapter('youtube', [], ['youtube.com']);
      registry.registerAdapter(adapter);

      registry.unregisterAdapter('youtube');

      expect(registry.getAllAdapters()).toHaveLength(0);
    });

    it('should not affect other adapters', () => {
      const youtubeAdapter = createMockAdapter('youtube', [], ['youtube.com']);
      const netflixAdapter = createMockAdapter('netflix', [], ['netflix.com']);
      registry.registerAdapter(youtubeAdapter);
      registry.registerAdapter(netflixAdapter);

      registry.unregisterAdapter('youtube');

      expect(registry.getAllAdapters()).toHaveLength(1);
      expect(registry.getAllAdapters()[0]).toBe(netflixAdapter);
    });

    it('should handle unregistering non-existent platform', () => {
      const adapter = createMockAdapter('youtube', [], ['youtube.com']);
      registry.registerAdapter(adapter);

      registry.unregisterAdapter('netflix');

      expect(registry.getAllAdapters()).toHaveLength(1);
    });
  });

  describe('getAdapter', () => {
    it('should return adapter that can handle URL', () => {
      const youtubeAdapter = createMockAdapter('youtube', [], ['youtube.com']);
      const netflixAdapter = createMockAdapter('netflix', [], ['netflix.com']);
      registry.registerAdapter(youtubeAdapter);
      registry.registerAdapter(netflixAdapter);

      const adapter = registry.getAdapter('https://www.youtube.com/watch?v=abc123');

      expect(adapter).toBe(youtubeAdapter);
    });

    it('should return null for unhandled URL', () => {
      const youtubeAdapter = createMockAdapter('youtube', [], ['youtube.com']);
      registry.registerAdapter(youtubeAdapter);

      const adapter = registry.getAdapter('https://www.example.com');

      expect(adapter).toBeNull();
    });

    it('should return first matching adapter', () => {
      // Both adapters claim to handle the same URL
      const adapter1 = createMockAdapter('youtube', [], ['video.com']);
      const adapter2 = createMockAdapter('netflix', [], ['video.com']);
      registry.registerAdapter(adapter1);
      registry.registerAdapter(adapter2);

      const adapter = registry.getAdapter('https://video.com/watch');

      expect(adapter).toBe(adapter1);
    });
  });

  describe('getAdapterByPlatform', () => {
    it('should return adapter by platform name', () => {
      const youtubeAdapter = createMockAdapter('youtube', [], ['youtube.com']);
      const netflixAdapter = createMockAdapter('netflix', [], ['netflix.com']);
      registry.registerAdapter(youtubeAdapter);
      registry.registerAdapter(netflixAdapter);

      const adapter = registry.getAdapterByPlatform('netflix');

      expect(adapter).toBe(netflixAdapter);
    });

    it('should return null for non-existent platform', () => {
      const youtubeAdapter = createMockAdapter('youtube', [], ['youtube.com']);
      registry.registerAdapter(youtubeAdapter);

      const adapter = registry.getAdapterByPlatform('netflix');

      expect(adapter).toBeNull();
    });
  });

  describe('getAllAdapters', () => {
    it('should return empty array when no adapters registered', () => {
      expect(registry.getAllAdapters()).toEqual([]);
    });

    it('should return copy of adapters array', () => {
      const adapter = createMockAdapter('youtube', [], ['youtube.com']);
      registry.registerAdapter(adapter);

      const adapters = registry.getAllAdapters();
      adapters.pop();

      expect(registry.getAllAdapters()).toHaveLength(1);
    });
  });

  describe('getCurrentAdapter', () => {
    it('should return null initially', () => {
      expect(registry.getCurrentAdapter()).toBeNull();
    });

    it('should return current adapter after setting', () => {
      const adapter = createMockAdapter('youtube', [], ['youtube.com']);
      registry.setCurrentAdapter(adapter);

      expect(registry.getCurrentAdapter()).toBe(adapter);
    });
  });

  describe('setCurrentAdapter', () => {
    it('should set current adapter', () => {
      const adapter = createMockAdapter('youtube', [], ['youtube.com']);

      registry.setCurrentAdapter(adapter);

      expect(registry.getCurrentAdapter()).toBe(adapter);
    });

    it('should destroy previous adapter when setting new one', () => {
      const adapter1 = createMockAdapter('youtube', [], ['youtube.com']);
      const adapter2 = createMockAdapter('netflix', [], ['netflix.com']);

      registry.setCurrentAdapter(adapter1);
      registry.setCurrentAdapter(adapter2);

      expect(adapter1.destroy).toHaveBeenCalled();
      expect(registry.getCurrentAdapter()).toBe(adapter2);
    });

    it('should not destroy adapter when setting same adapter', () => {
      const adapter = createMockAdapter('youtube', [], ['youtube.com']);

      registry.setCurrentAdapter(adapter);
      registry.setCurrentAdapter(adapter);

      expect(adapter.destroy).not.toHaveBeenCalled();
    });

    it('should handle setting null', () => {
      const adapter = createMockAdapter('youtube', [], ['youtube.com']);
      registry.setCurrentAdapter(adapter);

      registry.setCurrentAdapter(null);

      expect(adapter.destroy).toHaveBeenCalled();
      expect(registry.getCurrentAdapter()).toBeNull();
    });
  });

  describe('initializeForCurrentPage', () => {
    it('should initialize matching adapter', async () => {
      const adapter = createMockAdapter('youtube', [], ['youtube.com']);
      registry.registerAdapter(adapter);

      const result = await registry.initializeForCurrentPage('https://www.youtube.com/watch?v=abc');

      expect(result).toBe(adapter);
      expect(adapter.initialize).toHaveBeenCalled();
      expect(registry.getCurrentAdapter()).toBe(adapter);
    });

    it('should return null for unmatched URL', async () => {
      const adapter = createMockAdapter('youtube', [], ['youtube.com']);
      registry.registerAdapter(adapter);

      const result = await registry.initializeForCurrentPage('https://www.example.com');

      expect(result).toBeNull();
      expect(adapter.initialize).not.toHaveBeenCalled();
    });

    it('should return null on initialization failure', async () => {
      const adapter = createMockAdapter('youtube', [], ['youtube.com']);
      (adapter.initialize as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Init failed'));
      registry.registerAdapter(adapter);

      const result = await registry.initializeForCurrentPage('https://www.youtube.com/watch');

      expect(result).toBeNull();
    });

    it('should destroy previous adapter before initializing new one', async () => {
      const adapter1 = createMockAdapter('youtube', [], ['youtube.com']);
      const adapter2 = createMockAdapter('netflix', [], ['netflix.com']);
      registry.registerAdapter(adapter1);
      registry.registerAdapter(adapter2);

      await registry.initializeForCurrentPage('https://www.youtube.com/watch');
      await registry.initializeForCurrentPage('https://www.netflix.com/watch');

      expect(adapter1.destroy).toHaveBeenCalled();
      expect(registry.getCurrentAdapter()).toBe(adapter2);
    });
  });

  describe('destroy', () => {
    it('should destroy current adapter', () => {
      const adapter = createMockAdapter('youtube', [], ['youtube.com']);
      registry.setCurrentAdapter(adapter);

      registry.destroy();

      expect(adapter.destroy).toHaveBeenCalled();
      expect(registry.getCurrentAdapter()).toBeNull();
    });

    it('should handle no current adapter', () => {
      expect(() => registry.destroy()).not.toThrow();
    });
  });

  describe('global adapterRegistry', () => {
    it('should be an instance of AdapterRegistry', () => {
      expect(adapterRegistry).toBeInstanceOf(AdapterRegistry);
    });
  });
});

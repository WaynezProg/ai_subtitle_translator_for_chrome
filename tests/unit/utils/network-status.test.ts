/**
 * Tests for Network Status Utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isOnline,
  isOllamaReachable,
  onNetworkStatusChange,
} from '@shared/utils/network-status';

describe('Network Status', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isOnline', () => {
    it('should return true when navigator.onLine is true', () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      expect(isOnline()).toBe(true);
    });

    it('should return false when navigator.onLine is false', () => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      expect(isOnline()).toBe(false);
    });
  });

  describe('isOllamaReachable', () => {
    it('should return true when Ollama responds successfully', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
      });

      const result = await isOllamaReachable();
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return false when Ollama responds with error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await isOllamaReachable();
      expect(result).toBe(false);
    });

    it('should return false when fetch throws', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await isOllamaReachable();
      expect(result).toBe(false);
    });

    it('should use custom endpoint when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
      });

      await isOllamaReachable('http://custom:8080');
      expect(fetch).toHaveBeenCalledWith(
        'http://custom:8080/api/tags',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should timeout after 3 seconds', async () => {
      vi.useFakeTimers();

      let abortCalled = false;
      global.fetch = vi.fn().mockImplementation((_url, options) => {
        return new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () => {
            abortCalled = true;
            reject(new Error('Aborted'));
          });
        });
      });

      const promise = isOllamaReachable();

      // Advance timer past the 3 second timeout
      vi.advanceTimersByTime(3500);

      const result = await promise;
      expect(result).toBe(false);
      expect(abortCalled).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('onNetworkStatusChange', () => {
    it('should add callback to listeners', () => {
      const callback = vi.fn();
      const unsubscribe = onNetworkStatusChange(callback);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should return unsubscribe function that removes callback', () => {
      const callback = vi.fn();
      const unsubscribe = onNetworkStatusChange(callback);

      // Unsubscribe should not throw
      expect(() => unsubscribe()).not.toThrow();
    });

    it('should allow multiple subscriptions', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      const unsubscribe1 = onNetworkStatusChange(callback1);
      const unsubscribe2 = onNetworkStatusChange(callback2);

      expect(typeof unsubscribe1).toBe('function');
      expect(typeof unsubscribe2).toBe('function');
    });

    it('should handle unsubscribing the same callback twice', () => {
      const callback = vi.fn();
      const unsubscribe = onNetworkStatusChange(callback);

      // First unsubscribe
      unsubscribe();

      // Second unsubscribe should not throw
      expect(() => unsubscribe()).not.toThrow();
    });
  });
});

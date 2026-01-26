/**
 * Tests for Connection Quality Monitor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ConnectionMonitor,
  getConnectionMonitor,
  initConnectionMonitor,
  isNetworkAvailable,
  getConnectionQuality,
  waitForNetwork,
  type ConnectionState,
  type ConnectionQuality,
} from '@shared/utils/connection-monitor';

describe('ConnectionMonitor', () => {
  let monitor: ConnectionMonitor;

  beforeEach(() => {
    monitor = new ConnectionMonitor({
      autoMonitor: false, // Disable auto monitoring for tests
      pingTimeoutMs: 1000,
      sampleCount: 3,
    });
  });

  afterEach(() => {
    monitor.destroy();
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const state = monitor.getState();
      expect(state.isOnline).toBe(true);
      expect(state.quality).toBe('good');
      expect(state.failureCount).toBe(0);
    });

    it('should initialize connection monitor', () => {
      monitor.initialize();
      const state = monitor.getState();
      expect(state).toBeDefined();
    });
  });

  describe('isOnline', () => {
    it('should return online status', () => {
      expect(monitor.isOnline()).toBe(true);
    });
  });

  describe('getQuality', () => {
    it('should return current quality', () => {
      const quality = monitor.getQuality();
      expect(['excellent', 'good', 'fair', 'poor', 'offline']).toContain(quality);
    });
  });

  describe('getRecommendedTimeout', () => {
    it('should return appropriate timeout for excellent quality', () => {
      // Manually set state for testing
      (monitor as unknown as { state: ConnectionState }).state.quality = 'excellent';
      expect(monitor.getRecommendedTimeout()).toBe(30000);
    });

    it('should return appropriate timeout for good quality', () => {
      (monitor as unknown as { state: ConnectionState }).state.quality = 'good';
      expect(monitor.getRecommendedTimeout()).toBe(45000);
    });

    it('should return appropriate timeout for fair quality', () => {
      (monitor as unknown as { state: ConnectionState }).state.quality = 'fair';
      expect(monitor.getRecommendedTimeout()).toBe(60000);
    });

    it('should return appropriate timeout for poor quality', () => {
      (monitor as unknown as { state: ConnectionState }).state.quality = 'poor';
      expect(monitor.getRecommendedTimeout()).toBe(90000);
    });

    it('should return appropriate timeout for offline', () => {
      (monitor as unknown as { state: ConnectionState }).state.quality = 'offline';
      expect(monitor.getRecommendedTimeout()).toBe(120000);
    });
  });

  describe('getRecommendedChunkSize', () => {
    it('should return full chunk size for excellent quality', () => {
      (monitor as unknown as { state: ConnectionState }).state.quality = 'excellent';
      expect(monitor.getRecommendedChunkSize()).toBe(50);
    });

    it('should return reduced chunk size for poor quality', () => {
      (monitor as unknown as { state: ConnectionState }).state.quality = 'poor';
      expect(monitor.getRecommendedChunkSize()).toBe(10);
    });

    it('should return minimum chunk size for offline', () => {
      (monitor as unknown as { state: ConnectionState }).state.quality = 'offline';
      expect(monitor.getRecommendedChunkSize()).toBe(5);
    });
  });

  describe('canMakeRequests', () => {
    it('should return true when online and not offline quality', () => {
      (monitor as unknown as { state: ConnectionState }).state.isOnline = true;
      (monitor as unknown as { state: ConnectionState }).state.quality = 'good';
      expect(monitor.canMakeRequests()).toBe(true);
    });

    it('should return false when offline', () => {
      (monitor as unknown as { state: ConnectionState }).state.isOnline = false;
      (monitor as unknown as { state: ConnectionState }).state.quality = 'offline';
      expect(monitor.canMakeRequests()).toBe(false);
    });
  });

  describe('addListener', () => {
    it('should add listener and return unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = monitor.addListener(listener);

      expect(typeof unsubscribe).toBe('function');

      // Manually trigger notification
      (monitor as unknown as { notifyListeners: () => void }).notifyListeners();
      expect(listener).toHaveBeenCalledTimes(1);

      // Unsubscribe and verify no more calls
      unsubscribe();
      (monitor as unknown as { notifyListeners: () => void }).notifyListeners();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should receive state updates', () => {
      const listener = vi.fn();
      monitor.addListener(listener);

      (monitor as unknown as { notifyListeners: () => void }).notifyListeners();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          isOnline: expect.any(Boolean),
          quality: expect.any(String),
          latencyMs: expect.any(Number),
        })
      );
    });
  });

  describe('removeListener', () => {
    it('should remove listener', () => {
      const listener = vi.fn();
      monitor.addListener(listener);
      monitor.removeListener(listener);

      (monitor as unknown as { notifyListeners: () => void }).notifyListeners();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('checkLatency', () => {
    it('should return latency result', async () => {
      // Mock fetch for testing
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const result = await monitor.checkLatency();

      expect(result.success).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle fetch errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await monitor.checkLatency();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should handle timeout', async () => {
      // Create monitor with very short timeout
      const fastMonitor = new ConnectionMonitor({
        pingTimeoutMs: 10,
        autoMonitor: false,
      });

      // Mock fetch that respects abort signal
      global.fetch = vi.fn().mockImplementation(
        (_url: string, options?: { signal?: AbortSignal }) =>
          new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => resolve({ ok: true }), 1000);

            // Listen for abort signal
            if (options?.signal) {
              options.signal.addEventListener('abort', () => {
                clearTimeout(timeoutId);
                reject(new DOMException('Aborted', 'AbortError'));
              });
            }
          })
      );

      const result = await fastMonitor.checkLatency();

      // Should fail due to abort signal
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      fastMonitor.destroy();
    });
  });

  describe('checkConnection', () => {
    it('should update state on successful check', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const state = await monitor.checkConnection();

      expect(state.isOnline).toBe(true);
      expect(state.lastChecked).toBeGreaterThan(0);
    });

    it('should count failures and mark offline after 3', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await monitor.checkConnection();
      expect(monitor.getState().isOnline).toBe(true);
      expect(monitor.getState().failureCount).toBe(1);

      await monitor.checkConnection();
      expect(monitor.getState().failureCount).toBe(2);

      await monitor.checkConnection();
      expect(monitor.getState().failureCount).toBe(3);
      expect(monitor.getState().isOnline).toBe(false);
    });

    it('should reset failure count on success', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await monitor.checkConnection();
      await monitor.checkConnection();

      global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

      await monitor.checkConnection();
      expect(monitor.getState().failureCount).toBe(0);
    });
  });

  describe('startMonitoring / stopMonitoring', () => {
    it('should start and stop monitoring', () => {
      monitor.startMonitoring();
      expect((monitor as unknown as { checkInterval: unknown }).checkInterval).not.toBeNull();

      monitor.stopMonitoring();
      expect((monitor as unknown as { checkInterval: unknown }).checkInterval).toBeNull();
    });
  });

  describe('destroy', () => {
    it('should clean up resources', () => {
      const listener = vi.fn();
      monitor.addListener(listener);
      monitor.startMonitoring();

      monitor.destroy();

      expect((monitor as unknown as { checkInterval: unknown }).checkInterval).toBeNull();
      expect((monitor as unknown as { listeners: Set<unknown> }).listeners.size).toBe(0);
    });
  });
});

describe('ConnectionMonitor quality calculation', () => {
  let monitor: ConnectionMonitor;

  beforeEach(() => {
    monitor = new ConnectionMonitor({
      autoMonitor: false,
      thresholds: {
        excellent: 100,
        good: 300,
        fair: 1000,
      },
    });
  });

  afterEach(() => {
    monitor.destroy();
  });

  it('should classify excellent latency', () => {
    const state = monitor as unknown as { state: ConnectionState };
    const addSample = (monitor as unknown as { addLatencySample: (ms: number) => void })
      .addLatencySample.bind(monitor);
    const updateQuality = (monitor as unknown as { updateQuality: () => void }).updateQuality.bind(
      monitor
    );

    state.state.isOnline = true;
    addSample(50);
    updateQuality();

    expect(monitor.getQuality()).toBe('excellent');
  });

  it('should classify good latency', () => {
    const state = monitor as unknown as { state: ConnectionState };
    const addSample = (monitor as unknown as { addLatencySample: (ms: number) => void })
      .addLatencySample.bind(monitor);
    const updateQuality = (monitor as unknown as { updateQuality: () => void }).updateQuality.bind(
      monitor
    );

    state.state.isOnline = true;
    addSample(200);
    updateQuality();

    expect(monitor.getQuality()).toBe('good');
  });

  it('should classify fair latency', () => {
    const state = monitor as unknown as { state: ConnectionState };
    const addSample = (monitor as unknown as { addLatencySample: (ms: number) => void })
      .addLatencySample.bind(monitor);
    const updateQuality = (monitor as unknown as { updateQuality: () => void }).updateQuality.bind(
      monitor
    );

    state.state.isOnline = true;
    addSample(500);
    updateQuality();

    expect(monitor.getQuality()).toBe('fair');
  });

  it('should classify poor latency', () => {
    const state = monitor as unknown as { state: ConnectionState };
    const addSample = (monitor as unknown as { addLatencySample: (ms: number) => void })
      .addLatencySample.bind(monitor);
    const updateQuality = (monitor as unknown as { updateQuality: () => void }).updateQuality.bind(
      monitor
    );

    state.state.isOnline = true;
    addSample(2000);
    updateQuality();

    expect(monitor.getQuality()).toBe('poor');
  });

  it('should downgrade quality for high jitter', () => {
    const state = monitor as unknown as { state: ConnectionState };

    state.state.isOnline = true;
    state.state.latencyMs = 100;
    state.state.jitterMs = 100; // 100% jitter - very unstable
    state.state.quality = 'excellent';

    const updateQuality = (monitor as unknown as { updateQuality: () => void }).updateQuality.bind(
      monitor
    );
    updateQuality();

    // Should be downgraded from excellent due to high jitter
    expect(monitor.getQuality()).not.toBe('excellent');
  });
});

describe('Global connection monitor functions', () => {
  afterEach(() => {
    const monitor = getConnectionMonitor();
    monitor.destroy();
  });

  describe('getConnectionMonitor', () => {
    it('should return singleton instance', () => {
      const monitor1 = getConnectionMonitor();
      const monitor2 = getConnectionMonitor();
      expect(monitor1).toBe(monitor2);
    });
  });

  describe('initConnectionMonitor', () => {
    it('should create new monitor with config', () => {
      const monitor = initConnectionMonitor({
        checkIntervalMs: 60000,
      });

      expect(monitor).toBeDefined();
      expect(monitor.getState()).toBeDefined();
    });
  });

  describe('isNetworkAvailable', () => {
    it('should return online status', () => {
      const result = isNetworkAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('getConnectionQuality', () => {
    it('should return quality string', () => {
      const quality = getConnectionQuality();
      expect(['excellent', 'good', 'fair', 'poor', 'offline']).toContain(quality);
    });
  });

  describe('waitForNetwork', () => {
    it('should resolve immediately if online', async () => {
      const result = await waitForNetwork(1000);
      expect(result).toBe(true);
    });

    it('should timeout if offline', async () => {
      const monitor = getConnectionMonitor();
      (monitor as unknown as { state: ConnectionState }).state.isOnline = false;

      const result = await waitForNetwork(100);
      expect(result).toBe(false);
    });
  });
});

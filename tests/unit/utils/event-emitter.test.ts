/**
 * Tests for Type-Safe Event Emitter
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TypedEventEmitter,
  getEventEmitter,
  resetEventEmitter,
  on,
  once,
  emit,
  waitFor,
  type ExtensionEventMap,
} from '@shared/utils/event-emitter';

// ============================================================================
// Test Event Types
// ============================================================================

interface TestEventMap {
  'test:simple': { value: string };
  'test:number': { count: number };
  'test:complex': { id: string; data: { nested: boolean } };
}

// ============================================================================
// TypedEventEmitter Tests
// ============================================================================

describe('TypedEventEmitter', () => {
  let emitter: TypedEventEmitter<TestEventMap>;

  beforeEach(() => {
    emitter = new TypedEventEmitter<TestEventMap>();
  });

  describe('on/emit', () => {
    it('should register and call event handlers', () => {
      const handler = vi.fn();
      emitter.on('test:simple', handler);

      emitter.emit('test:simple', { value: 'hello' });

      expect(handler).toHaveBeenCalledWith({ value: 'hello' });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should call handler multiple times', () => {
      const handler = vi.fn();
      emitter.on('test:simple', handler);

      emitter.emit('test:simple', { value: 'first' });
      emitter.emit('test:simple', { value: 'second' });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should support multiple handlers for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('test:simple', handler1);
      emitter.on('test:simple', handler2);

      emitter.emit('test:simple', { value: 'test' });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should return true when event has listeners', () => {
      emitter.on('test:simple', vi.fn());

      const result = emitter.emit('test:simple', { value: 'test' });

      expect(result).toBe(true);
    });

    it('should return false when event has no listeners', () => {
      const result = emitter.emit('test:simple', { value: 'test' });

      expect(result).toBe(false);
    });
  });

  describe('once', () => {
    it('should only call handler once', () => {
      const handler = vi.fn();
      emitter.once('test:simple', handler);

      emitter.emit('test:simple', { value: 'first' });
      emitter.emit('test:simple', { value: 'second' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ value: 'first' });
    });

    it('should remove handler after being called', () => {
      const handler = vi.fn();
      emitter.once('test:simple', handler);

      emitter.emit('test:simple', { value: 'test' });

      expect(emitter.listenerCount('test:simple')).toBe(0);
    });
  });

  describe('off', () => {
    it('should remove specific handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('test:simple', handler1);
      emitter.on('test:simple', handler2);

      emitter.off('test:simple', handler1);

      emitter.emit('test:simple', { value: 'test' });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should return true when handler was removed', () => {
      const handler = vi.fn();
      emitter.on('test:simple', handler);

      const result = emitter.off('test:simple', handler);

      expect(result).toBe(true);
    });

    it('should return false when handler was not found', () => {
      const handler = vi.fn();

      const result = emitter.off('test:simple', handler);

      expect(result).toBe(false);
    });
  });

  describe('unsubscribe function', () => {
    it('should remove listener when called', () => {
      const handler = vi.fn();
      const unsubscribe = emitter.on('test:simple', handler);

      unsubscribe();

      emitter.emit('test:simple', { value: 'test' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('onAny (wildcard)', () => {
    it('should receive all events', () => {
      const handler = vi.fn();
      emitter.onAny(handler);

      emitter.emit('test:simple', { value: 'hello' });
      emitter.emit('test:number', { count: 42 });

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith('test:simple', { value: 'hello' });
      expect(handler).toHaveBeenCalledWith('test:number', { count: 42 });
    });
  });

  describe('priority', () => {
    it('should call higher priority handlers first', () => {
      const order: number[] = [];

      emitter.on('test:simple', () => order.push(1), { priority: 1 });
      emitter.on('test:simple', () => order.push(2), { priority: 2 });
      emitter.on('test:simple', () => order.push(3), { priority: 3 });

      emitter.emit('test:simple', { value: 'test' });

      expect(order).toEqual([3, 2, 1]);
    });
  });

  describe('emitAsync', () => {
    it('should wait for async handlers', async () => {
      const results: string[] = [];

      emitter.on('test:simple', async () => {
        await new Promise((r) => setTimeout(r, 10));
        results.push('async');
      });

      emitter.on('test:simple', () => {
        results.push('sync');
      });

      await emitter.emitAsync('test:simple', { value: 'test' });

      expect(results).toContain('async');
      expect(results).toContain('sync');
    });

    it('should remove once handlers after async emit', async () => {
      const handler = vi.fn();
      emitter.once('test:simple', handler);

      await emitter.emitAsync('test:simple', { value: 'test' });

      expect(emitter.listenerCount('test:simple')).toBe(0);
    });
  });

  describe('waitFor', () => {
    it('should resolve when event is emitted', async () => {
      const promise = emitter.waitFor('test:simple');

      setTimeout(() => {
        emitter.emit('test:simple', { value: 'resolved' });
      }, 10);

      const result = await promise;
      expect(result).toEqual({ value: 'resolved' });
    });

    it('should timeout if event is not emitted', async () => {
      const promise = emitter.waitFor('test:simple', { timeout: 50 });

      await expect(promise).rejects.toThrow('Timeout waiting for event');
    });

    it('should filter events', async () => {
      const promise = emitter.waitFor('test:number', {
        filter: (data) => data.count > 10,
      });

      setTimeout(() => {
        emitter.emit('test:number', { count: 5 });
        emitter.emit('test:number', { count: 15 });
      }, 10);

      const result = await promise;
      expect(result.count).toBe(15);
    });
  });

  describe('listenerCount', () => {
    it('should return correct count', () => {
      expect(emitter.listenerCount('test:simple')).toBe(0);

      emitter.on('test:simple', vi.fn());
      expect(emitter.listenerCount('test:simple')).toBe(1);

      emitter.on('test:simple', vi.fn());
      expect(emitter.listenerCount('test:simple')).toBe(2);
    });
  });

  describe('eventNames', () => {
    it('should return registered event names', () => {
      emitter.on('test:simple', vi.fn());
      emitter.on('test:number', vi.fn());

      const names = emitter.eventNames();

      expect(names).toContain('test:simple');
      expect(names).toContain('test:number');
    });

    it('should not include wildcard', () => {
      emitter.on('test:simple', vi.fn());
      emitter.onAny(vi.fn());

      const names = emitter.eventNames();

      expect(names).not.toContain('*');
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for specific event', () => {
      emitter.on('test:simple', vi.fn());
      emitter.on('test:simple', vi.fn());
      emitter.on('test:number', vi.fn());

      emitter.removeAllListeners('test:simple');

      expect(emitter.listenerCount('test:simple')).toBe(0);
      expect(emitter.listenerCount('test:number')).toBe(1);
    });

    it('should remove all listeners when no event specified', () => {
      emitter.on('test:simple', vi.fn());
      emitter.on('test:number', vi.fn());

      emitter.removeAllListeners();

      expect(emitter.listenerCount('test:simple')).toBe(0);
      expect(emitter.listenerCount('test:number')).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should catch sync errors when captureErrors is true', () => {
      const errorEmitter = new TypedEventEmitter<TestEventMap>({ captureErrors: true });

      errorEmitter.on('test:simple', () => {
        throw new Error('Handler error');
      });

      expect(() => {
        errorEmitter.emit('test:simple', { value: 'test' });
      }).not.toThrow();
    });

    it('should propagate errors when captureErrors is false', () => {
      const errorEmitter = new TypedEventEmitter<TestEventMap>({ captureErrors: false });

      errorEmitter.on('test:simple', () => {
        throw new Error('Handler error');
      });

      expect(() => {
        errorEmitter.emit('test:simple', { value: 'test' });
      }).toThrow('Handler error');
    });

    it('should track error count', () => {
      const errorEmitter = new TypedEventEmitter<TestEventMap>({ captureErrors: true });

      errorEmitter.on('test:simple', () => {
        throw new Error('Error 1');
      });
      errorEmitter.on('test:simple', () => {
        throw new Error('Error 2');
      });

      errorEmitter.emit('test:simple', { value: 'test' });

      const stats = errorEmitter.getStats();
      expect(stats.errorCount).toBe(2);
    });
  });

  describe('statistics', () => {
    it('should track emitted events', () => {
      emitter.on('test:simple', vi.fn());
      emitter.emit('test:simple', { value: 'test' });
      emitter.emit('test:simple', { value: 'test' });

      const stats = emitter.getStats();

      expect(stats.totalEmitted).toBe(2);
      expect(stats.emittedByType.get('test:simple')).toBe(2);
    });

    it('should track listener count', () => {
      emitter.on('test:simple', vi.fn());
      emitter.on('test:simple', vi.fn());
      emitter.on('test:number', vi.fn());

      const stats = emitter.getStats();

      expect(stats.totalListeners).toBe(3);
      expect(stats.listenersByType.get('test:simple')).toBe(2);
      expect(stats.listenersByType.get('test:number')).toBe(1);
    });

    it('should reset statistics', () => {
      emitter.on('test:simple', vi.fn());
      emitter.emit('test:simple', { value: 'test' });

      emitter.resetStats();

      const stats = emitter.getStats();
      expect(stats.totalEmitted).toBe(0);
      // Listener count should remain
      expect(stats.totalListeners).toBe(1);
    });
  });
});

// ============================================================================
// Singleton and Convenience Functions Tests
// ============================================================================

describe('Extension Event Emitter Singleton', () => {
  beforeEach(() => {
    resetEventEmitter();
  });

  afterEach(() => {
    resetEventEmitter();
  });

  it('should return singleton instance', () => {
    const instance1 = getEventEmitter();
    const instance2 = getEventEmitter();
    expect(instance1).toBe(instance2);
  });

  it('should work with convenience functions', () => {
    const handler = vi.fn();

    on('translation:started', handler);
    emit('translation:started', { videoId: 'test123', cueCount: 10 });

    expect(handler).toHaveBeenCalledWith({ videoId: 'test123', cueCount: 10 });
  });

  it('should support once via convenience function', () => {
    const handler = vi.fn();

    once('translation:completed', handler);
    emit('translation:completed', { videoId: 'test', cueCount: 5, durationMs: 1000, cached: false });
    emit('translation:completed', { videoId: 'test', cueCount: 5, durationMs: 1000, cached: false });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should support waitFor via convenience function', async () => {
    const promise = waitFor('connection:online', { timeout: 1000 });

    setTimeout(() => {
      emit('connection:online', { timestamp: Date.now() });
    }, 10);

    const result = await promise;
    expect(result.timestamp).toBeDefined();
  });
});

// ============================================================================
// Extension Event Types Tests
// ============================================================================

describe('Extension Event Types', () => {
  let emitter: TypedEventEmitter<ExtensionEventMap>;

  beforeEach(() => {
    emitter = new TypedEventEmitter<ExtensionEventMap>();
  });

  it('should handle translation events', () => {
    const handler = vi.fn();
    emitter.on('translation:progress', handler);

    emitter.emit('translation:progress', {
      videoId: 'abc123',
      progress: 0.5,
      translated: 50,
      total: 100,
    });

    expect(handler).toHaveBeenCalledWith({
      videoId: 'abc123',
      progress: 0.5,
      translated: 50,
      total: 100,
    });
  });

  it('should handle provider events', () => {
    const handler = vi.fn();
    emitter.on('provider:rateLimit', handler);

    emitter.emit('provider:rateLimit', {
      providerId: 'claude-api',
      retryAfterMs: 60000,
    });

    expect(handler).toHaveBeenCalledWith({
      providerId: 'claude-api',
      retryAfterMs: 60000,
    });
  });

  it('should handle settings events', () => {
    const handler = vi.fn();
    emitter.on('settings:changed', handler);

    emitter.emit('settings:changed', {
      key: 'targetLanguage',
      value: 'ja',
      previousValue: 'zh-TW',
    });

    expect(handler).toHaveBeenCalledWith({
      key: 'targetLanguage',
      value: 'ja',
      previousValue: 'zh-TW',
    });
  });

  it('should handle cache events', () => {
    const handler = vi.fn();
    emitter.on('cache:hit', handler);

    emitter.emit('cache:hit', { key: 'translation:abc', size: 1024 });

    expect(handler).toHaveBeenCalledWith({ key: 'translation:abc', size: 1024 });
  });

  it('should handle error events', () => {
    const handler = vi.fn();
    emitter.on('error:unhandled', handler);

    const error = new Error('Test error');
    emitter.emit('error:unhandled', { error, context: 'translation' });

    expect(handler).toHaveBeenCalledWith({ error, context: 'translation' });
  });
});

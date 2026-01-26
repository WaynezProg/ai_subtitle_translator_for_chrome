/**
 * Tests for Performance Metrics Collector
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  PerformanceMetricsCollector,
  PerformanceTimer,
  getMetricsCollector,
  resetMetricsCollector,
  startTimer,
  recordTiming,
  measure,
  incrementCounter,
  setGauge,
  recordError,
  getPerformanceSummary,
  withMetrics,
} from '@shared/utils/performance-metrics';

// ============================================================================
// PerformanceTimer Tests
// ============================================================================

describe('PerformanceTimer', () => {
  let collector: PerformanceMetricsCollector;

  beforeEach(() => {
    collector = new PerformanceMetricsCollector();
  });

  it('should measure duration on stop', async () => {
    const timer = collector.startTimer('test-op');

    // Simulate some work
    await new Promise((resolve) => setTimeout(resolve, 10));

    const duration = timer.stop();

    expect(duration).toBeGreaterThanOrEqual(10);
    expect(duration).toBeLessThan(100);
  });

  it('should record timing as success on stop', () => {
    const timer = collector.startTimer('test-op');
    timer.stop();

    const stats = collector.getTimingStats('test-op');
    expect(stats).toBeDefined();
    expect(stats?.count).toBe(1);
  });

  it('should record timing as failure on fail', () => {
    const timer = collector.startTimer('test-op');
    timer.fail(new Error('test error'));

    const errorCount = collector.getCounter('test-op.errors');
    expect(errorCount).toBe(1);
  });

  it('should add metadata', () => {
    const timer = collector.startTimer('test-op');
    timer.addMetadata('key', 'value');
    timer.stop();

    const stats = collector.getTimingStats('test-op');
    expect(stats).toBeDefined();
  });

  it('should report elapsed time without stopping', async () => {
    const timer = collector.startTimer('test-op');

    await new Promise((resolve) => setTimeout(resolve, 10));
    const elapsed1 = timer.elapsed();

    await new Promise((resolve) => setTimeout(resolve, 10));
    const elapsed2 = timer.elapsed();

    expect(elapsed2).toBeGreaterThan(elapsed1);
  });
});

// ============================================================================
// PerformanceMetricsCollector Tests
// ============================================================================

describe('PerformanceMetricsCollector', () => {
  let collector: PerformanceMetricsCollector;

  beforeEach(() => {
    collector = new PerformanceMetricsCollector();
  });

  afterEach(() => {
    collector.destroy();
  });

  describe('timing methods', () => {
    it('should record timing', () => {
      collector.recordTiming('operation', 100);
      collector.recordTiming('operation', 200);
      collector.recordTiming('operation', 150);

      const stats = collector.getTimingStats('operation');

      expect(stats).toBeDefined();
      expect(stats?.count).toBe(3);
      expect(stats?.min).toBe(100);
      expect(stats?.max).toBe(200);
      expect(stats?.avg).toBe(150);
    });

    it('should return null for unknown timing', () => {
      const stats = collector.getTimingStats('unknown');
      expect(stats).toBeNull();
    });

    it('should trim old samples', () => {
      const smallCollector = new PerformanceMetricsCollector({ maxSamples: 5 });

      for (let i = 0; i < 10; i++) {
        smallCollector.recordTiming('operation', i * 10);
      }

      const stats = smallCollector.getTimingStats('operation');
      expect(stats?.count).toBe(5);
      // Should have last 5 values: 50, 60, 70, 80, 90
      expect(stats?.min).toBe(50);
    });

    it('should measure async operation', async () => {
      const result = await collector.measure('async-op', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 'result';
      });

      expect(result).toBe('result');

      const stats = collector.getTimingStats('async-op');
      expect(stats?.count).toBe(1);
      expect(stats?.avg).toBeGreaterThanOrEqual(10);
    });

    it('should record failure on async operation error', async () => {
      await expect(
        collector.measure('async-op', async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');

      const errorCount = collector.getCounter('async-op.errors');
      expect(errorCount).toBe(1);
    });

    it('should measure sync operation', () => {
      const result = collector.measureSync('sync-op', () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
        return sum;
      });

      expect(result).toBe(499500);

      const stats = collector.getTimingStats('sync-op');
      expect(stats?.count).toBe(1);
    });
  });

  describe('counter methods', () => {
    it('should increment counter', () => {
      collector.incrementCounter('requests');
      collector.incrementCounter('requests');
      collector.incrementCounter('requests', 3);

      expect(collector.getCounter('requests')).toBe(5);
    });

    it('should return 0 for unknown counter', () => {
      expect(collector.getCounter('unknown')).toBe(0);
    });

    it('should reset counter', () => {
      collector.incrementCounter('requests', 10);
      collector.resetCounter('requests');

      expect(collector.getCounter('requests')).toBe(0);
    });
  });

  describe('gauge methods', () => {
    it('should set and get gauge', () => {
      collector.setGauge('active_connections', 5);

      expect(collector.getGauge('active_connections')).toBe(5);
    });

    it('should return undefined for unknown gauge', () => {
      expect(collector.getGauge('unknown')).toBeUndefined();
    });

    it('should increment gauge', () => {
      collector.setGauge('queue_size', 10);
      collector.incrementGauge('queue_size', 5);

      expect(collector.getGauge('queue_size')).toBe(15);
    });

    it('should decrement gauge', () => {
      collector.setGauge('queue_size', 10);
      collector.decrementGauge('queue_size', 3);

      expect(collector.getGauge('queue_size')).toBe(7);
    });
  });

  describe('error tracking', () => {
    it('should record errors', () => {
      collector.recordError('network_error');
      collector.recordError('network_error');
      collector.recordError('timeout_error');

      expect(collector.getErrorCount('network_error')).toBe(2);
      expect(collector.getErrorCount('timeout_error')).toBe(1);
      expect(collector.getTotalErrors()).toBe(3);
    });

    it('should return 0 for unknown error type', () => {
      expect(collector.getErrorCount('unknown')).toBe(0);
    });
  });

  describe('statistics calculation', () => {
    it('should calculate percentiles correctly', () => {
      // Add 100 samples: 1, 2, 3, ..., 100
      for (let i = 1; i <= 100; i++) {
        collector.recordTiming('operation', i);
      }

      const stats = collector.getTimingStats('operation');

      expect(stats?.count).toBe(100);
      expect(stats?.min).toBe(1);
      expect(stats?.max).toBe(100);
      expect(stats?.avg).toBeCloseTo(50.5);
      expect(stats?.p50).toBeCloseTo(50.5, 0);
      expect(stats?.p90).toBeCloseTo(90.1, 0);
      expect(stats?.p95).toBeCloseTo(95.05, 0);
      expect(stats?.p99).toBeCloseTo(99.01, 0);
    });

    it('should handle single value', () => {
      collector.recordTiming('operation', 42);

      const stats = collector.getTimingStats('operation');

      expect(stats?.count).toBe(1);
      expect(stats?.min).toBe(42);
      expect(stats?.max).toBe(42);
      expect(stats?.avg).toBe(42);
      expect(stats?.p50).toBe(42);
      expect(stats?.p99).toBe(42);
    });
  });

  describe('summary and export', () => {
    it('should generate summary', () => {
      collector.recordTiming('op1', 100);
      collector.recordTiming('op2', 200);
      collector.incrementCounter('requests', 5);
      collector.setGauge('connections', 10);
      collector.recordError('error1');

      const summary = collector.getSummary();

      expect(summary.timings.size).toBe(2);
      expect(summary.counters.get('requests')).toBe(5);
      expect(summary.gauges.get('connections')).toBe(10);
      expect(summary.errors.get('error1')).toBe(1);
      expect(summary.periodEnd).toBeGreaterThanOrEqual(summary.periodStart);
    });

    it('should export as JSON', () => {
      collector.recordTiming('operation', 100);
      collector.incrementCounter('requests', 5);

      const json = collector.exportAsJson();
      const parsed = JSON.parse(json);

      expect(parsed.timings.operation).toBeDefined();
      expect(parsed.counters.requests).toBe(5);
    });
  });

  describe('reset and destroy', () => {
    it('should reset all metrics', () => {
      collector.recordTiming('operation', 100);
      collector.incrementCounter('requests', 5);
      collector.setGauge('connections', 10);
      collector.recordError('error1');

      collector.reset();

      expect(collector.getTimingStats('operation')).toBeNull();
      expect(collector.getCounter('requests')).toBe(0);
      expect(collector.getGauge('connections')).toBeUndefined();
      expect(collector.getErrorCount('error1')).toBe(0);
    });
  });

  describe('flush interval', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should flush periodically when configured', () => {
      const flushCollector = new PerformanceMetricsCollector({
        flushIntervalMs: 1000,
        enableLogging: true,
      });

      const initialPeriodStart = flushCollector.getSummary().periodStart;

      vi.advanceTimersByTime(1500);

      const newPeriodStart = flushCollector.getSummary().periodStart;
      expect(newPeriodStart).toBeGreaterThan(initialPeriodStart);

      flushCollector.destroy();
    });
  });
});

// ============================================================================
// Singleton and Convenience Functions Tests
// ============================================================================

describe('Singleton and Convenience Functions', () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  it('should return singleton instance', () => {
    const instance1 = getMetricsCollector();
    const instance2 = getMetricsCollector();
    expect(instance1).toBe(instance2);
  });

  it('should start timer via convenience function', () => {
    const timer = startTimer('test-op');
    timer.stop();

    const summary = getPerformanceSummary();
    expect(summary.timings.has('test-op')).toBe(true);
  });

  it('should record timing via convenience function', () => {
    recordTiming('test-op', 100);
    recordTiming('test-op', 200);

    const summary = getPerformanceSummary();
    const stats = summary.timings.get('test-op');
    expect(stats?.count).toBe(2);
  });

  it('should measure via convenience function', async () => {
    const result = await measure('async-op', async () => 'done');

    expect(result).toBe('done');

    const summary = getPerformanceSummary();
    expect(summary.timings.has('async-op')).toBe(true);
  });

  it('should increment counter via convenience function', () => {
    incrementCounter('requests');
    incrementCounter('requests', 4);

    const summary = getPerformanceSummary();
    expect(summary.counters.get('requests')).toBe(5);
  });

  it('should set gauge via convenience function', () => {
    setGauge('connections', 42);

    const summary = getPerformanceSummary();
    expect(summary.gauges.get('connections')).toBe(42);
  });

  it('should record error via convenience function', () => {
    recordError('network_error');
    recordError('network_error');

    const summary = getPerformanceSummary();
    expect(summary.errors.get('network_error')).toBe(2);
  });
});

// ============================================================================
// withMetrics Decorator Tests
// ============================================================================

describe('withMetrics', () => {
  beforeEach(() => {
    resetMetricsCollector();
  });

  afterEach(() => {
    resetMetricsCollector();
  });

  it('should wrap function with metrics', async () => {
    const originalFn = async (x: number) => x * 2;
    const measuredFn = withMetrics('double', originalFn);

    const result = await measuredFn(21);

    expect(result).toBe(42);

    const summary = getPerformanceSummary();
    expect(summary.timings.has('double')).toBe(true);
  });

  it('should propagate errors from wrapped function', async () => {
    const failingFn = async () => {
      throw new Error('test error');
    };
    const measuredFn = withMetrics('failing', failingFn);

    await expect(measuredFn()).rejects.toThrow('test error');
  });
});

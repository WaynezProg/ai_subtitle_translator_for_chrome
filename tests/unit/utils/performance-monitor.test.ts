/**
 * Tests for Performance Monitor
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  perfMonitor,
  startTimer,
  stopTimer,
  measure,
  measureSync,
  recordTiming,
  getPerformanceStats,
  generatePerformanceReport,
  MetricNames,
} from '@shared/utils/performance-monitor';

describe('Performance Monitor', () => {
  beforeEach(() => {
    perfMonitor.clear();
    perfMonitor.setEnabled(true);
  });

  describe('Timer functions', () => {
    it('should start and stop a timer', () => {
      const id = startTimer('test.operation');
      expect(id).toContain('test.operation');

      const duration = stopTimer(id);
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should return null for non-existent timer', () => {
      const duration = stopTimer('non-existent-timer-id');
      expect(duration).toBeNull();
    });

    it('should record timer with metadata', () => {
      const id = startTimer('test.with-metadata', { videoId: 'abc123' });
      stopTimer(id);

      const report = generatePerformanceReport();
      const timing = report.timings.find((t) => t.name === 'test.with-metadata');

      expect(timing).toBeDefined();
      expect(timing?.metadata).toEqual({ videoId: 'abc123' });
    });
  });

  describe('measure function', () => {
    it('should measure async function execution time', async () => {
      const result = await measure('test.async', async () => {
        // Use 15ms to provide timing tolerance for CI environments
        await new Promise((resolve) => setTimeout(resolve, 15));
        return 'done';
      });

      expect(result).toBe('done');

      const stats = getPerformanceStats('test.async');
      expect(stats).not.toBeNull();
      // Allow some tolerance for timing variations
      expect((stats as { avgMs: number }).avgMs).toBeGreaterThanOrEqual(10);
    });

    it('should measure async function that throws', async () => {
      await expect(
        measure('test.error', async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      // Should still record the timing
      const stats = getPerformanceStats('test.error');
      expect(stats).not.toBeNull();
    });
  });

  describe('measureSync function', () => {
    it('should measure sync function execution time', () => {
      const result = measureSync('test.sync', () => {
        // Simulate some work
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
        return sum;
      });

      expect(result).toBe(499500);

      const stats = getPerformanceStats('test.sync');
      expect(stats).not.toBeNull();
    });

    it('should measure sync function that throws', () => {
      expect(() =>
        measureSync('test.sync-error', () => {
          throw new Error('Sync error');
        })
      ).toThrow('Sync error');

      // Should still record the timing
      const stats = getPerformanceStats('test.sync-error');
      expect(stats).not.toBeNull();
    });
  });

  describe('recordTiming function', () => {
    it('should record a pre-measured timing', () => {
      recordTiming('test.manual', 150);

      const stats = getPerformanceStats('test.manual');
      expect(stats).not.toBeNull();
      expect((stats as { avgMs: number }).avgMs).toBe(150);
    });

    it('should record timing with metadata', () => {
      recordTiming('test.manual-meta', 200, { source: 'external' });

      const report = generatePerformanceReport();
      const timing = report.timings.find((t) => t.name === 'test.manual-meta');

      expect(timing?.metadata).toEqual({ source: 'external' });
    });
  });

  describe('getPerformanceStats', () => {
    beforeEach(() => {
      // Record multiple timings
      recordTiming('stats.test', 100);
      recordTiming('stats.test', 200);
      recordTiming('stats.test', 150);
      recordTiming('stats.test', 300);
      recordTiming('stats.test', 50);
    });

    it('should return aggregated stats for a metric', () => {
      const stats = getPerformanceStats('stats.test');

      expect(stats).not.toBeNull();
      expect((stats as { count: number }).count).toBe(5);
      expect((stats as { minMs: number }).minMs).toBe(50);
      expect((stats as { maxMs: number }).maxMs).toBe(300);
      expect((stats as { avgMs: number }).avgMs).toBe(160); // (100+200+150+300+50)/5
      expect((stats as { totalMs: number }).totalMs).toBe(800);
    });

    it('should return null for non-existent metric', () => {
      const stats = getPerformanceStats('non.existent');
      expect(stats).toBeNull();
    });

    it('should return all stats when no name provided', () => {
      recordTiming('another.metric', 500);

      const allStats = getPerformanceStats();
      expect(Array.isArray(allStats)).toBe(true);
      expect((allStats as { name: string }[]).length).toBeGreaterThanOrEqual(2);
    });

    it('should calculate p95 correctly', () => {
      perfMonitor.clear();

      // Add 100 samples: 1-100
      for (let i = 1; i <= 100; i++) {
        recordTiming('p95.test', i);
      }

      const stats = getPerformanceStats('p95.test');
      expect((stats as { p95Ms: number }).p95Ms).toBeGreaterThanOrEqual(95);
    });
  });

  describe('generatePerformanceReport', () => {
    it('should generate a complete report', () => {
      recordTiming('report.test', 100);

      const report = generatePerformanceReport();

      expect(report.timestamp).toBeDefined();
      expect(report.timings).toBeInstanceOf(Array);
      expect(report.aggregated).toBeInstanceOf(Array);
    });

    it('should include memory info if available', () => {
      const report = generatePerformanceReport();

      // Memory might or might not be available depending on environment
      if (report.memory) {
        expect(report.memory.usedJSHeapSize).toBeGreaterThanOrEqual(0);
        expect(report.memory.totalJSHeapSize).toBeGreaterThanOrEqual(0);
      }
    });

    it('should limit timings to last 100', () => {
      // Record 150 timings
      for (let i = 0; i < 150; i++) {
        recordTiming('bulk.test', i);
      }

      const report = generatePerformanceReport();
      expect(report.timings.length).toBeLessThanOrEqual(100);
    });
  });

  describe('setEnabled', () => {
    it('should not record when disabled', () => {
      perfMonitor.setEnabled(false);

      recordTiming('disabled.test', 100);
      const stats = getPerformanceStats('disabled.test');

      expect(stats).toBeNull();
    });

    it('should clear data when disabled', () => {
      recordTiming('clear.test', 100);
      perfMonitor.setEnabled(false);

      const stats = getPerformanceStats('clear.test');
      expect(stats).toBeNull();
    });

    it('should resume recording when re-enabled', () => {
      perfMonitor.setEnabled(false);
      perfMonitor.setEnabled(true);

      recordTiming('reenabled.test', 100);
      const stats = getPerformanceStats('reenabled.test');

      expect(stats).not.toBeNull();
    });
  });

  describe('clear functions', () => {
    it('should clear all metrics', () => {
      recordTiming('clear.all1', 100);
      recordTiming('clear.all2', 200);

      perfMonitor.clear();

      expect(getPerformanceStats('clear.all1')).toBeNull();
      expect(getPerformanceStats('clear.all2')).toBeNull();
    });

    it('should clear specific metric', () => {
      recordTiming('clear.specific', 100);
      recordTiming('clear.keep', 200);

      perfMonitor.clearMetric('clear.specific');

      expect(getPerformanceStats('clear.specific')).toBeNull();
      expect(getPerformanceStats('clear.keep')).not.toBeNull();
    });
  });

  describe('MetricNames constants', () => {
    it('should have expected metric names', () => {
      expect(MetricNames.TRANSLATION_BATCH).toBe('translation.batch');
      expect(MetricNames.CACHE_L1_READ).toBe('cache.l1.read');
      expect(MetricNames.PARSE_WEBVTT).toBe('parse.webvtt');
      expect(MetricNames.NETWORK_FETCH).toBe('network.fetch');
      expect(MetricNames.UI_RENDER).toBe('ui.render');
      expect(MetricNames.ADAPTER_INIT).toBe('adapter.init');
    });
  });

  describe('sample limiting', () => {
    it('should limit samples per metric to prevent memory growth', () => {
      // Record more than max samples (100)
      for (let i = 0; i < 150; i++) {
        recordTiming('limited.test', i);
      }

      const stats = getPerformanceStats('limited.test');
      expect((stats as { count: number }).count).toBeLessThanOrEqual(100);
    });
  });
});

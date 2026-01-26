/**
 * Performance Monitor
 *
 * Tracks and reports performance metrics for the extension.
 * Useful for debugging, optimization, and user-facing statistics.
 *
 * Features:
 * - Timer-based measurements
 * - Aggregated statistics
 * - Memory usage tracking
 * - Export capabilities
 */

import { createLogger } from './logger';

const log = createLogger('PerfMonitor');

// ============================================================================
// Types
// ============================================================================

export interface TimingMetric {
  /** Metric name */
  name: string;
  /** Start timestamp */
  startTime: number;
  /** End timestamp (undefined if still running) */
  endTime?: number;
  /** Duration in milliseconds */
  duration?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

export interface AggregatedMetric {
  /** Metric name */
  name: string;
  /** Number of samples */
  count: number;
  /** Total duration */
  totalMs: number;
  /** Average duration */
  avgMs: number;
  /** Minimum duration */
  minMs: number;
  /** Maximum duration */
  maxMs: number;
  /** 95th percentile */
  p95Ms: number;
}

export interface PerformanceReport {
  /** Report generation timestamp */
  timestamp: string;
  /** Individual timing metrics */
  timings: TimingMetric[];
  /** Aggregated metrics by name */
  aggregated: AggregatedMetric[];
  /** Memory usage if available */
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
}

// ============================================================================
// Performance Monitor Implementation
// ============================================================================

class PerformanceMonitor {
  private timings: Map<string, TimingMetric[]> = new Map();
  private activeTimers: Map<string, TimingMetric> = new Map();
  private maxSamplesPerMetric = 100;
  private enabled = true;

  /**
   * Enable or disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }

  /**
   * Start a timer for a metric
   */
  startTimer(name: string, metadata?: Record<string, unknown>): string {
    if (!this.enabled) return name;

    const id = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const metric: TimingMetric = {
      name,
      startTime: performance.now(),
      metadata,
    };

    this.activeTimers.set(id, metric);
    return id;
  }

  /**
   * Stop a timer and record the duration
   */
  stopTimer(id: string): number | null {
    if (!this.enabled) return null;

    const metric = this.activeTimers.get(id);
    if (!metric) {
      log.warn(`Timer not found: ${id}`);
      return null;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;

    this.activeTimers.delete(id);
    this.recordMetric(metric);

    return metric.duration;
  }

  /**
   * Measure an async function execution time
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const id = this.startTimer(name, metadata);
    try {
      return await fn();
    } finally {
      this.stopTimer(id);
    }
  }

  /**
   * Measure a sync function execution time
   */
  measureSync<T>(
    name: string,
    fn: () => T,
    metadata?: Record<string, unknown>
  ): T {
    const id = this.startTimer(name, metadata);
    try {
      return fn();
    } finally {
      this.stopTimer(id);
    }
  }

  /**
   * Record a pre-measured metric
   */
  record(name: string, durationMs: number, metadata?: Record<string, unknown>): void {
    if (!this.enabled) return;

    const metric: TimingMetric = {
      name,
      startTime: performance.now() - durationMs,
      endTime: performance.now(),
      duration: durationMs,
      metadata,
    };

    this.recordMetric(metric);
  }

  /**
   * Get aggregated statistics for a metric
   */
  getStats(name: string): AggregatedMetric | null {
    const metrics = this.timings.get(name);
    if (!metrics || metrics.length === 0) return null;

    const durations = metrics
      .filter((m) => m.duration !== undefined)
      .map((m) => m.duration as number)
      .sort((a, b) => a - b);

    if (durations.length === 0) return null;

    const sum = durations.reduce((a, b) => a + b, 0);
    const p95Index = Math.floor(durations.length * 0.95);

    return {
      name,
      count: durations.length,
      totalMs: sum,
      avgMs: sum / durations.length,
      minMs: durations[0],
      maxMs: durations[durations.length - 1],
      p95Ms: durations[p95Index] || durations[durations.length - 1],
    };
  }

  /**
   * Get all aggregated statistics
   */
  getAllStats(): AggregatedMetric[] {
    const stats: AggregatedMetric[] = [];

    for (const name of this.timings.keys()) {
      const stat = this.getStats(name);
      if (stat) stats.push(stat);
    }

    return stats.sort((a, b) => b.totalMs - a.totalMs);
  }

  /**
   * Get memory usage (if available)
   */
  getMemoryUsage(): PerformanceReport['memory'] | undefined {
    // Check if memory API is available (Chrome only)
    const perf = performance as Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    };

    if (perf.memory) {
      return {
        usedJSHeapSize: perf.memory.usedJSHeapSize,
        totalJSHeapSize: perf.memory.totalJSHeapSize,
        jsHeapSizeLimit: perf.memory.jsHeapSizeLimit,
      };
    }

    return undefined;
  }

  /**
   * Generate a full performance report
   */
  generateReport(): PerformanceReport {
    const allTimings: TimingMetric[] = [];

    for (const metrics of this.timings.values()) {
      allTimings.push(...metrics);
    }

    return {
      timestamp: new Date().toISOString(),
      timings: allTimings.slice(-100), // Last 100 timings
      aggregated: this.getAllStats(),
      memory: this.getMemoryUsage(),
    };
  }

  /**
   * Clear all recorded metrics
   */
  clear(): void {
    this.timings.clear();
    this.activeTimers.clear();
  }

  /**
   * Clear metrics for a specific name
   */
  clearMetric(name: string): void {
    this.timings.delete(name);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private recordMetric(metric: TimingMetric): void {
    const existing = this.timings.get(metric.name) || [];

    // Limit samples to prevent memory growth
    if (existing.length >= this.maxSamplesPerMetric) {
      existing.shift();
    }

    existing.push(metric);
    this.timings.set(metric.name, existing);

    // Log slow operations
    if (metric.duration && metric.duration > 1000) {
      log.warn(`Slow operation: ${metric.name} took ${metric.duration.toFixed(0)}ms`, {
        metadata: metric.metadata,
      });
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const perfMonitor = new PerformanceMonitor();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Start a performance timer
 */
export function startTimer(name: string, metadata?: Record<string, unknown>): string {
  return perfMonitor.startTimer(name, metadata);
}

/**
 * Stop a performance timer
 */
export function stopTimer(id: string): number | null {
  return perfMonitor.stopTimer(id);
}

/**
 * Measure an async operation
 */
export function measure<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  return perfMonitor.measure(name, fn, metadata);
}

/**
 * Measure a sync operation
 */
export function measureSync<T>(
  name: string,
  fn: () => T,
  metadata?: Record<string, unknown>
): T {
  return perfMonitor.measureSync(name, fn, metadata);
}

/**
 * Record a timing metric
 */
export function recordTiming(
  name: string,
  durationMs: number,
  metadata?: Record<string, unknown>
): void {
  perfMonitor.record(name, durationMs, metadata);
}

/**
 * Get performance statistics
 */
export function getPerformanceStats(name?: string): AggregatedMetric | AggregatedMetric[] | null {
  if (name) {
    return perfMonitor.getStats(name);
  }
  return perfMonitor.getAllStats();
}

/**
 * Generate performance report
 */
export function generatePerformanceReport(): PerformanceReport {
  return perfMonitor.generateReport();
}

// ============================================================================
// Metric Names Constants
// ============================================================================

export const MetricNames = {
  // Translation metrics
  TRANSLATION_BATCH: 'translation.batch',
  TRANSLATION_SINGLE: 'translation.single',
  TRANSLATION_TOTAL: 'translation.total',

  // Cache metrics
  CACHE_L1_READ: 'cache.l1.read',
  CACHE_L1_WRITE: 'cache.l1.write',
  CACHE_L2_READ: 'cache.l2.read',
  CACHE_L2_WRITE: 'cache.l2.write',

  // Parsing metrics
  PARSE_WEBVTT: 'parse.webvtt',
  PARSE_TTML: 'parse.ttml',
  PARSE_JSON3: 'parse.json3',
  PARSE_SRT: 'parse.srt',

  // Network metrics
  NETWORK_FETCH: 'network.fetch',
  NETWORK_API_CALL: 'network.api_call',

  // UI metrics
  UI_RENDER: 'ui.render',
  UI_UPDATE: 'ui.update',

  // Adapter metrics
  ADAPTER_INIT: 'adapter.init',
  ADAPTER_INTERCEPT: 'adapter.intercept',
} as const;

/**
 * Performance Metrics Collector
 *
 * Collects and analyzes performance metrics for the extension,
 * including timing data, memory usage, and operation counts.
 */

import { createLogger } from './logger';

const logger = createLogger('PerformanceMetrics');

// ============================================================================
// Types
// ============================================================================

/**
 * Single metric entry
 */
export interface MetricEntry {
  /** Metric name */
  name: string;
  /** Metric value */
  value: number;
  /** Timestamp when recorded */
  timestamp: number;
  /** Optional tags for categorization */
  tags?: Record<string, string>;
}

/**
 * Timing metric with duration
 */
export interface TimingMetric {
  /** Operation name */
  name: string;
  /** Duration in milliseconds */
  durationMs: number;
  /** Start timestamp */
  startedAt: number;
  /** End timestamp */
  endedAt: number;
  /** Whether the operation succeeded */
  success: boolean;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated metric statistics
 */
export interface MetricStats {
  /** Number of samples */
  count: number;
  /** Sum of all values */
  sum: number;
  /** Minimum value */
  min: number;
  /** Maximum value */
  max: number;
  /** Average value */
  avg: number;
  /** Median value (p50) */
  p50: number;
  /** 90th percentile */
  p90: number;
  /** 95th percentile */
  p95: number;
  /** 99th percentile */
  p99: number;
}

/**
 * Performance summary
 */
export interface PerformanceSummary {
  /** Collection period start */
  periodStart: number;
  /** Collection period end */
  periodEnd: number;
  /** Timing statistics by operation */
  timings: Map<string, MetricStats>;
  /** Counter values */
  counters: Map<string, number>;
  /** Gauge values (current state) */
  gauges: Map<string, number>;
  /** Error counts by type */
  errors: Map<string, number>;
}

/**
 * Options for the metrics collector
 */
export interface MetricsCollectorOptions {
  /** Maximum number of timing samples to keep per metric */
  maxSamples?: number;
  /** Whether to log metrics to console */
  enableLogging?: boolean;
  /** Flush interval in ms (0 to disable) */
  flushIntervalMs?: number;
}

// ============================================================================
// Performance Timer
// ============================================================================

/**
 * Timer for measuring operation duration
 */
export class PerformanceTimer {
  private startTime: number;
  private endTime: number | null = null;
  private metadata: Record<string, unknown> = {};

  constructor(
    private name: string,
    private collector: PerformanceMetricsCollector
  ) {
    this.startTime = performance.now();
  }

  /**
   * Add metadata to the timer
   */
  addMetadata(key: string, value: unknown): this {
    this.metadata[key] = value;
    return this;
  }

  /**
   * Stop the timer and record as success
   */
  stop(): number {
    this.endTime = performance.now();
    const duration = this.endTime - this.startTime;
    this.collector.recordTiming(this.name, duration, true, this.metadata);
    return duration;
  }

  /**
   * Stop the timer and record as failure
   */
  fail(error?: Error): number {
    this.endTime = performance.now();
    const duration = this.endTime - this.startTime;
    if (error) {
      this.metadata.error = error.message;
    }
    this.collector.recordTiming(this.name, duration, false, this.metadata);
    return duration;
  }

  /**
   * Get elapsed time without stopping
   */
  elapsed(): number {
    return performance.now() - this.startTime;
  }
}

// ============================================================================
// Performance Metrics Collector
// ============================================================================

/**
 * Collects and aggregates performance metrics
 */
export class PerformanceMetricsCollector {
  private timings = new Map<string, TimingMetric[]>();
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private errors = new Map<string, number>();
  private periodStart: number;
  private maxSamples: number;
  private enableLogging: boolean;
  private flushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: MetricsCollectorOptions = {}) {
    this.maxSamples = options.maxSamples ?? 1000;
    this.enableLogging = options.enableLogging ?? false;
    this.periodStart = Date.now();

    if (options.flushIntervalMs && options.flushIntervalMs > 0) {
      this.flushInterval = setInterval(() => {
        this.flush();
      }, options.flushIntervalMs);
    }
  }

  // -------------------------------------------------------------------------
  // Timing Methods
  // -------------------------------------------------------------------------

  /**
   * Start a timer for an operation
   */
  startTimer(name: string): PerformanceTimer {
    return new PerformanceTimer(name, this);
  }

  /**
   * Record a timing metric
   */
  recordTiming(
    name: string,
    durationMs: number,
    success: boolean = true,
    metadata?: Record<string, unknown>
  ): void {
    const now = Date.now();
    const metric: TimingMetric = {
      name,
      durationMs,
      startedAt: now - durationMs,
      endedAt: now,
      success,
      metadata,
    };

    let samples = this.timings.get(name);
    if (!samples) {
      samples = [];
      this.timings.set(name, samples);
    }

    samples.push(metric);

    // Trim old samples
    if (samples.length > this.maxSamples) {
      samples.shift();
    }

    if (this.enableLogging) {
      logger.debug('Timing recorded', { name, durationMs, success });
    }

    // Track errors
    if (!success) {
      this.incrementCounter(`${name}.errors`);
    }
  }

  /**
   * Measure an async operation
   */
  async measure<T>(
    name: string,
    operation: () => Promise<T>,
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const timer = this.startTimer(name);
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        timer.addMetadata(key, value);
      }
    }

    try {
      const result = await operation();
      timer.stop();
      return result;
    } catch (error) {
      timer.fail(error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Measure a sync operation
   */
  measureSync<T>(
    name: string,
    operation: () => T,
    metadata?: Record<string, unknown>
  ): T {
    const timer = this.startTimer(name);
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        timer.addMetadata(key, value);
      }
    }

    try {
      const result = operation();
      timer.stop();
      return result;
    } catch (error) {
      timer.fail(error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Get timing statistics for an operation
   */
  getTimingStats(name: string): MetricStats | null {
    const samples = this.timings.get(name);
    if (!samples || samples.length === 0) {
      return null;
    }

    return this.calculateStats(samples.map((s) => s.durationMs));
  }

  // -------------------------------------------------------------------------
  // Counter Methods
  // -------------------------------------------------------------------------

  /**
   * Increment a counter
   */
  incrementCounter(name: string, amount: number = 1): number {
    const current = this.counters.get(name) ?? 0;
    const newValue = current + amount;
    this.counters.set(name, newValue);
    return newValue;
  }

  /**
   * Get counter value
   */
  getCounter(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  /**
   * Reset a counter
   */
  resetCounter(name: string): void {
    this.counters.set(name, 0);
  }

  // -------------------------------------------------------------------------
  // Gauge Methods
  // -------------------------------------------------------------------------

  /**
   * Set a gauge value
   */
  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  /**
   * Get gauge value
   */
  getGauge(name: string): number | undefined {
    return this.gauges.get(name);
  }

  /**
   * Increment a gauge
   */
  incrementGauge(name: string, amount: number = 1): number {
    const current = this.gauges.get(name) ?? 0;
    const newValue = current + amount;
    this.gauges.set(name, newValue);
    return newValue;
  }

  /**
   * Decrement a gauge
   */
  decrementGauge(name: string, amount: number = 1): number {
    return this.incrementGauge(name, -amount);
  }

  // -------------------------------------------------------------------------
  // Error Tracking
  // -------------------------------------------------------------------------

  /**
   * Record an error
   */
  recordError(type: string, error?: Error): void {
    const count = this.errors.get(type) ?? 0;
    this.errors.set(type, count + 1);

    if (this.enableLogging && error) {
      logger.debug('Error recorded', { type, message: error.message });
    }
  }

  /**
   * Get error count
   */
  getErrorCount(type: string): number {
    return this.errors.get(type) ?? 0;
  }

  /**
   * Get total error count
   */
  getTotalErrors(): number {
    let total = 0;
    for (const count of this.errors.values()) {
      total += count;
    }
    return total;
  }

  // -------------------------------------------------------------------------
  // Summary and Export
  // -------------------------------------------------------------------------

  /**
   * Get performance summary
   */
  getSummary(): PerformanceSummary {
    const timingStats = new Map<string, MetricStats>();
    for (const [name, samples] of this.timings) {
      if (samples.length > 0) {
        timingStats.set(name, this.calculateStats(samples.map((s) => s.durationMs)));
      }
    }

    return {
      periodStart: this.periodStart,
      periodEnd: Date.now(),
      timings: timingStats,
      counters: new Map(this.counters),
      gauges: new Map(this.gauges),
      errors: new Map(this.errors),
    };
  }

  /**
   * Export metrics as JSON
   */
  exportAsJson(): string {
    const summary = this.getSummary();
    return JSON.stringify({
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      timings: Object.fromEntries(summary.timings),
      counters: Object.fromEntries(summary.counters),
      gauges: Object.fromEntries(summary.gauges),
      errors: Object.fromEntries(summary.errors),
    }, null, 2);
  }

  /**
   * Flush/log current metrics and reset period
   */
  flush(): void {
    if (this.enableLogging) {
      const summary = this.getSummary();
      logger.debug('Metrics flush', {
        durationMs: summary.periodEnd - summary.periodStart,
        timingCount: summary.timings.size,
        totalErrors: this.getTotalErrors(),
      });
    }
    this.periodStart = Date.now();
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.timings.clear();
    this.counters.clear();
    this.gauges.clear();
    this.errors.clear();
    this.periodStart = Date.now();
  }

  /**
   * Destroy the collector
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.reset();
  }

  // -------------------------------------------------------------------------
  // Private Methods
  // -------------------------------------------------------------------------

  /**
   * Calculate statistics for a set of values
   */
  private calculateStats(values: number[]): MetricStats {
    if (values.length === 0) {
      return {
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);

    return {
      count: values.length,
      sum,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: sum / values.length,
      p50: this.percentile(sorted, 0.5),
      p90: this.percentile(sorted, 0.9),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99),
    };
  }

  /**
   * Calculate percentile value
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0];

    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (upper >= sorted.length) return sorted[sorted.length - 1];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let metricsCollector: PerformanceMetricsCollector | null = null;

/**
 * Get or create the global metrics collector
 */
export function getMetricsCollector(options?: MetricsCollectorOptions): PerformanceMetricsCollector {
  if (!metricsCollector) {
    metricsCollector = new PerformanceMetricsCollector(options);
  }
  return metricsCollector;
}

/**
 * Reset the global metrics collector (for testing)
 */
export function resetMetricsCollector(): void {
  if (metricsCollector) {
    metricsCollector.destroy();
  }
  metricsCollector = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Start a timer
 */
export function startTimer(name: string): PerformanceTimer {
  return getMetricsCollector().startTimer(name);
}

/**
 * Record a timing
 */
export function recordTiming(
  name: string,
  durationMs: number,
  success: boolean = true
): void {
  getMetricsCollector().recordTiming(name, durationMs, success);
}

/**
 * Measure an async operation
 */
export async function measure<T>(
  name: string,
  operation: () => Promise<T>
): Promise<T> {
  return getMetricsCollector().measure(name, operation);
}

/**
 * Increment a counter
 */
export function incrementCounter(name: string, amount: number = 1): number {
  return getMetricsCollector().incrementCounter(name, amount);
}

/**
 * Set a gauge value
 */
export function setGauge(name: string, value: number): void {
  getMetricsCollector().setGauge(name, value);
}

/**
 * Record an error
 */
export function recordError(type: string, error?: Error): void {
  getMetricsCollector().recordError(type, error);
}

/**
 * Get performance summary
 */
export function getPerformanceSummary(): PerformanceSummary {
  return getMetricsCollector().getSummary();
}

// ============================================================================
// Decorator Helper
// ============================================================================

/**
 * Create a measured version of an async function
 */
export function withMetrics<T extends (...args: unknown[]) => Promise<unknown>>(
  name: string,
  fn: T
): T {
  return (async (...args: Parameters<T>) => {
    return getMetricsCollector().measure(name, () => fn(...args));
  }) as T;
}

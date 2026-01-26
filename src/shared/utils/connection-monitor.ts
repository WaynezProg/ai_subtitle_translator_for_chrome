/**
 * Connection Quality Monitor
 *
 * Monitors network connection quality and provides insights for
 * adaptive behavior in the translation service.
 *
 * Features:
 * - Network connectivity detection
 * - Latency measurement
 * - Connection quality scoring
 * - Adaptive timeout recommendations
 * - Event-based notifications
 */

import { createLogger } from './logger';

const log = createLogger('ConnectionMonitor');

// ============================================================================
// Types
// ============================================================================

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'offline';

export interface ConnectionState {
  /** Whether the browser reports online status */
  isOnline: boolean;
  /** Current connection quality assessment */
  quality: ConnectionQuality;
  /** Average latency in milliseconds */
  latencyMs: number;
  /** Latency variance (jitter) in milliseconds */
  jitterMs: number;
  /** Estimated bandwidth category */
  bandwidthCategory: 'high' | 'medium' | 'low' | 'unknown';
  /** Connection type from Network Information API */
  connectionType?: string;
  /** Effective connection type */
  effectiveType?: string;
  /** Last check timestamp */
  lastChecked: number;
  /** Number of consecutive failures */
  failureCount: number;
}

export interface ConnectionCheckResult {
  /** Whether the check succeeded */
  success: boolean;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Error if check failed */
  error?: string;
}

export interface ConnectionMonitorConfig {
  /** URL to ping for latency checks */
  pingUrl: string;
  /** Interval between automatic checks (ms) */
  checkIntervalMs: number;
  /** Timeout for ping requests (ms) */
  pingTimeoutMs: number;
  /** Number of samples for averaging */
  sampleCount: number;
  /** Enable automatic monitoring */
  autoMonitor: boolean;
  /** Quality thresholds (ms) */
  thresholds: {
    excellent: number;
    good: number;
    fair: number;
  };
}

type ConnectionChangeListener = (state: ConnectionState) => void;

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: ConnectionMonitorConfig = {
  pingUrl: 'https://www.google.com/generate_204', // Google's connectivity check URL
  checkIntervalMs: 30000, // 30 seconds
  pingTimeoutMs: 5000, // 5 seconds
  sampleCount: 5,
  autoMonitor: true,
  thresholds: {
    excellent: 100, // < 100ms
    good: 300, // < 300ms
    fair: 1000, // < 1000ms
    // > 1000ms = poor
  },
};

// ============================================================================
// Connection Quality Monitor
// ============================================================================

export class ConnectionMonitor {
  private config: ConnectionMonitorConfig;
  private state: ConnectionState;
  private latencySamples: number[] = [];
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<ConnectionChangeListener> = new Set();
  private initialized = false;

  constructor(config: Partial<ConnectionMonitorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  /**
   * Initialize the connection monitor
   */
  initialize(): void {
    if (this.initialized) return;

    // Set up online/offline listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }

    // Initial state from navigator
    this.state.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    // Get connection info from Network Information API
    this.updateNetworkInfo();

    // Start automatic monitoring
    if (this.config.autoMonitor) {
      this.startMonitoring();
    }

    this.initialized = true;
    log.debug('Connection monitor initialized', { isOnline: this.state.isOnline });
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Check if currently online
   */
  isOnline(): boolean {
    return this.state.isOnline;
  }

  /**
   * Get current connection quality
   */
  getQuality(): ConnectionQuality {
    return this.state.quality;
  }

  /**
   * Perform a single latency check
   */
  async checkLatency(): Promise<ConnectionCheckResult> {
    const startTime = performance.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.pingTimeoutMs);

      const response = await fetch(this.config.pingUrl, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const latencyMs = Math.round(performance.now() - startTime);

      if (!response.ok && response.status !== 204) {
        return {
          success: false,
          latencyMs,
          error: `HTTP ${response.status}`,
        };
      }

      return { success: true, latencyMs };
    } catch (error) {
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        success: false,
        latencyMs,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Run a full connection quality check
   */
  async checkConnection(): Promise<ConnectionState> {
    const result = await this.checkLatency();

    if (result.success) {
      this.addLatencySample(result.latencyMs);
      this.state.failureCount = 0;
      this.state.isOnline = true;
    } else {
      this.state.failureCount++;

      // Consider offline after 3 consecutive failures
      if (this.state.failureCount >= 3) {
        this.state.isOnline = false;
      }
    }

    this.updateQuality();
    this.state.lastChecked = Date.now();

    // Notify listeners if state changed significantly
    this.notifyListeners();

    return this.getState();
  }

  /**
   * Get recommended timeout based on current connection quality
   */
  getRecommendedTimeout(): number {
    switch (this.state.quality) {
      case 'excellent':
        return 30000; // 30 seconds
      case 'good':
        return 45000; // 45 seconds
      case 'fair':
        return 60000; // 60 seconds
      case 'poor':
        return 90000; // 90 seconds
      case 'offline':
        return 120000; // 2 minutes (may come back online)
      default:
        return 60000;
    }
  }

  /**
   * Get recommended chunk size based on connection quality
   */
  getRecommendedChunkSize(): number {
    switch (this.state.quality) {
      case 'excellent':
        return 50; // Full chunks
      case 'good':
        return 40;
      case 'fair':
        return 25;
      case 'poor':
        return 10;
      case 'offline':
        return 5; // Very small chunks
      default:
        return 30;
    }
  }

  /**
   * Check if it's safe to make API requests
   */
  canMakeRequests(): boolean {
    return this.state.isOnline && this.state.quality !== 'offline';
  }

  /**
   * Add a connection change listener
   */
  addListener(listener: ConnectionChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Remove a connection change listener
   */
  removeListener(listener: ConnectionChangeListener): void {
    this.listeners.delete(listener);
  }

  /**
   * Start automatic monitoring
   */
  startMonitoring(): void {
    if (this.checkInterval) return;

    // Initial check
    void this.checkConnection();

    this.checkInterval = setInterval(() => {
      void this.checkConnection();
    }, this.config.checkIntervalMs);

    log.debug('Started connection monitoring');
  }

  /**
   * Stop automatic monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    log.debug('Stopped connection monitoring');
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopMonitoring();
    this.listeners.clear();

    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }

    this.initialized = false;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private createInitialState(): ConnectionState {
    return {
      isOnline: true,
      quality: 'good',
      latencyMs: 0,
      jitterMs: 0,
      bandwidthCategory: 'unknown',
      lastChecked: 0,
      failureCount: 0,
    };
  }

  private handleOnline = (): void => {
    log.debug('Browser reports online');
    this.state.isOnline = true;
    this.state.failureCount = 0;

    // Check connection quality immediately
    void this.checkConnection();

    this.notifyListeners();
  };

  private handleOffline = (): void => {
    log.debug('Browser reports offline');
    this.state.isOnline = false;
    this.state.quality = 'offline';
    this.notifyListeners();
  };

  private updateNetworkInfo(): void {
    // Use Network Information API if available
    const connection = (navigator as Navigator & {
      connection?: {
        type?: string;
        effectiveType?: string;
        downlink?: number;
        rtt?: number;
      };
    }).connection;

    if (connection) {
      this.state.connectionType = connection.type;
      this.state.effectiveType = connection.effectiveType;

      // Map effective type to bandwidth category
      switch (connection.effectiveType) {
        case '4g':
          this.state.bandwidthCategory = 'high';
          break;
        case '3g':
          this.state.bandwidthCategory = 'medium';
          break;
        case '2g':
        case 'slow-2g':
          this.state.bandwidthCategory = 'low';
          break;
        default:
          this.state.bandwidthCategory = 'unknown';
      }

      // Use RTT if available
      if (connection.rtt) {
        this.addLatencySample(connection.rtt);
      }
    }
  }

  private addLatencySample(latencyMs: number): void {
    this.latencySamples.push(latencyMs);

    // Keep only recent samples
    while (this.latencySamples.length > this.config.sampleCount) {
      this.latencySamples.shift();
    }

    // Update average and jitter
    if (this.latencySamples.length > 0) {
      const sum = this.latencySamples.reduce((a, b) => a + b, 0);
      this.state.latencyMs = Math.round(sum / this.latencySamples.length);

      // Calculate jitter (variance)
      if (this.latencySamples.length > 1) {
        const squaredDiffs = this.latencySamples.map(
          (sample) => Math.pow(sample - this.state.latencyMs, 2)
        );
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;
        this.state.jitterMs = Math.round(Math.sqrt(variance));
      }
    }
  }

  private updateQuality(): void {
    if (!this.state.isOnline) {
      this.state.quality = 'offline';
      return;
    }

    const latency = this.state.latencyMs;

    if (latency <= 0) {
      // No data yet, assume good
      this.state.quality = 'good';
    } else if (latency < this.config.thresholds.excellent) {
      this.state.quality = 'excellent';
    } else if (latency < this.config.thresholds.good) {
      this.state.quality = 'good';
    } else if (latency < this.config.thresholds.fair) {
      this.state.quality = 'fair';
    } else {
      this.state.quality = 'poor';
    }

    // Adjust for high jitter (unreliable connection)
    if (this.state.jitterMs > latency * 0.5 && this.state.quality !== 'poor') {
      // High jitter relative to latency - downgrade quality
      const qualities: ConnectionQuality[] = ['excellent', 'good', 'fair', 'poor'];
      const currentIndex = qualities.indexOf(this.state.quality);
      if (currentIndex < qualities.length - 1) {
        this.state.quality = qualities[currentIndex + 1];
      }
    }
  }

  private notifyListeners(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (error) {
        log.error('Error in connection listener', error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let connectionMonitor: ConnectionMonitor | null = null;

/**
 * Get the global connection monitor instance
 */
export function getConnectionMonitor(): ConnectionMonitor {
  if (!connectionMonitor) {
    connectionMonitor = new ConnectionMonitor();
  }
  return connectionMonitor;
}

/**
 * Initialize the global connection monitor
 */
export function initConnectionMonitor(config?: Partial<ConnectionMonitorConfig>): ConnectionMonitor {
  if (connectionMonitor) {
    connectionMonitor.destroy();
  }
  connectionMonitor = new ConnectionMonitor(config);
  connectionMonitor.initialize();
  return connectionMonitor;
}

/**
 * Check if the network is currently available
 */
export function isNetworkAvailable(): boolean {
  return getConnectionMonitor().isOnline();
}

/**
 * Get current connection quality
 */
export function getConnectionQuality(): ConnectionQuality {
  return getConnectionMonitor().getQuality();
}

/**
 * Wait for network to become available
 */
export function waitForNetwork(timeoutMs = 30000): Promise<boolean> {
  const monitor = getConnectionMonitor();

  if (monitor.isOnline()) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      removeListener();
      resolve(false);
    }, timeoutMs);

    const removeListener = monitor.addListener((state) => {
      if (state.isOnline) {
        clearTimeout(timeout);
        removeListener();
        resolve(true);
      }
    });
  });
}

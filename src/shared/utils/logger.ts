/**
 * Production-safe Logger
 *
 * A configurable logging utility that:
 * - Reduces console logging overhead in production
 * - Provides structured logging with context
 * - Supports log levels and filtering
 * - Enables module-specific logging control
 *
 * Usage:
 * ```ts
 * import { createLogger } from './logger';
 * const log = createLogger('YouTubeAdapter');
 *
 * log.debug('Initializing...');
 * log.info('Found video', { videoId });
 * log.warn('Subtitle not found');
 * log.error('Failed to fetch', error);
 * ```
 */

// ============================================================================
// Types
// ============================================================================

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: Record<string, unknown>;
  error?: Error;
}

export interface LoggerConfig {
  /** Minimum log level to output */
  minLevel: LogLevel;
  /** Whether to include timestamps */
  timestamps: boolean;
  /** Whether to include module prefix */
  modulePrefix: boolean;
  /** Modules to enable (empty = all) */
  enabledModules: Set<string>;
  /** Modules to disable */
  disabledModules: Set<string>;
  /** Max data object depth for serialization */
  maxDepth: number;
  /** Custom log handler */
  handler?: (entry: LogEntry) => void;
}

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: Error | Record<string, unknown>): void;
  setLevel(level: LogLevel): void;
}

// ============================================================================
// Constants
// ============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

const LOG_COLORS: Record<LogLevel, string> = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m', // Green
  warn: '\x1b[33m', // Yellow
  error: '\x1b[31m', // Red
  none: '',
};

const RESET_COLOR = '\x1b[0m';

// ============================================================================
// Global Configuration
// ============================================================================

/**
 * Global logger configuration
 * Can be modified at runtime to change logging behavior
 */
export const loggerConfig: LoggerConfig = {
  // Production: only warn and error; Development: all
  minLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  timestamps: process.env.NODE_ENV !== 'production',
  modulePrefix: true,
  enabledModules: new Set(),
  disabledModules: new Set(),
  maxDepth: 3,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel, module: string): boolean {
  // Check level threshold
  if (LOG_LEVELS[level] < LOG_LEVELS[loggerConfig.minLevel]) {
    return false;
  }

  // Check module filtering
  if (loggerConfig.disabledModules.has(module)) {
    return false;
  }

  if (loggerConfig.enabledModules.size > 0 && !loggerConfig.enabledModules.has(module)) {
    return false;
  }

  return true;
}

/**
 * Format a log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
  const parts: string[] = [];

  // Timestamp
  if (loggerConfig.timestamps) {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    parts.push(`[${time}]`);
  }

  // Level
  parts.push(`[${entry.level.toUpperCase()}]`);

  // Module
  if (loggerConfig.modulePrefix) {
    parts.push(`[${entry.module}]`);
  }

  // Message
  parts.push(entry.message);

  return parts.join(' ');
}

/**
 * Safely serialize data for logging
 */
function serializeData(data: unknown, depth = 0): unknown {
  if (depth > loggerConfig.maxDepth) {
    return '[Max depth exceeded]';
  }

  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'function') {
    return '[Function]';
  }

  if (data instanceof Error) {
    return {
      name: data.name,
      message: data.message,
      stack: data.stack?.split('\n').slice(0, 5).join('\n'),
    };
  }

  if (Array.isArray(data)) {
    return data.slice(0, 10).map((item) => serializeData(item, depth + 1));
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    const entries = Object.entries(data as Record<string, unknown>).slice(0, 20);

    for (const [key, value] of entries) {
      result[key] = serializeData(value, depth + 1);
    }

    return result;
  }

  // Truncate long strings
  if (typeof data === 'string' && data.length > 500) {
    return data.substring(0, 500) + '... [truncated]';
  }

  return data;
}

// ============================================================================
// Logger Factory
// ============================================================================

/**
 * Create a logger instance for a specific module
 *
 * @param module - Module name (e.g., 'YouTubeAdapter', 'CacheManager')
 * @returns Logger instance
 */
export function createLogger(module: string): Logger {
  let moduleLevel: LogLevel | null = null;

  const log = (level: LogLevel, message: string, data?: Record<string, unknown>, error?: Error): void => {
    const effectiveLevel = moduleLevel ?? loggerConfig.minLevel;

    if (LOG_LEVELS[level] < LOG_LEVELS[effectiveLevel]) {
      return;
    }

    if (!shouldLog(level, module)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      module,
      message,
      data: data ? (serializeData(data) as Record<string, unknown>) : undefined,
      error,
    };

    // Use custom handler if provided
    if (loggerConfig.handler) {
      loggerConfig.handler(entry);
      return;
    }

    // Default console output
    const formattedMessage = formatLogEntry(entry);

    // Map log level to console method
    const consoleMethodMap: Record<LogLevel, keyof Pick<Console, 'log' | 'info' | 'warn' | 'error'>> = {
      debug: 'log',
      info: 'info',
      warn: 'warn',
      error: 'error',
      none: 'log', // Won't be used, but needed for type safety
    };
    const consoleMethod = consoleMethodMap[level];

    if (data || error) {
      const logData = { ...data };
      if (error) {
        logData.error = serializeData(error) as Record<string, unknown>;
      }
      console[consoleMethod](formattedMessage, logData);
    } else {
      console[consoleMethod](formattedMessage);
    }
  };

  return {
    debug(message: string, data?: Record<string, unknown>): void {
      log('debug', message, data);
    },

    info(message: string, data?: Record<string, unknown>): void {
      log('info', message, data);
    },

    warn(message: string, data?: Record<string, unknown>): void {
      log('warn', message, data);
    },

    error(message: string, errorOrData?: Error | Record<string, unknown>): void {
      if (errorOrData instanceof Error) {
        log('error', message, undefined, errorOrData);
      } else {
        log('error', message, errorOrData);
      }
    },

    setLevel(level: LogLevel): void {
      moduleLevel = level;
    },
  };
}

// ============================================================================
// Configuration Functions
// ============================================================================

/**
 * Set the global minimum log level
 */
export function setLogLevel(level: LogLevel): void {
  loggerConfig.minLevel = level;
}

/**
 * Enable logging for specific modules only
 */
export function enableModules(...modules: string[]): void {
  modules.forEach((m) => loggerConfig.enabledModules.add(m));
}

/**
 * Disable logging for specific modules
 */
export function disableModules(...modules: string[]): void {
  modules.forEach((m) => loggerConfig.disabledModules.add(m));
}

/**
 * Reset all module filters
 */
export function resetModuleFilters(): void {
  loggerConfig.enabledModules.clear();
  loggerConfig.disabledModules.clear();
}

/**
 * Set a custom log handler
 */
export function setLogHandler(handler: (entry: LogEntry) => void): void {
  loggerConfig.handler = handler;
}

/**
 * Remove the custom log handler
 */
export function clearLogHandler(): void {
  loggerConfig.handler = undefined;
}

// ============================================================================
// Development Utilities
// ============================================================================

/**
 * Temporarily enable all logging (useful for debugging)
 */
export function enableAllLogs(): void {
  loggerConfig.minLevel = 'debug';
  loggerConfig.enabledModules.clear();
  loggerConfig.disabledModules.clear();
}

/**
 * Disable all logging
 */
export function disableAllLogs(): void {
  loggerConfig.minLevel = 'none';
}

/**
 * Create a performance timer for measuring operation duration
 */
export function createTimer(module: string, operation: string): () => void {
  const logger = createLogger(module);
  const start = performance.now();

  return () => {
    const duration = performance.now() - start;
    logger.debug(`${operation} completed`, { durationMs: duration.toFixed(2) });
  };
}

// ============================================================================
// Default Loggers for Common Modules
// ============================================================================

export const backgroundLogger = createLogger('Background');
export const contentLogger = createLogger('Content');
export const cacheLogger = createLogger('Cache');
export const providerLogger = createLogger('Provider');

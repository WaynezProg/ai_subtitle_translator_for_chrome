/**
 * Logger Utilities
 *
 * Provides structured logging with levels, formatting, transports,
 * context, and performance tracking for the extension.
 */

// =============================================================================
// Types
// =============================================================================

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
  context?: string;
  data?: Record<string, unknown>;
  error?: Error;
  duration?: number;
}

export interface LoggerConfig {
  level: LogLevel;
  context?: string;
  enabled?: boolean;
  timestamp?: boolean;
  colors?: boolean;
  transports?: LogTransport[];
  format?: LogFormatter;
}

export type LogTransport = (entry: LogEntry) => void;
export type LogFormatter = (entry: LogEntry) => string;

// =============================================================================
// Log Level Utilities
// =============================================================================

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
  fatal: 5,
  silent: 6,
};

const LOG_COLORS: Record<LogLevel, string> = {
  trace: '\x1b[90m',  // Gray
  debug: '\x1b[36m',  // Cyan
  info: '\x1b[32m',   // Green
  warn: '\x1b[33m',   // Yellow
  error: '\x1b[31m',  // Red
  fatal: '\x1b[35m',  // Magenta
  silent: '',
};

const RESET_COLOR = '\x1b[0m';

/**
 * Check if a log level should be logged
 */
export function shouldLog(configLevel: LogLevel, messageLevel: LogLevel): boolean {
  return LOG_LEVELS[messageLevel] >= LOG_LEVELS[configLevel];
}

/**
 * Parse log level from string
 */
export function parseLogLevel(level: string): LogLevel {
  const normalized = level.toLowerCase() as LogLevel;
  return normalized in LOG_LEVELS ? normalized : 'info';
}

// =============================================================================
// Formatters
// =============================================================================

/**
 * Default log formatter
 */
export function defaultFormatter(entry: LogEntry): string {
  const parts: string[] = [];

  // Timestamp
  if (entry.timestamp) {
    const date = new Date(entry.timestamp);
    parts.push(`[${date.toISOString()}]`);
  }

  // Level
  parts.push(`[${entry.level.toUpperCase()}]`);

  // Context
  if (entry.context) {
    parts.push(`[${entry.context}]`);
  }

  // Message
  parts.push(entry.message);

  // Duration
  if (entry.duration !== undefined) {
    parts.push(`(${entry.duration.toFixed(2)}ms)`);
  }

  // Data
  if (entry.data && Object.keys(entry.data).length > 0) {
    parts.push(JSON.stringify(entry.data));
  }

  return parts.join(' ');
}

/**
 * JSON log formatter
 */
export function jsonFormatter(entry: LogEntry): string {
  return JSON.stringify({
    ...entry,
    timestamp: new Date(entry.timestamp).toISOString(),
    error: entry.error ? {
      name: entry.error.name,
      message: entry.error.message,
      stack: entry.error.stack,
    } : undefined,
  });
}

/**
 * Compact log formatter
 */
export function compactFormatter(entry: LogEntry): string {
  const levelChar = entry.level[0].toUpperCase();
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const ctx = entry.context ? `[${entry.context}]` : '';
  return `${levelChar} ${time} ${ctx} ${entry.message}`;
}

/**
 * Pretty log formatter with colors
 */
export function prettyFormatter(entry: LogEntry): string {
  const color = LOG_COLORS[entry.level];
  const parts: string[] = [];

  // Timestamp
  const time = new Date(entry.timestamp).toLocaleTimeString();
  parts.push(`\x1b[90m${time}${RESET_COLOR}`);

  // Level with color
  parts.push(`${color}${entry.level.toUpperCase().padEnd(5)}${RESET_COLOR}`);

  // Context
  if (entry.context) {
    parts.push(`\x1b[90m[${entry.context}]${RESET_COLOR}`);
  }

  // Message
  parts.push(entry.message);

  // Duration
  if (entry.duration !== undefined) {
    parts.push(`\x1b[90m(${entry.duration.toFixed(2)}ms)${RESET_COLOR}`);
  }

  // Data
  if (entry.data && Object.keys(entry.data).length > 0) {
    parts.push(`\n  ${color}→${RESET_COLOR} ${JSON.stringify(entry.data, null, 2)}`);
  }

  // Error
  if (entry.error) {
    parts.push(`\n  ${color}✗${RESET_COLOR} ${entry.error.stack || entry.error.message}`);
  }

  return parts.join(' ');
}

// =============================================================================
// Transports
// =============================================================================

/**
 * Console transport
 */
export function createConsoleTransport(useColors: boolean = true): LogTransport {
  return (entry: LogEntry) => {
    const formatter = useColors ? prettyFormatter : defaultFormatter;
    const message = formatter(entry);

    switch (entry.level) {
      case 'trace':
      case 'debug':
        console.debug(message);
        break;
      case 'info':
        console.info(message);
        break;
      case 'warn':
        console.warn(message);
        break;
      case 'error':
      case 'fatal':
        console.error(message);
        break;
    }
  };
}

/**
 * Memory transport (stores logs in array)
 */
export function createMemoryTransport(
  maxEntries: number = 1000
): LogTransport & { entries: LogEntry[]; clear: () => void } {
  const entries: LogEntry[] = [];

  const transport = ((entry: LogEntry) => {
    entries.push(entry);
    if (entries.length > maxEntries) {
      entries.shift();
    }
  }) as LogTransport & { entries: LogEntry[]; clear: () => void };

  transport.entries = entries;
  transport.clear = () => {
    entries.length = 0;
  };

  return transport;
}

/**
 * Callback transport
 */
export function createCallbackTransport(
  callback: (entry: LogEntry) => void
): LogTransport {
  return callback;
}

/**
 * Filter transport (only passes matching entries)
 */
export function createFilterTransport(
  transport: LogTransport,
  filter: (entry: LogEntry) => boolean
): LogTransport {
  return (entry: LogEntry) => {
    if (filter(entry)) {
      transport(entry);
    }
  };
}

/**
 * Batch transport (collects entries and flushes periodically)
 */
export function createBatchTransport(
  onFlush: (entries: LogEntry[]) => void,
  options: { maxSize?: number; flushInterval?: number } = {}
): LogTransport & { flush: () => void } {
  const { maxSize = 100, flushInterval = 5000 } = options;
  let batch: LogEntry[] = [];
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (batch.length > 0) {
      onFlush(batch);
      batch = [];
    }
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  const scheduleFlush = () => {
    if (!timeoutId) {
      timeoutId = setTimeout(flush, flushInterval);
    }
  };

  const transport = ((entry: LogEntry) => {
    batch.push(entry);
    if (batch.length >= maxSize) {
      flush();
    } else {
      scheduleFlush();
    }
  }) as LogTransport & { flush: () => void };

  transport.flush = flush;

  return transport;
}

// =============================================================================
// Logger Class
// =============================================================================

export class Logger {
  private config: Required<LoggerConfig>;
  private timers = new Map<string, number>();

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: config.level ?? 'info',
      context: config.context ?? '',
      enabled: config.enabled ?? true,
      timestamp: config.timestamp ?? true,
      colors: config.colors ?? true,
      transports: config.transports ?? [createConsoleTransport()],
      format: config.format ?? defaultFormatter,
    };
  }

  /**
   * Create a child logger with inherited config
   */
  child(context: string, overrides?: Partial<LoggerConfig>): Logger {
    const childContext = this.config.context
      ? `${this.config.context}:${context}`
      : context;

    return new Logger({
      ...this.config,
      ...overrides,
      context: childContext,
    });
  }

  /**
   * Set log level
   */
  setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * Enable/disable logging
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Add a transport
   */
  addTransport(transport: LogTransport): () => void {
    this.config.transports.push(transport);
    return () => {
      const index = this.config.transports.indexOf(transport);
      if (index !== -1) {
        this.config.transports.splice(index, 1);
      }
    };
  }

  /**
   * Log at trace level
   */
  trace(message: string, data?: Record<string, unknown>): void {
    this.log('trace', message, data);
  }

  /**
   * Log at debug level
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log('debug', message, data);
  }

  /**
   * Log at info level
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log('info', message, data);
  }

  /**
   * Log at warn level
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log('warn', message, data);
  }

  /**
   * Log at error level
   */
  error(message: string, error?: Error | Record<string, unknown>, data?: Record<string, unknown>): void {
    if (error instanceof Error) {
      this.log('error', message, data, error);
    } else {
      this.log('error', message, error);
    }
  }

  /**
   * Log at fatal level
   */
  fatal(message: string, error?: Error | Record<string, unknown>, data?: Record<string, unknown>): void {
    if (error instanceof Error) {
      this.log('fatal', message, data, error);
    } else {
      this.log('fatal', message, error);
    }
  }

  /**
   * Start a timer
   */
  time(label: string): void {
    this.timers.set(label, performance.now());
  }

  /**
   * End a timer and log the duration
   */
  timeEnd(label: string, message?: string, data?: Record<string, unknown>): number | null {
    const start = this.timers.get(label);
    if (start === undefined) {
      this.warn(`Timer '${label}' does not exist`);
      return null;
    }

    const duration = performance.now() - start;
    this.timers.delete(label);

    this.logWithDuration('debug', message || label, duration, data);
    return duration;
  }

  /**
   * Measure async function execution
   */
  async measure<T>(
    label: string,
    fn: () => Promise<T>,
    data?: Record<string, unknown>
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = performance.now() - start;
      this.logWithDuration('debug', label, duration, { ...data, success: true });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.logWithDuration('error', label, duration, { ...data, success: false }, error as Error);
      throw error;
    }
  }

  /**
   * Measure sync function execution
   */
  measureSync<T>(
    label: string,
    fn: () => T,
    data?: Record<string, unknown>
  ): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = performance.now() - start;
      this.logWithDuration('debug', label, duration, { ...data, success: true });
      return result;
    } catch (error) {
      const duration = performance.now() - start;
      this.logWithDuration('error', label, duration, { ...data, success: false }, error as Error);
      throw error;
    }
  }

  /**
   * Create a group of related logs
   */
  group(label: string): { end: () => void } {
    if (typeof console.group === 'function') {
      console.group(label);
    }
    return {
      end: () => {
        if (typeof console.groupEnd === 'function') {
          console.groupEnd();
        }
      },
    };
  }

  /**
   * Create a collapsed group
   */
  groupCollapsed(label: string): { end: () => void } {
    if (typeof console.groupCollapsed === 'function') {
      console.groupCollapsed(label);
    }
    return {
      end: () => {
        if (typeof console.groupEnd === 'function') {
          console.groupEnd();
        }
      },
    };
  }

  /**
   * Log a table
   */
  table(data: unknown[], columns?: string[]): void {
    if (this.config.enabled && typeof console.table === 'function') {
      console.table(data, columns);
    }
  }

  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
    error?: Error
  ): void {
    if (!this.config.enabled || !shouldLog(this.config.level, level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context: this.config.context || undefined,
      data,
      error,
    };

    this.config.transports.forEach((transport) => transport(entry));
  }

  private logWithDuration(
    level: LogLevel,
    message: string,
    duration: number,
    data?: Record<string, unknown>,
    error?: Error
  ): void {
    if (!this.config.enabled || !shouldLog(this.config.level, level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: Date.now(),
      context: this.config.context || undefined,
      data,
      error,
      duration,
    };

    this.config.transports.forEach((transport) => transport(entry));
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a logger instance
 */
export function createLogger(config?: Partial<LoggerConfig>): Logger {
  return new Logger(config);
}

/**
 * Create a silent logger (no output)
 */
export function createSilentLogger(): Logger {
  return new Logger({ level: 'silent', transports: [] });
}

/**
 * Create a debug logger
 */
export function createDebugLogger(context?: string): Logger {
  return new Logger({
    level: 'debug',
    context,
    colors: true,
  });
}

// =============================================================================
// Global Logger
// =============================================================================

let globalLogger: Logger | null = null;

/**
 * Get or create the global logger
 */
export function getGlobalLogger(): Logger {
  if (!globalLogger) {
    globalLogger = createLogger();
  }
  return globalLogger;
}

/**
 * Set the global logger
 */
export function setGlobalLogger(logger: Logger): void {
  globalLogger = logger;
}

/**
 * Configure the global logger
 */
export function configureGlobalLogger(config: Partial<LoggerConfig>): Logger {
  globalLogger = createLogger(config);
  return globalLogger;
}

// =============================================================================
// Convenience Functions
// =============================================================================

export const log = {
  trace: (message: string, data?: Record<string, unknown>) =>
    getGlobalLogger().trace(message, data),
  debug: (message: string, data?: Record<string, unknown>) =>
    getGlobalLogger().debug(message, data),
  info: (message: string, data?: Record<string, unknown>) =>
    getGlobalLogger().info(message, data),
  warn: (message: string, data?: Record<string, unknown>) =>
    getGlobalLogger().warn(message, data),
  error: (message: string, error?: Error | Record<string, unknown>) =>
    getGlobalLogger().error(message, error),
  fatal: (message: string, error?: Error | Record<string, unknown>) =>
    getGlobalLogger().fatal(message, error),
};

// =============================================================================
// Utilities
// =============================================================================

/**
 * Redact sensitive data from log entries
 */
export function redactSensitiveData(
  data: Record<string, unknown>,
  sensitiveKeys: string[] = ['password', 'token', 'apiKey', 'secret', 'authorization']
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const isLoweredSensitive = sensitiveKeys.some(
      (sk) => key.toLowerCase().includes(sk.toLowerCase())
    );

    if (isLoweredSensitive) {
      result[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = redactSensitiveData(value as Record<string, unknown>, sensitiveKeys);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Truncate long strings in log data
 */
export function truncateLogData(
  data: Record<string, unknown>,
  maxLength: number = 200
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.length > maxLength) {
      result[key] = value.slice(0, maxLength) + `... (${value.length} chars)`;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = truncateLogData(value as Record<string, unknown>, maxLength);
    } else if (Array.isArray(value) && value.length > 10) {
      result[key] = [...value.slice(0, 10), `... (${value.length} items)`];
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Create a scoped logger that adds prefix to all messages
 */
export function createScopedLogger(
  logger: Logger,
  scope: string
): Pick<Logger, 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'> {
  return {
    trace: (message: string, data?: Record<string, unknown>) =>
      logger.trace(`[${scope}] ${message}`, data),
    debug: (message: string, data?: Record<string, unknown>) =>
      logger.debug(`[${scope}] ${message}`, data),
    info: (message: string, data?: Record<string, unknown>) =>
      logger.info(`[${scope}] ${message}`, data),
    warn: (message: string, data?: Record<string, unknown>) =>
      logger.warn(`[${scope}] ${message}`, data),
    error: (message: string, error?: Error | Record<string, unknown>) =>
      logger.error(`[${scope}] ${message}`, error),
    fatal: (message: string, error?: Error | Record<string, unknown>) =>
      logger.fatal(`[${scope}] ${message}`, error),
  };
}

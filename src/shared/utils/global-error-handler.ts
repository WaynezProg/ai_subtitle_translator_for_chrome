/**
 * Global Error Handler
 *
 * Catches uncaught exceptions and unhandled promise rejections
 * to prevent the extension from crashing and provide meaningful
 * error reporting.
 */

import { createLogger } from './logger';
import { normalizeError, AppError, ErrorCodes } from './error-handler';

const log = createLogger('GlobalErrorHandler');

// ============================================================================
// Types
// ============================================================================

export interface GlobalErrorHandlerOptions {
  /** Callback when an error is caught */
  onError?: (error: AppError, source: 'error' | 'unhandledrejection') => void;

  /** Whether to show user-facing notifications for errors */
  showNotifications?: boolean;

  /** Notification callback (for content scripts) */
  notify?: (message: string, type: 'error' | 'warning') => void;

  /** Whether to report errors to an external service */
  reportErrors?: boolean;
}

// ============================================================================
// Implementation
// ============================================================================

let isInitialized = false;
let options: GlobalErrorHandlerOptions = {};

/**
 * Initialize global error handlers
 */
export function initGlobalErrorHandler(opts: GlobalErrorHandlerOptions = {}): void {
  if (isInitialized) {
    log.warn('Global error handler already initialized');
    return;
  }

  options = opts;

  // Handle uncaught errors
  window.addEventListener('error', handleError);

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', handleRejection);

  isInitialized = true;
  log.debug('Global error handler initialized');
}

/**
 * Clean up global error handlers
 */
export function destroyGlobalErrorHandler(): void {
  if (!isInitialized) return;

  window.removeEventListener('error', handleError);
  window.removeEventListener('unhandledrejection', handleRejection);

  isInitialized = false;
  log.debug('Global error handler destroyed');
}

/**
 * Handle uncaught errors
 */
function handleError(event: ErrorEvent): void {
  // Skip cross-origin script errors (limited info available)
  if (event.message === 'Script error.' && !event.filename) {
    log.debug('Ignoring cross-origin script error');
    return;
  }

  const appError = normalizeError(
    event.error || new Error(event.message),
    ErrorCodes.UNKNOWN_ERROR
  );

  log.error('Uncaught error', {
    message: appError.message,
    code: appError.code,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });

  processError(appError, 'error');
}

/**
 * Handle unhandled promise rejections
 */
function handleRejection(event: PromiseRejectionEvent): void {
  const appError = normalizeError(
    event.reason,
    ErrorCodes.UNKNOWN_ERROR
  );

  // Skip extension context invalidated errors - these are expected after extension updates
  // and the user just needs to refresh the page
  if (isExtensionContextError(appError.message)) {
    log.debug('Extension context invalidated - page refresh required');
    event.preventDefault();
    return;
  }

  log.error('Unhandled promise rejection', {
    message: appError.message,
    code: appError.code,
  });

  processError(appError, 'unhandledrejection');

  // Prevent default browser handling
  event.preventDefault();
}

/**
 * Check if the error is related to extension context being invalidated
 * This happens after extension updates when the old content script tries to communicate
 */
function isExtensionContextError(message: string): boolean {
  const contextErrorPatterns = [
    'Extension context invalidated',
    '擴充功能已更新',
    'Receiving end does not exist',
    'Could not establish connection',
    'The message port closed',
  ];
  return contextErrorPatterns.some(pattern => message.includes(pattern));
}

/**
 * Process caught error
 */
function processError(error: AppError, source: 'error' | 'unhandledrejection'): void {
  // Call user callback
  options.onError?.(error, source);

  // Show notification if enabled
  if (options.showNotifications && options.notify) {
    // Only show for critical errors to avoid notification spam
    if (error.severity === 'critical' || error.severity === 'high') {
      options.notify(error.userMessage, 'error');
    }
  }

  // Report error if enabled
  if (options.reportErrors) {
    reportError(error, source);
  }
}

/**
 * Report error to external service (placeholder)
 */
function reportError(error: AppError, source: string): void {
  // This is a placeholder for error reporting
  // In production, this could send to Sentry, LogRocket, etc.
  log.debug('Would report error', {
    code: error.code,
    message: error.message,
    category: error.category,
    severity: error.severity,
    source,
    timestamp: error.timestamp,
  });
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Wrap an async function with error boundary
 * Catches errors and prevents them from propagating as unhandled rejections
 */
export function withErrorBoundary<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  fallback?: R,
  onError?: (error: AppError) => void
): (...args: T) => Promise<R | typeof fallback> {
  return async (...args: T): Promise<R | typeof fallback> => {
    try {
      return await fn(...args);
    } catch (error) {
      const appError = normalizeError(error);
      log.error('Error caught by boundary', {
        message: appError.message,
        code: appError.code,
      });
      onError?.(appError);
      return fallback as typeof fallback;
    }
  };
}

/**
 * Safe wrapper for event handlers
 * Prevents errors from propagating and crashing the app
 */
export function safeHandler<T extends Event>(
  handler: (event: T) => void | Promise<void>
): (event: T) => void {
  return (event: T): void => {
    try {
      const result = handler(event);
      if (result instanceof Promise) {
        result.catch((error) => {
          const appError = normalizeError(error);
          log.error('Error in async event handler', {
            message: appError.message,
            code: appError.code,
            eventType: event.type,
          });
        });
      }
    } catch (error) {
      const appError = normalizeError(error);
      log.error('Error in event handler', {
        message: appError.message,
        code: appError.code,
        eventType: event.type,
      });
    }
  };
}

/**
 * Execute code with error recovery
 * Returns a tuple of [result, error] similar to Go's error handling pattern
 */
export async function tryAsync<T>(
  fn: () => Promise<T>
): Promise<[T, null] | [null, AppError]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (error) {
    return [null, normalizeError(error)];
  }
}

/**
 * Synchronous version of tryAsync
 */
export function trySync<T>(
  fn: () => T
): [T, null] | [null, AppError] {
  try {
    const result = fn();
    return [result, null];
  } catch (error) {
    return [null, normalizeError(error)];
  }
}

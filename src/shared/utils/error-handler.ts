/**
 * Centralized Error Handler
 *
 * Provides standardized error handling, categorization, and recovery strategies
 * across the extension.
 *
 * Features:
 * - Error categorization by severity and type
 * - Retry strategies with exponential backoff
 * - User-friendly error messages
 * - Error context preservation
 * - Analytics-ready error information
 */

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error categories for classification
 */
export type ErrorCategory =
  | 'network' // Network/connectivity issues
  | 'auth' // Authentication/authorization failures
  | 'provider' // Translation provider errors
  | 'platform' // Streaming platform adapter errors
  | 'cache' // Cache operation failures
  | 'parse' // Subtitle parsing errors
  | 'validation' // Input validation errors
  | 'unknown'; // Unclassified errors

/**
 * Error severity levels
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Retry strategy for recoverable errors
 */
export interface RetryStrategy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatuses?: number[];
}

/**
 * Extended error information
 */
export interface ErrorInfo {
  code: string;
  message: string;
  userMessage: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  retryStrategy?: RetryStrategy;
  context?: Record<string, unknown>;
  originalError?: Error;
  timestamp: string;
}

/**
 * Application error class with extended info
 */
export class AppError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly severity: ErrorSeverity;
  readonly userMessage: string;
  readonly retryable: boolean;
  readonly retryStrategy?: RetryStrategy;
  readonly context: Record<string, unknown>;
  readonly timestamp: string;

  constructor(
    code: string,
    message: string,
    options: {
      category?: ErrorCategory;
      severity?: ErrorSeverity;
      userMessage?: string;
      retryable?: boolean;
      retryStrategy?: RetryStrategy;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.category = options.category ?? 'unknown';
    this.severity = options.severity ?? 'medium';
    this.userMessage = options.userMessage ?? this.getDefaultUserMessage(code);
    this.retryable = options.retryable ?? false;
    this.retryStrategy = options.retryStrategy;
    this.context = options.context ?? {};
    this.timestamp = new Date().toISOString();
  }

  private getDefaultUserMessage(code: string): string {
    return ERROR_MESSAGES[code] ?? 'An unexpected error occurred. Please try again.';
  }

  toInfo(): ErrorInfo {
    return {
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      category: this.category,
      severity: this.severity,
      retryable: this.retryable,
      retryStrategy: this.retryStrategy,
      context: this.context,
      originalError: this.cause instanceof Error ? this.cause : undefined,
      timestamp: this.timestamp,
    };
  }
}

// ============================================================================
// Error Codes and Messages
// ============================================================================

/**
 * Standard error codes used throughout the application
 */
export const ErrorCodes = {
  // Network errors
  NETWORK_OFFLINE: 'NETWORK_OFFLINE',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',

  // Auth errors
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  AUTH_RATE_LIMITED: 'AUTH_RATE_LIMITED',

  // Provider errors
  PROVIDER_NOT_CONFIGURED: 'PROVIDER_NOT_CONFIGURED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_QUOTA_EXCEEDED: 'PROVIDER_QUOTA_EXCEEDED',
  PROVIDER_INVALID_RESPONSE: 'PROVIDER_INVALID_RESPONSE',
  PROVIDER_TRANSLATION_FAILED: 'PROVIDER_TRANSLATION_FAILED',

  // Platform errors
  PLATFORM_NOT_SUPPORTED: 'PLATFORM_NOT_SUPPORTED',
  PLATFORM_VIDEO_NOT_FOUND: 'PLATFORM_VIDEO_NOT_FOUND',
  PLATFORM_SUBTITLE_NOT_FOUND: 'PLATFORM_SUBTITLE_NOT_FOUND',
  PLATFORM_INJECTION_FAILED: 'PLATFORM_INJECTION_FAILED',
  PLATFORM_UPDATED: 'PLATFORM_UPDATED',

  // Cache errors
  CACHE_READ_ERROR: 'CACHE_READ_ERROR',
  CACHE_WRITE_ERROR: 'CACHE_WRITE_ERROR',
  CACHE_QUOTA_EXCEEDED: 'CACHE_QUOTA_EXCEEDED',

  // Parse errors
  PARSE_INVALID_FORMAT: 'PARSE_INVALID_FORMAT',
  PARSE_EMPTY_CONTENT: 'PARSE_EMPTY_CONTENT',
  PARSE_ENCODING_ERROR: 'PARSE_ENCODING_ERROR',

  // Validation errors
  VALIDATION_REQUIRED_FIELD: 'VALIDATION_REQUIRED_FIELD',
  VALIDATION_INVALID_VALUE: 'VALIDATION_INVALID_VALUE',

  // Generic errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  OPERATION_CANCELLED: 'OPERATION_CANCELLED',

  // Ollama specific errors
  OLLAMA_NOT_RUNNING: 'OLLAMA_NOT_RUNNING',
  OLLAMA_MODEL_NOT_FOUND: 'OLLAMA_MODEL_NOT_FOUND',
  OLLAMA_TIMEOUT: 'OLLAMA_TIMEOUT',
} as const;

/**
 * User-friendly error messages
 */
export const ERROR_MESSAGES: Record<string, string> = {
  [ErrorCodes.NETWORK_OFFLINE]: 'No internet connection. Please check your network and try again.',
  [ErrorCodes.NETWORK_TIMEOUT]: 'The request timed out. Please try again.',
  [ErrorCodes.NETWORK_ERROR]: 'A network error occurred. Please try again.',

  [ErrorCodes.AUTH_INVALID_CREDENTIALS]: 'Invalid API key or credentials. Please check your settings.',
  [ErrorCodes.AUTH_TOKEN_EXPIRED]: 'Your session has expired. Please sign in again.',
  [ErrorCodes.AUTH_UNAUTHORIZED]: 'Access denied. Please check your credentials.',
  [ErrorCodes.AUTH_RATE_LIMITED]: 'Too many requests. Please wait a moment and try again.',

  [ErrorCodes.PROVIDER_NOT_CONFIGURED]:
    'Translation provider not configured. Please set up your provider in settings.',
  [ErrorCodes.PROVIDER_UNAVAILABLE]: 'Translation service is temporarily unavailable. Please try again later.',
  [ErrorCodes.PROVIDER_QUOTA_EXCEEDED]:
    'API quota exceeded. Please check your usage limits or try a different provider.',
  [ErrorCodes.PROVIDER_INVALID_RESPONSE]: 'Received an invalid response from the translation service.',
  [ErrorCodes.PROVIDER_TRANSLATION_FAILED]: 'Translation failed. Please try again.',

  [ErrorCodes.PLATFORM_NOT_SUPPORTED]: 'This video platform is not supported.',
  [ErrorCodes.PLATFORM_VIDEO_NOT_FOUND]: 'Video not found. Please refresh the page.',
  [ErrorCodes.PLATFORM_SUBTITLE_NOT_FOUND]: 'No subtitles available for this video.',
  [ErrorCodes.PLATFORM_INJECTION_FAILED]: 'Failed to display subtitles. Please refresh the page.',
  [ErrorCodes.PLATFORM_UPDATED]: 'The platform may have been updated. Extension update may be required.',

  [ErrorCodes.CACHE_READ_ERROR]: 'Failed to read from cache.',
  [ErrorCodes.CACHE_WRITE_ERROR]: 'Failed to save to cache.',
  [ErrorCodes.CACHE_QUOTA_EXCEEDED]: 'Storage quota exceeded. Please clear some cached translations.',

  [ErrorCodes.PARSE_INVALID_FORMAT]: 'Invalid subtitle format.',
  [ErrorCodes.PARSE_EMPTY_CONTENT]: 'Subtitle content is empty.',
  [ErrorCodes.PARSE_ENCODING_ERROR]: 'Subtitle encoding error.',

  [ErrorCodes.VALIDATION_REQUIRED_FIELD]: 'Required field is missing.',
  [ErrorCodes.VALIDATION_INVALID_VALUE]: 'Invalid value provided.',

  [ErrorCodes.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.',
  [ErrorCodes.OPERATION_CANCELLED]: 'Operation was cancelled.',

  // Ollama specific messages
  [ErrorCodes.OLLAMA_NOT_RUNNING]: 'Ollama is not running. Please start Ollama and try again.',
  [ErrorCodes.OLLAMA_MODEL_NOT_FOUND]: 'Model not found. Please run "ollama pull <model>" first.',
  [ErrorCodes.OLLAMA_TIMEOUT]: 'Ollama connection timed out. Please ensure Ollama is running.',
};

// ============================================================================
// Retry Strategies
// ============================================================================

/**
 * Default retry strategies for different error types
 */
export const RetryStrategies: Record<string, RetryStrategy> = {
  network: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    retryableStatuses: [408, 429, 500, 502, 503, 504],
  },
  provider: {
    maxAttempts: 2,
    baseDelayMs: 2000,
    maxDelayMs: 8000,
    backoffMultiplier: 2,
    retryableStatuses: [429, 500, 502, 503],
  },
  rateLimit: {
    maxAttempts: 3,
    baseDelayMs: 5000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
  },
};

// ============================================================================
// Error Handler Functions
// ============================================================================

/**
 * Classify an error based on its type and content
 */
export function classifyError(error: unknown): {
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
} {
  if (error instanceof AppError) {
    return {
      category: error.category,
      severity: error.severity,
      retryable: error.retryable,
    };
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection') ||
      message.includes('offline')
    ) {
      return { category: 'network', severity: 'medium', retryable: true };
    }

    // Auth errors
    if (
      message.includes('unauthorized') ||
      message.includes('401') ||
      message.includes('403') ||
      message.includes('authentication')
    ) {
      return { category: 'auth', severity: 'high', retryable: false };
    }

    // Rate limiting
    if (message.includes('rate limit') || message.includes('429') || message.includes('too many')) {
      return { category: 'provider', severity: 'medium', retryable: true };
    }

    // Parse errors
    if (message.includes('parse') || message.includes('invalid') || message.includes('format')) {
      return { category: 'parse', severity: 'medium', retryable: false };
    }
  }

  return { category: 'unknown', severity: 'medium', retryable: false };
}

/**
 * Create an AppError from any error type
 */
export function normalizeError(error: unknown, defaultCode = ErrorCodes.UNKNOWN_ERROR): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const classification = classifyError(error);
  const message = error instanceof Error ? error.message : String(error);

  return new AppError(defaultCode, message, {
    ...classification,
    cause: error instanceof Error ? error : undefined,
  });
}

/**
 * Create a network error
 */
export function createNetworkError(message: string, cause?: Error): AppError {
  return new AppError(ErrorCodes.NETWORK_ERROR, message, {
    category: 'network',
    severity: 'medium',
    retryable: true,
    retryStrategy: RetryStrategies.network,
    cause,
  });
}

/**
 * Create an authentication error
 */
export function createAuthError(
  code: string = ErrorCodes.AUTH_UNAUTHORIZED,
  message: string,
  cause?: Error
): AppError {
  return new AppError(code, message, {
    category: 'auth',
    severity: 'high',
    retryable: false,
    cause,
  });
}

/**
 * Create a provider error
 */
export function createProviderError(
  code: string = ErrorCodes.PROVIDER_TRANSLATION_FAILED,
  message: string,
  options: { retryable?: boolean; cause?: Error; context?: Record<string, unknown> } = {}
): AppError {
  return new AppError(code, message, {
    category: 'provider',
    severity: 'medium',
    retryable: options.retryable ?? true,
    retryStrategy: options.retryable ? RetryStrategies.provider : undefined,
    cause: options.cause,
    context: options.context,
  });
}

/**
 * Create a platform adapter error
 */
export function createPlatformError(
  code: string,
  message: string,
  options: { platform?: string; cause?: Error } = {}
): AppError {
  return new AppError(code, message, {
    category: 'platform',
    severity: 'high',
    retryable: false,
    cause: options.cause,
    context: options.platform ? { platform: options.platform } : undefined,
  });
}

// ============================================================================
// Retry Utilities
// ============================================================================

/**
 * Calculate delay for retry attempt with exponential backoff
 */
export function calculateRetryDelay(attempt: number, strategy: RetryStrategy): number {
  const delay = strategy.baseDelayMs * Math.pow(strategy.backoffMultiplier, attempt - 1);
  // Add jitter (±10%)
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, strategy.maxDelayMs);
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  strategy: RetryStrategy,
  onRetry?: (attempt: number, error: Error, delay: number) => void
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt >= strategy.maxAttempts) {
        break;
      }

      // Check if error is retryable
      const classification = classifyError(error);
      if (!classification.retryable) {
        break;
      }

      // Calculate and wait for delay
      const delay = calculateRetryDelay(attempt, strategy);
      onRetry?.(attempt, lastError, delay);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Fetch with retry logic and timeout
 * Automatically retries on network errors and retryable HTTP status codes
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit & { timeout?: number } = {},
  retryOptions?: {
    strategy?: RetryStrategy;
    onRetry?: (attempt: number, error: Error, delay: number) => void;
  }
): Promise<Response> {
  const strategy = retryOptions?.strategy ?? RetryStrategies.network;
  const timeout = options.timeout ?? 30000;

  const fetchWithTimeout = async (): Promise<Response> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check if response status is retryable
      if (!response.ok && strategy.retryableStatuses?.includes(response.status)) {
        throw new AppError(ErrorCodes.NETWORK_ERROR, `HTTP ${response.status}: ${response.statusText}`, {
          category: 'network',
          severity: 'medium',
          retryable: true,
          context: { status: response.status, url },
        });
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // Handle abort error (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(ErrorCodes.NETWORK_TIMEOUT, 'Request timed out', {
          category: 'network',
          severity: 'medium',
          retryable: true,
          context: { timeout, url },
        });
      }

      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new AppError(ErrorCodes.NETWORK_ERROR, error.message, {
          category: 'network',
          severity: 'medium',
          retryable: true,
          cause: error,
          context: { url },
        });
      }

      throw error;
    }
  };

  return withRetry(fetchWithTimeout, strategy, retryOptions?.onRetry);
}

// ============================================================================
// Error Logging
// ============================================================================

/**
 * Log level for error logging
 */
export type ErrorLogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Log error with context (production-safe)
 */
export function logError(error: AppError | Error, level: ErrorLogLevel = 'error'): void {
  const info = error instanceof AppError ? error.toInfo() : normalizeError(error).toInfo();

  // In production, use structured logging
  if (process.env.NODE_ENV === 'production') {
    // Could send to analytics/monitoring service here
    console[level](`[${info.code}] ${info.message}`);
  } else {
    // In development, log full details
    console[level]('[Error]', info);
  }
}

// ============================================================================
// Error Recovery Suggestions
// ============================================================================

/**
 * Get recovery suggestions for an error
 */
export function getRecoverySuggestions(error: AppError | Error): string[] {
  const info = error instanceof AppError ? error : normalizeError(error);
  const suggestions: string[] = [];

  switch (info.category) {
    case 'network':
      suggestions.push('Check your internet connection');
      suggestions.push('Try refreshing the page');
      break;

    case 'auth':
      suggestions.push('Verify your API key in settings');
      suggestions.push('Sign in again if using subscription');
      break;

    case 'provider':
      suggestions.push('Try a different translation provider');
      suggestions.push('Check your API quota/usage');
      break;

    case 'platform':
      suggestions.push('Refresh the page');
      suggestions.push('Check for extension updates');
      break;

    case 'cache':
      suggestions.push('Clear the translation cache');
      suggestions.push('Try translating again');
      break;

    default:
      suggestions.push('Try again in a few moments');
      suggestions.push('Refresh the page if the problem persists');
  }

  return suggestions;
}

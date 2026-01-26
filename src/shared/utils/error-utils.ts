/**
 * Error Handling Utilities
 *
 * Provides structured error handling, custom error types, error categorization,
 * error serialization, and retry logic utilities for the extension.
 */

// =============================================================================
// Custom Error Classes
// =============================================================================

/**
 * Base error class with additional context
 */
export class AppError extends Error {
  readonly code: string;
  readonly context: Record<string, unknown>;
  readonly timestamp: number;
  readonly recoverable: boolean;

  constructor(
    message: string,
    options: {
      code?: string;
      context?: Record<string, unknown>;
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.code = options.code || 'UNKNOWN_ERROR';
    this.context = options.context || {};
    this.timestamp = Date.now();
    this.recoverable = options.recoverable ?? true;
    this.cause = options.cause;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      timestamp: this.timestamp,
      recoverable: this.recoverable,
      stack: this.stack,
      cause: this.cause instanceof Error ? this.cause.message : this.cause,
    };
  }
}

/**
 * Network-related errors
 */
export class NetworkError extends AppError {
  readonly statusCode?: number;
  readonly url?: string;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      url?: string;
      context?: Record<string, unknown>;
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message, {
      code: getNetworkErrorCode(options.statusCode),
      context: { ...options.context, statusCode: options.statusCode, url: options.url },
      recoverable: options.recoverable ?? isRetryableStatusCode(options.statusCode),
      cause: options.cause,
    });
    this.name = 'NetworkError';
    this.statusCode = options.statusCode;
    this.url = options.url;
  }
}

/**
 * Translation-related errors
 */
export class TranslationError extends AppError {
  readonly provider?: string;
  readonly targetLanguage?: string;

  constructor(
    message: string,
    options: {
      code?: string;
      provider?: string;
      targetLanguage?: string;
      context?: Record<string, unknown>;
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message, {
      code: options.code || 'TRANSLATION_ERROR',
      context: {
        ...options.context,
        provider: options.provider,
        targetLanguage: options.targetLanguage,
      },
      recoverable: options.recoverable ?? true,
      cause: options.cause,
    });
    this.name = 'TranslationError';
    this.provider = options.provider;
    this.targetLanguage = options.targetLanguage;
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  readonly field?: string;
  readonly value?: unknown;

  constructor(
    message: string,
    options: {
      field?: string;
      value?: unknown;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message, {
      code: 'VALIDATION_ERROR',
      context: { ...options.context, field: options.field },
      recoverable: false,
      cause: options.cause,
    });
    this.name = 'ValidationError';
    this.field = options.field;
    this.value = options.value;
  }
}

/**
 * Authentication/Authorization errors
 */
export class AuthError extends AppError {
  constructor(
    message: string,
    options: {
      code?: string;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message, {
      code: options.code || 'AUTH_ERROR',
      context: options.context,
      recoverable: false,
      cause: options.cause,
    });
    this.name = 'AuthError';
  }
}

/**
 * Storage-related errors
 */
export class StorageError extends AppError {
  readonly operation?: string;
  readonly key?: string;

  constructor(
    message: string,
    options: {
      operation?: string;
      key?: string;
      context?: Record<string, unknown>;
      recoverable?: boolean;
      cause?: Error;
    } = {}
  ) {
    super(message, {
      code: 'STORAGE_ERROR',
      context: { ...options.context, operation: options.operation, key: options.key },
      recoverable: options.recoverable ?? true,
      cause: options.cause,
    });
    this.name = 'StorageError';
    this.operation = options.operation;
    this.key = options.key;
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends AppError {
  readonly timeoutMs: number;

  constructor(
    message: string,
    options: {
      timeoutMs: number;
      context?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message, {
      code: 'TIMEOUT_ERROR',
      context: { ...options.context, timeoutMs: options.timeoutMs },
      recoverable: true,
      cause: options.cause,
    });
    this.name = 'TimeoutError';
    this.timeoutMs = options.timeoutMs;
  }
}

/**
 * Parser errors
 */
export class ParseError extends AppError {
  readonly format?: string;
  readonly position?: number;

  constructor(
    message: string,
    options: {
      format?: string;
      position?: number;
      context?: Record<string, unknown>;
      cause?: Error;
    } = {}
  ) {
    super(message, {
      code: 'PARSE_ERROR',
      context: { ...options.context, format: options.format, position: options.position },
      recoverable: false,
      cause: options.cause,
    });
    this.name = 'ParseError';
    this.format = options.format;
    this.position = options.position;
  }
}

// =============================================================================
// Error Categorization
// =============================================================================

export type ErrorCategory =
  | 'network'
  | 'translation'
  | 'validation'
  | 'auth'
  | 'storage'
  | 'timeout'
  | 'parse'
  | 'unknown';

/**
 * Categorize an error
 */
export function categorizeError(error: unknown): ErrorCategory {
  if (error instanceof NetworkError) return 'network';
  if (error instanceof TranslationError) return 'translation';
  if (error instanceof ValidationError) return 'validation';
  if (error instanceof AuthError) return 'auth';
  if (error instanceof StorageError) return 'storage';
  if (error instanceof TimeoutError) return 'timeout';
  if (error instanceof ParseError) return 'parse';

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('connection')
    ) {
      return 'network';
    }
    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }
    if (
      message.includes('auth') ||
      message.includes('unauthorized') ||
      message.includes('forbidden')
    ) {
      return 'auth';
    }
    if (message.includes('parse') || message.includes('syntax')) {
      return 'parse';
    }
  }

  return 'unknown';
}

/**
 * Check if an error is recoverable
 */
export function isRecoverableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.recoverable;
  }

  const category = categorizeError(error);
  return category === 'network' || category === 'timeout';
}

// =============================================================================
// Error Normalization
// =============================================================================

/**
 * Normalize any thrown value to an Error object
 */
export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  if (error && typeof error === 'object') {
    const message =
      'message' in error && typeof error.message === 'string'
        ? error.message
        : JSON.stringify(error);
    return new Error(message);
  }

  return new Error(String(error));
}

/**
 * Convert any error to AppError
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  const normalized = normalizeError(error);
  return new AppError(normalized.message, {
    cause: normalized,
    code: 'UNKNOWN_ERROR',
  });
}

// =============================================================================
// Error Serialization
// =============================================================================

export interface SerializedError {
  name: string;
  message: string;
  code?: string;
  context?: Record<string, unknown>;
  timestamp?: number;
  recoverable?: boolean;
  stack?: string;
  cause?: SerializedError | string;
}

/**
 * Serialize an error for storage or transmission
 */
export function serializeError(error: unknown): SerializedError {
  if (error instanceof AppError) {
    return error.toJSON() as SerializedError;
  }

  const normalized = normalizeError(error);
  return {
    name: normalized.name,
    message: normalized.message,
    stack: normalized.stack,
    cause: normalized.cause instanceof Error ? serializeError(normalized.cause) : undefined,
  };
}

/**
 * Deserialize an error from storage or transmission
 */
export function deserializeError(data: SerializedError): AppError {
  const error = new AppError(data.message, {
    code: data.code,
    context: data.context,
    recoverable: data.recoverable,
  });

  if (data.stack) {
    error.stack = data.stack;
  }

  return error;
}

// =============================================================================
// Error Wrapping
// =============================================================================

/**
 * Wrap an error with additional context
 */
export function wrapError(
  error: unknown,
  message: string,
  context?: Record<string, unknown>
): AppError {
  const normalized = normalizeError(error);
  return new AppError(message, {
    cause: normalized,
    context,
  });
}

/**
 * Create an error chain from multiple errors
 */
export function createErrorChain(errors: unknown[]): AppError {
  if (errors.length === 0) {
    return new AppError('No errors');
  }

  if (errors.length === 1) {
    return toAppError(errors[0]);
  }

  const messages = errors.map((e) => normalizeError(e).message);
  return new AppError(`Multiple errors: ${messages.join('; ')}`, {
    code: 'MULTIPLE_ERRORS',
    context: { errors: errors.map(serializeError) },
  });
}

// =============================================================================
// Safe Execution Utilities
// =============================================================================

/**
 * Result type for safe execution
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Create a success result
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Create a failure result
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

/**
 * Safely execute a function and return a Result
 */
export function trySafe<T>(fn: () => T): Result<T, Error> {
  try {
    return { ok: true, value: fn() };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

/**
 * Safely execute an async function and return a Result
 */
export async function trySafeAsync<T>(fn: () => Promise<T>): Promise<Result<T, Error>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error: normalizeError(error) };
  }
}

/**
 * Unwrap a Result, throwing if it's an error
 */
export function unwrap<T>(result: Result<T>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a Result with a default value
 */
export function unwrapOr<T>(result: Result<T>, defaultValue: T): T {
  return result.ok ? result.value : defaultValue;
}

/**
 * Map over a Result's value
 */
export function mapResult<T, U>(result: Result<T>, fn: (value: T) => U): Result<U> {
  if (result.ok) {
    return { ok: true, value: fn(result.value) };
  }
  return result;
}

/**
 * Map over a Result's error
 */
export function mapError<T, E1, E2>(
  result: Result<T, E1>,
  fn: (error: E1) => E2
): Result<T, E2> {
  if (result.ok) {
    return result;
  }
  return { ok: false, error: fn(result.error) };
}

// =============================================================================
// Error Aggregation
// =============================================================================

/**
 * Aggregate multiple results, collecting all errors
 */
export function aggregateResults<T>(results: Result<T>[]): Result<T[], Error[]> {
  const values: T[] = [];
  const errors: Error[] = [];

  for (const result of results) {
    if (result.ok) {
      values.push(result.value);
    } else {
      errors.push(result.error);
    }
  }

  return errors.length > 0 ? { ok: false, error: errors } : { ok: true, value: values };
}

/**
 * Collect results, returning first error or all values
 */
export function collectResults<T>(results: Result<T>[]): Result<T[]> {
  const values: T[] = [];

  for (const result of results) {
    if (!result.ok) {
      return result;
    }
    values.push(result.value);
  }

  return { ok: true, value: values };
}

// =============================================================================
// Error Assertion
// =============================================================================

/**
 * Assert a condition, throwing if false
 */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new AppError(message, { code: 'ASSERTION_ERROR', recoverable: false });
  }
}

/**
 * Assert a value is not null or undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new AppError(message, { code: 'ASSERTION_ERROR', recoverable: false });
  }
}

/**
 * Assert a value is never reached (exhaustive check)
 */
export function assertNever(value: never, message?: string): never {
  throw new AppError(message || `Unexpected value: ${value}`, {
    code: 'ASSERTION_ERROR',
    recoverable: false,
  });
}

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Format an error for user display
 */
export function formatErrorForUser(error: unknown): string {
  const category = categorizeError(error);
  const message = normalizeError(error).message;

  switch (category) {
    case 'network':
      return 'Unable to connect. Please check your internet connection and try again.';
    case 'timeout':
      return 'The request took too long. Please try again.';
    case 'auth':
      return 'Authentication required. Please sign in and try again.';
    case 'validation':
      return message;
    case 'translation':
      return 'Translation failed. Please try again later.';
    case 'storage':
      return 'Unable to save data. Please try again.';
    case 'parse':
      return 'Unable to process the data. The format may be incorrect.';
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

/**
 * Format an error for logging
 */
export function formatErrorForLog(error: unknown): string {
  const serialized = serializeError(error);
  const parts: string[] = [];

  parts.push(`[${serialized.name}]`);
  if (serialized.code) {
    parts.push(`(${serialized.code})`);
  }
  parts.push(serialized.message);

  if (serialized.context && Object.keys(serialized.context).length > 0) {
    parts.push(`| context: ${JSON.stringify(serialized.context)}`);
  }

  return parts.join(' ');
}

/**
 * Format error stack for display
 */
export function formatStack(error: Error): string[] {
  if (!error.stack) {
    return [];
  }

  return error.stack
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '));
}

// =============================================================================
// Error Handlers
// =============================================================================

export type ErrorHandler = (error: unknown) => void;
export type AsyncErrorHandler = (error: unknown) => Promise<void>;

/**
 * Create an error handler with logging
 */
export function createErrorHandler(
  name: string,
  onError?: ErrorHandler
): (error: unknown) => void {
  return (error: unknown) => {
    console.error(`[${name}]`, formatErrorForLog(error));
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    onError?.(error);
  };
}

/**
 * Create a global error handler for unhandled rejections
 */
export function createUnhandledRejectionHandler(onError?: ErrorHandler): (event: Event) => void {
  return (event: Event) => {
    const promiseEvent = event as PromiseRejectionEvent;
    const error = promiseEvent.reason;
    console.error('[UnhandledRejection]', formatErrorForLog(error));
    onError?.(error);
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

function getNetworkErrorCode(statusCode?: number): string {
  if (!statusCode) return 'NETWORK_ERROR';
  if (statusCode >= 500) return 'SERVER_ERROR';
  if (statusCode === 429) return 'RATE_LIMITED';
  if (statusCode === 404) return 'NOT_FOUND';
  if (statusCode === 403) return 'FORBIDDEN';
  if (statusCode === 401) return 'UNAUTHORIZED';
  if (statusCode >= 400) return 'CLIENT_ERROR';
  return 'NETWORK_ERROR';
}

function isRetryableStatusCode(statusCode?: number): boolean {
  if (!statusCode) return true;
  // Retry on server errors (5xx) and rate limiting (429)
  return statusCode >= 500 || statusCode === 429 || statusCode === 408;
}

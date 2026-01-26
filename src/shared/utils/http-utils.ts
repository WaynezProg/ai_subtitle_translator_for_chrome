/**
 * HTTP Client Utilities
 *
 * Provides a robust HTTP client with retries, interceptors, timeouts,
 * request/response transformations, and caching for the extension.
 */

// =============================================================================
// Types
// =============================================================================

export interface HttpRequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string | number | boolean>;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  cache?: RequestCache;
  credentials?: RequestCredentials;
  signal?: AbortSignal;
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer';
  validateStatus?: (status: number) => boolean;
}

export interface HttpResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
  config: HttpRequestConfig;
  url: string;
}

export interface HttpError extends Error {
  status?: number;
  statusText?: string;
  response?: HttpResponse;
  config?: HttpRequestConfig;
  code?: string;
}

export type RequestInterceptor = (
  config: HttpRequestConfig & { url: string }
) => HttpRequestConfig & { url: string } | Promise<HttpRequestConfig & { url: string }>;

export type ResponseInterceptor = (
  response: HttpResponse
) => HttpResponse | Promise<HttpResponse>;

export type ErrorInterceptor = (error: HttpError) => HttpError | Promise<HttpError | never>;

// =============================================================================
// HTTP Client Class
// =============================================================================

export class HttpClient {
  private baseUrl: string;
  private defaultConfig: HttpRequestConfig;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];

  constructor(
    baseUrl: string = '',
    defaultConfig: HttpRequestConfig = {}
  ) {
    this.baseUrl = baseUrl;
    this.defaultConfig = {
      method: 'GET',
      timeout: 30000,
      retries: 0,
      retryDelay: 1000,
      responseType: 'json',
      validateStatus: (status) => status >= 200 && status < 300,
      ...defaultConfig,
    };
  }

  /**
   * Add a request interceptor
   */
  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.requestInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Add a response interceptor
   */
  addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      const index = this.responseInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.responseInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Add an error interceptor
   */
  addErrorInterceptor(interceptor: ErrorInterceptor): () => void {
    this.errorInterceptors.push(interceptor);
    return () => {
      const index = this.errorInterceptors.indexOf(interceptor);
      if (index !== -1) {
        this.errorInterceptors.splice(index, 1);
      }
    };
  }

  /**
   * Make an HTTP request
   */
  async request<T = unknown>(
    url: string,
    config: HttpRequestConfig = {}
  ): Promise<HttpResponse<T>> {
    const mergedConfig = { ...this.defaultConfig, ...config };
    let fullUrl = this.buildUrl(url, mergedConfig.params);
    let processedConfig = { ...mergedConfig, url: fullUrl };

    // Apply request interceptors
    for (const interceptor of this.requestInterceptors) {
      processedConfig = await interceptor(processedConfig);
      fullUrl = processedConfig.url;
    }

    const { retries = 0, retryDelay = 1000 } = processedConfig;
    let lastError: HttpError | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        let response = await this.executeRequest<T>(fullUrl, processedConfig);

        // Apply response interceptors
        for (const interceptor of this.responseInterceptors) {
          response = await interceptor(response) as HttpResponse<T>;
        }

        return response;
      } catch (error) {
        lastError = error as HttpError;

        // Check if should retry
        if (attempt < retries && this.shouldRetry(lastError)) {
          await this.delay(retryDelay * Math.pow(2, attempt));
          continue;
        }

        // Apply error interceptors
        for (const interceptor of this.errorInterceptors) {
          lastError = await interceptor(lastError);
        }

        throw lastError;
      }
    }

    throw lastError;
  }

  private async executeRequest<T>(
    url: string,
    config: HttpRequestConfig
  ): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const timeoutId = config.timeout
      ? setTimeout(() => controller.abort(), config.timeout)
      : null;

    try {
      const fetchConfig: RequestInit = {
        method: config.method,
        headers: this.buildHeaders(config),
        credentials: config.credentials,
        cache: config.cache,
        signal: config.signal ?? controller.signal,
      };

      if (config.body !== undefined && config.method !== 'GET' && config.method !== 'HEAD') {
        fetchConfig.body = this.serializeBody(config.body);
      }

      const response = await fetch(url, fetchConfig);

      if (!config.validateStatus!(response.status)) {
        const error = this.createError(
          `Request failed with status ${response.status}`,
          response.status,
          response.statusText,
          config
        );
        throw error;
      }

      const data = await this.parseResponse<T>(response, config.responseType);

      return {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        config,
        url,
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  private buildUrl(url: string, params?: Record<string, string | number | boolean>): string {
    const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}${url}`;

    if (!params || Object.keys(params).length === 0) {
      return fullUrl;
    }

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      searchParams.append(key, String(value));
    }

    const separator = fullUrl.includes('?') ? '&' : '?';
    return `${fullUrl}${separator}${searchParams.toString()}`;
  }

  private buildHeaders(config: HttpRequestConfig): Headers {
    const headers = new Headers(config.headers);

    if (config.body !== undefined && !headers.has('Content-Type')) {
      if (typeof config.body === 'object' && !(config.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
      }
    }

    return headers;
  }

  private serializeBody(body: unknown): BodyInit {
    if (body instanceof FormData || body instanceof Blob || typeof body === 'string') {
      return body;
    }
    return JSON.stringify(body);
  }

  private async parseResponse<T>(
    response: Response,
    responseType?: string
  ): Promise<T> {
    switch (responseType) {
      case 'text':
        return (await response.text()) as T;
      case 'blob':
        return (await response.blob()) as T;
      case 'arrayBuffer':
        return (await response.arrayBuffer()) as T;
      case 'json':
      default: {
        const text = await response.text();
        if (!text) return undefined as T;
        try {
          return JSON.parse(text);
        } catch {
          return text as T;
        }
      }
    }
  }

  private shouldRetry(error: HttpError): boolean {
    // Retry on network errors or 5xx status codes
    if (!error.status) return true;
    return error.status >= 500 || error.status === 429;
  }

  private createError(
    message: string,
    status?: number,
    statusText?: string,
    config?: HttpRequestConfig
  ): HttpError {
    const error = new Error(message) as HttpError;
    error.name = 'HttpError';
    error.status = status;
    error.statusText = statusText;
    error.config = config;
    return error;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Convenience methods

  async get<T = unknown>(
    url: string,
    config?: HttpRequestConfig
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: 'GET' });
  }

  async post<T = unknown>(
    url: string,
    body?: unknown,
    config?: HttpRequestConfig
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: 'POST', body });
  }

  async put<T = unknown>(
    url: string,
    body?: unknown,
    config?: HttpRequestConfig
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: 'PUT', body });
  }

  async patch<T = unknown>(
    url: string,
    body?: unknown,
    config?: HttpRequestConfig
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: 'PATCH', body });
  }

  async delete<T = unknown>(
    url: string,
    config?: HttpRequestConfig
  ): Promise<HttpResponse<T>> {
    return this.request<T>(url, { ...config, method: 'DELETE' });
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an HTTP client instance
 */
export function createHttpClient(
  baseUrl: string = '',
  config?: HttpRequestConfig
): HttpClient {
  return new HttpClient(baseUrl, config);
}

// =============================================================================
// Request Builders
// =============================================================================

/**
 * Build URL with query parameters
 */
export function buildUrl(
  base: string,
  path: string = '',
  params?: Record<string, string | number | boolean | undefined>
): string {
  let url = base.endsWith('/') ? base.slice(0, -1) : base;
  if (path) {
    url += path.startsWith('/') ? path : `/${path}`;
  }

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }
  }

  return url;
}

/**
 * Build headers from object
 */
export function buildHeaders(
  headers: Record<string, string | undefined>
): Headers {
  const result = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value !== undefined) {
      result.set(key, value);
    }
  }
  return result;
}

// =============================================================================
// Request Helpers
// =============================================================================

/**
 * Create an abort controller with timeout
 */
export function createTimeoutController(timeoutMs: number): {
  controller: AbortController;
  clear: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    controller,
    clear: () => clearTimeout(timeoutId),
  };
}

/**
 * Simple fetch with timeout
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<Response> {
  const { controller, clear } = createTimeoutController(timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clear();
  }
}

/**
 * Fetch JSON with automatic parsing
 */
export async function fetchJson<T = unknown>(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<T> {
  const response = await fetchWithTimeout(url, options, timeoutMs);

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as HttpError;
    error.status = response.status;
    error.statusText = response.statusText;
    throw error;
  }

  return response.json();
}

/**
 * Post JSON data
 */
export async function postJson<T = unknown, R = unknown>(
  url: string,
  data: T,
  options: RequestInit = {},
  timeoutMs: number = 30000
): Promise<R> {
  const response = await fetchWithTimeout(
    url,
    {
      ...options,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(data),
    },
    timeoutMs
  );

  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as HttpError;
    error.status = response.status;
    error.statusText = response.statusText;
    throw error;
  }

  return response.json();
}

// =============================================================================
// Retry Logic
// =============================================================================

export interface RetryOptions {
  retries: number;
  retryDelay: number;
  retryOn?: (error: Error, attempt: number) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Fetch with retry logic
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = { retries: 3, retryDelay: 1000 }
): Promise<Response> {
  const { retries, retryDelay, retryOn, onRetry } = retryOptions;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Retry on 5xx errors by default
      if (!response.ok && response.status >= 500 && attempt < retries) {
        const error = new Error(`HTTP ${response.status}`) as HttpError;
        error.status = response.status;

        if (!retryOn || retryOn(error, attempt)) {
          onRetry?.(error, attempt);
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelay * Math.pow(2, attempt))
          );
          continue;
        }
      }

      return response;
    } catch (error) {
      if (attempt < retries && (!retryOn || retryOn(error as Error, attempt))) {
        onRetry?.(error as Error, attempt);
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay * Math.pow(2, attempt))
        );
        continue;
      }
      throw error;
    }
  }

  throw new Error('Max retries exceeded');
}

// =============================================================================
// Request Queue
// =============================================================================

interface QueuedRequest {
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * Request queue for rate limiting
 */
export class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  private concurrency: number;
  private activeCount = 0;
  private delayMs: number;

  constructor(options: { concurrency?: number; delayMs?: number } = {}) {
    this.concurrency = options.concurrency ?? 1;
    this.delayMs = options.delayMs ?? 0;
  }

  /**
   * Add a request to the queue
   */
  async add<T>(execute: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute: execute as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.activeCount >= this.concurrency) {
      return;
    }

    const request = this.queue.shift();
    if (!request) {
      return;
    }

    this.activeCount++;

    try {
      const result = await request.execute();
      request.resolve(result);
    } catch (error) {
      request.reject(error as Error);
    } finally {
      this.activeCount--;

      if (this.delayMs > 0 && this.queue.length > 0) {
        setTimeout(() => this.process(), this.delayMs);
      } else {
        this.process();
      }
    }
  }

  /**
   * Get queue length
   */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Get active request count
   */
  get active(): number {
    return this.activeCount;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    const requests = this.queue.splice(0);
    requests.forEach((req) => req.reject(new Error('Queue cleared')));
  }
}

// =============================================================================
// Response Helpers
// =============================================================================

/**
 * Check if response is JSON
 */
export function isJsonResponse(response: Response): boolean {
  const contentType = response.headers.get('Content-Type') || '';
  return contentType.includes('application/json');
}

/**
 * Get response size
 */
export function getResponseSize(response: Response): number | null {
  const contentLength = response.headers.get('Content-Length');
  return contentLength ? parseInt(contentLength, 10) : null;
}

/**
 * Parse Link header for pagination
 */
export function parseLinkHeader(linkHeader: string | null): Record<string, string> {
  const links: Record<string, string> = {};

  if (!linkHeader) return links;

  const parts = linkHeader.split(',');
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match) {
      links[match[2]] = match[1];
    }
  }

  return links;
}

/**
 * Extract error message from response
 */
export async function extractErrorMessage(response: Response): Promise<string> {
  try {
    if (isJsonResponse(response)) {
      const data = await response.json();
      return data.message || data.error || response.statusText;
    }
    return await response.text() || response.statusText;
  } catch {
    return response.statusText;
  }
}

// =============================================================================
// Common Interceptors
// =============================================================================

/**
 * Create auth header interceptor
 */
export function createAuthInterceptor(
  getToken: () => string | Promise<string | undefined> | undefined
): RequestInterceptor {
  return async (config) => {
    const token = await getToken();
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }
    return config;
  };
}

/**
 * Create logging interceptor
 */
export function createLoggingInterceptor(
  logger: (message: string, ...args: unknown[]) => void = console.log
): {
  request: RequestInterceptor;
  response: ResponseInterceptor;
  error: ErrorInterceptor;
} {
  return {
    request: (config) => {
      logger(`[HTTP] ${config.method} ${config.url}`);
      return config;
    },
    response: (response) => {
      logger(`[HTTP] ${response.status} ${response.url}`);
      return response;
    },
    error: (error) => {
      logger(`[HTTP] Error:`, error.message);
      return error;
    },
  };
}

/**
 * Create rate limit interceptor
 */
export function createRateLimitInterceptor(
  requestsPerSecond: number
): RequestInterceptor {
  let lastRequest = 0;
  const minInterval = 1000 / requestsPerSecond;

  return async (config) => {
    const now = Date.now();
    const elapsed = now - lastRequest;

    if (elapsed < minInterval) {
      await new Promise((resolve) =>
        setTimeout(resolve, minInterval - elapsed)
      );
    }

    lastRequest = Date.now();
    return config;
  };
}

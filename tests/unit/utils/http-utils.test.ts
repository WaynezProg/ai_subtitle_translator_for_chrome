/**
 * Tests for HTTP Client Utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  HttpClient,
  createHttpClient,
  buildUrl,
  buildHeaders,
  createTimeoutController,
  fetchWithTimeout,
  fetchJson,
  postJson,
  fetchWithRetry,
  RequestQueue,
  isJsonResponse,
  getResponseSize,
  parseLinkHeader,
  extractErrorMessage,
  createAuthInterceptor,
  createLoggingInterceptor,
  createRateLimitInterceptor,
} from '@shared/utils/http-utils';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('HTTP Utils', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('HttpClient', () => {
    let client: HttpClient;

    beforeEach(() => {
      client = new HttpClient('https://api.example.com');
    });

    describe('constructor', () => {
      it('should create client with base URL', () => {
        const client = createHttpClient('https://api.example.com');
        expect(client).toBeInstanceOf(HttpClient);
      });

      it('should create client with default config', () => {
        const client = createHttpClient('https://api.example.com', {
          timeout: 5000,
          headers: { 'X-Custom': 'value' },
        });
        expect(client).toBeInstanceOf(HttpClient);
      });
    });

    describe('request', () => {
      it('should make GET request', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          text: () => Promise.resolve('{"data":"test"}'),
        });

        const response = await client.get('/users');

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/users',
          expect.objectContaining({ method: 'GET' })
        );
        expect(response.data).toEqual({ data: 'test' });
      });

      it('should make POST request with body', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 201,
          statusText: 'Created',
          headers: new Headers(),
          text: () => Promise.resolve('{"id":1}'),
        });

        const response = await client.post('/users', { name: 'John' });

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/users',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ name: 'John' }),
          })
        );
        expect(response.data).toEqual({ id: 1 });
      });

      it('should add query parameters', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          text: () => Promise.resolve('[]'),
        });

        await client.get('/users', { params: { page: 1, limit: 10 } });

        expect(mockFetch).toHaveBeenCalledWith(
          'https://api.example.com/users?page=1&limit=10',
          expect.anything()
        );
      });

      it('should handle custom headers', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          text: () => Promise.resolve('{}'),
        });

        await client.get('/users', {
          headers: { Authorization: 'Bearer token' },
        });

        const [, options] = mockFetch.mock.calls[0];
        expect(options.headers.get('Authorization')).toBe('Bearer token');
      });

      it('should throw on error status', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          headers: new Headers(),
        });

        await expect(client.get('/users/999')).rejects.toThrow(
          'Request failed with status 404'
        );
      });

      it('should handle different response types', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          text: () => Promise.resolve('plain text'),
        });

        const response = await client.get('/text', { responseType: 'text' });

        expect(response.data).toBe('plain text');
      });
    });

    describe('interceptors', () => {
      it('should apply request interceptor', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          text: () => Promise.resolve('{}'),
        });

        client.addRequestInterceptor((config) => {
          config.headers = { ...config.headers, 'X-Intercepted': 'true' };
          return config;
        });

        await client.get('/users');

        const [, options] = mockFetch.mock.calls[0];
        expect(options.headers.get('X-Intercepted')).toBe('true');
      });

      it('should apply response interceptor', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          text: () => Promise.resolve('{"value":1}'),
        });

        client.addResponseInterceptor((response) => {
          response.data = { ...response.data as object, modified: true };
          return response;
        });

        const response = await client.get('/users');

        expect(response.data).toEqual({ value: 1, modified: true });
      });

      it('should apply error interceptor', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Server Error',
          headers: new Headers(),
        });

        client.addErrorInterceptor((error) => {
          error.message = 'Custom error: ' + error.message;
          return error;
        });

        await expect(client.get('/error')).rejects.toThrow('Custom error:');
      });

      it('should allow removing interceptors', async () => {
        const interceptor = vi.fn((config) => config);
        const remove = client.addRequestInterceptor(interceptor);

        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          text: () => Promise.resolve('{}'),
        });

        await client.get('/test1');
        expect(interceptor).toHaveBeenCalledTimes(1);

        remove();
        await client.get('/test2');
        expect(interceptor).toHaveBeenCalledTimes(1);
      });
    });

    describe('retry', () => {
      it('should retry on failure', async () => {
        vi.useRealTimers();

        mockFetch
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            text: () => Promise.resolve('{}'),
          });

        const response = await client.get('/users', { retries: 1, retryDelay: 10 });

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(response.status).toBe(200);

        vi.useFakeTimers();
      });

      it('should retry on 5xx status', async () => {
        vi.useRealTimers();

        mockFetch
          .mockResolvedValueOnce({
            ok: false,
            status: 500,
            statusText: 'Server Error',
            headers: new Headers(),
          })
          .mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            headers: new Headers(),
            text: () => Promise.resolve('{}'),
          });

        const response = await client.get('/users', { retries: 1, retryDelay: 10 });

        expect(mockFetch).toHaveBeenCalledTimes(2);
        expect(response.status).toBe(200);

        vi.useFakeTimers();
      });

      it('should not retry on 4xx status', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          headers: new Headers(),
        });

        await expect(client.get('/users', { retries: 2 })).rejects.toThrow();
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });
    });

    describe('convenience methods', () => {
      beforeEach(() => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          statusText: 'OK',
          headers: new Headers(),
          text: () => Promise.resolve('{}'),
        });
      });

      it('should have put method', async () => {
        await client.put('/users/1', { name: 'Updated' });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ method: 'PUT' })
        );
      });

      it('should have patch method', async () => {
        await client.patch('/users/1', { name: 'Patched' });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ method: 'PATCH' })
        );
      });

      it('should have delete method', async () => {
        await client.delete('/users/1');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ method: 'DELETE' })
        );
      });
    });
  });

  describe('buildUrl', () => {
    it('should combine base and path', () => {
      expect(buildUrl('https://api.example.com', '/users')).toBe(
        'https://api.example.com/users'
      );
    });

    it('should handle trailing slash', () => {
      expect(buildUrl('https://api.example.com/', '/users')).toBe(
        'https://api.example.com/users'
      );
    });

    it('should handle missing leading slash in path', () => {
      expect(buildUrl('https://api.example.com', 'users')).toBe(
        'https://api.example.com/users'
      );
    });

    it('should add query parameters', () => {
      expect(
        buildUrl('https://api.example.com', '/users', { page: 1, q: 'test' })
      ).toBe('https://api.example.com/users?page=1&q=test');
    });

    it('should skip undefined parameters', () => {
      expect(
        buildUrl('https://api.example.com', '/users', {
          page: 1,
          q: undefined,
        })
      ).toBe('https://api.example.com/users?page=1');
    });
  });

  describe('buildHeaders', () => {
    it('should create Headers from object', () => {
      const headers = buildHeaders({
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      });

      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('Authorization')).toBe('Bearer token');
    });

    it('should skip undefined values', () => {
      const headers = buildHeaders({
        'Content-Type': 'application/json',
        Authorization: undefined,
      });

      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.has('Authorization')).toBe(false);
    });
  });

  describe('createTimeoutController', () => {
    it('should create abort controller', () => {
      const { controller, clear } = createTimeoutController(5000);

      expect(controller).toBeInstanceOf(AbortController);
      expect(typeof clear).toBe('function');

      clear();
    });

    it('should abort after timeout', () => {
      const { controller } = createTimeoutController(100);

      vi.advanceTimersByTime(150);

      expect(controller.signal.aborted).toBe(true);
    });
  });

  describe('fetchWithTimeout', () => {
    it('should fetch with timeout', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const response = await fetchWithTimeout('https://example.com', {}, 5000);

      expect(response.ok).toBe(true);
    });
  });

  describe('fetchJson', () => {
    it('should fetch and parse JSON', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ data: 'test' }),
      });

      const data = await fetchJson('https://example.com/api');

      expect(data).toEqual({ data: 'test' });
    });

    it('should throw on error status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(fetchJson('https://example.com/api')).rejects.toThrow(
        'HTTP 404'
      );
    });
  });

  describe('postJson', () => {
    it('should post JSON and parse response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 1 }),
      });

      const data = await postJson('https://example.com/api', { name: 'Test' });

      expect(data).toEqual({ id: 1 });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ name: 'Test' }),
        })
      );
    });
  });

  describe('fetchWithRetry', () => {
    it('should retry on failure', async () => {
      vi.useRealTimers();

      mockFetch
        .mockRejectedValueOnce(new Error('Network'))
        .mockResolvedValueOnce({ ok: true });

      const response = await fetchWithRetry('https://example.com', {}, {
        retries: 2,
        retryDelay: 10,
      });

      expect(response.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      vi.useFakeTimers();
    });

    it('should call onRetry callback', async () => {
      vi.useRealTimers();

      const onRetry = vi.fn();

      mockFetch
        .mockRejectedValueOnce(new Error('Network'))
        .mockResolvedValueOnce({ ok: true });

      await fetchWithRetry('https://example.com', {}, {
        retries: 2,
        retryDelay: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalled();

      vi.useFakeTimers();
    });
  });

  describe('RequestQueue', () => {
    it('should queue requests', async () => {
      vi.useRealTimers();

      const queue = new RequestQueue({ concurrency: 1 });
      const results: number[] = [];

      await Promise.all([
        queue.add(async () => {
          await new Promise((r) => setTimeout(r, 10));
          results.push(1);
          return 1;
        }),
        queue.add(async () => {
          results.push(2);
          return 2;
        }),
      ]);

      expect(results).toEqual([1, 2]);

      vi.useFakeTimers();
    });

    it('should respect concurrency', async () => {
      vi.useRealTimers();

      const queue = new RequestQueue({ concurrency: 2 });
      let maxActive = 0;
      let currentActive = 0;

      const createTask = () => queue.add(async () => {
        currentActive++;
        maxActive = Math.max(maxActive, currentActive);
        await new Promise((r) => setTimeout(r, 10));
        currentActive--;
      });

      await Promise.all([createTask(), createTask(), createTask()]);

      expect(maxActive).toBeLessThanOrEqual(2);

      vi.useFakeTimers();
    });

    it('should track queue length', () => {
      const queue = new RequestQueue({ concurrency: 1 });

      expect(queue.length).toBe(0);

      queue.add(() => new Promise((r) => setTimeout(r, 1000)));
      queue.add(() => new Promise((r) => setTimeout(r, 1000)));

      expect(queue.length).toBe(1); // Second one is queued
    });

    it('should clear queue', async () => {
      const queue = new RequestQueue({ concurrency: 1 });

      const p1 = queue.add(() => new Promise((r) => setTimeout(r, 1000)));
      const p2 = queue.add(() => new Promise(() => {}));

      queue.clear();

      await expect(p2).rejects.toThrow('Queue cleared');
    });
  });

  describe('Response helpers', () => {
    describe('isJsonResponse', () => {
      it('should return true for JSON content type', () => {
        const response = {
          headers: new Headers({ 'Content-Type': 'application/json' }),
        } as Response;
        expect(isJsonResponse(response)).toBe(true);
      });

      it('should return false for non-JSON content type', () => {
        const response = {
          headers: new Headers({ 'Content-Type': 'text/html' }),
        } as Response;
        expect(isJsonResponse(response)).toBe(false);
      });
    });

    describe('getResponseSize', () => {
      it('should return content length', () => {
        const response = {
          headers: new Headers({ 'Content-Length': '1024' }),
        } as Response;
        expect(getResponseSize(response)).toBe(1024);
      });

      it('should return null if no content length', () => {
        const response = { headers: new Headers() } as Response;
        expect(getResponseSize(response)).toBe(null);
      });
    });

    describe('parseLinkHeader', () => {
      it('should parse Link header', () => {
        const links = parseLinkHeader(
          '<https://api.example.com/page=2>; rel="next", <https://api.example.com/page=5>; rel="last"'
        );

        expect(links.next).toBe('https://api.example.com/page=2');
        expect(links.last).toBe('https://api.example.com/page=5');
      });

      it('should return empty object for null', () => {
        expect(parseLinkHeader(null)).toEqual({});
      });
    });

    describe('extractErrorMessage', () => {
      it('should extract message from JSON response', async () => {
        const response = {
          headers: new Headers({ 'Content-Type': 'application/json' }),
          statusText: 'Bad Request',
          json: () => Promise.resolve({ message: 'Validation failed' }),
        } as unknown as Response;

        const message = await extractErrorMessage(response);
        expect(message).toBe('Validation failed');
      });

      it('should extract text from non-JSON response', async () => {
        const response = {
          headers: new Headers({ 'Content-Type': 'text/plain' }),
          statusText: 'Error',
          text: () => Promise.resolve('Something went wrong'),
        } as unknown as Response;

        const message = await extractErrorMessage(response);
        expect(message).toBe('Something went wrong');
      });
    });
  });

  describe('Interceptors', () => {
    describe('createAuthInterceptor', () => {
      it('should add auth header', async () => {
        const interceptor = createAuthInterceptor(() => 'my-token');
        const config = { url: '/test', headers: {} };

        const result = await interceptor(config);

        expect(result.headers?.Authorization).toBe('Bearer my-token');
      });

      it('should handle async token getter', async () => {
        const interceptor = createAuthInterceptor(async () => 'async-token');
        const config = { url: '/test', headers: {} };

        const result = await interceptor(config);

        expect(result.headers?.Authorization).toBe('Bearer async-token');
      });

      it('should skip if no token', async () => {
        const interceptor = createAuthInterceptor(() => undefined);
        const config = { url: '/test', headers: {} };

        const result = await interceptor(config);

        expect(result.headers?.Authorization).toBeUndefined();
      });
    });

    describe('createLoggingInterceptor', () => {
      it('should log requests and responses', () => {
        const logger = vi.fn();
        const { request, response } = createLoggingInterceptor(logger);

        request({ url: '/test', method: 'GET' });
        expect(logger).toHaveBeenCalledWith('[HTTP] GET /test');

        response({
          url: '/test',
          status: 200,
          statusText: 'OK',
          data: {},
          headers: new Headers(),
          config: {},
        });
        expect(logger).toHaveBeenCalledWith('[HTTP] 200 /test');
      });
    });

    describe('createRateLimitInterceptor', () => {
      it('should delay requests to respect rate limit', async () => {
        vi.useRealTimers();

        const interceptor = createRateLimitInterceptor(10); // 10 req/sec
        const config = { url: '/test' };

        const start = Date.now();
        await interceptor(config);
        await interceptor(config);
        const elapsed = Date.now() - start;

        expect(elapsed).toBeGreaterThanOrEqual(90); // ~100ms delay

        vi.useFakeTimers();
      });
    });
  });
});

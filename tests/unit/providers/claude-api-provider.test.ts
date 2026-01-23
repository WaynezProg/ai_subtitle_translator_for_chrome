/**
 * Claude API Provider Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeApiProvider } from '../../../src/shared/providers/claude-api-provider';
import type { TranslationRequest, CueInput } from '../../../src/shared/providers/types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ClaudeApiProvider', () => {
  let provider: ClaudeApiProvider;

  const createProvider = (apiKey = 'test-api-key') => {
    return new ClaudeApiProvider({
      type: 'claude-api',
      credentials: {
        type: 'api-key',
        encryptedApiKey: apiKey,
      },
      status: { state: 'configured' },
      configuredAt: new Date().toISOString(),
    });
  };

  beforeEach(() => {
    provider = createProvider();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with correct type', () => {
      expect(provider.type).toBe('claude-api');
    });

    it('should have display name', () => {
      expect(provider.displayName).toBe('Claude API');
    });

    it('should have multiple model options', () => {
      expect(provider.availableModels.length).toBeGreaterThan(0);
      expect(provider.availableModels.some(m => m.id.includes('haiku'))).toBe(true);
      expect(provider.availableModels.some(m => m.id.includes('sonnet'))).toBe(true);
    });

    it('should mark Claude 3.5 Haiku as recommended', () => {
      const haiku = provider.availableModels.find(m => m.id.includes('3-5-haiku'));
      expect(haiku?.recommended).toBe(true);
    });

    it('should throw error for invalid provider type', () => {
      expect(() => new ClaudeApiProvider({
        type: 'openai-api' as 'claude-api',
        credentials: { type: 'api-key', encryptedApiKey: 'test' },
        status: { state: 'configured' },
        configuredAt: new Date().toISOString(),
      })).toThrow('Invalid provider type');
    });

    it('should accept API key directly in config', () => {
      const providerWithDirectKey = new ClaudeApiProvider({
        type: 'claude-api',
        apiKey: 'direct-key',
        status: { state: 'configured' },
        configuredAt: new Date().toISOString(),
      } as Parameters<typeof ClaudeApiProvider['prototype']['constructor']>[0]);

      // Provider should be created without error
      expect(providerWithDirectKey.type).toBe('claude-api');
    });
  });

  describe('validateCredentials', () => {
    it('should return invalid when no API key', async () => {
      const emptyProvider = new ClaudeApiProvider({
        type: 'claude-api',
        credentials: { type: 'api-key', encryptedApiKey: '' },
        status: { state: 'unconfigured' },
        configuredAt: new Date().toISOString(),
      });

      const result = await emptyProvider.validateCredentials();

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_KEY');
    });

    it('should return valid on successful API call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [{ type: 'text', text: 'Hi' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      const result = await provider.validateCredentials();

      expect(result.valid).toBe(true);
    });

    it('should return invalid on 401 unauthorized', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Invalid API key' } }),
      });

      const result = await provider.validateCredentials();

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_KEY');
    });

    it('should return invalid on 429 rate limit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limited' } }),
      });

      const result = await provider.validateCredentials();

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INSUFFICIENT_QUOTA');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.validateCredentials();

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error('Invalid JSON'); },
      });

      const result = await provider.validateCredentials();

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
    });
  });

  describe('translate', () => {
    const createRequest = (cues: CueInput[]): TranslationRequest => ({
      cues,
      sourceLanguage: 'en',
      targetLanguage: 'zh-TW',
      model: 'claude-3-5-haiku-20241022',
    });

    it('should translate cues successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          content: [{ type: 'text', text: '[0] 你好\n[1] 世界' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      });

      const request = createRequest([
        { index: 0, text: 'Hello' },
        { index: 1, text: 'World' },
      ]);
      const result = await provider.translate(request);

      expect(result.cues).toHaveLength(2);
      expect(result.cues[0].translatedText).toBe('你好');
      expect(result.cues[1].translatedText).toBe('世界');
    });

    it('should include token usage', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          content: [{ type: 'text', text: '[0] 測試' }],
          usage: { input_tokens: 150, output_tokens: 25 },
        }),
      });

      const request = createRequest([{ index: 0, text: 'Test' }]);
      const result = await provider.translate(request);

      expect(result.usage.inputTokens).toBe(150);
      expect(result.usage.outputTokens).toBe(25);
    });

    it('should handle missing translations with fallback', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          content: [{ type: 'text', text: '[0] 翻譯' }], // Missing [1]
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
      });

      const request = createRequest([
        { index: 0, text: 'Translated' },
        { index: 1, text: 'Missing' },
      ]);
      const result = await provider.translate(request);

      expect(result.cues).toHaveLength(2);
      expect(result.cues[1].translatedText).toBe('Missing'); // Falls back to original
      expect(result.warnings).toContain('Missing translation for cue 1');
    });

    it('should throw AUTHENTICATION_FAILED on 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Unauthorized' } }),
      });

      const request = createRequest([{ index: 0, text: 'Test' }]);

      await expect(provider.translate(request)).rejects.toMatchObject({
        code: 'AUTHENTICATION_FAILED',
        retryable: false,
      });
    });

    it('should throw RATE_LIMITED on 429', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers({ 'retry-after': '30' }),
        json: async () => ({ error: { message: 'Too many requests' } }),
      });

      const request = createRequest([{ index: 0, text: 'Test' }]);

      await expect(provider.translate(request)).rejects.toMatchObject({
        code: 'RATE_LIMITED',
        retryable: true,
        retryAfter: 30,
      });
    });

    it('should throw CONTEXT_LENGTH_EXCEEDED on 400 with invalid_request_error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({
          error: { type: 'invalid_request_error', message: 'Too many tokens' },
        }),
      });

      const request = createRequest([{ index: 0, text: 'Test' }]);

      await expect(provider.translate(request)).rejects.toMatchObject({
        code: 'CONTEXT_LENGTH_EXCEEDED',
      });
    });

    it('should throw SERVICE_UNAVAILABLE on 5xx errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        headers: new Headers(),
        json: async () => ({ error: { message: 'Service unavailable' } }),
      });

      const request = createRequest([{ index: 0, text: 'Test' }]);

      await expect(provider.translate(request)).rejects.toMatchObject({
        code: 'SERVICE_UNAVAILABLE',
        retryable: true,
      });
    });

    it('should use default model when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          content: [{ type: 'text', text: '[0] 測試' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      const request: TranslationRequest = {
        cues: [{ index: 0, text: 'Test' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: '', // No model specified
      };

      await provider.translate(request);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Should use first model (recommended)
      expect(requestBody.model).toBe('claude-3-5-haiku-20241022');
    });

    it('should include character glossary in prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          content: [{ type: 'text', text: '[0] 約翰說你好' }],
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
      });

      const request: TranslationRequest = {
        cues: [{ index: 0, text: 'John says hello' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'claude-3-5-haiku-20241022',
        characterGlossary: { John: '約翰' },
      };

      await provider.translate(request);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content).toContain('John');
      expect(requestBody.messages[0].content).toContain('約翰');
    });

    it('should include previous context', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          content: [{ type: 'text', text: '[0] 繼續' }],
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
      });

      const request: TranslationRequest = {
        cues: [{ index: 0, text: 'Continue' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'claude-3-5-haiku-20241022',
        previousContext: {
          previousCues: [
            { original: 'Hello', translated: '你好' },
          ],
          characters: {},
        },
      };

      await provider.translate(request);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content).toContain('Hello');
      expect(requestBody.messages[0].content).toContain('你好');
    });

    it('should include custom instructions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          content: [{ type: 'text', text: '[0] 測試' }],
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
      });

      const request: TranslationRequest = {
        cues: [{ index: 0, text: 'Test' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'claude-3-5-haiku-20241022',
        customInstructions: 'Use formal language only',
      };

      await provider.translate(request);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content).toContain('Use formal language only');
    });

    it('should build context for next chunk', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          content: [{ type: 'text', text: '[0] 你好\n[1] 世界' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      });

      const request = createRequest([
        { index: 0, text: 'Hello' },
        { index: 1, text: 'World' },
      ]);
      const result = await provider.translate(request);

      expect(result.context).toBeDefined();
      expect(result.context.previousCues.length).toBeGreaterThan(0);
    });

    it('should remove speaker markers from translated text', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          content: [{ type: 'text', text: '[0] [John] 你好' }],
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
      });

      const request: TranslationRequest = {
        cues: [{ index: 0, text: 'Hello', speaker: 'John' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'claude-3-5-haiku-20241022',
      };
      const result = await provider.translate(request);

      // Speaker marker should be removed from translated text
      expect(result.cues[0].translatedText).toBe('你好');
    });
  });

  describe('translateStream', () => {
    it('should provide progress updates', async () => {
      // Create a mock readable stream
      const encoder = new TextEncoder();
      const streamChunks = [
        'data: {"type":"content_block_start","index":0}\n\n',
        'data: {"type":"content_block_delta","delta":{"text":"[0] 你好"}}\n\n',
        'data: {"type":"content_block_delta","delta":{"text":"\\n[1] 世界"}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ];

      let chunkIndex = 0;
      const mockStream = new ReadableStream({
        pull(controller) {
          if (chunkIndex < streamChunks.length) {
            controller.enqueue(encoder.encode(streamChunks[chunkIndex]));
            chunkIndex++;
          } else {
            controller.close();
          }
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        body: mockStream,
      });

      const onProgress = vi.fn();
      const request: TranslationRequest = {
        cues: [
          { index: 0, text: 'Hello' },
          { index: 1, text: 'World' },
        ],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'claude-3-5-haiku-20241022',
      };

      const result = await provider.translateStream(request, onProgress);

      expect(onProgress).toHaveBeenCalled();
      expect(result.cues).toHaveLength(2);
    });

    it('should throw error when no response body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        body: null,
      });

      const request: TranslationRequest = {
        cues: [{ index: 0, text: 'Test' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'claude-3-5-haiku-20241022',
      };

      await expect(
        provider.translateStream(request, vi.fn())
      ).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return default status when no recent info', async () => {
      const status = await provider.getRateLimitStatus();

      expect(status.requestsRemaining).toBe(1000);
      expect(status.tokensRemaining).toBe(100000);
      expect(status.isLimited).toBe(false);
    });

    it('should return cached status after request', async () => {
      // Make a request that updates rate limit info
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'x-ratelimit-limit-requests': '500',
          'x-ratelimit-limit-tokens': '50000',
        }),
        json: async () => ({
          content: [{ type: 'text', text: '[0] Test' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      await provider.translate({
        cues: [{ index: 0, text: 'Test' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'claude-3-5-haiku-20241022',
      });

      const status = await provider.getRateLimitStatus();

      expect(status.requestsRemaining).toBe(500);
      expect(status.tokensRemaining).toBe(50000);
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost based on cue count and character average', () => {
      const estimate = provider.estimateCost(100, 50);

      expect(estimate.estimatedInputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedOutputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedCostUSD).toBeGreaterThan(0);
      expect(estimate.costRange.min).toBeLessThan(estimate.costRange.max);
    });

    it('should provide reasonable range', () => {
      const estimate = provider.estimateCost(100, 50);

      // Min should be 80% of estimated
      expect(estimate.costRange.min).toBeCloseTo(estimate.estimatedCostUSD * 0.8, 5);
      // Max should be 150% of estimated
      expect(estimate.costRange.max).toBeCloseTo(estimate.estimatedCostUSD * 1.5, 5);
    });

    it('should return higher cost for more cues', () => {
      const smallEstimate = provider.estimateCost(10, 50);
      const largeEstimate = provider.estimateCost(100, 50);

      expect(largeEstimate.estimatedCostUSD).toBeGreaterThan(smallEstimate.estimatedCostUSD);
    });
  });

  describe('API request format', () => {
    it('should include correct headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          content: [{ type: 'text', text: '[0] Test' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      await provider.translate({
        cues: [{ index: 0, text: 'Test' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'claude-3-5-haiku-20241022',
      });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['x-api-key']).toBe('test-api-key');
      expect(headers['anthropic-version']).toBe('2023-06-01');
    });

    it('should set max_tokens to 8192', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          content: [{ type: 'text', text: '[0] Test' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      await provider.translate({
        cues: [{ index: 0, text: 'Test' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'claude-3-5-haiku-20241022',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(8192);
    });
  });
});

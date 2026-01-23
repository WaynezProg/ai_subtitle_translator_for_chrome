/**
 * OpenAI API Provider Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIApiProvider } from '../../../src/shared/providers/openai-api-provider';
import type { TranslationRequest, CueInput } from '../../../src/shared/providers/types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OpenAIApiProvider', () => {
  let provider: OpenAIApiProvider;

  const createProvider = (apiKey = 'test-api-key') => {
    return new OpenAIApiProvider({
      type: 'openai-api',
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
      expect(provider.type).toBe('openai-api');
    });

    it('should have display name', () => {
      expect(provider.displayName).toBe('OpenAI API');
    });

    it('should have multiple model options', () => {
      expect(provider.availableModels.length).toBeGreaterThan(0);
      expect(provider.availableModels.some(m => m.id === 'gpt-4o-mini')).toBe(true);
      expect(provider.availableModels.some(m => m.id === 'gpt-4o')).toBe(true);
      expect(provider.availableModels.some(m => m.id === 'gpt-4-turbo')).toBe(true);
      expect(provider.availableModels.some(m => m.id === 'gpt-3.5-turbo')).toBe(true);
    });

    it('should mark GPT-4o Mini as recommended', () => {
      const gpt4oMini = provider.availableModels.find(m => m.id === 'gpt-4o-mini');
      expect(gpt4oMini?.recommended).toBe(true);
    });

    it('should throw error for invalid provider type', () => {
      expect(() => new OpenAIApiProvider({
        type: 'claude-api' as 'openai-api',
        credentials: { type: 'api-key', encryptedApiKey: 'test' },
        status: { state: 'configured' },
        configuredAt: new Date().toISOString(),
      })).toThrow('Invalid provider type');
    });

    it('should accept API key directly in config', () => {
      const providerWithDirectKey = new OpenAIApiProvider({
        type: 'openai-api',
        apiKey: 'direct-key',
        status: { state: 'configured' },
        configuredAt: new Date().toISOString(),
      } as Parameters<typeof OpenAIApiProvider['prototype']['constructor']>[0]);

      expect(providerWithDirectKey.type).toBe('openai-api');
    });
  });

  describe('validateCredentials', () => {
    it('should return invalid when no API key', async () => {
      const emptyProvider = new OpenAIApiProvider({
        type: 'openai-api',
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
        json: async () => ({ data: [{ id: 'gpt-4o' }] }),
      });

      const result = await provider.validateCredentials();

      expect(result.valid).toBe(true);
    });

    it('should call models endpoint to validate key', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await provider.validateCredentials();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/models'),
        expect.objectContaining({ method: 'GET' })
      );
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
  });

  describe('translate', () => {
    const createRequest = (cues: CueInput[]): TranslationRequest => ({
      cues,
      sourceLanguage: 'en',
      targetLanguage: 'zh-TW',
      model: 'gpt-4o-mini',
    });

    it('should translate cues successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: '[0] 你好\n[1] 世界' } }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
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
          choices: [{ message: { content: '[0] 測試' } }],
          usage: { prompt_tokens: 150, completion_tokens: 25 },
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
          choices: [{ message: { content: '[0] 翻譯' } }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
      });

      const request = createRequest([
        { index: 0, text: 'Translated' },
        { index: 1, text: 'Missing' },
      ]);
      const result = await provider.translate(request);

      expect(result.cues).toHaveLength(2);
      expect(result.cues[1].translatedText).toBe('Missing');
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

    it('should throw CONTEXT_LENGTH_EXCEEDED on 400 with code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({
          error: { code: 'context_length_exceeded', message: 'Too many tokens' },
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
          choices: [{ message: { content: '[0] 測試' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      const request: TranslationRequest = {
        cues: [{ index: 0, text: 'Test' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: '',
      };

      await provider.translate(request);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.model).toBe('gpt-4o-mini');
    });

    it('should include character glossary in system message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: '[0] 約翰說你好' } }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
      });

      const request: TranslationRequest = {
        cues: [{ index: 0, text: 'John says hello' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'gpt-4o-mini',
        characterGlossary: { John: '約翰' },
      };

      await provider.translate(request);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const systemMessage = requestBody.messages.find((m: { role: string }) => m.role === 'system');
      expect(systemMessage.content).toContain('John');
      expect(systemMessage.content).toContain('約翰');
    });

    it('should include previous context as assistant message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: '[0] 繼續' } }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
      });

      const request: TranslationRequest = {
        cues: [{ index: 0, text: 'Continue' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'gpt-4o-mini',
        previousContext: {
          previousCues: [{ original: 'Hello', translated: '你好' }],
          characters: {},
        },
      };

      await provider.translate(request);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const assistantMessage = requestBody.messages.find((m: { role: string }) => m.role === 'assistant');
      expect(assistantMessage).toBeDefined();
      expect(assistantMessage.content).toContain('Hello');
      expect(assistantMessage.content).toContain('你好');
    });

    it('should include custom instructions', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: '[0] 測試' } }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
      });

      const request: TranslationRequest = {
        cues: [{ index: 0, text: 'Test' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'gpt-4o-mini',
        customInstructions: 'Use formal language only',
      };

      await provider.translate(request);

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const systemMessage = requestBody.messages.find((m: { role: string }) => m.role === 'system');
      expect(systemMessage.content).toContain('Use formal language only');
    });

    it('should build context for next chunk', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: '[0] 你好\n[1] 世界' } }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
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
          choices: [{ message: { content: '[0] [John] 你好' } }],
          usage: { prompt_tokens: 100, completion_tokens: 20 },
        }),
      });

      const request: TranslationRequest = {
        cues: [{ index: 0, text: 'Hello', speaker: 'John' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'gpt-4o-mini',
      };
      const result = await provider.translate(request);

      expect(result.cues[0].translatedText).toBe('你好');
    });

    it('should set temperature to 0.3', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: '[0] Test' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.translate(createRequest([{ index: 0, text: 'Test' }]));

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.temperature).toBe(0.3);
    });
  });

  describe('translateStream', () => {
    it('should provide progress updates', async () => {
      const encoder = new TextEncoder();
      const streamChunks = [
        'data: {"choices":[{"delta":{"content":"[0] 你好"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"\\n[1] 世界"}}]}\n\n',
        'data: [DONE]\n\n',
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
        model: 'gpt-4o-mini',
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
        model: 'gpt-4o-mini',
      };

      await expect(
        provider.translateStream(request, vi.fn())
      ).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
      });
    });

    it('should enable stream mode in request', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
          controller.close();
        },
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        body: mockStream,
      });

      await provider.translateStream(
        {
          cues: [{ index: 0, text: 'Test' }],
          sourceLanguage: 'en',
          targetLanguage: 'zh-TW',
          model: 'gpt-4o-mini',
        },
        vi.fn()
      );

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.stream).toBe(true);
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return default status when no recent info', async () => {
      const status = await provider.getRateLimitStatus();

      expect(status.requestsRemaining).toBe(10000);
      expect(status.tokensRemaining).toBe(1000000);
      expect(status.isLimited).toBe(false);
    });

    it('should return cached status after request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({
          'x-ratelimit-remaining-requests': '500',
          'x-ratelimit-remaining-tokens': '50000',
        }),
        json: async () => ({
          choices: [{ message: { content: '[0] Test' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.translate({
        cues: [{ index: 0, text: 'Test' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'gpt-4o-mini',
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

      expect(estimate.costRange.min).toBeCloseTo(estimate.estimatedCostUSD * 0.8, 5);
      expect(estimate.costRange.max).toBeCloseTo(estimate.estimatedCostUSD * 1.5, 5);
    });

    it('should return higher cost for more cues', () => {
      const smallEstimate = provider.estimateCost(10, 50);
      const largeEstimate = provider.estimateCost(100, 50);

      expect(largeEstimate.estimatedCostUSD).toBeGreaterThan(smallEstimate.estimatedCostUSD);
    });

    it('should use GPT-4o Mini pricing', () => {
      const estimate = provider.estimateCost(1000, 100);

      // GPT-4o Mini: $0.15/1M input, $0.6/1M output
      // Should be relatively cheap
      expect(estimate.estimatedCostUSD).toBeLessThan(0.1);
    });
  });

  describe('API request format', () => {
    it('should include correct headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: '[0] Test' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.translate({
        cues: [{ index: 0, text: 'Test' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'gpt-4o-mini',
      });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBe('Bearer test-api-key');
    });

    it('should set max_tokens to 8192', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: '[0] Test' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.translate({
        cues: [{ index: 0, text: 'Test' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'gpt-4o-mini',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(8192);
    });

    it('should include system, assistant (if context), and user messages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers(),
        json: async () => ({
          choices: [{ message: { content: '[0] Test' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      await provider.translate({
        cues: [{ index: 0, text: 'Test' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'gpt-4o-mini',
        previousContext: {
          previousCues: [{ original: 'Hello', translated: '你好' }],
          characters: {},
        },
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const roles = body.messages.map((m: { role: string }) => m.role);
      expect(roles).toContain('system');
      expect(roles).toContain('assistant');
      expect(roles).toContain('user');
    });
  });
});

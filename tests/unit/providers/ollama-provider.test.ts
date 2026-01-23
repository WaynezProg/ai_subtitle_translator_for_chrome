/**
 * Ollama Provider Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider } from '../../../src/shared/providers/ollama-provider';
import { ProviderError } from '../../../src/shared/providers/types';
import type { TranslationRequest, CueInput } from '../../../src/shared/providers/types';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    provider = new OllamaProvider();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create provider with correct type', () => {
      expect(provider.type).toBe('ollama');
    });

    it('should have display name', () => {
      expect(provider.displayName).toContain('Ollama');
    });

    it('should use default endpoint', () => {
      // Test via testConnection to verify endpoint
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      provider.testConnection();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('localhost:11434'),
        expect.anything()
      );
    });

    it('should use custom endpoint from config', () => {
      const customProvider = new OllamaProvider({
        type: 'ollama',
        credentials: {
          type: 'ollama',
          endpoint: 'http://192.168.1.100:11434',
          model: 'llama3',
        },
        status: { state: 'unconfigured' },
        configuredAt: new Date().toISOString(),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      customProvider.testConnection();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('192.168.1.100:11434'),
        expect.anything()
      );
    });
  });

  describe('setEndpoint and setModel', () => {
    it('should allow setting endpoint', () => {
      provider.setEndpoint('http://custom:11434');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      provider.testConnection();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('custom:11434'),
        expect.anything()
      );
    });

    it('should allow setting model', () => {
      provider.setModel('llama3');
      // Model is used in translate, which we test separately
    });
  });

  describe('testConnection', () => {
    it('should return success on successful connection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const result = await provider.testConnection();

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return failure with error message on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });

    it('should return failure on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await provider.testConnection();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Connection refused');
    });
  });

  describe('fetchAvailableModels', () => {
    it('should return models from API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: 'llama3', modified_at: '', size: 0, digest: '' },
            { name: 'mistral', modified_at: '', size: 0, digest: '' },
          ],
        }),
      });

      const models = await provider.fetchAvailableModels();

      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('llama3');
      expect(models[0].inputCostPer1M).toBe(0); // Local = free
    });

    it('should mark recommended models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: 'llama3', modified_at: '', size: 0, digest: '' },
            { name: 'other-model', modified_at: '', size: 0, digest: '' },
          ],
        }),
      });

      const models = await provider.fetchAvailableModels();

      expect(models.find((m) => m.id === 'llama3')?.recommended).toBe(true);
      expect(models.find((m) => m.id === 'other-model')?.recommended).toBe(false);
    });

    it('should return empty array on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const models = await provider.fetchAvailableModels();

      expect(models).toEqual([]);
    });

    it('should estimate context window for known models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { name: 'llama3:8b', modified_at: '', size: 0, digest: '' },
            { name: 'mistral:7b', modified_at: '', size: 0, digest: '' },
          ],
        }),
      });

      const models = await provider.fetchAvailableModels();

      expect(models.find((m) => m.id === 'llama3:8b')?.contextWindow).toBe(8192);
      expect(models.find((m) => m.id === 'mistral:7b')?.contextWindow).toBe(32768);
    });
  });

  describe('validateCredentials', () => {
    it('should return valid when connected with models', async () => {
      // First call for testConnection
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });
      // Second call for fetchAvailableModels
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3', modified_at: '', size: 0, digest: '' }],
        }),
      });

      const result = await provider.validateCredentials();

      expect(result.valid).toBe(true);
      expect(result.accountInfo?.tier).toBe('local');
    });

    it('should return invalid when connection fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Error',
      });

      const result = await provider.validateCredentials();

      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
    });

    it('should return invalid when no models available', async () => {
      // Connection succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });
      // But no models
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [] }),
      });

      const result = await provider.validateCredentials();

      expect(result.valid).toBe(false);
      expect(result.error?.message).toContain('No models found');
    });
  });

  describe('translate', () => {
    const createRequest = (cues: CueInput[]): TranslationRequest => ({
      cues,
      sourceLanguage: 'en',
      targetLanguage: 'zh-TW',
      model: 'llama3',
    });

    beforeEach(async () => {
      // Setup models first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3', modified_at: '', size: 0, digest: '' }],
        }),
      });
      await provider.fetchAvailableModels();
      mockFetch.mockReset();
    });

    it('should translate cues', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3',
          message: { content: '[0] 你好\n[1] 世界' },
          done: true,
          prompt_eval_count: 100,
          eval_count: 50,
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

    it('should include token usage from response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3',
          message: { content: '[0] 測試' },
          done: true,
          prompt_eval_count: 150,
          eval_count: 25,
        }),
      });

      const request = createRequest([{ index: 0, text: 'Test' }]);
      const result = await provider.translate(request);

      expect(result.usage.inputTokens).toBe(150);
      expect(result.usage.outputTokens).toBe(25);
    });

    it('should throw MODEL_NOT_FOUND when no model specified', async () => {
      // Create fresh provider without models
      const emptyProvider = new OllamaProvider();

      const request: TranslationRequest = {
        cues: [{ index: 0, text: 'Test' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: '', // No model
      };

      await expect(emptyProvider.translate(request)).rejects.toMatchObject({
        code: 'MODEL_NOT_FOUND',
      });
    });

    it('should handle missing translations gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3',
          message: { content: '[0] 翻譯\n' }, // Missing [1]
          done: true,
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

    it('should handle 404 model not found error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'model not found' }),
      });

      const request = createRequest([{ index: 0, text: 'Test' }]);

      await expect(provider.translate(request)).rejects.toMatchObject({
        code: 'MODEL_NOT_FOUND',
        retryable: false,
      });
    });

    it('should handle service unavailable', async () => {
      // Mock all retry attempts (fetchWithRetry will retry up to 3 times on retryable status codes)
      const errorResponse = {
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ error: 'service busy' }),
      };
      mockFetch.mockResolvedValue(errorResponse);

      const request = createRequest([{ index: 0, text: 'Test' }]);

      // After all retries exhausted, fetchWithRetry throws NETWORK_ERROR for retryable status codes
      await expect(provider.translate(request)).rejects.toMatchObject({
        code: 'NETWORK_ERROR',
        retryable: true,
      });
    });

    it('should include character glossary in system prompt', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: 'llama3',
          message: { content: '[0] 約翰說你好' },
          done: true,
        }),
      });

      const request: TranslationRequest = {
        cues: [{ index: 0, text: 'John says hello' }],
        sourceLanguage: 'en',
        targetLanguage: 'zh-TW',
        model: 'llama3',
        characterGlossary: { John: '約翰' },
      };

      await provider.translate(request);

      // Check that the request body includes the glossary
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.messages[0].content).toContain('John');
      expect(requestBody.messages[0].content).toContain('約翰');
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return unlimited status for local provider', async () => {
      const status = await provider.getRateLimitStatus();

      expect(status.requestsRemaining).toBe(999999);
      expect(status.tokensRemaining).toBe(999999);
      expect(status.isLimited).toBe(false);
    });
  });

  describe('estimateCost', () => {
    it('should always return zero cost for local provider', () => {
      const estimate = provider.estimateCost(100, 50);

      expect(estimate.estimatedCostUSD).toBe(0);
      expect(estimate.costRange.min).toBe(0);
      expect(estimate.costRange.max).toBe(0);
    });
  });
});

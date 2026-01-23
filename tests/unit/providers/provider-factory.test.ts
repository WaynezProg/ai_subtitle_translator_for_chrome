/**
 * Provider Factory Tests
 *
 * Tests the provider registration, creation, and error handling mechanisms.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ProviderFactory,
  ProviderNotRegisteredError,
  createProviderFromConfig,
} from '../../../src/shared/providers/factory';
import type { TranslationProvider } from '../../../src/shared/providers/types';
import type { AuthProvider, ProviderType } from '../../../src/shared/types/auth';

// Mock provider for testing
const createMockProvider = (type: ProviderType): TranslationProvider => ({
  type,
  name: `Mock ${type}`,
  supportsStreaming: false,
  supportsBatching: true,
  validateCredentials: vi.fn().mockResolvedValue(true),
  translate: vi.fn().mockResolvedValue({
    translatedText: 'Translated',
    sourceLanguage: 'en',
    targetLanguage: 'ja',
  }),
  translateBatch: vi.fn().mockResolvedValue([]),
});

describe('ProviderFactory', () => {
  // Note: We don't clear the registry in beforeEach because the actual providers
  // are registered at module load time. We test with those real registrations.

  describe('isRegistered', () => {
    it('should return true for registered providers', () => {
      expect(ProviderFactory.isRegistered('claude-api')).toBe(true);
      expect(ProviderFactory.isRegistered('openai-api')).toBe(true);
      expect(ProviderFactory.isRegistered('google-translate')).toBe(true);
      expect(ProviderFactory.isRegistered('ollama')).toBe(true);
    });

    it('should return false for unregistered providers', () => {
      expect(ProviderFactory.isRegistered('nonexistent-provider' as ProviderType)).toBe(false);
    });
  });

  describe('getRegisteredTypes', () => {
    it('should return all registered provider types', () => {
      const types = ProviderFactory.getRegisteredTypes();

      expect(types).toContain('claude-api');
      expect(types).toContain('openai-api');
      expect(types).toContain('google-translate');
      expect(types).toContain('ollama');
      expect(types).toContain('claude-subscription');
      expect(types).toContain('chatgpt-subscription');
    });
  });

  describe('create', () => {
    it('should create a google-translate provider', () => {
      const config: AuthProvider = {
        type: 'google-translate',
        credentials: { type: 'google-translate' },
        status: { state: 'validated' },
        configuredAt: new Date().toISOString(),
      };

      const provider = ProviderFactory.create(config);

      expect(provider).toBeDefined();
      expect(provider.type).toBe('google-translate');
    });

    it('should create an ollama provider', () => {
      const config: AuthProvider = {
        type: 'ollama',
        credentials: {
          type: 'ollama',
          endpoint: 'http://localhost:11434',
          model: 'llama2',
        },
        status: { state: 'unconfigured' },
        configuredAt: new Date().toISOString(),
      };

      const provider = ProviderFactory.create(config);

      expect(provider).toBeDefined();
      expect(provider.type).toBe('ollama');
    });

    it('should throw ProviderNotRegisteredError for unregistered type', () => {
      const config: AuthProvider = {
        type: 'nonexistent' as ProviderType,
        credentials: { type: 'api-key', encryptedApiKey: 'test' },
        status: { state: 'unconfigured' },
        configuredAt: new Date().toISOString(),
      };

      expect(() => ProviderFactory.create(config)).toThrow(ProviderNotRegisteredError);
    });
  });

  describe('tryCreate', () => {
    it('should return provider for valid config', () => {
      const config: AuthProvider = {
        type: 'google-translate',
        credentials: { type: 'google-translate' },
        status: { state: 'validated' },
        configuredAt: new Date().toISOString(),
      };

      const provider = ProviderFactory.tryCreate(config);

      expect(provider).not.toBeNull();
      expect(provider?.type).toBe('google-translate');
    });

    it('should return null for invalid config', () => {
      const config: AuthProvider = {
        type: 'nonexistent' as ProviderType,
        credentials: { type: 'api-key', encryptedApiKey: 'test' },
        status: { state: 'unconfigured' },
        configuredAt: new Date().toISOString(),
      };

      const provider = ProviderFactory.tryCreate(config);

      expect(provider).toBeNull();
    });
  });

  describe('register and unregister', () => {
    const testProviderType = 'test-provider' as ProviderType;

    it('should allow registering new provider types', () => {
      const mockConstructor = vi.fn().mockReturnValue(createMockProvider(testProviderType));

      ProviderFactory.register(testProviderType, mockConstructor);

      expect(ProviderFactory.isRegistered(testProviderType)).toBe(true);

      // Clean up
      ProviderFactory.unregister(testProviderType);
    });

    it('should allow unregistering provider types', () => {
      const mockConstructor = vi.fn().mockReturnValue(createMockProvider(testProviderType));

      ProviderFactory.register(testProviderType, mockConstructor);
      expect(ProviderFactory.isRegistered(testProviderType)).toBe(true);

      const result = ProviderFactory.unregister(testProviderType);

      expect(result).toBe(true);
      expect(ProviderFactory.isRegistered(testProviderType)).toBe(false);
    });

    it('should return false when unregistering non-existent type', () => {
      const result = ProviderFactory.unregister('nonexistent' as ProviderType);
      expect(result).toBe(false);
    });
  });
});

describe('createProviderFromConfig', () => {
  it('should create google-translate provider without api key', () => {
    const provider = createProviderFromConfig('google-translate');

    expect(provider).not.toBeNull();
    expect(provider?.type).toBe('google-translate');
  });

  it('should create ollama provider with endpoint', () => {
    const provider = createProviderFromConfig('ollama', 'http://localhost:11434', 'llama2');

    expect(provider).not.toBeNull();
    expect(provider?.type).toBe('ollama');
  });

  it('should return null for unregistered provider', () => {
    const provider = createProviderFromConfig('nonexistent' as ProviderType);

    expect(provider).toBeNull();
  });
});

describe('ProviderNotRegisteredError', () => {
  it('should include provider type in message', () => {
    const error = new ProviderNotRegisteredError('test-provider' as ProviderType);

    expect(error.providerType).toBe('test-provider');
    expect(error.message).toContain('test-provider');
    expect(error.message).toContain('not registered');
    expect(error.name).toBe('ProviderNotRegisteredError');
  });

  it('should list available providers', () => {
    const error = new ProviderNotRegisteredError('test-provider' as ProviderType);

    expect(error.message).toContain('claude-api');
  });
});

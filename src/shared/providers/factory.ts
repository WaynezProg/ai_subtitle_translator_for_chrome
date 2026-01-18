/**
 * Provider Factory
 * 
 * Creates translation provider instances based on configuration.
 * 
 * @see specs/001-ai-subtitle-translator/contracts/translation-provider.md
 */

import type { ProviderType, AuthProvider } from '../types/auth';
import type { TranslationProvider } from './types';

/**
 * Registry of provider constructors
 */
type ProviderConstructor = (config: AuthProvider) => TranslationProvider;

/**
 * Provider Factory - creates translation provider instances
 * 
 * Uses Strategy pattern to allow dynamic provider registration.
 */
export class ProviderFactory {
  private static readonly registry = new Map<ProviderType, ProviderConstructor>();
  
  /**
   * Register a provider constructor
   * 
   * @param type - Provider type identifier
   * @param constructor - Factory function to create the provider
   */
  static register(type: ProviderType, constructor: ProviderConstructor): void {
    this.registry.set(type, constructor);
  }
  
  /**
   * Unregister a provider
   * 
   * @param type - Provider type to remove
   */
  static unregister(type: ProviderType): boolean {
    return this.registry.delete(type);
  }
  
  /**
   * Check if a provider type is registered
   * 
   * @param type - Provider type to check
   */
  static isRegistered(type: ProviderType): boolean {
    return this.registry.has(type);
  }
  
  /**
   * Get all registered provider types
   */
  static getRegisteredTypes(): ProviderType[] {
    return Array.from(this.registry.keys());
  }
  
  /**
   * Create a translation provider instance
   * 
   * @param config - Auth provider configuration
   * @returns Translation provider instance
   * @throws Error if provider type is not registered
   */
  static create(config: AuthProvider): TranslationProvider {
    const constructor = this.registry.get(config.type);
    
    if (!constructor) {
      throw new ProviderNotRegisteredError(config.type);
    }
    
    return constructor(config);
  }
  
  /**
   * Try to create a provider, returning null if not registered
   * 
   * @param config - Auth provider configuration
   * @returns Translation provider instance or null
   */
  static tryCreate(config: AuthProvider): TranslationProvider | null {
    try {
      return this.create(config);
    } catch {
      return null;
    }
  }
  
  /**
   * Clear all registered providers (useful for testing)
   */
  static clearRegistry(): void {
    this.registry.clear();
  }
}

/**
 * Error thrown when trying to create an unregistered provider
 */
export class ProviderNotRegisteredError extends Error {
  constructor(public readonly providerType: ProviderType) {
    super(`Provider "${providerType}" is not registered. Available providers: ${
      ProviderFactory.getRegisteredTypes().join(', ') || 'none'
    }`);
    this.name = 'ProviderNotRegisteredError';
  }
}

// ============================================================================
// Provider Registration
// ============================================================================

import { ClaudeApiProvider } from './claude-api-provider';
import { OpenAIApiProvider } from './openai-api-provider';
import { ClaudeSubscriptionProvider } from './claude-subscription-provider';
import { ChatGPTSubscriptionProvider } from './chatgpt-subscription-provider';
import { OllamaProvider } from './ollama-provider';
import { GoogleTranslateProvider } from './google-translate-provider';

// Register all available providers
ProviderFactory.register('claude-api', (config) => new ClaudeApiProvider(config));
ProviderFactory.register('openai-api', (config) => new OpenAIApiProvider(config));
ProviderFactory.register('claude-subscription', (config) => new ClaudeSubscriptionProvider(config));
ProviderFactory.register('chatgpt-subscription', (config) => new ChatGPTSubscriptionProvider(config));
ProviderFactory.register('ollama', (config) => new OllamaProvider(config));
ProviderFactory.register('google-translate', (config) => new GoogleTranslateProvider(config));

// ============================================================================
// Convenience Factory Function
// ============================================================================

/**
 * Create a provider instance from provider type and optional API key
 * This is a simpler interface for creating providers without full AuthProvider config
 * 
 * @param providerType - The type of provider to create
 * @param apiKey - Optional API key (required for API providers)
 * @param model - Optional model to use
 * @returns TranslationProvider instance or null if provider type is not registered
 */
export function createProviderFromConfig(
  providerType: ProviderType,
  apiKey?: string,
  model?: string
): TranslationProvider | null {
  // Create a minimal config object that providers can use
  let credentials: AuthProvider['credentials'];
  
  if (providerType === 'ollama') {
    credentials = { type: 'ollama', endpoint: apiKey || 'http://localhost:11434', model: model || '' };
  } else if (providerType === 'google-translate') {
    credentials = { type: 'google-translate' };
  } else if (providerType.includes('subscription')) {
    credentials = { type: 'subscription', encryptedSessionToken: '' };
  } else {
    credentials = { type: 'api-key', encryptedApiKey: apiKey || '', model: model || '' };
  }
  
  const config: AuthProvider = {
    type: providerType,
    credentials,
    status: { state: 'unconfigured' },
    configuredAt: new Date().toISOString(),
  };
  
  // For API key providers, also store unencrypted key for immediate use
  if (apiKey && (providerType === 'claude-api' || providerType === 'openai-api')) {
    // Store in a way the provider constructors expect
    (config as AuthProviderWithApiKey).apiKey = apiKey;
  }
  
  return ProviderFactory.tryCreate(config);
}

/**
 * Extended AuthProvider type with unencrypted API key for provider creation
 */
interface AuthProviderWithApiKey extends AuthProvider {
  apiKey?: string;
}

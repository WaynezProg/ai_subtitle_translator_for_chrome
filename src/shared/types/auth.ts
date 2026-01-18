/**
 * Authentication-related type definitions
 * 
 * @see specs/001-ai-subtitle-translator/data-model.md
 */

/**
 * Supported provider types
 */
export type ProviderType =
  | 'claude-api'
  | 'openai-api'
  | 'ollama'
  | 'claude-subscription'
  | 'chatgpt-subscription'
  | 'google-translate';

/**
 * Provider credentials union type
 */
export type ProviderCredentials =
  | ApiKeyCredentials
  | OllamaCredentials
  | SubscriptionCredentials
  | OAuthCredentials
  | GoogleTranslateCredentials;

/**
 * Google Translate credentials (no API key needed for free tier)
 */
export interface GoogleTranslateCredentials {
  type: 'google-translate';
}

/**
 * API key credentials for official APIs
 */
export interface ApiKeyCredentials {
  type: 'api-key';
  /** Encrypted API key */
  encryptedApiKey: string;
  /** Selected model */
  model: string;
}

/**
 * Ollama local model credentials
 */
export interface OllamaCredentials {
  type: 'ollama';
  /** Ollama endpoint URL */
  endpoint: string;
  /** Selected model */
  model: string;
}

/**
 * Subscription credentials for Claude Pro/ChatGPT Plus (legacy session-based)
 */
export interface SubscriptionCredentials {
  type: 'subscription';
  /** Session token (encrypted) */
  encryptedSessionToken: string;
  /** Token expiration time */
  expiresAt?: string;
}

/**
 * OAuth credentials for Claude Pro/ChatGPT Plus
 */
export interface OAuthCredentials {
  type: 'oauth';
  /** OAuth access token */
  accessToken: string;
  /** OAuth refresh token */
  refreshToken?: string;
  /** Token expiration timestamp (ISO 8601) */
  expiresAt?: string;
  /** Token scopes */
  scopes?: string[];
}

/**
 * Provider status states
 */
export type ProviderStatus = 
  | { state: 'unconfigured' }
  | { state: 'validating' }
  | { state: 'valid'; validatedAt: string }
  | { state: 'invalid'; error: string }
  | { state: 'expired'; expiredAt: string };

/**
 * Authentication provider configuration
 */
export interface AuthProvider {
  /** Provider type */
  type: ProviderType;
  
  /** Authentication credentials */
  credentials: ProviderCredentials;
  
  /** Connection status */
  status: ProviderStatus;
  
  /** Last validation time */
  lastValidatedAt?: string;
  
  /** Configuration time */
  configuredAt: string;
}

/**
 * Helper to check if a provider is configured and valid
 */
export function isProviderReady(provider: AuthProvider | undefined): boolean {
  return provider?.status.state === 'valid';
}

/**
 * Helper to get provider display name
 */
export function getProviderDisplayName(type: ProviderType): string {
  const displayNames: Record<ProviderType, string> = {
    'claude-subscription': 'Claude Pro (訂閱)',
    'chatgpt-subscription': 'ChatGPT Plus (訂閱)',
    'claude-api': 'Claude API',
    'openai-api': 'OpenAI API',
    'ollama': 'Ollama (本地)',
    'google-translate': 'Google 翻譯 (免費)',
  };
  return displayNames[type];
}

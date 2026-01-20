/**
 * Auth Storage Utilities
 * 
 * Secure storage for API keys and provider credentials.
 * Uses chrome.storage.local for persistence with AES-GCM encryption
 * for sensitive data (API keys and OAuth tokens).
 * 
 * @see FR-009, FR-010: API Key Storage
 * @security API keys are encrypted using AES-GCM before storage
 */

import { STORAGE_KEYS } from './constants';
import { encrypt, decrypt, isEncryptedData, type EncryptedData } from './crypto';
import type { ProviderType } from '../types/auth';

// ============================================================================
// Types
// ============================================================================

export interface StoredAuthConfig {
  /** Currently selected provider */
  selectedProvider: ProviderType;
  
  /** Provider configurations */
  providers: Partial<Record<ProviderType, StoredProviderConfig>>;
}

export interface StoredProviderConfig {
  /** Provider type */
  type: ProviderType;
  
  /** 
   * API Key (for API providers)
   * Can be plain string (legacy) or EncryptedData (encrypted)
   * @security New keys are stored encrypted; legacy keys are migrated on read
   */
  apiKey?: string | EncryptedData;
  
  /** Endpoint (for Ollama) - not encrypted as it's not sensitive */
  endpoint?: string;
  
  /** Selected model */
  selectedModel?: string;
  
  /** Last validation time */
  lastValidated?: string;
  
  /** Is currently valid */
  isValid?: boolean;
}

/**
 * Simple auth provider info returned by getAuthProvider
 * This is a simplified version for UI use, not the full AuthProvider type
 */
export interface AuthProviderInfo {
  type: ProviderType;
  displayName: string;
  apiKey?: string;
  endpoint?: string;
  selectedModel?: string;
  status: 'valid' | 'invalid' | 'unknown';
}

// ============================================================================
// Default Config
// ============================================================================

const DEFAULT_AUTH_CONFIG: StoredAuthConfig = {
  selectedProvider: 'claude-subscription',
  providers: {},
};

// ============================================================================
// Storage Functions
// ============================================================================

/**
 * Get stored auth configuration
 */
export async function getAuthConfig(): Promise<StoredAuthConfig> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.AUTH_PROVIDER);
    const stored = result[STORAGE_KEYS.AUTH_PROVIDER] as StoredAuthConfig | undefined;
    
    if (!stored) {
      return { ...DEFAULT_AUTH_CONFIG };
    }
    
    return {
      ...DEFAULT_AUTH_CONFIG,
      ...stored,
    };
  } catch (error) {
    console.error('[AuthStorage] Failed to get auth config:', error);
    return { ...DEFAULT_AUTH_CONFIG };
  }
}

/**
 * Save auth configuration
 */
export async function saveAuthConfig(config: Partial<StoredAuthConfig>): Promise<void> {
  try {
    const current = await getAuthConfig();
    const updated = {
      ...current,
      ...config,
      providers: {
        ...current.providers,
        ...(config.providers || {}),
      },
    };
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.AUTH_PROVIDER]: updated,
    });
  } catch (error) {
    console.error('[AuthStorage] Failed to save auth config:', error);
    throw error;
  }
}

/**
 * Get currently selected provider type
 */
export async function getSelectedProvider(): Promise<ProviderType> {
  const config = await getAuthConfig();
  return config.selectedProvider;
}

/**
 * Set currently selected provider
 */
export async function setSelectedProvider(providerType: ProviderType): Promise<void> {
  await saveAuthConfig({ selectedProvider: providerType });
}

/**
 * Get provider config
 */
export async function getProviderConfig(providerType: ProviderType): Promise<StoredProviderConfig | null> {
  const config = await getAuthConfig();
  return config.providers[providerType] || null;
}

/**
 * Save provider credentials
 * API keys are encrypted before storage for security
 */
export async function saveProviderCredentials(
  providerType: ProviderType,
  apiKeyOrEndpoint: string,
  selectedModel?: string
): Promise<void> {
  const config = await getAuthConfig();
  
  const providerConfig: StoredProviderConfig = {
    type: providerType,
    selectedModel,
    lastValidated: new Date().toISOString(),
    isValid: true,
  };
  
  // Set appropriate field based on provider type
  if (providerType === 'ollama') {
    // Ollama endpoint is not sensitive, store as-is
    providerConfig.endpoint = apiKeyOrEndpoint;
  } else {
    // Encrypt API key before storage
    providerConfig.apiKey = await encrypt(apiKeyOrEndpoint);
  }
  
  config.providers[providerType] = providerConfig;
  
  await saveAuthConfig(config);
}

/**
 * Delete provider credentials
 */
export async function deleteProviderCredentials(providerType: ProviderType): Promise<void> {
  const config = await getAuthConfig();
  delete config.providers[providerType];
  await saveAuthConfig(config);
}

/**
 * Get AuthProviderInfo for UI display and provider creation
 * Automatically decrypts API keys and migrates legacy unencrypted keys
 */
export async function getAuthProvider(providerType?: ProviderType): Promise<AuthProviderInfo | null> {
  const config = await getAuthConfig();
  const type = providerType || config.selectedProvider;
  const providerConfig = config.providers[type];
  
  if (!providerConfig) {
    // Return minimal config for subscription providers that don't need credentials
    if (type === 'claude-subscription' || type === 'chatgpt-subscription') {
      return {
        type,
        displayName: type === 'claude-subscription' ? 'Claude Pro' : 'ChatGPT Plus',
        status: 'unknown',
      };
    }
    return null;
  }
  
  // Decrypt API key if encrypted, or migrate legacy unencrypted key
  let decryptedApiKey: string | undefined;
  if (providerConfig.apiKey) {
    decryptedApiKey = await decryptAndMigrateApiKey(type, providerConfig.apiKey);
  }
  
  return {
    type,
    displayName: getProviderDisplayName(type),
    apiKey: decryptedApiKey,
    endpoint: providerConfig.endpoint,
    selectedModel: providerConfig.selectedModel,
    status: providerConfig.isValid ? 'valid' : 'invalid',
  };
}

/**
 * Get all configured providers
 */
export async function getConfiguredProviders(): Promise<ProviderType[]> {
  const config = await getAuthConfig();
  return Object.keys(config.providers) as ProviderType[];
}

/**
 * Check if provider has valid credentials
 */
export async function hasValidCredentials(providerType: ProviderType): Promise<boolean> {
  const config = await getAuthConfig();
  const provider = config.providers[providerType];
  
  if (!provider) {
    // Subscription providers don't need stored credentials
    return providerType === 'claude-subscription' || providerType === 'chatgpt-subscription';
  }
  
  return provider.isValid === true;
}

/**
 * Mark provider as validated
 */
export async function markProviderValidated(
  providerType: ProviderType,
  isValid: boolean
): Promise<void> {
  const config = await getAuthConfig();
  const provider = config.providers[providerType];
  
  if (provider) {
    provider.lastValidated = new Date().toISOString();
    provider.isValid = isValid;
    await saveAuthConfig(config);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Decrypt API key and migrate legacy unencrypted keys
 * 
 * @param providerType - Provider type for migration
 * @param apiKey - Encrypted or plain text API key
 * @returns Decrypted API key
 */
async function decryptAndMigrateApiKey(
  providerType: ProviderType,
  apiKey: string | EncryptedData
): Promise<string> {
  if (isEncryptedData(apiKey)) {
    // Already encrypted, just decrypt
    return decrypt(apiKey);
  }
  
  // Legacy unencrypted key - migrate to encrypted storage
  console.warn('[AuthStorage] Migrating legacy unencrypted API key for:', providerType);
  
  // Encrypt and save
  const encryptedKey = await encrypt(apiKey);
  const config = await getAuthConfig();
  const provider = config.providers[providerType];
  
  if (provider) {
    provider.apiKey = encryptedKey;
    await saveAuthConfig(config);
  }
  
  return apiKey;
}

function getProviderDisplayName(type: ProviderType): string {
  switch (type) {
    case 'claude-api':
      return 'Claude API';
    case 'openai-api':
      return 'OpenAI API';
    case 'claude-subscription':
      return 'Claude Pro (Subscription)';
    case 'chatgpt-subscription':
      return 'ChatGPT Plus (Subscription)';
    case 'ollama':
      return 'Ollama (Local)';
    case 'google-translate':
      return 'Google 翻譯 (Free)';
    default:
      return type;
  }
}

/**
 * Mask API key for display (show first 4 and last 4 characters)
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 12) {
    return '*'.repeat(apiKey.length);
  }
  return `${apiKey.slice(0, 4)}${'*'.repeat(apiKey.length - 8)}${apiKey.slice(-4)}`;
}

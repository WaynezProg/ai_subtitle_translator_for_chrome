/**
 * AI Subtitle Translator - Background Service Worker
 * 
 * This service worker handles:
 * - Message passing with content scripts
 * - Translation service orchestration
 * - Credential storage and validation
 * - Cache management
 */

import { messageHandler, sendToTab } from './message-handler';
import { translationService } from './translation-service';
import { successResponse } from '../shared/types/messages';
import type {
  SubtitleDetectedMessage,
  RequestTranslationMessage,
  CancelTranslationMessage,
  GetCachedTranslationMessage,
  GetAuthStatusMessage,
  TranslateTextMessage,
  SaveTranslationMessage,
  ValidateOAuthTokenMessage,
} from '../shared/types/messages';
import { ProviderFactory } from '../shared/providers/factory';
import { getUserSettings } from '../shared/utils/preferences';
import type { AuthProvider, ProviderCredentials, ProviderStatus } from '../shared/types/auth';
import { storeClaudeTokens, getValidClaudeToken, getStoredClaudeTokens } from '../shared/providers/claude-oauth';
import { storeChatGPTTokens, getValidChatGPTToken } from '../shared/providers/chatgpt-oauth';

// ============================================================================
// Type declarations for build-time injected tokens
// ============================================================================

declare const __PRELOADED_CLAUDE_TOKEN__: {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
} | null;

declare const __PRELOADED_CHATGPT_TOKEN__: {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
} | null;

// ============================================================================
// Service Worker Initialization
// ============================================================================

console.log('[Background] AI Subtitle Translator Service Worker initialized');

// ============================================================================
// Preloaded Token Initialization
// ============================================================================

/**
 * Initialize preloaded tokens from build-time injection
 * These tokens are loaded from .session.json files during webpack build
 */
async function initializePreloadedTokens(): Promise<void> {
  // Check and store Claude token
  if (__PRELOADED_CLAUDE_TOKEN__) {
    const existing = await getValidClaudeToken();
    if (!existing) {
      console.log('[Background] Initializing preloaded Claude token');
      await storeClaudeTokens({
        accessToken: __PRELOADED_CLAUDE_TOKEN__.accessToken,
        refreshToken: __PRELOADED_CLAUDE_TOKEN__.refreshToken || undefined,
        expiresAt: __PRELOADED_CLAUDE_TOKEN__.expiresAt || undefined,
      });
    } else {
      console.log('[Background] Claude token already exists, skipping preload');
    }
  }
  
  // Check and store ChatGPT token
  if (__PRELOADED_CHATGPT_TOKEN__) {
    const existing = await getValidChatGPTToken();
    if (!existing) {
      console.log('[Background] Initializing preloaded ChatGPT token');
      await storeChatGPTTokens({
        accessToken: __PRELOADED_CHATGPT_TOKEN__.accessToken,
        refreshToken: __PRELOADED_CHATGPT_TOKEN__.refreshToken || undefined,
        expiresAt: __PRELOADED_CHATGPT_TOKEN__.expiresAt || undefined,
      });
    } else {
      console.log('[Background] ChatGPT token already exists, skipping preload');
    }
  }
}

// Initialize preloaded tokens on service worker start
void initializePreloadedTokens();

// ============================================================================
// Message Handlers Registration
// ============================================================================

// Handler for SUBTITLE_DETECTED
messageHandler.on('SUBTITLE_DETECTED', async (message: SubtitleDetectedMessage, _sender) => {
  const { platform, videoId, subtitleUrl, sourceLanguage, format } = message.payload;
  
  console.log('[Background] Subtitle detected:', {
    platform,
    videoId,
    sourceLanguage,
    format,
    url: subtitleUrl.substring(0, 100) + '...',
  });
  
  try {
    // Get user preferences to determine target language and provider
    const settings = await getUserSettings();
    const targetLanguage = settings.targetLanguage || 'zh-TW';
    const providerType = settings.selectedProvider || 'claude-subscription';
    
    // Check cache for existing translation
    const cacheResult = await translationService.checkCache(
      videoId,
      sourceLanguage,
      targetLanguage,
      providerType
    );
    
    if (cacheResult.hit) {
      console.log(`[Background] Subtitle already cached (${cacheResult.source}) for ${videoId}`);
      return successResponse({
        cached: true,
        cacheStatus: 'hit',
      });
    }
    
    return successResponse({
      cached: false,
      cacheStatus: undefined,
    });
  } catch (error) {
    console.error('[Background] Cache check failed:', error);
    return successResponse({
      cached: false,
      cacheStatus: undefined,
    });
  }
});

// Handler for REQUEST_TRANSLATION
messageHandler.on('REQUEST_TRANSLATION', async (message: RequestTranslationMessage, sender) => {
  const { subtitleId, videoId, platform, sourceLanguage, targetLanguage, cues, startFromIndex } = message.payload;
  const tabId = sender.tab?.id;
  
  console.log('[Background] Translation requested:', {
    subtitleId,
    videoId,
    platform,
    sourceLanguage,
    targetLanguage,
    cueCount: cues.length,
    startFromIndex,
    tabId,
  });
  
  if (!tabId) {
    console.error('[Background] No tab ID found in sender');
    return {
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'No tab ID found',
      },
    };
  }
  
  try {
    // Get user settings to determine provider
    const settings = await getUserSettings();
    const providerType = settings.selectedProvider || 'google-translate';
    
    // Get auth config from storage
    const authConfig = await chrome.storage.local.get(['authConfig']);
    const config = authConfig.authConfig as Record<string, string | undefined> | undefined;
    
    // Build credentials based on provider type
    let credentials: ProviderCredentials;
    switch (providerType) {
      case 'google-translate':
        credentials = { type: 'google-translate' };
        break;
      case 'ollama':
        credentials = {
          type: 'ollama',
          endpoint: config?.apiEndpoint || 'http://localhost:11434',
          model: config?.model || 'llama3.2',
        };
        break;
      case 'claude-api':
      case 'openai-api':
        credentials = {
          type: 'api-key',
          encryptedApiKey: config?.apiKey || '',
          model: config?.model || (providerType === 'claude-api' ? 'claude-sonnet-4-20250514' : 'gpt-4o'),
        };
        break;
      case 'claude-subscription': {
        // Get OAuth token (automatically refreshes if expired)
        const claudeToken = await getValidClaudeToken();
        credentials = {
          type: 'oauth',
          accessToken: claudeToken || '',
        };
        break;
      }
      case 'chatgpt-subscription': {
        // Get OAuth token (automatically refreshes if expired)
        const chatgptToken = await getValidChatGPTToken();
        credentials = {
          type: 'oauth',
          accessToken: chatgptToken || '',
        };
        break;
      }
      default:
        credentials = { type: 'google-translate' };
    }
    
    // Build provider status
    const status: ProviderStatus = { state: 'valid', validatedAt: new Date().toISOString() };
    
    // Build provider configuration
    const provider: AuthProvider = {
      type: providerType,
      credentials,
      status,
      configuredAt: new Date().toISOString(),
    };
    
    // Start translation job
    const jobId = await translationService.startTranslation({
      subtitleId,
      videoId,
      platform,
      cues,
      sourceLanguage,
      targetLanguage,
      provider,
      tabId,
      startFromIndex,
    });
    
    console.log(`[Background] Translation job started: ${jobId}`);
    
    return successResponse({
      jobId,
      status: 'started' as const,
    });
  } catch (error) {
    console.error('[Background] Failed to start translation:', error);
    return {
      success: false,
      error: {
        code: 'TRANSLATION_START_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
});

// Handler for CANCEL_TRANSLATION
messageHandler.on('CANCEL_TRANSLATION', async (message: CancelTranslationMessage, _sender) => {
  const { jobId } = message.payload;
  
  console.log('[Background] Translation cancel requested:', { jobId });
  
  const cancelled = translationService.cancelTranslation(jobId);
  console.log(`[Background] Translation cancellation result: ${cancelled}`);
  
  return successResponse({
    cancelled,
  });
});

// Handler for GET_CACHED_TRANSLATION
messageHandler.on('GET_CACHED_TRANSLATION', async (message: GetCachedTranslationMessage, _sender) => {
  const { videoId, sourceLanguage, targetLanguage } = message.payload;
  
  // Get user preferences to determine provider
  // Use 'google-translate' as default to match SAVE_TRANSLATION handler
  const settings = await getUserSettings();
  const providerType = settings.selectedProvider || 'google-translate';
  
  console.log('[Background] Cache lookup:', {
    videoId,
    sourceLanguage,
    targetLanguage,
    providerType,
    model: 'default',
  });
  
  try {
    // Check cache - use 'default' model to match the key used when saving
    const cacheResult = await translationService.checkCache(
      videoId,
      sourceLanguage,
      targetLanguage,
      providerType,
      'default'
    );
    
    console.log('[Background] Cache result:', {
      hit: cacheResult.hit,
      source: cacheResult.source,
      hasCues: !!cacheResult.subtitle?.cues?.length,
    });
    
    if (cacheResult.hit && cacheResult.subtitle) {
      console.log(`[Background] Cache hit (${cacheResult.source}) for ${videoId}`);
      return successResponse({
        found: true,
        subtitle: cacheResult.subtitle,
        lastAccessedAt: new Date().toISOString(),
      });
    }
    
    return successResponse({
      found: false,
      subtitle: undefined,
      lastAccessedAt: undefined,
    });
  } catch (error) {
    console.error('[Background] Cache lookup failed:', error);
    return successResponse({
      found: false,
      subtitle: undefined,
      lastAccessedAt: undefined,
    });
  }
});

// Handler for GET_AUTH_STATUS
messageHandler.on('GET_AUTH_STATUS', async (_message: GetAuthStatusMessage, _sender) => {
  console.log('[Background] Auth status requested');
  
  try {
    // Get user settings to check configured provider
    const settings = await getUserSettings();
    const providerType = settings.selectedProvider;
    
    // Check auth config
    const authConfig = await chrome.storage.local.get(['authConfig']);
    const config = authConfig.authConfig as { selectedProvider?: string } | undefined;
    const selectedProvider = config?.selectedProvider || providerType || 'google-translate';
    
    // Google Translate and Ollama don't need API keys
    const noAuthRequired = ['google-translate', 'ollama'];
    if (noAuthRequired.includes(selectedProvider)) {
      console.log(`[Background] Provider ${selectedProvider} requires no auth`);
      return successResponse({
        configured: true,
        provider: selectedProvider as import('../shared/types/auth').ProviderType,
        status: { state: 'valid', validatedAt: new Date().toISOString() },
      });
    }
    
    // For API providers, check if credentials exist
    const providers = (authConfig.authConfig as { providers?: Record<string, unknown> })?.providers || {};
    const providerConfig = providers[selectedProvider];
    
    if (providerConfig) {
      console.log(`[Background] Provider ${selectedProvider} is configured`);
      return successResponse({
        configured: true,
        provider: selectedProvider as import('../shared/types/auth').ProviderType,
        status: { state: 'valid', validatedAt: new Date().toISOString() },
      });
    }
    
    console.log(`[Background] Provider ${selectedProvider} is not configured`);
    return successResponse({
      configured: false,
      provider: selectedProvider as import('../shared/types/auth').ProviderType,
      status: { state: 'unconfigured' },
    });
  } catch (error) {
    console.error('[Background] Auth status check failed:', error);
    // Default to google-translate which doesn't need config
    return successResponse({
      configured: true,
      provider: 'google-translate',
      status: { state: 'valid', validatedAt: new Date().toISOString() },
    });
  }
});

// Handler for TRANSLATE_TEXT (real-time single text translation)
messageHandler.on('TRANSLATE_TEXT', async (message: TranslateTextMessage, _sender) => {
  const { text, sourceLanguage, targetLanguage, context } = message.payload;

  // Get user settings first to log provider info
  const settings = await getUserSettings();
  const providerType = settings.selectedProvider || 'google-translate';

  console.log('[Background] Real-time translation requested:', {
    textLength: text.length,
    sourceLanguage,
    targetLanguage,
    provider: providerType,
    hasContext: !!(context?.previousCues?.length),
  });

  try {
    // providerType already retrieved above for logging

    // Get auth config
    const authConfig = await chrome.storage.local.get(['authConfig']);
    const config = authConfig.authConfig as Record<string, string | undefined> | undefined;

    // Build credentials based on provider type
    let credentials: ProviderCredentials;
    switch (providerType) {
      case 'google-translate':
        credentials = { type: 'google-translate' };
        break;
      case 'ollama':
        credentials = {
          type: 'ollama',
          endpoint: config?.apiEndpoint || 'http://localhost:11434',
          model: config?.model || 'llama3.2',
        };
        break;
      case 'claude-api':
      case 'openai-api':
        credentials = {
          type: 'api-key',
          encryptedApiKey: config?.apiKey || '',
          model: config?.model || (providerType === 'claude-api' ? 'claude-sonnet-4-20250514' : 'gpt-4o'),
        };
        break;
      case 'claude-subscription': {
        const claudeToken = await getValidClaudeToken();
        credentials = {
          type: 'oauth',
          accessToken: claudeToken || '',
        };
        break;
      }
      case 'chatgpt-subscription': {
        const chatgptToken = await getValidChatGPTToken();
        credentials = {
          type: 'oauth',
          accessToken: chatgptToken || '',
        };
        break;
      }
      default:
        credentials = { type: 'google-translate' };
    }

    // Build provider
    const provider: AuthProvider = {
      type: providerType,
      credentials,
      status: { state: 'valid', validatedAt: new Date().toISOString() },
      configuredAt: new Date().toISOString(),
    };

    // Create provider instance
    const translationProvider = ProviderFactory.tryCreate(provider);
    if (!translationProvider) {
      throw new Error(`Provider ${providerType} not available`);
    }

    // Build previousContext for provider if context is provided
    const previousContext = context?.previousCues?.length
      ? {
          previousCues: context.previousCues,
          characters: {},
        }
      : undefined;

    // Translate with context for better consistency
    const result = await translationProvider.translate({
      cues: [{ index: 0, text }],
      sourceLanguage,
      targetLanguage,
      model: providerType === 'google-translate' ? '' : 'default',
      previousContext,
    });

    const translatedText = result.cues[0]?.translatedText || text;

    console.log('[Background] Real-time translation completed:', {
      original: text.substring(0, 50),
      translated: translatedText.substring(0, 50),
    });

    return successResponse({
      translatedText,
      cached: false,
    });
  } catch (error) {
    console.error('[Background] Real-time translation failed:', error);
    return {
      success: false,
      error: {
        code: 'TRANSLATION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
});

// Handler for SAVE_TRANSLATION (save translated subtitle to cache)
messageHandler.on('SAVE_TRANSLATION', async (message: SaveTranslationMessage, _sender) => {
  const { videoId, platform, sourceLanguage, targetLanguage, subtitle } = message.payload;
  
  // Get user settings to determine provider
  const settings = await getUserSettings();
  const providerType = settings.selectedProvider || 'google-translate';
  
  console.log('[Background] Save translation requested:', {
    videoId,
    platform,
    sourceLanguage,
    targetLanguage,
    providerType,
    model: 'default',
    cueCount: subtitle.cues.length,
  });
  
  try {
    // Save to cache
    await translationService.saveToCache(
      videoId,
      sourceLanguage,
      targetLanguage,
      providerType,
      'default',
      subtitle
    );
    
    console.log('[Background] Translation saved to cache successfully');
    return successResponse({ saved: true });
  } catch (error) {
    console.error('[Background] Failed to save translation:', error);
    return successResponse({ saved: false });
  }
});

// Handler for VALIDATE_OAUTH_TOKEN (validates OAuth token via background to avoid CORS)
messageHandler.on('VALIDATE_OAUTH_TOKEN', async (message: ValidateOAuthTokenMessage, _sender) => {
  const { provider, accessToken } = message.payload;

  console.log('[Background] OAuth token validation requested:', { provider });

  try {
    if (provider === 'claude') {
      // Validate Claude OAuth token by checking token format and expiration
      // We can't use the Messages API due to Organization CORS restrictions

      // First check if token has the expected format (sk-ant-oat01-...)
      if (!accessToken.startsWith('sk-ant-oat01-')) {
        console.warn('[Background] Claude token has invalid format');
        return successResponse({ valid: false, error: 'Invalid token format. Expected sk-ant-oat01-...' });
      }

      // Try to get stored tokens and check expiration
      const storedTokens = await getStoredClaudeTokens();
      if (storedTokens?.expiresAt) {
        const expiresAt = new Date(storedTokens.expiresAt).getTime();
        const now = Date.now();
        const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

        if (now >= expiresAt - bufferTime) {
          // Token is expired or about to expire
          if (storedTokens.refreshToken) {
            // Try to refresh the token
            try {
              console.log('[Background] Token expired, attempting refresh...');
              const refreshResponse = await fetch('https://console.anthropic.com/v1/oauth/token', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                  grant_type: 'refresh_token',
                  refresh_token: storedTokens.refreshToken,
                  client_id: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
                }),
              });

              if (refreshResponse.ok) {
                const data = await refreshResponse.json() as {
                  access_token: string;
                  refresh_token?: string;
                  expires_in?: number;
                };

                // Store the new tokens
                const newExpiresAt = data.expires_in
                  ? new Date(Date.now() + data.expires_in * 1000).toISOString()
                  : undefined;

                await storeClaudeTokens({
                  accessToken: data.access_token,
                  refreshToken: data.refresh_token || storedTokens.refreshToken,
                  expiresAt: newExpiresAt,
                });

                console.log('[Background] Claude token refreshed successfully');
                return successResponse({ valid: true });
              } else {
                const errorText = await refreshResponse.text();
                console.warn('[Background] Token refresh failed:', refreshResponse.status, errorText);
                return successResponse({ valid: false, error: 'Token expired and refresh failed' });
              }
            } catch (refreshError) {
              console.error('[Background] Token refresh error:', refreshError);
              return successResponse({ valid: false, error: 'Token refresh failed' });
            }
          } else {
            return successResponse({ valid: false, error: 'Token expired and no refresh token available' });
          }
        }
      }

      // Token format is valid and not expired
      console.log('[Background] Claude token format valid and not expired');
      return successResponse({ valid: true });

    } else if (provider === 'chatgpt') {
      // Validate ChatGPT OAuth token using backend-api/me endpoint
      // Note: ChatGPT OAuth tokens work with chatgpt.com backend-api, not api.openai.com
      const response = await fetch('https://chatgpt.com/backend-api/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      console.log('[Background] ChatGPT validation response status:', response.status);

      // 200 = success
      if (response.ok) {
        const data = await response.json() as { email?: string; id?: string };
        console.log('[Background] ChatGPT user:', data.email || data.id);
        return successResponse({ valid: true });
      }

      const errorText = await response.text();
      console.warn('[Background] ChatGPT validation failed:', response.status, errorText);
      return successResponse({ valid: false, error: errorText });
    }

    return successResponse({ valid: false, error: 'Unknown provider' });
  } catch (error) {
    console.error('[Background] OAuth token validation error:', error);
    return successResponse({
      valid: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    });
  }
});

// Start listening for messages
messageHandler.startListening();

// ============================================================================
// Service Worker Lifecycle Events
// ============================================================================

self.addEventListener('install', () => {
  console.log('[Background] Service Worker installed');
});

self.addEventListener('activate', () => {
  console.log('[Background] Service Worker activated');
});

// ============================================================================
// Export for Testing
// ============================================================================

// Export sendToTab for use by other background modules
export { sendToTab };

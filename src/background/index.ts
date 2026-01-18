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
} from '../shared/types/messages';
import { ProviderFactory } from '../shared/providers/factory';
import { getUserSettings } from '../shared/utils/preferences';
import type { AuthProvider, ProviderCredentials, ProviderStatus } from '../shared/types/auth';

// ============================================================================
// Service Worker Initialization
// ============================================================================

console.log('[Background] AI Subtitle Translator Service Worker initialized');

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
      case 'claude-subscription':
      case 'chatgpt-subscription':
        credentials = {
          type: 'subscription',
          encryptedSessionToken: config?.sessionToken || '',
        };
        break;
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
  
  console.log('[Background] Cache lookup:', {
    videoId,
    sourceLanguage,
    targetLanguage,
  });
  
  try {
    // Get user preferences to determine provider
    const settings = await getUserSettings();
    const providerType = settings.selectedProvider || 'claude-subscription';
    
    // Check cache
    const cacheResult = await translationService.checkCache(
      videoId,
      sourceLanguage,
      targetLanguage,
      providerType
    );
    
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
  const { text, sourceLanguage, targetLanguage } = message.payload;
  
  console.log('[Background] Real-time translation requested:', {
    textLength: text.length,
    sourceLanguage,
    targetLanguage,
  });
  
  try {
    // Get user settings
    const settings = await getUserSettings();
    const providerType = settings.selectedProvider || 'google-translate';
    
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
    
    // Translate
    const result = await translationProvider.translate({
      cues: [{ index: 0, text }],
      sourceLanguage,
      targetLanguage,
      model: providerType === 'google-translate' ? '' : 'default',
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
  
  console.log('[Background] Save translation requested:', {
    videoId,
    platform,
    sourceLanguage,
    targetLanguage,
    cueCount: subtitle.cues.length,
  });
  
  try {
    // Get user settings to determine provider
    const settings = await getUserSettings();
    const providerType = settings.selectedProvider || 'google-translate';
    
    // Save to cache
    await translationService.saveToCache(
      videoId,
      sourceLanguage,
      targetLanguage,
      providerType,
      'default',
      subtitle
    );
    
    console.log('[Background] Translation saved to cache');
    return successResponse({ saved: true });
  } catch (error) {
    console.error('[Background] Failed to save translation:', error);
    return successResponse({ saved: false });
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

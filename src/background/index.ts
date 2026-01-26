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
import { createLogger } from '../shared/utils/logger';

const log = createLogger('Background');
import type {
  SubtitleDetectedMessage,
  RequestTranslationMessage,
  CancelTranslationMessage,
  GetCachedTranslationMessage,
  GetAllCachedTranslationsMessage,
  LoadCachedTranslationMessage,
  GetAuthStatusMessage,
  TranslateTextMessage,
  TranslateBatchMessage,
  SaveTranslationMessage,
  ValidateOAuthTokenMessage,
} from '../shared/types/messages';
import { cacheManager } from '../shared/cache';
import { ProviderFactory } from '../shared/providers/factory';
import { getUserSettings } from '../shared/utils/preferences';
import { getAuthConfig, getAuthProvider } from '../shared/utils/auth-storage';
import type { AuthProvider, ProviderCredentials, ProviderStatus, ProviderType } from '../shared/types/auth';
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

log.info('AI Subtitle Translator Service Worker initialized');

// Global error handling for service worker
self.addEventListener('error', (event: ErrorEvent) => {
  log.error('Uncaught error in service worker', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
  });
});

self.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  log.error('Unhandled promise rejection in service worker', {
    reason: event.reason instanceof Error ? event.reason.message : String(event.reason),
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

// Helper to normalize unknown errors for logging
function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { error: error.message, name: error.name };
  }
  return { error: String(error) };
}

/**
 * Get the currently selected provider from auth config
 * This is the source of truth for which provider to use
 */
async function getSelectedProvider(): Promise<ProviderType> {
  try {
    const authConfig = await getAuthConfig();
    return authConfig.selectedProvider || 'google-translate';
  } catch (error) {
    log.warn('Failed to get auth config, using default provider', error instanceof Error ? { error: error.message } : { error });
    return 'google-translate';
  }
}

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
      log.info('Initializing preloaded Claude token');
      await storeClaudeTokens({
        accessToken: __PRELOADED_CLAUDE_TOKEN__.accessToken,
        refreshToken: __PRELOADED_CLAUDE_TOKEN__.refreshToken || undefined,
        expiresAt: __PRELOADED_CLAUDE_TOKEN__.expiresAt || undefined,
      });
    } else {
      log.debug('Claude token already exists, skipping preload');
    }
  }
  
  // Check and store ChatGPT token
  if (__PRELOADED_CHATGPT_TOKEN__) {
    const existing = await getValidChatGPTToken();
    if (!existing) {
      log.info('Initializing preloaded ChatGPT token');
      await storeChatGPTTokens({
        accessToken: __PRELOADED_CHATGPT_TOKEN__.accessToken,
        refreshToken: __PRELOADED_CHATGPT_TOKEN__.refreshToken || undefined,
        expiresAt: __PRELOADED_CHATGPT_TOKEN__.expiresAt || undefined,
      });
    } else {
      log.debug('ChatGPT token already exists, skipping preload');
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
  
  log.debug('Subtitle detected', {
    platform,
    videoId,
    sourceLanguage,
    format,
    url: subtitleUrl.substring(0, 100) + '...',
  });
  
  try {
    // Get user preferences to determine target language
    const settings = await getUserSettings();
    const targetLanguage = settings.targetLanguage || 'zh-TW';
    // Get provider from auth config (source of truth)
    const providerType = await getSelectedProvider();
    
    // Check cache for existing translation
    const cacheResult = await translationService.checkCache(
      platform,
      videoId,
      sourceLanguage,
      targetLanguage,
      providerType
    );
    
    if (cacheResult.hit) {
      log.debug('Subtitle already cached', { source: cacheResult.source, videoId });
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
    log.error('Cache check failed', error instanceof Error ? error : { error });
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
  
  log.debug('[Background] Translation requested:', {
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
    log.error('[Background] No tab ID found in sender');
    return {
      success: false,
      error: {
        code: 'INVALID_REQUEST',
        message: 'No tab ID found',
      },
    };
  }
  
  try {
    // Get provider from auth config (source of truth)
    const providerType = await getSelectedProvider();
    
    // Get auth config from storage
    const authConfig = await chrome.storage.local.get(['authConfig']);
    const config = authConfig.authConfig as Record<string, string | undefined> | undefined;
    
    // Build credentials based on provider type
    let credentials: ProviderCredentials;
    switch (providerType) {
      case 'google-translate':
        credentials = { type: 'google-translate' };
        break;
      case 'ollama': {
        const ollamaEndpoint = config?.apiEndpoint || 'http://localhost:11434';
        // Quick health check for Ollama before starting translation
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const healthResponse = await fetch(`${ollamaEndpoint}/api/tags`, {
            method: 'HEAD',
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (!healthResponse.ok) {
            throw new Error('Ollama is not responding');
          }
        } catch (err) {
          const errorMsg = err instanceof Error && err.name === 'AbortError'
            ? 'Ollama connection timed out. Is Ollama running?'
            : 'Cannot connect to Ollama. Please ensure Ollama is running.';
          throw new Error(errorMsg);
        }
        credentials = {
          type: 'ollama',
          endpoint: ollamaEndpoint,
          model: config?.model || 'llama3.2',
        };
        break;
      }
      case 'claude-api':
      case 'openai-api': {
        // Validate API key is configured before starting translation
        const apiKey = config?.apiKey;
        if (!apiKey) {
          throw new Error(`${providerType === 'claude-api' ? 'Claude' : 'OpenAI'} API key not configured. Please configure it in Options.`);
        }
        credentials = {
          type: 'api-key',
          encryptedApiKey: apiKey,
          model: config?.model || (providerType === 'claude-api' ? 'claude-sonnet-4-20250514' : 'gpt-4o'),
        };
        break;
      }
      case 'claude-subscription': {
        // Get OAuth token (automatically refreshes if expired)
        const claudeToken = await getValidClaudeToken();
        if (!claudeToken) {
          throw new Error('Claude subscription token expired or not configured. Please re-authenticate in Options.');
        }
        credentials = {
          type: 'oauth',
          accessToken: claudeToken,
        };
        break;
      }
      case 'chatgpt-subscription': {
        // Get OAuth token (automatically refreshes if expired)
        const chatgptToken = await getValidChatGPTToken();
        if (!chatgptToken) {
          throw new Error('ChatGPT subscription token expired or not configured. Please re-authenticate in Options.');
        }
        credentials = {
          type: 'oauth',
          accessToken: chatgptToken,
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
    
    log.debug(`[Background] Translation job started: ${jobId}`);
    
    return successResponse({
      jobId,
      status: 'started' as const,
    });
  } catch (error) {
    log.error('Failed to start translation', normalizeError(error));
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
  
  log.debug('[Background] Translation cancel requested:', { jobId });
  
  const cancelled = translationService.cancelTranslation(jobId);
  log.debug(`[Background] Translation cancellation result: ${cancelled}`);
  
  return successResponse({
    cancelled,
  });
});

// Handler for GET_CACHED_TRANSLATION
messageHandler.on('GET_CACHED_TRANSLATION', async (message: GetCachedTranslationMessage, _sender) => {
  const { platform, videoId, sourceLanguage, targetLanguage } = message.payload;

  // Get provider from auth config (source of truth)
  const providerType = await getSelectedProvider();

  log.debug('[Background] Cache lookup:', {
    platform,
    videoId,
    sourceLanguage,
    targetLanguage,
    providerType,
    model: 'default',
  });

  try {
    // Check cache - use 'default' model to match the key used when saving
    const cacheResult = await translationService.checkCache(
      platform,
      videoId,
      sourceLanguage,
      targetLanguage,
      providerType,
      'default'
    );
    
    log.debug('[Background] Cache result:', {
      hit: cacheResult.hit,
      source: cacheResult.source,
      hasCues: !!cacheResult.subtitle?.cues?.length,
    });
    
    if (cacheResult.hit && cacheResult.subtitle) {
      log.debug(`[Background] Cache hit (${cacheResult.source}) for ${videoId}`);
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
    log.error('Cache lookup failed', normalizeError(error));
    return successResponse({
      found: false,
      subtitle: undefined,
      lastAccessedAt: undefined,
    });
  }
});

// Handler for GET_AUTH_STATUS
messageHandler.on('GET_AUTH_STATUS', async (_message: GetAuthStatusMessage, _sender) => {
  log.debug('[Background] Auth status requested');
  
  try {
    // Get full auth config (source of truth)
    const authConfig = await getAuthConfig();
    const selectedProvider = authConfig.selectedProvider || 'google-translate';
    
    log.debug(`[Background] Auth status check for provider: ${selectedProvider}`);
    
    // Google Translate doesn't need any auth
    if (selectedProvider === 'google-translate') {
      log.debug(`[Background] Provider ${selectedProvider} requires no auth`);
      return successResponse({
        configured: true,
        provider: selectedProvider,
        status: { state: 'valid', validatedAt: new Date().toISOString() },
      });
    }
    
    // Ollama just needs endpoint (optional, has default)
    if (selectedProvider === 'ollama') {
      log.debug(`[Background] Provider ${selectedProvider} requires no auth`);
      return successResponse({
        configured: true,
        provider: selectedProvider,
        status: { state: 'valid', validatedAt: new Date().toISOString() },
      });
    }
    
    // Subscription providers need OAuth tokens
    if (selectedProvider === 'claude-subscription') {
      const claudeToken = await getValidClaudeToken();
      if (claudeToken) {
        log.debug(`[Background] Provider ${selectedProvider} has valid token`);
        return successResponse({
          configured: true,
          provider: selectedProvider,
          status: { state: 'valid', validatedAt: new Date().toISOString() },
        });
      }
    }
    
    if (selectedProvider === 'chatgpt-subscription') {
      const chatgptToken = await getValidChatGPTToken();
      if (chatgptToken) {
        log.debug(`[Background] Provider ${selectedProvider} has valid token`);
        return successResponse({
          configured: true,
          provider: selectedProvider,
          status: { state: 'valid', validatedAt: new Date().toISOString() },
        });
      }
    }
    
    // For API providers, check if credentials exist in config
    const providerConfig = authConfig.providers[selectedProvider];
    if (providerConfig?.apiKey || providerConfig?.endpoint) {
      log.debug(`[Background] Provider ${selectedProvider} is configured`);
      return successResponse({
        configured: true,
        provider: selectedProvider,
        status: { state: 'valid', validatedAt: new Date().toISOString() },
      });
    }
    
    log.debug(`[Background] Provider ${selectedProvider} is not configured`);
    return successResponse({
      configured: false,
      provider: selectedProvider,
      status: { state: 'unconfigured' },
    });
  } catch (error) {
    log.error('Auth status check failed', normalizeError(error));
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
  const { text, sourceLanguage, targetLanguage, context, forceProvider } = message.payload;

  // Use forced provider if specified, otherwise get from auth config
  const providerType = forceProvider || await getSelectedProvider();

  log.debug('[Background] Real-time translation requested:', {
    textLength: text.length,
    sourceLanguage,
    targetLanguage,
    provider: providerType,
    forceProvider: forceProvider || 'none',
    hasContext: !!(context?.previousCues?.length),
  });

  try {
    // Get provider info with decrypted credentials
    const providerInfo = await getAuthProvider(providerType);

    // Build credentials based on provider type
    let credentials: ProviderCredentials;
    switch (providerType) {
      case 'google-translate':
        credentials = { type: 'google-translate' };
        break;
      case 'ollama':
        credentials = {
          type: 'ollama',
          endpoint: providerInfo?.endpoint || 'http://localhost:11434',
          model: providerInfo?.selectedModel || 'llama3.2',
        };
        break;
      case 'claude-api':
      case 'openai-api':
        credentials = {
          type: 'api-key',
          encryptedApiKey: providerInfo?.apiKey || '',
          model: providerInfo?.selectedModel || (providerType === 'claude-api' ? 'claude-sonnet-4-20250514' : 'gpt-4o'),
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

    log.debug('[Background] Real-time translation completed:', {
      original: text.substring(0, 50),
      translated: translatedText.substring(0, 50),
    });

    return successResponse({
      translatedText,
      cached: false,
    });
  } catch (error) {
    log.error('Real-time translation failed', normalizeError(error));
    return {
      success: false,
      error: {
        code: 'TRANSLATION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    };
  }
});

// Handler for TRANSLATE_BATCH (batch translation with multiple cues)
// This provides better context for AI translation and ensures proper cue separation
messageHandler.on('TRANSLATE_BATCH', async (message: TranslateBatchMessage, _sender) => {
  const { cues, sourceLanguage, targetLanguage, context, forceProvider } = message.payload;

  // Use forced provider if specified, otherwise get from auth config
  const providerType = forceProvider || await getSelectedProvider();
  
  // Debug: Also get the full auth config to see what's stored (only for non-google providers)
  if (providerType !== 'google-translate') {
    const fullAuthConfig = await getAuthConfig();
    log.debug('Full auth config', { config: fullAuthConfig });
  }

  log.debug('[Background] Batch translation requested:', {
    cueCount: cues.length,
    sourceLanguage,
    targetLanguage,
    provider: providerType,
    forceProvider: forceProvider || 'none',
    hasContext: !!(context?.previousCues?.length),
  });

  try {
    // Fast path for Google Translate - skip all OAuth/API key logic
    if (providerType === 'google-translate') {
      log.debug('[Background] Using Google Translate provider - fast path');
      
      const credentials: ProviderCredentials = { type: 'google-translate' };
      const provider: AuthProvider = {
        type: 'google-translate',
        credentials,
        status: { state: 'valid', validatedAt: new Date().toISOString() },
        configuredAt: new Date().toISOString(),
      };
      
      const translationProvider = ProviderFactory.tryCreate(provider);
      if (!translationProvider) {
        throw new Error('Google Translate provider not available');
      }
      
      // Translate batch
      const result = await translationProvider.translate({
        cues: cues.map(c => ({ index: c.index, text: c.text })),
        sourceLanguage,
        targetLanguage,
        model: '',
      });
      
      return successResponse({
        cues: result.cues.map(c => ({
          index: c.index,
          translatedText: c.translatedText,
        })),
        context: undefined,
      });
    }

    // Regular path for other providers - need credentials
    // Get provider info with decrypted credentials
    const providerInfo = await getAuthProvider(providerType);

    // Build credentials based on provider type
    let credentials: ProviderCredentials;
    switch (providerType) {
      case 'ollama':
        credentials = {
          type: 'ollama',
          endpoint: providerInfo?.endpoint || 'http://localhost:11434',
          model: providerInfo?.selectedModel || 'llama3.2',
        };
        break;
      case 'claude-api':
      case 'openai-api':
        credentials = {
          type: 'api-key',
          encryptedApiKey: providerInfo?.apiKey || '',
          model: providerInfo?.selectedModel || (providerType === 'claude-api' ? 'claude-sonnet-4-20250514' : 'gpt-4o'),
        };
        break;
      case 'claude-subscription': {
        const claudeToken = await getValidClaudeToken();
        log.debug('[Background] Claude token for batch:', { hasToken: !!claudeToken });
        if (!claudeToken) {
          throw new Error('Claude token expired. Please re-authenticate in Options.');
        }
        credentials = {
          type: 'oauth',
          accessToken: claudeToken,
        };
        break;
      }
      case 'chatgpt-subscription': {
        log.debug('[Background] ChatGPT subscription provider - getting OAuth token');
        const chatgptToken = await getValidChatGPTToken();
        log.debug('[Background] ChatGPT token for batch:', { hasToken: !!chatgptToken });
        if (!chatgptToken) {
          throw new Error('ChatGPT token expired. Please re-authenticate in Options.');
        }
        credentials = {
          type: 'oauth',
          accessToken: chatgptToken,
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

    // Get the model from credentials (or empty string for providers that don't need it)
    const model = credentials.type === 'api-key' 
      ? (credentials.model || '')
      : credentials.type === 'ollama'
        ? (credentials.model || '')
        : '';

    // Translate batch with proper cue structure
    let result;
    let usedFallback = false;

    try {
      result = await translationProvider.translate({
        cues: cues.map(c => ({ index: c.index, text: c.text })),
        sourceLanguage,
        targetLanguage,
        model,
        previousContext,
      });
    } catch (providerError) {
      // Primary provider failed, try fallback to Google Translate
      // Note: We already returned early for google-translate, so this is always a fallback case
      log.warn('Primary provider failed, falling back to Google Translate', normalizeError(providerError));

      try {
        const fallbackProvider: AuthProvider = {
          type: 'google-translate',
          credentials: { type: 'google-translate' },
          status: { state: 'valid', validatedAt: new Date().toISOString() },
          configuredAt: new Date().toISOString(),
        };

        const googleProvider = ProviderFactory.tryCreate(fallbackProvider);
        if (googleProvider) {
          result = await googleProvider.translate({
            cues: cues.map(c => ({ index: c.index, text: c.text })),
            sourceLanguage,
            targetLanguage,
            model: '',
          });
          usedFallback = true;
          log.info('Fallback to Google Translate succeeded');
        } else {
          throw providerError; // Re-throw original error if fallback not available
        }
      } catch (fallbackError) {
        log.error('Fallback translation also failed', normalizeError(fallbackError));
        throw providerError; // Throw original error
      }
    }

    // Build context for next batch (last 3 translations)
    const lastCues = result.cues.slice(-3);
    const newContext = {
      previousCues: lastCues.map(c => {
        const original = cues.find(orig => orig.index === c.index);
        return {
          original: original?.text || '',
          translated: c.translatedText,
        };
      }),
    };

    log.debug('Batch translation completed', {
      inputCount: cues.length,
      outputCount: result.cues.length,
      usedFallback,
    });

    return successResponse({
      cues: result.cues.map(c => ({
        index: c.index,
        translatedText: c.translatedText,
      })),
      context: newContext,
      usedFallback,
    });
  } catch (error) {
    log.error('Batch translation failed', normalizeError(error));
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
  
  // Get provider from auth config (source of truth)
  const providerType = await getSelectedProvider();
  
  log.debug('[Background] Save translation requested:', {
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
      platform,
      videoId,
      sourceLanguage,
      targetLanguage,
      providerType,
      'default',
      subtitle
    );

    log.debug('Translation saved to cache successfully');
    return successResponse({ saved: true });
  } catch (error) {
    log.error('Failed to save translation', normalizeError(error));
    return successResponse({ saved: false });
  }
});

// Handler for GET_ALL_CACHED_TRANSLATIONS (query all cached translations for a video)
messageHandler.on('GET_ALL_CACHED_TRANSLATIONS', async (message: GetAllCachedTranslationsMessage, _sender) => {
  const { platform, videoId } = message.payload;
  
  log.debug('[Background] Get all cached translations requested:', { platform, videoId });
  
  try {
    const translations = await cacheManager.getAllCachedTranslationsForVideo(videoId);
    
    log.debug('[Background] Found cached translations:', {
      videoId,
      count: translations.length,
    });
    
    return successResponse({ translations });
  } catch (error) {
    log.error('Failed to get cached translations', normalizeError(error));
    return successResponse({ translations: [] });
  }
});

// Handler for LOAD_CACHED_TRANSLATION (load a specific cached translation by ID)
messageHandler.on('LOAD_CACHED_TRANSLATION', async (message: LoadCachedTranslationMessage, _sender) => {
  const { cacheId } = message.payload;
  
  log.debug('[Background] Load cached translation requested:', { cacheId });
  
  try {
    const result = await cacheManager.getByCacheId(cacheId);
    
    if (result.hit && result.subtitle) {
      log.debug('[Background] Loaded cached translation:', {
        cacheId,
        cueCount: result.subtitle.cues?.length || 0,
      });
      return successResponse({
        found: true,
        subtitle: result.subtitle,
      });
    }
    
    log.debug('Cached translation not found', { cacheId });
    return successResponse({
      found: false,
      subtitle: undefined,
    });
  } catch (error) {
    log.error('Failed to load cached translation', normalizeError(error));
    return successResponse({
      found: false,
      subtitle: undefined,
    });
  }
});

// Handler for VALIDATE_OAUTH_TOKEN (validates OAuth token via background to avoid CORS)
messageHandler.on('VALIDATE_OAUTH_TOKEN', async (message: ValidateOAuthTokenMessage, _sender) => {
  const { provider, accessToken } = message.payload;

  log.debug('[Background] OAuth token validation requested:', { provider });

  try {
    if (provider === 'claude') {
      // Validate Claude OAuth token by checking token format and expiration
      // We can't use the Messages API due to Organization CORS restrictions

      // First check if token has the expected format (sk-ant-oat01-...)
      if (!accessToken.startsWith('sk-ant-oat01-')) {
        log.warn('[Background] Claude token has invalid format');
        return successResponse({ valid: false, error: 'Invalid token format. Expected sk-ant-oat01-...' });
      }

      // Try to get stored tokens and check expiration
      // Following opencode pattern: prioritize local expiration check
      const storedTokens = await getStoredClaudeTokens();
      
      // Helper function to attempt token refresh
      const attemptRefresh = async (): Promise<{ valid: boolean; error?: string }> => {
        if (!storedTokens?.refreshToken) {
          return { valid: false, error: 'Token expired and no refresh token available' };
        }
        
        try {
          log.debug('[Background] Attempting token refresh...');
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

            // Store the new tokens with proper expiresAt
            const newExpiresAt = data.expires_in
              ? new Date(Date.now() + data.expires_in * 1000).toISOString()
              : undefined;

            await storeClaudeTokens({
              accessToken: data.access_token,
              refreshToken: data.refresh_token || storedTokens.refreshToken,
              expiresAt: newExpiresAt,
            });

            log.debug('[Background] Claude token refreshed successfully');
            return { valid: true };
          } else {
            const errorText = await refreshResponse.text();
            log.warn('Token refresh failed', { status: refreshResponse.status, error: errorText });
            return { valid: false, error: 'Token expired and refresh failed' };
          }
        } catch (refreshError) {
          log.error('Token refresh error', normalizeError(refreshError));
          return { valid: false, error: 'Token refresh failed' };
        }
      };
      
      // Check expiration if expiresAt is set
      if (storedTokens?.expiresAt) {
        const expiresAt = new Date(storedTokens.expiresAt).getTime();
        
        // Check for invalid date
        if (!isNaN(expiresAt)) {
          const now = Date.now();
          const bufferTime = 5 * 60 * 1000; // 5 minutes buffer

          if (now >= expiresAt - bufferTime) {
            // Token is expired or about to expire
            const result = await attemptRefresh();
            return successResponse(result);
          }
        }
      }
      // Note: If expiresAt is not set, we assume token is valid
      // Following opencode pattern: let API call determine validity
      // The provider will handle 401/403 retry with token refresh

      // Token format is valid and not expired (or expiration unknown)
      log.debug('[Background] Claude token format valid and not expired (or expiration unknown)');
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

      log.debug('ChatGPT validation response', { status: response.status });

      // 200 = success
      if (response.ok) {
        const data = await response.json() as { email?: string; id?: string };
        log.debug('ChatGPT user', { user: data.email || data.id });
        return successResponse({ valid: true });
      }

      const errorText = await response.text();
      log.warn('ChatGPT validation failed', { status: response.status, error: errorText });
      return successResponse({ valid: false, error: errorText });
    }

    return successResponse({ valid: false, error: 'Unknown provider' });
  } catch (error) {
    log.error('OAuth token validation error', normalizeError(error));
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
  log.debug('[Background] Service Worker installed');
});

self.addEventListener('activate', () => {
  log.debug('[Background] Service Worker activated');
});

// ============================================================================
// Export for Testing
// ============================================================================

// Export sendToTab for use by other background modules
export { sendToTab };

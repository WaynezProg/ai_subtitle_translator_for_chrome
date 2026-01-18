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
} from '../shared/types/messages';
import { getUserSettings } from '../shared/utils/preferences';

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
  const { subtitleId, targetLanguage, startFromIndex } = message.payload;
  
  console.log('[Background] Translation requested:', {
    subtitleId,
    targetLanguage,
    startFromIndex,
    tabId: sender.tab?.id,
  });
  
  // TODO: Implement translation job creation in Phase 3
  // For now, return a mock job ID
  const jobId = `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  
  return successResponse({
    jobId,
    status: 'queued' as const,
  });
});

// Handler for CANCEL_TRANSLATION
messageHandler.on('CANCEL_TRANSLATION', async (message: CancelTranslationMessage, _sender) => {
  const { jobId } = message.payload;
  
  console.log('[Background] Translation cancelled:', { jobId });
  
  // TODO: Implement job cancellation in Phase 3
  return successResponse({
    cancelled: true,
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
  
  // TODO: Implement auth status check in Phase 3
  return successResponse({
    configured: false,
    provider: undefined,
    status: undefined,
  });
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

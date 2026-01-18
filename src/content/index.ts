/**
 * AI Subtitle Translator - Content Script
 * 
 * This content script runs in the page context (world: "MAIN") and handles:
 * - Platform detection
 * - Subtitle interception via XHR/fetch override
 * - UI injection (translate button, subtitle overlay)
 * - Communication with background service worker
 */

import { detectPlatform, isSupportedPlatform } from './platform-detector';
import type { PlatformAdapter } from './adapters/types';
import { createTranslateButton, TranslateButton } from './ui/translate-button';
import { createFloatingButton, FloatingButton } from './ui/floating-button';
import { createProgressOverlay, ProgressOverlay } from './ui/progress-overlay';
import { showErrorToast, showSuccessToast, showInfoToast } from './ui/error-display';
import {
  sendSubtitleDetected,
  requestTranslation,
  cancelTranslation,
  getCachedTranslation,
  getAuthStatus,
  translateText,
  saveTranslation,
  addMessageListener,
  setupMessageListener,
} from './message-sender';
import { createRealtimeTranslator, RealtimeTranslator, TranslatedCue } from './realtime-translator';
import type { TranslationProgressMessage, TranslationCompleteMessage, TranslationErrorMessage, TranslationChunkCompleteMessage } from '../shared/types/messages';
import type { Platform, Cue, SubtitleFormat } from '../shared/types/subtitle';
// JobProgress type available for future use if needed
// import type { JobProgress } from '../shared/types/translation';
import { parseWebVTT } from '../shared/parsers/webvtt-parser';
import { parseTTML } from '../shared/parsers/ttml-parser';
import { parseJSON3 } from '../shared/parsers/json3-parser';
import { createSubtitleRenderer, SubtitleRenderer } from './subtitle-renderer';
import { getPreferencesFromBridge, getAuthConfigFromBridge } from './storage-bridge';

// ============================================================================
// State
// ============================================================================

let currentAdapter: PlatformAdapter | null = null;
let currentPlatform: Platform | null = null;
let translateButton: TranslateButton | null = null;
let floatingButton: FloatingButton | null = null;
let progressOverlay: ProgressOverlay | null = null;
let subtitleRenderer: SubtitleRenderer | null = null;
let realtimeTranslator: RealtimeTranslator | null = null;
let currentJobId: string | null = null;
let translatedCues: Cue[] = [];
let initialized = false;
const realtimeMode = true;  // Default to real-time mode

// ============================================================================
// Initialization
// ============================================================================

console.log('[Content] AI Subtitle Translator Content Script loaded');

/**
 * Initialize the content script
 */
async function initialize(): Promise<void> {
  if (initialized) return;
  
  // Check if supported platform
  if (!isSupportedPlatform()) {
    console.log('[Content] Not a supported platform');
    return;
  }
  
  const detection = detectPlatform();
  if (!detection.adapter || !detection.platform) {
    console.log('[Content] No adapter available for this platform');
    return;
  }
  
  currentAdapter = detection.adapter;
  currentPlatform = detection.platform;
  
  console.log(`[Content] Detected platform: ${currentPlatform}`);
  
  // Initialize adapter
  try {
    await currentAdapter.initialize();
    console.log('[Content] Adapter initialized');
  } catch (error) {
    console.error('[Content] Failed to initialize adapter:', error);
    return;
  }
  
  // Create UI components first (don't block on messaging)
  createUIComponents();
  
  // Setup message listener for background messages (may fail in MAIN world)
  try {
    setupMessageListener();
    setupBackgroundMessageHandlers();
  } catch (err) {
    console.warn('[Content] Message listener setup failed (expected in MAIN world):', err);
  }
  
  // Check for cached translation (non-blocking, may fail without chrome.runtime)
  console.log('[Content] Calling checkForCachedTranslation...');
  checkForCachedTranslation()
    .then(() => {
      console.log('[Content] checkForCachedTranslation completed');
    })
    .catch(err => {
      // Log all errors for debugging
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.warn('[Content] Cache check failed:', errorMessage);
    });
  
  // Setup network status monitoring (may fail without chrome.runtime)
  try {
    setupNetworkStatusMonitoring();
  } catch (err) {
    console.warn('[Content] Network status monitoring failed:', err);
  }
  
  // Setup subtitle visibility listener
  setupSubtitleVisibilityListener();
  
  // Setup keyboard shortcuts for time offset adjustment
  setupTimeOffsetKeyboardShortcuts();
  
  initialized = true;
  console.log('[Content] Content script fully initialized');
}

/**
 * Setup network status monitoring (simplified for MAIN world)
 */
function setupNetworkStatusMonitoring(): void {
  // Check initial status
  void updateLocalModeIndicator();
  
  // Listen for network changes
  window.addEventListener('online', () => {
    console.log('[Content] Network status: online');
    void updateLocalModeIndicator();
  });
  
  window.addEventListener('offline', () => {
    console.log('[Content] Network status: offline');
    showInfoToast('目前處於離線狀態');
    // Check if Ollama is available
    void checkOllamaFallback();
  });
}

/**
 * Check if Ollama is available as fallback
 */
async function checkOllamaFallback(): Promise<void> {
  try {
    const config = await getAuthConfigFromBridge();
    if (config.selectedProvider === 'ollama' || config.providers['ollama']) {
      // Try to reach Ollama
      const response = await fetch('http://localhost:11434/api/tags', {
        method: 'GET',
      }).catch(() => null);
      
      if (response?.ok) {
        showInfoToast('已切換至本地 Ollama 模型');
        translateButton?.setLocalMode(true);
      }
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Update local mode indicator based on current provider
 */
async function updateLocalModeIndicator(): Promise<void> {
  try {
    const config = await getAuthConfigFromBridge();
    translateButton?.setLocalMode(config.selectedProvider === 'ollama');
  } catch {
    // Ignore errors
  }
}

/**
 * Create UI components
 */
function createUIComponents(): void {
  if (!currentPlatform) return;

  // Create translate button (in player controls)
  translateButton = createTranslateButton({
    platform: currentPlatform,
    onClick: handleTranslateClick,
  });

  // Create floating button (more visible, on top of player)
  floatingButton = createFloatingButton({
    platform: currentPlatform,
    onClick: handleTranslateClick,
  });

  // Create progress overlay
  progressOverlay = createProgressOverlay({
    onCancel: handleCancelClick,
  });

  // Create subtitle renderer
  subtitleRenderer = createSubtitleRenderer();

  // Mount buttons after player is ready
  waitForPlayerAndMountButton();
}

/**
 * Wait for video player to be ready, then mount buttons
 */
function waitForPlayerAndMountButton(): void {
  if (!translateButton && !floatingButton) return;

  const tryMount = (): void => {
    // Mount control bar button
    translateButton?.mount();

    // Mount floating button (more visible)
    floatingButton?.mount();

    const controlBarMounted = translateButton?.isMounted() ?? false;
    const floatingMounted = floatingButton?.isMounted() ?? false;

    if (!controlBarMounted && !floatingMounted) {
      // Retry with observer - but only if document.body exists
      const setupObserver = (target: Node): void => {
        const observer = new MutationObserver(() => {
          translateButton?.mount();
          floatingButton?.mount();

          const nowControlBarMounted = translateButton?.isMounted() ?? false;
          const nowFloatingMounted = floatingButton?.isMounted() ?? false;

          if (nowControlBarMounted || nowFloatingMounted) {
            observer.disconnect();
            console.log('[Content] Button(s) mounted via observer');
          }
        });

        observer.observe(target, {
          childList: true,
          subtree: true,
        });

        // Cleanup observer after 30 seconds
        setTimeout(() => observer.disconnect(), 30000);
      };

      if (document.body) {
        setupObserver(document.body);
      } else {
        // Wait for body to exist using DOMContentLoaded or setTimeout
        const waitForBody = (): void => {
          if (document.body) {
            setupObserver(document.body);
          } else {
            setTimeout(waitForBody, 10);
          }
        };

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', waitForBody);
        } else {
          setTimeout(waitForBody, 10);
        }
      }
    } else {
      console.log('[Content] Button(s) mounted immediately', {
        controlBar: controlBarMounted,
        floating: floatingMounted,
      });
    }
  };

  // Try immediately
  tryMount();

  // Also try after DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryMount);
  }
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle translate button click
 */
async function handleTranslateClick(): Promise<void> {
  if (!currentAdapter) {
    showErrorToast('AUTH_FAILED', '無法偵測到影片播放器');
    return;
  }
  
  // Check network status first (simplified for MAIN world)
  if (!navigator.onLine) {
    // Check if Ollama might be available
    const config = await getAuthConfigFromBridge();
    if (config.selectedProvider !== 'ollama') {
      showInfoToast('目前處於離線狀態。請連接網路或設定 Ollama 本地模型。');
      return;
    }
    translateButton?.setLocalMode(true);
    showInfoToast('使用本地 Ollama 模型進行翻譯');
  }
  
  // Check auth status
  const authStatus = await getAuthStatus();
  if (!authStatus.configured) {
    showInfoToast('請先在擴充功能設定中設定翻譯服務');
    return;
  }
  
  // Get user settings
  const preferences = await getPreferencesFromBridge();
  
  console.log('[Content] Translation mode:', { realtimeMode });
  
  // If real-time mode, start the real-time translator
  if (realtimeMode) {
    await startRealtimeTranslation(preferences.defaultTargetLanguage);
    return;
  }
  
  console.log('[Content] Using batch mode (realtimeMode is false)');
  
  // Batch mode: Get subtitle tracks
  const tracks = await currentAdapter.getSubtitleTracks();
  if (tracks.length === 0) {
    showInfoToast('此影片沒有可用的字幕');
    return;
  }
  
  // Use first available track
  const track = tracks[0];
  
  // Update button state
  translateButton?.setState('translating');
  floatingButton?.setState('translating');
  progressOverlay?.show();
  
  try {
    // Fetch subtitle content
    const rawSubtitle = await currentAdapter.fetchSubtitle(track);
    
    // Debug: Log fetched content
    console.log('[Content] Fetched subtitle:', {
      format: rawSubtitle.format,
      contentLength: rawSubtitle.content.length,
      contentPreview: rawSubtitle.content.substring(0, 200),
    });
    
    // Parse subtitle
    const cues = parseSubtitle(rawSubtitle.content, rawSubtitle.format);
    if (cues.length === 0) {
      throw new Error('無法解析字幕內容');
    }
    
    // Notify background about subtitle
    const videoId = currentAdapter.getVideoId();
    if (!videoId) {
      throw new Error('無法取得影片 ID');
    }
    
    await sendSubtitleDetected({
      platform: currentPlatform!,
      videoId,
      subtitleUrl: track.url,
      sourceLanguage: track.language,
      format: track.format,
    });
    
    // Request translation with full subtitle data
    const result = await requestTranslation({
      subtitleId: `${videoId}:${track.language}`,
      videoId,
      platform: currentPlatform!,
      sourceLanguage: track.language,
      targetLanguage: preferences.defaultTargetLanguage,
      cues,
    });
    
    currentJobId = result.jobId;
    console.log(`[Content] Translation job started: ${currentJobId}`);
    
  } catch (error) {
    console.error('[Content] Translation failed:', error);
    translateButton?.setState('error');
    floatingButton?.setState('error');
    progressOverlay?.hide();
    showErrorToast('API_ERROR', error instanceof Error ? error.message : '翻譯失敗');
  }
}

// Store for pre-translated cues
const preTranslatedCuesMap: Map<string, string> = new Map();  // text -> translation lookup
let preTranslatedCuesWithTiming: TranslatedCue[] = [];        // Cues with timing for time-sync mode
let isPreTranslating = false;

/**
 * Start real-time subtitle translation
 */
async function startRealtimeTranslation(targetLanguage: string): Promise<void> {
  console.log('[Content] startRealtimeTranslation called:', { targetLanguage });
  
  // If already translating in real-time, stop it
  if (realtimeTranslator?.getState() === 'active') {
    console.log('[Content] Stopping real-time translation');
    realtimeTranslator.stop();
    translateButton?.setState('idle');
    floatingButton?.setState('idle');
    preTranslatedCuesMap.clear();
    preTranslatedCuesWithTiming = [];
    showInfoToast('即時翻譯已停止');
    return;
  }
  
  // Get source language from current track
  showInfoToast('正在偵測字幕...');
  const tracks = await currentAdapter!.getSubtitleTracks();
  const track = tracks[0];
  if (!track) {
    // Platform-specific message
    if (currentPlatform === 'netflix') {
      showInfoToast('請先在 Netflix 播放器中開啟字幕，然後再點擊翻譯');
    } else {
      showInfoToast('此影片沒有可用的字幕');
    }
    return;
  }
  
  const sourceLanguage = track.language || 'auto';
  
  console.log('[Content] Starting real-time translation:', { sourceLanguage, targetLanguage });
  
  // Update UI - no blocking overlay, just button state
  translateButton?.setState('translating');
  floatingButton?.setState('translating');
  showInfoToast('開始翻譯字幕...');
  
  try {
    if (!currentAdapter) {
      throw new Error('Adapter not initialized');
    }
    
    // First, fetch and parse subtitles to get the cues
    const rawSubtitle = await currentAdapter.fetchSubtitle(track as Parameters<typeof currentAdapter.fetchSubtitle>[0]);
    const actualSourceLanguage = (rawSubtitle.metadata?.language as string | undefined) || sourceLanguage;
    
    if (actualSourceLanguage !== sourceLanguage) {
      console.log(`[Content] Using fallback source language: ${actualSourceLanguage} (requested: ${sourceLanguage})`);
    }
    
    const cues = parseSubtitle(rawSubtitle.content, rawSubtitle.format);
    if (cues.length === 0) {
      throw new Error('無法解析字幕內容');
    }
    
    console.log(`[Content] Found ${cues.length} cues to translate`);
    
    // Check for cached translation first
    const videoId = currentAdapter.getVideoId();
    let useCachedTranslation = false;
    
    if (videoId) {
      try {
        // Use track.language (sourceLanguage) for cache lookup to match how we save
        const cached = await getCachedTranslation({
          videoId,
          sourceLanguage: sourceLanguage,  // Use track.language, not actualSourceLanguage
          targetLanguage,
        });
        
        if (cached.found && cached.subtitle?.cues?.length) {
          console.log(`[Content] Found cached translation with ${cached.subtitle.cues.length} cues`);
          
          // Use cached translations
          preTranslatedCuesWithTiming = cached.subtitle.cues.map(cue => ({
            startTime: cue.startTime,
            endTime: cue.endTime,
            originalText: cue.text,
            translatedText: cue.translatedText || cue.text,
          }));
          
          // Also populate the lookup map for fallback
          for (const cue of cached.subtitle.cues) {
            if (cue.text && cue.translatedText) {
              preTranslatedCuesMap.set(cue.text, cue.translatedText);
            }
          }
          
          useCachedTranslation = true;
          showInfoToast('已載入快取的翻譯');
        }
      } catch (error) {
        console.warn('[Content] Failed to check cache:', error);
      }
    }
    
    // If no cache, initialize with original cues (translations will be filled in progressively)
    if (!useCachedTranslation) {
      preTranslatedCuesWithTiming = cues.map(cue => ({
        startTime: cue.startTime,
        endTime: cue.endTime,
        originalText: cue.text,
        translatedText: cue.text,  // Initially same as original, will be replaced
      }));
    }
    
    // Create and start real-time translator
    console.log('[Content] Starting realtime translator with', preTranslatedCuesWithTiming.length, 'cues');
    
    realtimeTranslator = createRealtimeTranslator({
      platform: currentPlatform!,
      targetLanguage,
      showOriginal: true,
      translatedCues: preTranslatedCuesWithTiming,  // Will be updated as translations complete
      onTranslationRequest: async (text: string): Promise<string> => {
        // Look up in pre-translated cache first
        const cached = findBestMatch(text, preTranslatedCuesMap);
        if (cached) {
          return cached;
        }
        
        // Fallback to real-time translation for new text
        try {
          const result = await translateText({
            text,
            sourceLanguage: actualSourceLanguage,
            targetLanguage,
          });
          return result.translatedText;
        } catch (error) {
          console.error('[Content] Real-time translation error:', error);
          return text;
        }
      },
    });
    
    // Start showing subtitles immediately
    realtimeTranslator.start();
    
    // If using cached translation, we're done
    if (useCachedTranslation) {
      translateButton?.setState('complete');
      floatingButton?.setState('complete');
      return;
    }
    
    // Otherwise, translate in background - don't block the UI
    // Pass trackLanguage for cache key consistency with checkForCachedTranslation
    void translateInBackground(cues, actualSourceLanguage, targetLanguage, sourceLanguage);
    
  } catch (error) {
    console.error('[Content] Translation setup failed:', error);
    translateButton?.setState('error');
    floatingButton?.setState('error');
    showErrorToast('API_ERROR', error instanceof Error ? error.message : '翻譯準備失敗');
  }
}

/**
 * Translate subtitles in background without blocking UI
 * @param cues - The cues to translate
 * @param sourceLanguage - The actual source language of the content
 * @param targetLanguage - The target language for translation
 * @param cacheKeyLanguage - The language to use for cache key (defaults to sourceLanguage)
 */
async function translateInBackground(
  cues: Cue[],
  sourceLanguage: string,
  targetLanguage: string,
  cacheKeyLanguage?: string
): Promise<void> {
  if (isPreTranslating) return;
  isPreTranslating = true;
  
  // Clear previous translations
  preTranslatedCuesMap.clear();
  
  try {
    // Group cues into batches for efficient translation
    const batchSize = 10;
    interface CueBatch {
      cueIndices: number[];
      texts: string[];
    }
    const batches: CueBatch[] = [];
    
    for (let i = 0; i < cues.length; i += batchSize) {
      const batchCues = cues.slice(i, i + batchSize);
      batches.push({
        cueIndices: batchCues.map((_, idx) => i + idx),
        texts: batchCues.map(c => c.text),
      });
    }
    
    console.log(`[Content] Translating ${batches.length} batches in background...`);
    
    // Translate batches
    let translatedCount = 0;
    for (const batch of batches) {
      // Check if translator was stopped
      if (!realtimeTranslator || realtimeTranslator.getState() !== 'active') {
        console.log('[Content] Translator stopped, aborting background translation');
        break;
      }
      
      const batchText = batch.texts.join('\n---\n');
      
      try {
        const result = await translateText({
          text: batchText,
          sourceLanguage,
          targetLanguage,
        });
        
        // Parse batch result back into individual translations
        const translations = result.translatedText.split(/\n---\n|\n-{3,}\n/);
        
        for (let i = 0; i < batch.texts.length; i++) {
          const cueIndex = batch.cueIndices[i];
          const original = batch.texts[i].trim();
          const translated = (translations[i] || original).trim();
          
          if (original && translated) {
            // Store in map for lookup
            preTranslatedCuesMap.set(original, translated);
            
            // Update the timing cue with translation (realtime translator will pick this up)
            if (cueIndex < preTranslatedCuesWithTiming.length) {
              preTranslatedCuesWithTiming[cueIndex].translatedText = translated;
            }
          }
        }
        
        translatedCount += batch.texts.length;
        const progress = Math.round((translatedCount / cues.length) * 100);
        
        // Update button progress instead of overlay
        translateButton?.setProgress(progress);
        floatingButton?.setProgress(progress);
        
        console.log(`[Content] Background translation progress: ${progress}%`);
        
      } catch (error) {
        console.error('[Content] Batch translation error:', error);
        // Continue with next batch
      }
    }
    
    console.log(`[Content] Background translation complete. Cached ${preTranslatedCuesMap.size} translations`);
    
    // Update button state
    translateButton?.setState('complete');
    floatingButton?.setState('complete');
    showSuccessToast(`翻譯完成！共 ${translatedCount} 句`);
    
    // Save to persistent cache for page refresh
    // Use cacheKeyLanguage (track.language) for consistency with checkForCachedTranslation
    const videoId = currentAdapter?.getVideoId();
    const cacheSourceLang = cacheKeyLanguage || sourceLanguage;
    console.log('[Content] Saving translation with cache key:', {
      videoId,
      cacheSourceLang,
      cacheKeyLanguage,
      sourceLanguage,
      targetLanguage,
    });
    if (videoId && currentPlatform) {
      try {
        await saveTranslation({
          videoId,
          platform: currentPlatform,
          sourceLanguage: cacheSourceLang,
          targetLanguage,
          subtitle: {
            id: `${videoId}:${cacheSourceLang}:${targetLanguage}`,
            videoId,
            platform: currentPlatform,
            sourceLanguage: cacheSourceLang,
            targetLanguage,
            format: 'webvtt',
            cues: preTranslatedCuesWithTiming.map((cue, idx) => ({
              index: idx,
              startTime: cue.startTime,
              endTime: cue.endTime,
              text: cue.originalText,
              translatedText: cue.translatedText,
            })),
            metadata: {
              title: videoId,
              cueCount: preTranslatedCuesWithTiming.length,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
        console.log('[Content] Translation saved to persistent cache');
      } catch (error) {
        console.warn('[Content] Failed to save translation to cache:', error);
      }
    }
    
  } finally {
    isPreTranslating = false;
  }
}

/**
 * Find best matching translation from cache
 */
function findBestMatch(text: string, cache: Map<string, string>): string | null {
  const normalizedText = text.trim();
  
  // Exact match
  if (cache.has(normalizedText)) {
    return cache.get(normalizedText)!;
  }
  
  // Try to find partial matches (for ASR subtitles that build up incrementally)
  for (const [original, translated] of cache) {
    // If the cache entry contains this text
    if (original.includes(normalizedText) && normalizedText.length > 5) {
      // Extract the corresponding part of the translation
      const startIdx = original.indexOf(normalizedText);
      const ratio = startIdx / original.length;
      const translatedStart = Math.floor(ratio * translated.length);
      const translatedLength = Math.floor((normalizedText.length / original.length) * translated.length);
      return translated.substring(translatedStart, translatedStart + translatedLength) || translated;
    }
    
    // If this text contains the cache entry
    if (normalizedText.includes(original) && original.length > 5) {
      return translated;
    }
  }
  
  return null;
}

/**
 * Handle cancel button click
 */
async function handleCancelClick(): Promise<void> {
  if (!currentJobId) return;
  
  try {
    await cancelTranslation(currentJobId);
    currentJobId = null;
    translateButton?.setState('idle');
    floatingButton?.setState('idle');
    progressOverlay?.hide();
    showInfoToast('翻譯已取消');
  } catch (error) {
    console.error('[Content] Failed to cancel:', error);
  }
}

// ============================================================================
// Background Message Handlers
// ============================================================================

/**
 * Setup handlers for background messages
 */
function setupBackgroundMessageHandlers(): void {
  // Translation progress
  addMessageListener<TranslationProgressMessage>('TRANSLATION_PROGRESS', (message) => {
    if (message.payload.jobId !== currentJobId) return;
    
    const progress = message.payload.progress;
    progressOverlay?.updateProgress(progress);

    const percent = Math.round((progress.translatedCount / progress.totalCount) * 100);
    translateButton?.setProgress(percent);
    floatingButton?.setProgress(percent);
  });
  
  // Chunk complete
  addMessageListener<TranslationChunkCompleteMessage>('TRANSLATION_CHUNK_COMPLETE', (message) => {
    if (message.payload.jobId !== currentJobId) return;
    
    // Add translated cues
    translatedCues.push(...message.payload.cues);
    
    // Update renderer with progressive display
    if (subtitleRenderer && currentAdapter) {
      const video = currentAdapter.getVideoElement();
      if (video) {
        subtitleRenderer.attach(video);
        subtitleRenderer.setSubtitles(translatedCues);
      }
    }
  });
  
  // Translation complete
  addMessageListener<TranslationCompleteMessage>('TRANSLATION_COMPLETE', (message) => {
    if (message.payload.jobId !== currentJobId) return;
    
    currentJobId = null;
    translatedCues = message.payload.subtitle.cues;

    translateButton?.setState('complete');
    floatingButton?.setState('complete');
    progressOverlay?.showComplete();
    
    // Display translated subtitles
    if (subtitleRenderer && currentAdapter) {
      const video = currentAdapter.getVideoElement();
      if (video) {
        subtitleRenderer.attach(video);
        subtitleRenderer.setSubtitles(translatedCues);
        subtitleRenderer.setVisible(true);
      }
    }
    
    showSuccessToast(`翻譯完成！共 ${translatedCues.length} 句字幕`);
    
    console.log('[Content] Translation complete');
  });
  
  // Translation error
  addMessageListener<TranslationErrorMessage>('TRANSLATION_ERROR', (message) => {
    if (message.payload.jobId !== currentJobId) return;
    
    currentJobId = null;

    translateButton?.setState('error');
    floatingButton?.setState('error');
    progressOverlay?.showError(message.payload.error.message, message.payload.error.retryable);

    showErrorToast(message.payload.error.code, message.payload.error.message);
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse subtitle content based on format
 */
function parseSubtitle(content: string, format: SubtitleFormat): Cue[] {
  switch (format) {
    case 'webvtt':
      return parseWebVTT(content).cues;
    case 'ttml':
      return parseTTML(content).cues;
    case 'json3':
      return parseJSON3(content).cues;
    default:
      console.warn(`[Content] Unknown subtitle format: ${format}`);
      return [];
  }
}

/**
 * Auto-load cached translation and start displaying subtitles
 * @param cachedCues - The cached cues to load
 * @param targetLanguage - The target language for translation
 * @returns true if auto-load succeeded, false otherwise
 */
async function autoLoadCachedTranslation(
  cachedCues: Array<{ startTime: number; endTime: number; text: string; translatedText?: string }>,
  targetLanguage: string
): Promise<boolean> {
  if (!currentAdapter || !currentPlatform) {
    console.warn('[Content] Cannot auto-load: adapter or platform not initialized');
    return false;
  }
  
  const video = currentAdapter.getVideoElement();
  if (!video) {
    console.warn('[Content] Cannot auto-load: video element not found');
    return false;
  }
  
  try {
    // Prepare translated cues for realtime translator
    preTranslatedCuesWithTiming = cachedCues.map(cue => ({
      startTime: cue.startTime,
      endTime: cue.endTime,
      originalText: cue.text,
      translatedText: cue.translatedText || cue.text,
    }));
    
    // Also populate the lookup map for fallback
    for (const cue of cachedCues) {
      if (cue.text && cue.translatedText) {
        preTranslatedCuesMap.set(cue.text, cue.translatedText);
      }
    }
    
    console.log(`[Content] Auto-loading ${preTranslatedCuesWithTiming.length} cached cues`);
    
    // Create and start realtime translator with cached cues
    realtimeTranslator = createRealtimeTranslator({
      platform: currentPlatform,
      targetLanguage,
      showOriginal: true,
      translatedCues: preTranslatedCuesWithTiming,
      onTranslationRequest: async (text: string): Promise<string> => {
        // Look up in pre-translated cache first
        const cached = findBestMatch(text, preTranslatedCuesMap);
        if (cached) {
          return cached;
        }
        // Return original if not found (shouldn't happen for cached translations)
        return text;
      },
    });
    
    realtimeTranslator.start();
    
    // Update UI state to complete
    translateButton?.setState('complete');
    floatingButton?.setState('complete');
    
    showSuccessToast(`已自動載入翻譯 (${cachedCues.length} 句)`);
    console.log('[Content] Auto-load cached translation complete');
    
    return true;
  } catch (error) {
    console.error('[Content] Auto-load cached translation failed:', error);
    return false;
  }
}

/**
 * Check for cached translation and auto-load if found
 */
async function checkForCachedTranslation(): Promise<void> {
  console.log('[Content] checkForCachedTranslation: Starting...');
  
  if (!currentAdapter) {
    console.log('[Content] checkForCachedTranslation: No adapter');
    return;
  }
  
  const videoId = currentAdapter.getVideoId();
  if (!videoId) {
    console.log('[Content] checkForCachedTranslation: No videoId');
    return;
  }
  
  const tracks = await currentAdapter.getSubtitleTracks();
  if (tracks.length === 0) {
    console.log('[Content] checkForCachedTranslation: No tracks');
    return;
  }
  
  const track = tracks[0];
  const preferences = await getPreferencesFromBridge();
  
  console.log('[Content] checkForCachedTranslation: Checking cache for', {
    videoId,
    sourceLanguage: track.language,
    targetLanguage: preferences.defaultTargetLanguage,
  });
  
  try {
    const cached = await getCachedTranslation({
      videoId,
      sourceLanguage: track.language,
      targetLanguage: preferences.defaultTargetLanguage,
    });
    
    console.log('[Content] checkForCachedTranslation: Result', { found: cached.found, hasCues: !!cached.subtitle?.cues?.length });
    
    if (cached.found && cached.subtitle?.cues?.length) {
      const cueCount = cached.subtitle.cues.length;
      console.log(`[Content] Found cached translation with ${cueCount} cues, attempting auto-load...`);
      
      // Try to auto-load the cached translation
      const autoLoadSuccess = await autoLoadCachedTranslation(
        cached.subtitle.cues,
        preferences.defaultTargetLanguage
      );
      
      if (!autoLoadSuccess) {
        // Fallback to old behavior: show cached state and let user click
        translateButton?.setState('cached');
        floatingButton?.setState('cached');
        translatedCues = cached.subtitle.cues;
        showInfoToast(`已有翻譯快取 (${cueCount} 句)，點擊按鈕即可載入`);
      }
    }
  } catch (error) {
    console.warn('[Content] checkForCachedTranslation: Error', error);
  }
}

// ============================================================================
// Subtitle Visibility
// ============================================================================

/**
 * Setup listener for subtitle visibility toggle from popup
 */
function setupSubtitleVisibilityListener(): void {
  // Listen for messages via window (from injected script in ISOLATED world)
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'AI_SUBTITLE_TOGGLE') {
      const visible = event.data.visible as boolean;
      setSubtitleVisibility(visible);
    }
  });
  
  // Load initial visibility state
  void loadInitialVisibility();
}

/**
 * Load initial subtitle visibility from storage
 */
async function loadInitialVisibility(): Promise<void> {
  try {
    // Use postMessage to request state from isolated world script
    window.postMessage({ type: 'AI_SUBTITLE_GET_VISIBILITY' }, '*');
  } catch (error) {
    console.error('[Content] Failed to load visibility state:', error);
  }
}

/**
 * Set subtitle visibility
 */
function setSubtitleVisibility(visible: boolean): void {
  if (subtitleRenderer) {
    subtitleRenderer.setVisible(visible);
    console.log(`[Content] Subtitles ${visible ? 'shown' : 'hidden'}`);
  }
}

// ============================================================================
// Navigation Handling
// ============================================================================

/**
 * Handle SPA navigation
 */
function handleNavigation(): void {
  console.log('[Content] Navigation detected, cleaning up...');
  
  // Stop realtime translator first
  if (realtimeTranslator?.getState() === 'active') {
    realtimeTranslator.stop();
    realtimeTranslator = null;
  }
  
  // Clear pre-translated cues
  preTranslatedCuesMap.clear();
  preTranslatedCuesWithTiming = [];
  isPreTranslating = false;
  
  // Reset state
  currentJobId = null;
  translatedCues = [];
  translateButton?.setState('idle');
  floatingButton?.setState('idle');
  progressOverlay?.hide();
  subtitleRenderer?.detach();
  
  // Cleanup previous adapter
  if (currentAdapter) {
    currentAdapter.destroy();
    currentAdapter = null;
  }
  
  initialized = false;
  
  // Re-initialize
  setTimeout(() => void initialize(), 500);
}

// Watch for navigation changes
let lastUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    handleNavigation();
  }
});

// Also handle popstate for back/forward navigation
window.addEventListener('popstate', handleNavigation);

// ============================================================================
// Subtitle Time Offset Adjustment
// ============================================================================

/**
 * Setup keyboard shortcuts for subtitle time offset adjustment
 * - Shift + Left Arrow: Delay subtitles by 500ms (subtitles appear later)
 * - Shift + Right Arrow: Advance subtitles by 500ms (subtitles appear earlier)
 * - Shift + 0: Reset offset to 0
 */
function setupTimeOffsetKeyboardShortcuts(): void {
  const OFFSET_STEP = 500; // 500ms per keypress
  
  document.addEventListener('keydown', (event) => {
    // Only handle when Shift is pressed and translator is active
    if (!event.shiftKey || !realtimeTranslator || realtimeTranslator.getState() !== 'active') {
      return;
    }
    
    // Don't interfere with input fields
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }
    
    let handled = false;
    
    switch (event.key) {
      case 'ArrowLeft':
        // Delay subtitles (they appear later)
        realtimeTranslator.setTimeOffset(realtimeTranslator.getTimeOffset() + OFFSET_STEP);
        showInfoToast(`字幕延遲 ${realtimeTranslator.getTimeOffset()}ms`);
        handled = true;
        break;
        
      case 'ArrowRight':
        // Advance subtitles (they appear earlier)
        realtimeTranslator.setTimeOffset(realtimeTranslator.getTimeOffset() - OFFSET_STEP);
        showInfoToast(`字幕提前 ${-realtimeTranslator.getTimeOffset()}ms`);
        handled = true;
        break;
        
      case '0':
      case 'Numpad0':
        // Reset offset
        realtimeTranslator.setTimeOffset(0);
        showInfoToast('字幕時間已重置');
        handled = true;
        break;
    }
    
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  
  console.log('[Content] Time offset keyboard shortcuts enabled (Shift + Arrow keys)');
}

// ============================================================================
// Start
// ============================================================================

function startObserving(): void {
  // Start URL observer once body is available
  const tryObserve = (): boolean => {
    if (document.body) {
      urlObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
      return true;
    }
    return false;
  };

  // Try immediately
  if (tryObserve()) return;

  // If body doesn't exist, wait for DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      tryObserve();
    });
  } else {
    // Fallback: use setTimeout to retry
    const retryObserve = (): void => {
      if (!tryObserve()) {
        setTimeout(retryObserve, 10);
      }
    };
    setTimeout(retryObserve, 10);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    startObserving();
    void initialize();
  });
} else {
  startObserving();
  void initialize();
}

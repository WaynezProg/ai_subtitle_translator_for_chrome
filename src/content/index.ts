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
  addMessageListener,
  setupMessageListener,
} from './message-sender';
import type { TranslationProgressMessage, TranslationCompleteMessage, TranslationErrorMessage, TranslationChunkCompleteMessage } from '../shared/types/messages';
import type { Platform, Cue, SubtitleFormat } from '../shared/types/subtitle';
// JobProgress type available for future use if needed
// import type { JobProgress } from '../shared/types/translation';
import { parseWebVTT } from '../shared/parsers/webvtt-parser';
import { parseTTML } from '../shared/parsers/ttml-parser';
import { parseJSON3 } from '../shared/parsers/json3-parser';
import { createSubtitleRenderer, SubtitleRenderer } from './subtitle-renderer';
import { getUserSettings } from '../shared/utils/preferences';
import { getNetworkStatus, onNetworkStatusChange, getProviderSuggestion } from '../shared/utils/network-status';

// ============================================================================
// State
// ============================================================================

let currentAdapter: PlatformAdapter | null = null;
let currentPlatform: Platform | null = null;
let translateButton: TranslateButton | null = null;
let floatingButton: FloatingButton | null = null;
let progressOverlay: ProgressOverlay | null = null;
let subtitleRenderer: SubtitleRenderer | null = null;
let currentJobId: string | null = null;
let translatedCues: Cue[] = [];
let initialized = false;

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
  
  // Setup message listener for background messages
  setupMessageListener();
  setupBackgroundMessageHandlers();
  
  // Create UI components
  createUIComponents();
  
  // Check for cached translation
  await checkForCachedTranslation();
  
  // Setup network status monitoring
  setupNetworkStatusMonitoring();
  
  // Setup subtitle visibility listener
  setupSubtitleVisibilityListener();
  
  initialized = true;
  console.log('[Content] Content script fully initialized');
}

/**
 * Setup network status monitoring
 */
function setupNetworkStatusMonitoring(): void {
  // Check initial status
  void updateLocalModeIndicator();
  
  // Listen for network changes
  onNetworkStatusChange((status) => {
    console.log('[Content] Network status changed:', status);
    
    if (!status.isOnline && status.ollamaAvailable) {
      showInfoToast('已切換至本地 Ollama 模型');
      translateButton?.setLocalMode(true);
    } else if (!status.isOnline && !status.ollamaAvailable) {
      showInfoToast('目前處於離線狀態，無法翻譯');
    } else {
      void updateLocalModeIndicator();
    }
  });
}

/**
 * Update local mode indicator based on current provider
 */
async function updateLocalModeIndicator(): Promise<void> {
  const suggestion = await getProviderSuggestion();
  translateButton?.setLocalMode(suggestion.useOllama);
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
  
  // Check network status first
  const networkStatus = await getNetworkStatus();
  if (!networkStatus.isOnline && !networkStatus.ollamaAvailable) {
    showInfoToast('目前處於離線狀態。請連接網路或設定 Ollama 本地模型。');
    return;
  }
  
  // If offline but Ollama is available, show indicator
  if (!networkStatus.isOnline && networkStatus.ollamaAvailable) {
    translateButton?.setLocalMode(true);
    showInfoToast('使用本地 Ollama 模型進行翻譯');
  }
  
  // Check auth status
  const authStatus = await getAuthStatus();
  if (!authStatus.configured) {
    showInfoToast('請先在擴充功能設定中設定翻譯服務');
    return;
  }
  
  // Get subtitle tracks
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
    
    // Parse subtitle
    const cues = parseSubtitle(rawSubtitle.content, rawSubtitle.format);
    if (cues.length === 0) {
      throw new Error('無法解析字幕內容');
    }
    
    // Get user settings
    const settings = await getUserSettings();
    
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
    
    // Request translation
    const result = await requestTranslation({
      subtitleId: `${videoId}:${track.language}`,
      targetLanguage: settings.targetLanguage,
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
 * Check for cached translation
 */
async function checkForCachedTranslation(): Promise<void> {
  if (!currentAdapter) return;
  
  const videoId = currentAdapter.getVideoId();
  if (!videoId) return;
  
  const tracks = await currentAdapter.getSubtitleTracks();
  if (tracks.length === 0) return;
  
  const track = tracks[0];
  const settings = await getUserSettings();
  
  try {
    const cached = await getCachedTranslation({
      videoId,
      sourceLanguage: track.language,
      targetLanguage: settings.targetLanguage,
    });
    
    if (cached.found && cached.subtitle) {
      translateButton?.setState('cached');
      floatingButton?.setState('cached');
      translatedCues = cached.subtitle.cues;
      console.log('[Content] Found cached translation');
    }
  } catch {
    // Ignore cache errors
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

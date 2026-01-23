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
import { createSettingsPanel, SettingsPanel } from './ui/settings-panel';
import type { RenderOptions } from './adapters/types';
import { DEFAULT_RENDER_OPTIONS } from './adapters/types';
import { showErrorToast, showSuccessToast, showInfoToast } from './ui/error-display';
import {
  sendSubtitleDetected,
  requestTranslation,
  cancelTranslation,
  getCachedTranslation,
  getAuthStatus,
  translateText,
  translateBatch,
  saveTranslation,
  addMessageListener,
  setupMessageListener,
  getAllCachedTranslations,
  loadCachedTranslation,
} from './message-sender';
import { createRealtimeTranslator, RealtimeTranslator, TranslatedCue } from './realtime-translator';
import type { TranslationProgressMessage, TranslationCompleteMessage, TranslationErrorMessage, TranslationChunkCompleteMessage } from '../shared/types/messages';
import type { Platform, Cue, SubtitleFormat } from '../shared/types/subtitle';
// JobProgress type available for future use if needed
// import type { JobProgress } from '../shared/types/translation';
import { parseWebVTT } from '../shared/parsers/webvtt-parser';
import { parseTTML } from '../shared/parsers/ttml-parser';
import { createLogger } from '../shared/utils/logger';

const log = createLogger('Content');

// Helper to normalize unknown errors for logging
function normalizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { error: error.message, name: error.name };
  }
  return { error: String(error) };
}

import { parseJSON3 } from '../shared/parsers/json3-parser';
import { createSubtitleRenderer, SubtitleRenderer } from './subtitle-renderer';
import { getPreferencesFromBridge, getAuthConfigFromBridge } from './storage-bridge';
import { downloadSubtitleAsSRT } from '../shared/utils/subtitle-download';
import { parseSRT } from '../shared/parsers/srt-parser';
import { detectSubtitleFormat, parseSubtitle as parseSubtitleByFormat } from '../shared/parsers';
import type { SRTGenerationMode } from '../shared/utils/srt-generator';
import type { SubtitleState, SubtitleOption } from './ui/settings-panel';

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
let settingsPanel: SettingsPanel | null = null;
let currentJobId: string | null = null;
let translatedCues: Cue[] = [];
let initialized = false;
const realtimeMode = true;  // Default to real-time mode
let currentRenderOptions: RenderOptions = { ...DEFAULT_RENDER_OPTIONS };

// Lock to prevent race conditions when starting translation
let translationStartLock = false;

// ============================================================================
// Initialization
// ============================================================================

log.debug('[Content] AI Subtitle Translator Content Script loaded');

/**
 * Initialize the content script
 */
async function initialize(): Promise<void> {
  if (initialized) return;
  
  // Check if supported platform
  if (!isSupportedPlatform()) {
    log.debug('[Content] Not a supported platform');
    return;
  }
  
  const detection = detectPlatform();
  if (!detection.adapter || !detection.platform) {
    log.debug('[Content] No adapter available for this platform');
    return;
  }
  
  currentAdapter = detection.adapter;
  currentPlatform = detection.platform;
  
  log.debug(`[Content] Detected platform: ${currentPlatform}`);
  
  // Initialize adapter
  try {
    await currentAdapter.initialize();
    log.debug('[Content] Adapter initialized');
  } catch (error) {
    log.error('Failed to initialize adapter', normalizeError(error));
    return;
  }
  
  // Create UI components first (don't block on messaging)
  createUIComponents();
  
  // Setup message listener for background messages (may fail in MAIN world)
  try {
    setupMessageListener();
    setupBackgroundMessageHandlers();
  } catch (err) {
    log.warn('Message listener setup failed (expected in MAIN world)', normalizeError(err));
  }
  
  // Check for cached translation (non-blocking, may fail without chrome.runtime)
  log.debug('[Content] Calling checkForCachedTranslation...');
  checkForCachedTranslation()
    .then(() => {
      log.debug('[Content] checkForCachedTranslation completed');
    })
    .catch(err => {
      // Log all errors for debugging
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.warn('Cache check failed', { error: errorMessage });
    });
  
  // Setup network status monitoring (may fail without chrome.runtime)
  try {
    setupNetworkStatusMonitoring();
  } catch (err) {
    log.warn('Network status monitoring failed', normalizeError(err));
  }
  
  // Setup subtitle visibility listener
  setupSubtitleVisibilityListener();
  
  // Setup keyboard shortcuts for time offset adjustment
  setupTimeOffsetKeyboardShortcuts();
  
  initialized = true;
  log.debug('[Content] Content script fully initialized');
}

/**
 * Setup network status monitoring (simplified for MAIN world)
 */
function setupNetworkStatusMonitoring(): void {
  // Check initial status
  void updateLocalModeIndicator();
  
  // Listen for network changes
  window.addEventListener('online', () => {
    log.debug('[Content] Network status: online');
    void updateLocalModeIndicator();
  });
  
  window.addEventListener('offline', () => {
    log.debug('[Content] Network status: offline');
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

  // Load saved render options
  void loadRenderOptions();

  // Create translate button (in player controls) with settings callback
  translateButton = createTranslateButton({
    platform: currentPlatform,
    onClick: handleTranslateClick,
    onSettingsClick: handleSettingsClick,
  });

  // Create floating button (more visible, on top of player)
  floatingButton = createFloatingButton({
    platform: currentPlatform,
    onClick: handleTranslateClick,
    onSettingsClick: handleSettingsClick,
  });

  // Create progress overlay
  progressOverlay = createProgressOverlay({
    onCancel: handleCancelClick,
  });

  // Create subtitle renderer
  subtitleRenderer = createSubtitleRenderer();

  // Create settings panel
  settingsPanel = createSettingsPanel({
    platform: currentPlatform,
    renderOptions: currentRenderOptions,
    onSettingsChange: handleSettingsChange,
    onCacheSelect: handleCacheSelect,
    onTranslate: handleTranslateClick,
    onDownload: handleSettingsPanelDownload,
    onUpload: handleSettingsPanelUpload,
    onSubtitleSelect: handleSubtitleSelect,
  });

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
            log.debug('[Content] Button(s) mounted via observer');
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
      log.debug('[Content] Button(s) mounted immediately', {
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
// Settings Management
// ============================================================================

const RENDER_OPTIONS_STORAGE_KEY = 'ai-subtitle-render-options';

/**
 * Load render options from storage
 */
async function loadRenderOptions(): Promise<void> {
  try {
    // Try to load from localStorage (accessible in MAIN world)
    const stored = localStorage.getItem(RENDER_OPTIONS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<RenderOptions>;
      currentRenderOptions = { ...DEFAULT_RENDER_OPTIONS, ...parsed };
      log.debug('Loaded render options', { options: currentRenderOptions });
    }
  } catch (error) {
    log.warn('Failed to load render options', normalizeError(error));
  }
}

/**
 * Save render options to storage
 */
function saveRenderOptions(options: RenderOptions): void {
  try {
    localStorage.setItem(RENDER_OPTIONS_STORAGE_KEY, JSON.stringify(options));
    log.debug('[Content] Saved render options');
  } catch (error) {
    log.warn('Failed to save render options', normalizeError(error));
  }
}

/**
 * Sync UI state across all components (translate button, floating button, settings panel)
 * Note: Exported for potential external use; prefix with underscore if unused to satisfy linter
 */
function _syncUIState(
  state: 'idle' | 'translating' | 'complete' | 'error' | 'cached' | 'local',
  progress?: number
): void {
  translateButton?.setState(state);
  // FloatingButton doesn't have 'local' state, map it to 'complete'
  const floatingState = state === 'local' ? 'complete' : state;
  floatingButton?.setState(floatingState);
  // SettingsPanel only has idle/translating/complete/error
  const panelState = (state === 'cached' || state === 'local') ? 'complete' : state;
  settingsPanel?.setTranslationState(panelState);
  
  if (progress !== undefined) {
    translateButton?.setProgress(progress);
    floatingButton?.setProgress(progress);
    settingsPanel?.setProgress(progress);
  }
}

// Export for potential future use
void _syncUIState;

/**
 * Find the best container for mounting the settings panel
 * Different platforms have different DOM structures
 */
function findSettingsPanelContainer(): HTMLElement | null {
  if (!currentPlatform) return null;
  
  switch (currentPlatform) {
    case 'youtube':
      // YouTube: mount near the control bar button
      return translateButton?.getContainer() ?? document.querySelector('.ytp-right-controls');
    
    case 'netflix':
      // Netflix: mount in the player container (controls are dynamic)
      return document.querySelector('.watch-video--player-view') ||
             document.querySelector('[data-uia="player"]') ||
             document.querySelector('.VideoContainer');
    
    case 'disney':
      // Disney+: mount in the player container
      return document.querySelector('.btm-media-client-element') ||
             document.querySelector('[data-testid="web-player"]');
    
    case 'prime':
      // Prime Video: mount in the player container
      return document.querySelector('.webPlayerContainer') ||
             document.querySelector('[id^="dv-web-player"]');
    
    default:
      return translateButton?.getContainer() ?? null;
  }
}

/**
 * Handle settings button click - toggle settings panel
 */
function handleSettingsClick(): void {
  if (!settingsPanel) return;

  // Mount panel if not already mounted
  if (!document.getElementById('ai-subtitle-settings-panel')) {
    const container = findSettingsPanelContainer();
    if (container) {
      settingsPanel.mount(container);
    } else {
      log.warn('[Content] Could not find container for settings panel');
      return;
    }
    
    // Load cached translations for this video
    void loadCachedTranslationsForPanel();
  }

  settingsPanel.toggle();
  
  // Update settings button active state
  const settingsBtn = document.querySelector('.ai-subtitle-settings-btn');
  if (settingsBtn) {
    settingsBtn.setAttribute('data-active', String(settingsPanel.isVisible()));
  }
  
  // Fetch subtitles and update state asynchronously when panel is shown
  if (settingsPanel.isVisible()) {
    void (async () => {
      const state = await getSubtitleStateAsync();
      settingsPanel?.updateSubtitleState(state);
    })();
  }
}

/**
 * Load cached translations for the current video into the settings panel
 */
async function loadCachedTranslationsForPanel(): Promise<void> {
  if (!currentAdapter || !settingsPanel || !currentPlatform) return;

  const videoId = currentAdapter.getVideoId();
  if (!videoId) return;

  try {
    const result = await getAllCachedTranslations({ platform: currentPlatform, videoId });
    if (result.translations && result.translations.length > 0) {
      settingsPanel.updateCachedTranslations(result.translations);
    }
  } catch (error) {
    log.warn('Failed to load cached translations', normalizeError(error));
  }
}

/**
 * Handle settings change from panel
 */
function handleSettingsChange(changes: Partial<RenderOptions>): void {
  // Update current options
  currentRenderOptions = { ...currentRenderOptions, ...changes };
  
  // Save to storage
  saveRenderOptions(currentRenderOptions);
  
  // Apply to realtime translator if active
  if (realtimeTranslator && realtimeTranslator.getState() === 'active') {
    realtimeTranslator.updateRenderOptions(currentRenderOptions);
  }
  
  // Apply to subtitle renderer if active
  if (subtitleRenderer) {
    subtitleRenderer.updateOptions(currentRenderOptions);
  }
  
  log.debug('[Content] Settings changed:', changes);
}

/**
 * Handle cache selection from panel
 */
async function handleCacheSelect(cacheId: string): Promise<void> {
  if (!currentAdapter || !currentPlatform) return;

  try {
    showInfoToast('正在載入快取翻譯...');
    
    const result = await loadCachedTranslation(cacheId);
    
    if (!result.found || !result.subtitle?.cues?.length) {
      showInfoToast('無法載入快取翻譯');
      return;
    }
    
    // Stop current translator if active
    if (realtimeTranslator?.getState() === 'active') {
      realtimeTranslator.stop();
    }
    
    // Load the cached translation
    const preferences = await getPreferencesFromBridge();
    const autoLoadSuccess = await autoLoadCachedTranslation(
      result.subtitle.cues,
      preferences.defaultTargetLanguage
    );
    
    if (autoLoadSuccess) {
      // Hide settings panel after successful load
      settingsPanel?.hide();
    } else {
      showErrorToast('API_ERROR', '載入快取翻譯失敗');
    }
  } catch (error) {
    log.error('Failed to load cached translation', normalizeError(error));
    showErrorToast('API_ERROR', '載入快取翻譯時發生錯誤');
  }
}

/**
 * Handle download request from settings panel
 */
function handleSettingsPanelDownload(mode: SRTGenerationMode): void {
  void handleSubtitleDownload(mode);
}

/**
 * Handle upload request from settings panel
 */
async function handleSettingsPanelUpload(file: File): Promise<void> {
  try {
    const content = await readFileAsText(file);
    await handleSubtitleUpload(content, file.name);
  } catch (error) {
    log.error('Failed to read uploaded file', normalizeError(error));
    showErrorToast('API_ERROR', '無法讀取上傳的檔案');
  }
}

/**
 * Handle subtitle selection from settings panel
 */
async function handleSubtitleSelect(subtitleId: string): Promise<void> {
  log.debug('Subtitle selected', { subtitleId });
  
  // Check if it's a cached translation
  const videoId = currentAdapter?.getVideoId();
  if (!videoId || !currentPlatform) return;

  try {
    // Try to load from cache
    const cached = await getCachedTranslation({
      platform: currentPlatform,
      videoId,
      sourceLanguage: subtitleId.includes('uploaded') ? 'uploaded' : subtitleId,
      targetLanguage: 'zh-TW',
    });
    
    if (cached.found && cached.subtitle?.cues?.length) {
      // Load the cached/uploaded subtitle
      preTranslatedCuesWithTiming = cached.subtitle.cues.map(cue => ({
        startTime: cue.startTime,
        endTime: cue.endTime,
        originalText: cue.text || '',
        translatedText: cue.translatedText || cue.text,
      }));
      
      translatedCues = cached.subtitle.cues;
      
      // Update or start realtime translator
      if (realtimeTranslator) {
        realtimeTranslator.updateTranslatedCues(preTranslatedCuesWithTiming);
        realtimeTranslator.refreshCurrentCue();
      } else {
        realtimeTranslator = createRealtimeTranslator({
          platform: currentPlatform,
          targetLanguage: 'zh-TW',
          showOriginal: currentRenderOptions.bilingual,
          translatedCues: preTranslatedCuesWithTiming,
          isAutoGenerated: false,
          renderOptions: currentRenderOptions,
          onTranslationRequest: async (text: string): Promise<string> => {
            return preTranslatedCuesMap.get(text) || text;
          },
        });
        realtimeTranslator.start();
      }
      
      // Update UI
      translateButton?.setState('complete');
      floatingButton?.setState('complete');
      settingsPanel?.updateSubtitleState(getSubtitleState());
      
      showSuccessToast(`已載入字幕: ${cached.subtitle.cues.length} 句`);
    }
  } catch (error) {
    log.error('Failed to load subtitle', normalizeError(error));
    showErrorToast('API_ERROR', '載入字幕失敗');
  }
}

/**
 * Read file content as text (helper for settings panel upload)
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read file as text'));
      }
    };
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsText(file, 'UTF-8');
  });
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle translate button click
 */
async function handleTranslateClick(): Promise<void> {
  // Prevent race conditions from rapid button clicks
  if (translationStartLock) {
    log.debug('[Content] Translation start already in progress, ignoring click');
    return;
  }

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
  
  log.debug('[Content] Translation mode:', { realtimeMode });
  
  // If real-time mode, start the real-time translator
  if (realtimeMode) {
    await startRealtimeTranslation(preferences.defaultTargetLanguage);
    return;
  }
  
  log.debug('[Content] Using batch mode (realtimeMode is false)');

  // Acquire lock to prevent race conditions
  translationStartLock = true;

  // Batch mode: Get subtitle tracks
  const tracks = await currentAdapter.getSubtitleTracks();
  if (tracks.length === 0) {
    showInfoToast('此影片沒有可用的字幕');
    translationStartLock = false;  // Release lock
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
    log.debug('[Content] Fetched subtitle:', {
      format: rawSubtitle.format,
      contentLength: rawSubtitle.content.length,
      contentPreview: rawSubtitle.content.substring(0, 200),
      isAutoGenerated: track.isAutoGenerated,
    });
    
    // Parse subtitle - pass isAutoGenerated to preserve ASR timing
    const cues = parseSubtitle(rawSubtitle.content, rawSubtitle.format, track.isAutoGenerated);
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
    log.debug(`[Content] Translation job started: ${currentJobId}`);
    
  } catch (error) {
    log.error('Translation failed', normalizeError(error));
    translateButton?.setState('error');
    floatingButton?.setState('error');
    progressOverlay?.hide();
    showErrorToast('API_ERROR', error instanceof Error ? error.message : '翻譯失敗');
  } finally {
    translationStartLock = false;  // Release lock
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
  log.debug('[Content] startRealtimeTranslation called:', { targetLanguage });

  // If already translating in real-time, stop it
  if (realtimeTranslator?.getState() === 'active') {
    log.debug('[Content] Stopping real-time translation');
    realtimeTranslator.stop();
    translateButton?.setState('idle');
    floatingButton?.setState('idle');
    preTranslatedCuesMap.clear();
    preTranslatedCuesWithTiming = [];
    showInfoToast('即時翻譯已停止');
    return;
  }

  // Acquire lock to prevent race conditions
  if (translationStartLock) {
    log.debug('[Content] Translation start already in progress');
    return;
  }
  translationStartLock = true;

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
    translationStartLock = false;  // Release lock
    return;
  }
  
  const sourceLanguage = track.language || 'auto';
  
  log.debug('[Content] Starting real-time translation:', { sourceLanguage, targetLanguage });
  
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
      log.debug(`[Content] Using fallback source language: ${actualSourceLanguage} (requested: ${sourceLanguage})`);
    }
    
    // Parse subtitle - pass isAutoGenerated to preserve ASR timing
    const isAutoGenerated = track.isAutoGenerated || (rawSubtitle.metadata?.isAutoGenerated as boolean | undefined);
    let cues = parseSubtitle(rawSubtitle.content, rawSubtitle.format, isAutoGenerated);
    if (cues.length === 0) {
      throw new Error('無法解析字幕內容');
    }

    // IMPORTANT: Sort cues by startTime to ensure correct time-based lookup
    // Some subtitle formats may have cues out of order in the file
    // After sorting, reindex to maintain the invariant: cue.index === array position
    cues = cues.slice().sort((a, b) => a.startTime - b.startTime);
    cues = cues.map((cue, idx) => ({ ...cue, index: idx }));

    log.debug(`[Content] Found ${cues.length} cues to translate (ASR: ${isAutoGenerated}, sorted by time)`);
    
    // Check for cached translation first
    const videoId = currentAdapter.getVideoId();
    let useCachedTranslation = false;
    
    if (videoId && currentPlatform) {
      try {
        // Use track.language (sourceLanguage) for cache lookup to match how we save
        const cached = await getCachedTranslation({
          platform: currentPlatform,
          videoId,
          sourceLanguage: sourceLanguage,  // Use track.language, not actualSourceLanguage
          targetLanguage,
        });
        
        if (cached.found && cached.subtitle?.cues?.length) {
          log.debug(`[Content] Found cached translation with ${cached.subtitle.cues.length} cues`);

          // Use cached translations - sort by startTime to ensure correct time-based lookup
          const sortedCachedCues = cached.subtitle.cues.slice().sort((a, b) => a.startTime - b.startTime);
          preTranslatedCuesWithTiming = sortedCachedCues.map(cue => ({
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
        log.warn('Failed to check cache', normalizeError(error));
      }
    }
    
    // If no cache, initialize with original cues (translations will be filled in progressively)
    // The cues array should already be in order by startTime from the parser
    if (!useCachedTranslation) {
      preTranslatedCuesWithTiming = cues.map(cue => ({
        startTime: cue.startTime,
        endTime: cue.endTime,
        originalText: cue.text,
        translatedText: cue.text,  // Initially same as original, will be replaced
      }));
    }
    
    // Update settings panel with subtitle state (now we have cues)
    settingsPanel?.updateSubtitleState(getSubtitleState());
    
    // Create and start real-time translator
    log.debug('Starting realtime translator', { cueCount: preTranslatedCuesWithTiming.length, isAutoGenerated });
    
    realtimeTranslator = createRealtimeTranslator({
      platform: currentPlatform!,
      targetLanguage,
      showOriginal: currentRenderOptions.bilingual,
      translatedCues: preTranslatedCuesWithTiming,  // Will be updated as translations complete
      isAutoGenerated,  // Pass ASR flag for faster update throttling
      renderOptions: currentRenderOptions,  // Apply saved user preferences
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
          log.error('Real-time translation error', normalizeError(error));
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
      settingsPanel?.updateSubtitleState(getSubtitleState());
      translationStartLock = false;  // Release lock
      return;
    }

    // Otherwise, translate in background - don't block the UI
    // Pass trackLanguage for cache key consistency with checkForCachedTranslation
    void translateInBackground(cues, actualSourceLanguage, targetLanguage, sourceLanguage);

    // Release lock after starting background translation
    translationStartLock = false;

  } catch (error) {
    log.error('Translation setup failed', normalizeError(error));
    translateButton?.setState('error');
    floatingButton?.setState('error');
    showErrorToast('API_ERROR', error instanceof Error ? error.message : '翻譯準備失敗');
    translationStartLock = false;  // Release lock on error
  }
}

/**
 * Find the cue index closest to the current video playback position
 * This helps prioritize translating cues near what the user is watching
 * Returns the cue.index value, which should match the array position for properly indexed cues
 */
function findCurrentCueIndex(cues: Cue[]): number {
  const video = currentAdapter?.getVideoElement();
  if (!video || cues.length === 0) return 0;

  const currentTimeMs = video.currentTime * 1000;

  // Binary search for the cue closest to current time
  let left = 0;
  let right = cues.length - 1;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (cues[mid].startTime < currentTimeMs) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  // Clamp to valid array position and return the cue.index at that position
  const arrayPos = Math.max(0, Math.min(left, cues.length - 1));
  return cues[arrayPos].index;
}

/**
 * Order batches by priority: start from current playback position, then expand outward
 * This ensures the user sees translations for what they're currently watching first
 */
function orderBatchesByPriority<T extends { cueIndices: number[] }>(batches: T[], currentCueIndex: number, batchSize: number): T[] {
  if (batches.length === 0) return batches;

  // Find which batch contains the current cue
  const currentBatchIndex = Math.floor(currentCueIndex / batchSize);

  // Create priority-ordered list: current batch first, then alternating forward/backward
  const orderedBatches: T[] = [];
  const visited = new Set<number>();

  // Start with the current batch
  if (currentBatchIndex < batches.length) {
    orderedBatches.push(batches[currentBatchIndex]);
    visited.add(currentBatchIndex);
  }

  // Expand outward: alternate between forward and backward batches
  let offset = 1;
  while (orderedBatches.length < batches.length) {
    // Forward batch (after current)
    const forwardIndex = currentBatchIndex + offset;
    if (forwardIndex < batches.length && !visited.has(forwardIndex)) {
      orderedBatches.push(batches[forwardIndex]);
      visited.add(forwardIndex);
    }

    // Backward batch (before current)
    const backwardIndex = currentBatchIndex - offset;
    if (backwardIndex >= 0 && !visited.has(backwardIndex)) {
      orderedBatches.push(batches[backwardIndex]);
      visited.add(backwardIndex);
    }

    offset++;

    // Safety: break if we've checked more than necessary
    if (offset > batches.length) break;
  }

  return orderedBatches;
}

/**
 * Translate subtitles in background without blocking UI
 *
 * Strategy:
 * - Prioritize translating cues near current playback position first
 * - If provider is Google Translate: Direct translation, no context needed
 * - If provider is AI (Claude/ChatGPT/Ollama):
 *   1. First pass: Quick Google Translate for immediate display
 *   2. Second pass: AI translation with context for quality (replaces Google results)
 *
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
    // Get current provider from auth config
    const authConfig = await getAuthConfigFromBridge();
    const selectedProvider = authConfig?.selectedProvider || 'google-translate';
    const isAIProvider = selectedProvider !== 'google-translate';

    log.debug(`[Content] Translation provider: ${selectedProvider}, isAI: ${isAIProvider}`);

    // Find current playback position to prioritize translation
    const currentCueIndex = findCurrentCueIndex(cues);
    log.debug(`[Content] Current cue index: ${currentCueIndex} (video position-based priority)`);

    // Group cues into batches for efficient translation
    // IMPORTANT: Use the original cue.index to ensure correct mapping back to preTranslatedCuesWithTiming
    const batchSize = 10;
    interface CueBatch {
      cueIndices: number[];
      cues: Array<{ index: number; text: string }>;
    }
    const batches: CueBatch[] = [];

    for (let i = 0; i < cues.length; i += batchSize) {
      const batchCues = cues.slice(i, i + batchSize);
      batches.push({
        // Use original cue.index, not calculated position
        cueIndices: batchCues.map(c => c.index),
        cues: batchCues.map(c => ({ index: c.index, text: c.text })),
      });
    }

    // Order batches by priority: start from current position, expand outward
    const prioritizedBatches = orderBatchesByPriority(batches, currentCueIndex, batchSize);
    log.debug(`[Content] Batch order: starting from batch containing cue ${currentCueIndex}`);
    
    // ========================================================================
    // Phase 1: Quick Google Translate (if using AI provider)
    // Use batch translation for speed - prioritize batches near current playback
    // ========================================================================
    if (isAIProvider) {
      log.debug(`[Content] Phase 1: Quick Google Translate for ${cues.length} cues in ${prioritizedBatches.length} batches (prioritized by playback position)...`);
      showInfoToast('正在快速翻譯中...');

      let quickTranslatedCount = 0;
      let completedBatches = 0;

      for (const batch of prioritizedBatches) {
        if (!realtimeTranslator || realtimeTranslator.getState() !== 'active') {
          break;
        }

        try {
          // Use batch translation with forceProvider for much faster results
          const result = await translateBatch({
            cues: batch.cues,
            sourceLanguage,
            targetLanguage,
            forceProvider: 'google-translate',
          });

          // Process batch results
          for (const translatedCue of result.cues) {
            const originalCue = batch.cues.find(c => c.index === translatedCue.index);
            const original = originalCue?.text.trim() || '';
            const translated = translatedCue.translatedText.trim();

            if (original && translated) {
              preTranslatedCuesMap.set(original, translated);

              // IMPORTANT: Use index-based matching as PRIMARY method
              // The parser reindexes cues so cue.index === array position
              // Text-based matching can fail when multiple cues have identical text,
              // causing translations to be applied to wrong cues and timing shifts
              const cueIndex = translatedCue.index;
              if (cueIndex >= 0 && cueIndex < preTranslatedCuesWithTiming.length) {
                const timingCue = preTranslatedCuesWithTiming[cueIndex];
                // Verify the text matches to avoid mismatched indices
                if (timingCue.originalText.trim() === original) {
                  timingCue.translatedText = translated;
                  quickTranslatedCount++;
                  continue;
                }
              }

              // Fallback to text-based matching only if index matching failed
              for (const timingCue of preTranslatedCuesWithTiming) {
                if (timingCue.originalText.trim() === original && timingCue.translatedText === timingCue.originalText) {
                  // Only update if this cue hasn't been translated yet (avoid duplicates)
                  timingCue.translatedText = translated;
                  quickTranslatedCount++;
                  break;
                }
              }
            }
          }

          completedBatches++;

          // Refresh display after each batch to show Google Translate results progressively
          // This is especially important for the first batch (near current position)
          if (realtimeTranslator && realtimeTranslator.getState() === 'active') {
            realtimeTranslator.refreshCurrentCue();
          }

          const progress = Math.round((completedBatches / prioritizedBatches.length) * 50); // 0-50% for phase 1
          translateButton?.setProgress(progress);
          floatingButton?.setProgress(progress);
        } catch (error) {
          log.error('Quick translation batch error', normalizeError(error));
          // Continue with next batch
        }
      }

      log.debug(`[Content] Phase 1 complete. ${quickTranslatedCount} cues quick-translated in ${completedBatches} batches.`);
      showInfoToast('快速翻譯完成，正在進行 AI 精翻...');
    }

    // ========================================================================
    // Phase 2: AI Translation with context (or Google Translate if that's the provider)
    // Use parallel processing to speed up - process PARALLEL_BATCH_COUNT batches at a time
    // Batches are already prioritized by playback position
    // ========================================================================
    const PARALLEL_BATCH_COUNT = 3; // Number of batches to process in parallel
    log.debug(`[Content] ${isAIProvider ? 'Phase 2: AI' : 'Translating'} ${prioritizedBatches.length} batches (${PARALLEL_BATCH_COUNT} parallel, prioritized)...`);

    let translatedCount = 0;
    let successfulBatches = 0;
    let failedBatches = 0;

    // Process prioritized batches in parallel groups
    for (let i = 0; i < prioritizedBatches.length; i += PARALLEL_BATCH_COUNT) {
      if (!realtimeTranslator || realtimeTranslator.getState() !== 'active') {
        log.debug('[Content] Translator stopped, aborting background translation');
        break;
      }

      // Get the next group of prioritized batches to process in parallel
      const batchGroup = prioritizedBatches.slice(i, i + PARALLEL_BATCH_COUNT);
      
      try {
        // Process all batches in this group in parallel
        const results = await Promise.allSettled(
          batchGroup.map(batch => 
            translateBatch({
              cues: batch.cues,
              sourceLanguage,
              targetLanguage,
              // Skip context for parallel processing - speed over perfect consistency
            })
          )
        );

        // Process results from all parallel batches
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          const batch = batchGroup[j];

          if (result.status === 'fulfilled') {
            let batchSuccessCount = 0;
            for (const translatedCue of result.value.cues) {
              const cueIndex = translatedCue.index;
              const originalCue = batch.cues.find(c => c.index === cueIndex);
              const original = originalCue?.text.trim() || '';
              const translated = translatedCue.translatedText.trim();

              if (original && translated) {
                // Store in map for lookup (overwrites Google Translate results if AI)
                preTranslatedCuesMap.set(original, translated);

                // IMPORTANT: Use index-based matching as PRIMARY method
                // The parser reindexes cues so cue.index === array position
                // Text-based matching can fail when multiple cues have identical text,
                // causing translations to be applied to wrong cues and timing shifts
                if (cueIndex >= 0 && cueIndex < preTranslatedCuesWithTiming.length) {
                  const timingCue = preTranslatedCuesWithTiming[cueIndex];
                  // Verify the text matches to avoid mismatched indices
                  if (timingCue.originalText.trim() === original) {
                    timingCue.translatedText = translated;
                    batchSuccessCount++;
                    continue;
                  }
                }

                // Fallback to text-based matching only if index matching failed
                for (const timingCue of preTranslatedCuesWithTiming) {
                  if (timingCue.originalText.trim() === original) {
                    timingCue.translatedText = translated;
                    batchSuccessCount++;
                    break;
                  }
                }
              }
            }

            if (batchSuccessCount > 0) {
              successfulBatches++;
              translatedCount += batchSuccessCount;
            } else {
              failedBatches++;
            }
          } else {
            failedBatches++;
            log.error('[Content] Batch translation error:', result.reason);
          }
        }

        // Progress: 50-100% for phase 2 (if AI), or 0-100% for Google-only
        const progressBase = isAIProvider ? 50 : 0;
        const progressRange = isAIProvider ? 50 : 100;
        const completedBatchCount = i + batchGroup.length;
        const progress = progressBase + Math.round((completedBatchCount / prioritizedBatches.length) * progressRange);

        translateButton?.setProgress(progress);
        floatingButton?.setProgress(progress);

        // Refresh display to show updated translations immediately
        realtimeTranslator?.refreshCurrentCue();

        log.debug(`[Content] ${isAIProvider ? 'AI' : 'Background'} translation progress: ${progress}% (${successfulBatches} successful, ${failedBatches} failed batches)`);

      } catch (error) {
        failedBatches += batchGroup.length;
        log.error('Batch group translation error', normalizeError(error));
        // Continue with next batch instead of stopping
      }
    }

    log.debug(`[Content] Background translation complete. Successful: ${successfulBatches}/${prioritizedBatches.length} batches, ${translatedCount}/${cues.length} cues translated`);

    // Only show success and save if we have successful translations
    if (translatedCount > 0) {
      // Update button state
      translateButton?.setState('complete');
      floatingButton?.setState('complete');
      settingsPanel?.updateSubtitleState(getSubtitleState());
      showSuccessToast(`翻譯完成！共 ${translatedCount} 句`);

      if (failedBatches > 0) {
        log.warn(`[Content] Some batches failed (${failedBatches}/${prioritizedBatches.length}), but ${translatedCount} cues were successfully translated`);
      }
    } else {
      // All translations failed
      log.error('[Content] All translation batches failed');
      translateButton?.setState('error');
      floatingButton?.setState('error');
      showErrorToast('API_ERROR', '翻譯失敗，請檢查網路連線或稍後再試');
      // Don't save empty results to cache
      return;
    }
    
    // Save to persistent cache for page refresh
    // Only save if we have valid translations
    // Use cacheKeyLanguage (track.language) for consistency with checkForCachedTranslation
    const videoId = currentAdapter?.getVideoId();
    const cacheSourceLang = cacheKeyLanguage || sourceLanguage;
    
    // Count how many cues have valid translations
    const validTranslatedCues = preTranslatedCuesWithTiming.filter(
      cue => cue.translatedText && cue.translatedText.trim().length > 0
    );
    
    if (validTranslatedCues.length === 0) {
      log.warn('[Content] No valid translations to save, skipping cache save');
      return;
    }
    
    log.debug('[Content] Saving translation with cache key:', {
      videoId,
      cacheSourceLang,
      cacheKeyLanguage,
      sourceLanguage,
      targetLanguage,
      validCueCount: validTranslatedCues.length,
      totalCueCount: preTranslatedCuesWithTiming.length,
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
              translatedText: cue.translatedText || cue.originalText, // Fallback to original if no translation
            })),
            metadata: {
              title: videoId,
              cueCount: preTranslatedCuesWithTiming.length,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
        log.debug(`[Content] Translation saved to persistent cache (${validTranslatedCues.length}/${preTranslatedCuesWithTiming.length} cues translated)`);
      } catch (error) {
        log.warn('Failed to save translation to cache', normalizeError(error));
      }
    }
    
  } finally {
    isPreTranslating = false;
  }
}

/**
 * Find matching translation from cache
 * Uses exact text matching only to prevent timing issues from partial matches
 */
function findBestMatch(text: string, cache: Map<string, string>): string | null {
  const normalizedText = text.trim();

  // Exact match only - partial matches can cause timing issues
  if (cache.has(normalizedText)) {
    return cache.get(normalizedText)!;
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
    log.error('Failed to cancel', normalizeError(error));
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
    settingsPanel?.updateSubtitleState(getSubtitleState());
    
    log.debug('[Content] Translation complete');
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
 * @param content - Raw subtitle content
 * @param format - Subtitle format
 * @param isAutoGenerated - Whether subtitle is auto-generated (ASR), affects JSON3 parsing
 */
function parseSubtitle(content: string, format: SubtitleFormat, isAutoGenerated?: boolean): Cue[] {
  switch (format) {
    case 'webvtt':
      return parseWebVTT(content).cues;
    case 'ttml':
      return parseTTML(content).cues;
    case 'json3':
      // Pass isAutoGenerated to preserve ASR timing characteristics
      return parseJSON3(content, { isAutoGenerated }).cues;
    default:
      log.warn(`[Content] Unknown subtitle format: ${format}`);
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
    log.warn('[Content] Cannot auto-load: adapter or platform not initialized');
    return false;
  }
  
  const video = currentAdapter.getVideoElement();
  if (!video) {
    log.warn('[Content] Cannot auto-load: video element not found');
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
    
    log.debug(`[Content] Auto-loading ${preTranslatedCuesWithTiming.length} cached cues`);
    
    // Create and start realtime translator with cached cues
    realtimeTranslator = createRealtimeTranslator({
      platform: currentPlatform,
      targetLanguage,
      showOriginal: currentRenderOptions.bilingual,
      translatedCues: preTranslatedCuesWithTiming,
      renderOptions: currentRenderOptions,  // Apply saved user preferences
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
    settingsPanel?.updateSubtitleState(getSubtitleState());
    
    showSuccessToast(`已自動載入翻譯 (${cachedCues.length} 句)`);
    log.debug('[Content] Auto-load cached translation complete');
    
    return true;
  } catch (error) {
    log.error('Auto-load cached translation failed', normalizeError(error));
    return false;
  }
}

/**
 * Check for cached translation and auto-load if found
 */
async function checkForCachedTranslation(): Promise<void> {
  log.debug('[Content] checkForCachedTranslation: Starting...');
  
  if (!currentAdapter) {
    log.debug('[Content] checkForCachedTranslation: No adapter');
    return;
  }
  
  const videoId = currentAdapter.getVideoId();
  if (!videoId) {
    log.debug('[Content] checkForCachedTranslation: No videoId');
    return;
  }
  
  const tracks = await currentAdapter.getSubtitleTracks();
  if (tracks.length === 0) {
    log.debug('[Content] checkForCachedTranslation: No tracks');
    return;
  }
  
  const track = tracks[0];
  const preferences = await getPreferencesFromBridge();
  
  log.debug('[Content] checkForCachedTranslation: Checking cache for', {
    platform: currentPlatform,
    videoId,
    sourceLanguage: track.language,
    targetLanguage: preferences.defaultTargetLanguage,
  });

  if (!currentPlatform) {
    log.debug('[Content] checkForCachedTranslation: No platform detected, skipping cache check');
    return;
  }

  try {
    const cached = await getCachedTranslation({
      platform: currentPlatform,
      videoId,
      sourceLanguage: track.language,
      targetLanguage: preferences.defaultTargetLanguage,
    });
    
    log.debug('[Content] checkForCachedTranslation: Result', { found: cached.found, hasCues: !!cached.subtitle?.cues?.length });
    
    if (cached.found && cached.subtitle?.cues?.length) {
      const cueCount = cached.subtitle.cues.length;
      log.debug(`[Content] Found cached translation with ${cueCount} cues, attempting auto-load...`);
      
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
    log.warn('checkForCachedTranslation error', normalizeError(error));
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
    
    const data = event.data;
    if (!data?.type) return;
    
    // Handle visibility toggle
    if (data.type === 'AI_SUBTITLE_TOGGLE') {
      const visible = data.visible as boolean;
      setSubtitleVisibility(visible);
      return;
    }
    
    // Handle subtitle state request
    if (data.type === 'AI_SUBTITLE_GET_STATE') {
      const state = getSubtitleState();
      // Security: Use window.location.origin instead of '*' to restrict message receivers
      window.postMessage({
        type: 'AI_SUBTITLE_STATE_RESPONSE',
        requestId: data.requestId,
        state,
      }, window.location.origin);
      return;
    }
    
    // Handle download request
    if (data.type === 'AI_SUBTITLE_DOWNLOAD') {
      const mode = data.mode as SRTGenerationMode;
      void handleSubtitleDownload(mode);
      return;
    }
    
    // Handle upload request
    if (data.type === 'AI_SUBTITLE_UPLOAD') {
      const content = data.content as string;
      const filename = data.filename as string;
      void handleSubtitleUpload(content, filename);
      return;
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
    // Security: Use window.location.origin instead of '*' to restrict message receivers
    window.postMessage({ type: 'AI_SUBTITLE_GET_VISIBILITY' }, window.location.origin);
  } catch (error) {
    log.error('Failed to load visibility state', normalizeError(error));
  }
}

/**
 * Set subtitle visibility
 */
function setSubtitleVisibility(visible: boolean): void {
  if (subtitleRenderer) {
    subtitleRenderer.setVisible(visible);
    log.debug(`[Content] Subtitles ${visible ? 'shown' : 'hidden'}`);
  }
}

// ============================================================================
// Subtitle Download/Upload Handlers
// ============================================================================

/**
 * Get current subtitle state for popup/settings panel
 * Now supports fetching subtitles on-demand if not already loaded
 */
async function getSubtitleStateAsync(): Promise<SubtitleState> {
  const videoId = currentAdapter?.getVideoId() || '';
  const videoTitle = videoId;
  
  // Check if we already have cues loaded
  let cues: Cue[] = [];
  
  if (preTranslatedCuesWithTiming.length > 0) {
    cues = preTranslatedCuesWithTiming.map((tc, idx) => ({
      index: idx,
      startTime: tc.startTime,
      endTime: tc.endTime,
      text: tc.originalText,
      translatedText: tc.translatedText,
    }));
  } else if (translatedCues.length > 0) {
    cues = translatedCues;
  }
  
  // If no cues loaded yet, try to fetch from adapter
  if (cues.length === 0 && currentAdapter) {
    try {
      const tracks = await currentAdapter.getSubtitleTracks();
      if (tracks.length > 0) {
        const track = tracks[0];
        const rawSubtitle = await currentAdapter.fetchSubtitle(track as Parameters<typeof currentAdapter.fetchSubtitle>[0]);
        const parsedCues = parseSubtitle(rawSubtitle.content, rawSubtitle.format, track.isAutoGenerated);
        
        if (parsedCues.length > 0) {
          // Store for future use
          preTranslatedCuesWithTiming = parsedCues.map(cue => ({
            startTime: cue.startTime,
            endTime: cue.endTime,
            originalText: cue.text,
            translatedText: cue.text, // No translation yet
          }));
          
          cues = parsedCues;
          log.debug(`[Content] Fetched ${cues.length} cues on-demand for download`);
        }
      }
    } catch (error) {
      log.warn('Failed to fetch subtitles on-demand', normalizeError(error));
    }
  }
  
  const hasOriginal = cues.length > 0;
  const hasTranslation = preTranslatedCuesWithTiming.some(
    cue => cue.translatedText && cue.translatedText !== cue.originalText
  ) || translatedCues.some(
    cue => cue.translatedText && cue.translatedText !== cue.text
  );
  
  // Get language info
  const sourceLanguage = 'en';
  const targetLanguage = 'zh-TW';
  
  log.debug('[Content] getSubtitleStateAsync result:', {
    hasOriginal,
    hasTranslation,
    cueCount: cues.length,
  });
  
  return {
    hasOriginal,
    hasTranslation,
    cues: cues.length > 0 ? cues : undefined,
    videoTitle,
    videoId,
    sourceLanguage,
    targetLanguage,
  };
}

/**
 * Sync version for quick checks (won't fetch on-demand)
 */
function getSubtitleState(): SubtitleState {
  const hasOriginal = preTranslatedCuesWithTiming.length > 0 || translatedCues.length > 0;
  // Check for translation: either translated text differs from original,
  // or originalText is empty (uploaded subtitle without original)
  const hasTranslation = preTranslatedCuesWithTiming.some(
    cue => cue.translatedText && (cue.translatedText !== cue.originalText || cue.originalText === '')
  ) || translatedCues.some(
    cue => cue.translatedText && cue.translatedText !== cue.text
  );
  
  const cues: Cue[] = preTranslatedCuesWithTiming.length > 0
    ? preTranslatedCuesWithTiming.map((tc, idx) => ({
        index: idx,
        startTime: tc.startTime,
        endTime: tc.endTime,
        text: tc.originalText,
        translatedText: tc.translatedText,
      }))
    : translatedCues;
  
  const videoId = currentAdapter?.getVideoId() || '';
  const videoTitle = videoId;
  const sourceLanguage = 'en';
  const targetLanguage = 'zh-TW';
  
  // Build available subtitles list
  const availableSubtitles: SubtitleOption[] = [];
  
  // Add current translation if available
  if (hasTranslation && cues.length > 0) {
    // Check if it's uploaded (originalText is empty)
    const isUploaded = preTranslatedCuesWithTiming.length > 0 && 
                       preTranslatedCuesWithTiming[0]?.originalText === '';
    
    availableSubtitles.push({
      id: isUploaded ? 'uploaded:zh-TW' : `translated:${sourceLanguage}:${targetLanguage}`,
      label: isUploaded ? '上傳的字幕' : `翻譯 (${targetLanguage})`,
      type: isUploaded ? 'uploaded' : 'translated',
      language: targetLanguage,
      cueCount: cues.length,
    });
  }
  
  // Determine selected subtitle ID
  let selectedSubtitleId: string | undefined;
  if (hasTranslation) {
    const isUploaded = preTranslatedCuesWithTiming.length > 0 && 
                       preTranslatedCuesWithTiming[0]?.originalText === '';
    selectedSubtitleId = isUploaded ? 'uploaded:zh-TW' : `translated:${sourceLanguage}:${targetLanguage}`;
  }
  
  return {
    hasOriginal,
    hasTranslation,
    cues: cues.length > 0 ? cues : undefined,
    videoTitle,
    videoId,
    sourceLanguage,
    targetLanguage,
    availableSubtitles,
    selectedSubtitleId,
  };
}

/**
 * Handle subtitle download request
 */
async function handleSubtitleDownload(mode: SRTGenerationMode): Promise<void> {
  showInfoToast('正在準備下載...');
  
  // Use async version to fetch subtitles if needed
  const state = await getSubtitleStateAsync();
  
  if (!state.cues || state.cues.length === 0) {
    showErrorToast('API_ERROR', '此影片沒有可用的字幕');
    return;
  }
  
  // Validate mode requirements
  if (mode === 'translated' && !state.hasTranslation) {
    showErrorToast('API_ERROR', '沒有翻譯字幕可下載，請先進行翻譯');
    return;
  }
  
  const result = downloadSubtitleAsSRT({
    cues: state.cues,
    mode,
    videoTitle: state.videoTitle,
    videoId: state.videoId || 'video',
    sourceLanguage: state.sourceLanguage || 'en',
    targetLanguage: state.targetLanguage,
  });
  
  if (result.success) {
    showSuccessToast(`字幕已下載: ${result.filename}`);
  } else {
    showErrorToast('API_ERROR', result.error || '下載失敗');
  }
}

/**
 * Handle subtitle upload from popup/settings
 * @param content - Raw subtitle content (SRT, WebVTT, TTML, etc.)
 * @param filename - Original filename
 */
async function handleSubtitleUpload(content: string, filename: string): Promise<void> {
  log.debug('Processing uploaded subtitle', { filename });

  try {
    // Detect subtitle format from content or file extension
    let format: SubtitleFormat | null = detectSubtitleFormat(content);

    // Fallback to file extension if content detection fails
    if (!format) {
      const ext = filename.toLowerCase().split('.').pop();
      switch (ext) {
        case 'srt':
          format = 'srt';
          break;
        case 'vtt':
        case 'webvtt':
          format = 'webvtt';
          break;
        case 'ttml':
        case 'xml':
        case 'dfxp':
          format = 'ttml';
          break;
        case 'json':
          format = 'json3';
          break;
        default:
          // Default to SRT as most common format
          format = 'srt';
          log.warn('Unknown subtitle format, defaulting to SRT', { filename, ext });
      }
    }

    log.debug('Detected subtitle format', { format, filename });

    // Parse based on detected format
    const cues = parseSubtitleByFormat(content, format);

    if (cues.length === 0) {
      showErrorToast('API_ERROR', '無法解析上傳的字幕檔案');
      return;
    }

    // Create parseResult structure for compatibility
    const parseResult = { cues };

    log.debug('Parsed cues from uploaded file', { cueCount: parseResult.cues.length });
    log.debug('First 3 parsed cues', { cues: parseResult.cues.slice(0, 3) });
    
    // Direct replace mode: Use uploaded subtitles directly with their own timing
    // This replaces any existing subtitles completely
    
    // Convert parsed cues to translated cues format
    preTranslatedCuesWithTiming = parseResult.cues.map(cue => ({
      startTime: cue.startTime,
      endTime: cue.endTime,
      originalText: '',  // Empty to mark as uploaded/replaced
      translatedText: cue.text,
    }));
    
    log.debug('[Content] preTranslatedCuesWithTiming set:', {
      length: preTranslatedCuesWithTiming.length,
      firstCue: preTranslatedCuesWithTiming[0],
      hasTranslatedText: preTranslatedCuesWithTiming[0]?.translatedText ? 'yes' : 'no',
    });
    
    // Clear and rebuild the lookup map
    preTranslatedCuesMap.clear();
    for (const cue of parseResult.cues) {
      preTranslatedCuesMap.set(cue.text, cue.text);
    }
    
    // Update batch mode cues as well
    translatedCues = parseResult.cues.map((cue, idx) => ({
      index: idx,
      startTime: cue.startTime,
      endTime: cue.endTime,
      text: '',  // Original text empty
      translatedText: cue.text,
    }));
    
    // Update subtitle renderer if exists
    if (subtitleRenderer) {
      subtitleRenderer.setSubtitles(translatedCues);
    }
    
    // Start or update realtime translator
    // Determine platform - use detected platform or try to detect from URL
    const platform = currentPlatform || detectPlatform().platform;
    
    if (realtimeTranslator && realtimeTranslator.getState() === 'active') {
      // Update existing active translator
      log.debug('[Content] Updating existing realtime translator with uploaded subtitles');
      realtimeTranslator.updateTranslatedCues(preTranslatedCuesWithTiming);
      realtimeTranslator.refreshCurrentCue();
    } else if (platform) {
      // Stop existing translator if it's in idle state
      if (realtimeTranslator) {
        realtimeTranslator.stop();
        realtimeTranslator = null;
      }
      
      // Create and start new realtime translator for uploaded subtitles
      log.debug('[Content] Starting realtime translator for uploaded subtitles');
      
      realtimeTranslator = createRealtimeTranslator({
        platform: platform,
        targetLanguage: 'zh-TW',
        showOriginal: currentRenderOptions.bilingual,
        translatedCues: preTranslatedCuesWithTiming,
        isAutoGenerated: false,
        renderOptions: currentRenderOptions,
        onTranslationRequest: async (text: string): Promise<string> => {
          // For uploaded subtitles, just return the text as-is
          const cached = preTranslatedCuesMap.get(text);
          return cached || text;
        },
      });
      
      realtimeTranslator.start();
    } else {
      log.warn('[Content] Cannot start realtime translator: platform not detected');
    }
    
    // Save uploaded subtitle to cache (associated with video)
    const videoId = currentAdapter?.getVideoId();
    if (videoId && currentPlatform) {
      try {
        // Extract language from filename if possible (e.g., "video_zh-TW.srt" -> "zh-TW")
        const langMatch = filename.match(/_([a-z]{2}(?:-[A-Z]{2})?)\.(srt|vtt)$/i);
        const targetLanguage = langMatch ? langMatch[1] : 'zh-TW';
        
        await saveTranslation({
          videoId,
          platform: currentPlatform,
          sourceLanguage: 'uploaded',  // Mark as uploaded
          targetLanguage,
          subtitle: {
            id: `${videoId}:uploaded:${targetLanguage}`,
            videoId,
            platform: currentPlatform,
            sourceLanguage: 'uploaded',
            targetLanguage,
            format: 'srt',
            cues: translatedCues,
            metadata: {
              title: filename,
              cueCount: translatedCues.length,
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        });
        log.debug('[Content] Uploaded subtitle saved to cache');
      } catch (error) {
        log.warn('Failed to save uploaded subtitle to cache', normalizeError(error));
      }
    }
    
    // Update UI state
    translateButton?.setState('complete');
    floatingButton?.setState('complete');
    
    const state = getSubtitleState();
    log.debug('[Content] Subtitle state after upload:', {
      hasOriginal: state.hasOriginal,
      hasTranslation: state.hasTranslation,
      cueCount: state.cues?.length,
      availableSubtitles: state.availableSubtitles,
      selectedSubtitleId: state.selectedSubtitleId,
      preTranslatedCuesCount: preTranslatedCuesWithTiming.length,
      firstCue: preTranslatedCuesWithTiming[0],
    });
    settingsPanel?.updateSubtitleState(state);
    
    showSuccessToast(`已載入 ${parseResult.cues.length} 句字幕`);
    
  } catch (error) {
    log.error('Upload processing failed', normalizeError(error));
    showErrorToast('API_ERROR', error instanceof Error ? error.message : '處理上傳檔案失敗');
  }
}

// ============================================================================
// Navigation Handling
// ============================================================================

/**
 * Handle SPA navigation
 */
function handleNavigation(): void {
  log.debug('[Content] Navigation detected, cleaning up...');
  
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
  
  // Unmount all UI elements to prevent duplicates
  translateButton?.unmount();
  translateButton = null;
  floatingButton?.unmount();
  floatingButton = null;
  settingsPanel?.unmount();
  settingsPanel = null;
  progressOverlay?.hide();
  progressOverlay = null;
  subtitleRenderer?.detach();
  subtitleRenderer = null;
  
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
  
  log.debug('[Content] Time offset keyboard shortcuts enabled (Shift + Arrow keys)');
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

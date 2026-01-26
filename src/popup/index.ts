/**
 * AI Subtitle Translator - Popup Script
 * 
 * Handles the popup UI for quick status and settings access.
 * 
 * @see FR-027: Display current provider status in popup
 */

import { getAuthConfig, getAuthProvider, type AuthProviderInfo } from '../shared/utils/auth-storage';
import type { SRTGenerationMode } from '../shared/utils/srt-generator';
import { createLogger } from '../shared/utils/logger';

const log = createLogger('Popup');

// Subtitle state from content script
interface SubtitleInfo {
  hasOriginal: boolean;
  hasTranslation: boolean;
  videoTitle?: string;
  videoId?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  cueCount?: number;
}

document.addEventListener('DOMContentLoaded', () => {
  log.debug('Popup loaded');
  
  // Open options page button
  const openOptionsBtn = document.getElementById('open-options');
  openOptionsBtn?.addEventListener('click', () => {
    void chrome.runtime.openOptionsPage();
  });
  
  // Initialize subtitle toggle
  initSubtitleToggle();
  
  // Initialize subtitle management
  initSubtitleManagement();
  
  // Load and display current provider status
  void loadProviderStatus();
  
  // Load subtitle visibility state
  void loadSubtitleVisibility();
  
  // Load subtitle state from content script
  void loadSubtitleState();
});

function initSubtitleToggle(): void {
  const toggle = document.getElementById('toggle-subtitles') as HTMLInputElement;
  
  toggle?.addEventListener('change', () => {
    const visible = toggle.checked;
    
    void (async (): Promise<void> => {
      // Save preference
      await chrome.storage.local.set({ subtitleVisible: visible });
      
      // Notify content script to show/hide subtitles
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id) {
          await chrome.tabs.sendMessage(tabs[0].id, {
            type: 'TOGGLE_SUBTITLES',
            payload: { visible }
          });
        }
      } catch (error) {
        console.error('[Popup] Failed to toggle subtitles:', error);
      }
    })();
  });
}

async function loadSubtitleVisibility(): Promise<void> {
  const toggle = document.getElementById('toggle-subtitles') as HTMLInputElement;
  if (!toggle) return;
  
  try {
    const result = await chrome.storage.local.get(['subtitleVisible']);
    // Default to true (visible) if not set
    toggle.checked = result.subtitleVisible !== false;
  } catch (error) {
    console.error('[Popup] Failed to load subtitle visibility:', error);
  }
}

async function loadProviderStatus(): Promise<void> {
  const providerNameEl = document.getElementById('provider-name');
  const providerStatusEl = document.getElementById('provider-status-text');
  const providerIndicatorEl = document.getElementById('provider-indicator');
  const providerModelEl = document.getElementById('provider-model');
  
  if (!providerNameEl || !providerIndicatorEl) return;
  
  try {
    const config = await getAuthConfig();
    const authProvider = await getAuthProvider(config.selectedProvider);
    
    if (authProvider) {
      providerNameEl.textContent = authProvider.displayName;
      
      // Update status indicator
      const statusClass = getStatusClass(authProvider.status);
      providerIndicatorEl.className = `status-indicator ${statusClass}`;
      
      // Update status text
      if (providerStatusEl) {
        providerStatusEl.textContent = getStatusText(authProvider.status);
      }
      
      // Update model info
      if (providerModelEl && authProvider.selectedModel) {
        providerModelEl.textContent = authProvider.selectedModel;
        providerModelEl.style.display = 'block';
      } else if (providerModelEl) {
        providerModelEl.style.display = 'none';
      }
    } else {
      providerNameEl.textContent = getProviderDisplayName(config.selectedProvider);
      providerIndicatorEl.className = 'status-indicator unknown';
      if (providerStatusEl) {
        providerStatusEl.textContent = '未設定';
      }
      if (providerModelEl) {
        providerModelEl.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('[Popup] Failed to load provider status:', error);
    providerNameEl.textContent = '載入失敗';
    providerIndicatorEl.className = 'status-indicator error';
    if (providerStatusEl) {
      providerStatusEl.textContent = '錯誤';
    }
  }
}

function getStatusClass(status: AuthProviderInfo['status']): string {
  switch (status) {
    case 'valid':
      return 'valid';
    case 'invalid':
      return 'invalid';
    default:
      return 'unknown';
  }
}

function getStatusText(status: AuthProviderInfo['status']): string {
  switch (status) {
    case 'valid':
      return '已連接';
    case 'invalid':
      return '無效';
    default:
      return '未驗證';
  }
}

function getProviderDisplayName(type: string): string {
  const displayNames: Record<string, string> = {
    'claude-subscription': 'Claude Pro',
    'chatgpt-subscription': 'ChatGPT Plus',
    'claude-api': 'Claude API',
    'openai-api': 'OpenAI API',
    'ollama': 'Ollama',
    'google-translate': 'Google 翻譯'
  };
  return displayNames[type] ?? type;
}

// ============================================================================
// Subtitle Management
// ============================================================================

function initSubtitleManagement(): void {
  // Download buttons
  const downloadOriginal = document.getElementById('download-original');
  const downloadTranslated = document.getElementById('download-translated');
  const downloadBilingual = document.getElementById('download-bilingual');
  
  downloadOriginal?.addEventListener('click', () => {
    void triggerDownload('original');
  });
  
  downloadTranslated?.addEventListener('click', () => {
    void triggerDownload('translated');
  });
  
  downloadBilingual?.addEventListener('click', () => {
    void triggerDownload('bilingual');
  });
  
  // Upload button
  const uploadBtn = document.getElementById('upload-btn');
  const uploadInput = document.getElementById('upload-srt') as HTMLInputElement;
  
  uploadBtn?.addEventListener('click', () => {
    uploadInput?.click();
  });
  
  uploadInput?.addEventListener('change', () => {
    const file = uploadInput.files?.[0];
    if (file) {
      void triggerUpload(file);
      uploadInput.value = ''; // Reset for next selection
    }
  });
}

async function loadSubtitleState(): Promise<void> {
  const subtitleSection = document.getElementById('subtitle-section');
  const statusText = document.getElementById('subtitle-status-text');
  const downloadOriginal = document.getElementById('download-original') as HTMLButtonElement;
  const downloadTranslated = document.getElementById('download-translated') as HTMLButtonElement;
  const downloadBilingual = document.getElementById('download-bilingual') as HTMLButtonElement;
  const uploadBtn = document.getElementById('upload-btn') as HTMLButtonElement;
  
  try {
    // Query active tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    
    if (!tabId) {
      if (subtitleSection) subtitleSection.style.display = 'none';
      return;
    }
    
    // Check if on supported video page
    const tab = tabs[0];
    const url = tab.url || '';
    const isSupportedPage = isVideoPage(url);
    
    if (!isSupportedPage) {
      if (subtitleSection) subtitleSection.style.display = 'none';
      return;
    }
    
    // Show section
    if (subtitleSection) subtitleSection.style.display = 'block';
    
    // Query subtitle state from content script
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'GET_SUBTITLE_STATE'
      }) as SubtitleInfo | undefined;
      
      if (response) {
        updateSubtitleUI(response, statusText, downloadOriginal, downloadTranslated, downloadBilingual, uploadBtn);
      } else {
        if (statusText) statusText.textContent = '尚未擷取字幕';
      }
    } catch {
      // Content script may not be ready
      if (statusText) statusText.textContent = '等待頁面載入...';
    }
  } catch (error) {
    console.error('[Popup] Failed to load subtitle state:', error);
    if (subtitleSection) subtitleSection.style.display = 'none';
  }
}

function updateSubtitleUI(
  info: SubtitleInfo,
  statusText: HTMLElement | null,
  downloadOriginal: HTMLButtonElement | null,
  downloadTranslated: HTMLButtonElement | null,
  downloadBilingual: HTMLButtonElement | null,
  uploadBtn: HTMLButtonElement | null
): void {
  if (statusText) {
    if (!info.hasOriginal) {
      statusText.textContent = '尚未擷取字幕';
    } else if (info.hasTranslation) {
      statusText.textContent = `已翻譯 ${info.cueCount || 0} 句`;
    } else {
      statusText.textContent = `原文 ${info.cueCount || 0} 句`;
    }
  }
  
  if (downloadOriginal) {
    downloadOriginal.disabled = !info.hasOriginal;
  }
  
  if (downloadTranslated) {
    downloadTranslated.disabled = !info.hasTranslation;
  }
  
  if (downloadBilingual) {
    downloadBilingual.disabled = !info.hasTranslation;
  }
  
  if (uploadBtn) {
    uploadBtn.disabled = !info.hasOriginal;
  }
}

function isVideoPage(url: string): boolean {
  const patterns = [
    /youtube\.com\/watch/,
    /netflix\.com\/watch/,
    /disneyplus\.com\/video/,
    /primevideo\.com\/detail/,
    /amazon\.com\/gp\/video/
  ];
  
  return patterns.some(pattern => pattern.test(url));
}

async function triggerDownload(mode: SRTGenerationMode): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    
    if (!tabId) return;
    
    await chrome.tabs.sendMessage(tabId, {
      type: 'DOWNLOAD_SUBTITLE',
      payload: { mode }
    });
  } catch (error) {
    console.error('[Popup] Failed to trigger download:', error);
  }
}

async function triggerUpload(file: File): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    
    if (!tabId) return;
    
    // Read file content
    const content = await file.text();
    
    await chrome.tabs.sendMessage(tabId, {
      type: 'UPLOAD_SUBTITLE',
      payload: { content, filename: file.name }
    });
  } catch (error) {
    console.error('[Popup] Failed to trigger upload:', error);
  }
}

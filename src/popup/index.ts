/**
 * AI Subtitle Translator - Popup Script
 * 
 * Handles the popup UI for quick status and settings access.
 * 
 * @see FR-027: Display current provider status in popup
 */

import { getAuthConfig, getAuthProvider, type AuthProviderInfo } from '../shared/utils/auth-storage';

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Popup] Popup loaded');
  
  // Open options page button
  const openOptionsBtn = document.getElementById('open-options');
  openOptionsBtn?.addEventListener('click', () => {
    void chrome.runtime.openOptionsPage();
  });
  
  // Initialize subtitle toggle
  initSubtitleToggle();
  
  // Load and display current provider status
  void loadProviderStatus();
  
  // Load subtitle visibility state
  void loadSubtitleVisibility();
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
    'ollama': 'Ollama'
  };
  return displayNames[type] ?? type;
}

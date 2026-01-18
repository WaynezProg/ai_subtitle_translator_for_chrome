/**
 * AI Subtitle Translator - Options Page Script
 * 
 * Handles the settings page for provider configuration and preferences.
 * Includes cache management UI (FR-017) and API key management (FR-009, FR-010).
 */

import { cacheManager, formatBytes, type CacheManagerStats } from '../shared/cache';
import type { TranslationCache } from '../shared/types/translation';
import type { ProviderType } from '../shared/types/auth';
import {
  getAuthConfig,
  saveProviderCredentials,
  deleteProviderCredentials,
  setSelectedProvider,
  getAuthProvider,
  maskApiKey,
} from '../shared/utils/auth-storage';
import { createProviderFromConfig } from '../shared/providers/factory';

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Options] Options page loaded');
  
  // Initialize UI event handlers
  initProviderSelector();
  initApiKeySection();
  initSubscriptionSection();
  initOllamaSection();
  initFontSizeSlider();
  initSaveButton();
  initCacheManagement();
  
  // Load saved settings
  void loadSettings();
  
  // Load provider config
  void loadProviderConfig();
  
  // Load cache statistics
  void loadCacheStats();
});

function initProviderSelector(): void {
  const providerRadios = document.querySelectorAll('input[name="provider"]');
  const apiKeySection = document.getElementById('api-key-section');
  const subscriptionSection = document.getElementById('subscription-section');
  const ollamaSection = document.getElementById('ollama-section');
  
  providerRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      const value = target.value as ProviderType;
      
      // Show/hide relevant sections
      const showApiKey = value === 'claude-api' || value === 'openai-api';
      const showSubscription = value === 'claude-subscription' || value === 'chatgpt-subscription';
      const showOllama = value === 'ollama';
      const showGoogleTranslate = value === 'google-translate';
      
      apiKeySection?.classList.toggle('hidden', !showApiKey);
      subscriptionSection?.classList.toggle('hidden', !showSubscription);
      ollamaSection?.classList.toggle('hidden', !showOllama);
      
      // For Google Translate, show a success message (no config needed)
      if (showGoogleTranslate) {
        showNotification('Google 翻譯已選擇，無需額外設定！');
      }
      
      // Update API key section title based on provider
      const apiKeyTitle = document.getElementById('api-key-title');
      if (apiKeyTitle) {
        apiKeyTitle.textContent = value === 'claude-api' ? 'Claude API 設定' : 'OpenAI API 設定';
      }
      
      // Update subscription section title based on provider
      const subscriptionTitle = document.getElementById('subscription-title');
      if (subscriptionTitle) {
        subscriptionTitle.textContent = value === 'claude-subscription' 
          ? 'Claude Pro 訂閱設定' 
          : 'ChatGPT Plus 訂閱設定';
      }
      
      void (async (): Promise<void> => {
        // Load existing API key for this provider
        if (showApiKey) {
          await loadApiKeyForProvider(value);
        }
        
        // Load subscription status if selected
        if (showSubscription) {
          await loadSubscriptionStatus(value);
        }
        
        // Load Ollama config if selected
        if (showOllama) {
          await loadOllamaConfig();
        }
        
        // Save selected provider
        await setSelectedProvider(value);
      })();
    });
  });
}

function initApiKeySection(): void {
  // Validate API key button
  const validateBtn = document.getElementById('validate-key');
  validateBtn?.addEventListener('click', () => {
    void validateApiKey();
  });
  
  // Save API key button
  const saveKeyBtn = document.getElementById('save-api-key');
  saveKeyBtn?.addEventListener('click', () => {
    void saveApiKey();
  });
  
  // Clear API key button
  const clearKeyBtn = document.getElementById('clear-api-key');
  clearKeyBtn?.addEventListener('click', () => {
    void clearApiKey();
  });
  
  // Toggle API key visibility
  const toggleBtn = document.getElementById('toggle-key-visibility');
  toggleBtn?.addEventListener('click', () => {
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    if (apiKeyInput) {
      const isPassword = apiKeyInput.type === 'password';
      apiKeyInput.type = isPassword ? 'text' : 'password';
      toggleBtn.textContent = isPassword ? '隱藏' : '顯示';
    }
  });
}

function initSubscriptionSection(): void {
  // Open login page button
  const openLoginBtn = document.getElementById('open-login-page');
  openLoginBtn?.addEventListener('click', () => {
    const providerRadio = document.querySelector('input[name="provider"]:checked') as HTMLInputElement;
    const providerType = providerRadio?.value as ProviderType;
    
    const loginUrls: Record<string, string> = {
      'claude-subscription': 'https://claude.ai/login',
      'chatgpt-subscription': 'https://chat.openai.com/auth/login',
    };
    
    const url = loginUrls[providerType];
    if (url) {
      window.open(url, '_blank');
    }
  });
  
  // Verify subscription button
  const verifyBtn = document.getElementById('verify-subscription');
  verifyBtn?.addEventListener('click', () => {
    void verifySubscription();
  });
  
  // ToS disclaimer checkbox
  const tosCheckbox = document.getElementById('accept-tos-disclaimer') as HTMLInputElement;
  tosCheckbox?.addEventListener('change', () => {
    void saveToSAcceptance(tosCheckbox.checked);
  });
}

async function verifySubscription(): Promise<void> {
  const verifyBtn = document.getElementById('verify-subscription') as HTMLButtonElement;
  const statusEl = document.getElementById('subscription-status');
  const accountInfoEl = document.getElementById('subscription-account-info');
  
  const providerRadio = document.querySelector('input[name="provider"]:checked') as HTMLInputElement;
  const providerType = providerRadio?.value as ProviderType;
  
  if (!providerType) return;
  
  if (verifyBtn) {
    verifyBtn.disabled = true;
    verifyBtn.textContent = '驗證中...';
  }
  
  try {
    // Create provider and validate
    const provider = createProviderFromConfig(providerType);
    
    if (!provider) {
      throw new Error('無法建立 Provider');
    }
    
    const result = await provider.validateCredentials();
    
    if (result.valid) {
      statusEl?.classList.remove('hidden');
      statusEl?.classList.add('success');
      if (accountInfoEl) {
        accountInfoEl.textContent = result.accountInfo?.tier || '訂閱帳號已連線';
      }
      showNotification('訂閱驗證成功！');
      
      // Save subscription status
      await saveProviderCredentials(providerType, 'session-based', undefined);
    } else {
      statusEl?.classList.remove('hidden');
      statusEl?.classList.remove('success');
      statusEl?.classList.add('error');
      if (accountInfoEl) {
        accountInfoEl.textContent = result.error?.message || '驗證失敗';
      }
      showNotification(result.error?.message || '驗證失敗，請確認已登入', 'error');
    }
  } catch (error) {
    console.error('[Options] Subscription verification error:', error);
    statusEl?.classList.add('hidden');
    showNotification('驗證過程發生錯誤，請確認已在瀏覽器中登入', 'error');
  } finally {
    if (verifyBtn) {
      verifyBtn.disabled = false;
      verifyBtn.textContent = '驗證訂閱狀態';
    }
  }
}

async function loadSubscriptionStatus(providerType: ProviderType): Promise<void> {
  const statusEl = document.getElementById('subscription-status');
  const accountInfoEl = document.getElementById('subscription-account-info');
  const tosCheckbox = document.getElementById('accept-tos-disclaimer') as HTMLInputElement;
  
  try {
    const authProvider = await getAuthProvider(providerType);
    
    if (authProvider?.status === 'valid') {
      statusEl?.classList.remove('hidden');
      statusEl?.classList.add('success');
      if (accountInfoEl) {
        accountInfoEl.textContent = authProvider.displayName || '訂閱帳號已連線';
      }
    } else {
      statusEl?.classList.add('hidden');
    }
    
    // Load ToS acceptance status
    const result = await chrome.storage.local.get(['preferences']);
    if (tosCheckbox && result.preferences?.acceptedSubscriptionDisclaimer) {
      tosCheckbox.checked = true;
    }
  } catch (error) {
    console.error('[Options] Failed to load subscription status:', error);
    statusEl?.classList.add('hidden');
  }
}

async function saveToSAcceptance(accepted: boolean): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['preferences']);
    const preferences = result.preferences || {};
    preferences.acceptedSubscriptionDisclaimer = accepted;
    await chrome.storage.local.set({ preferences });
  } catch (error) {
    console.error('[Options] Failed to save ToS acceptance:', error);
  }
}

function initOllamaSection(): void {
  // Test connection button
  const testBtn = document.getElementById('test-ollama');
  testBtn?.addEventListener('click', () => {
    void testOllamaConnection();
  });
  
  // Ollama endpoint input - load models on change
  const endpointInput = document.getElementById('ollama-endpoint') as HTMLInputElement;
  endpointInput?.addEventListener('blur', () => {
    void loadOllamaModels();
  });
  
  // Save endpoint when model is selected
  const modelSelect = document.getElementById('ollama-model') as HTMLSelectElement;
  modelSelect?.addEventListener('change', () => {
    void saveOllamaConfig();
  });
}

async function testOllamaConnection(): Promise<void> {
  const endpointInput = document.getElementById('ollama-endpoint') as HTMLInputElement;
  const testBtn = document.getElementById('test-ollama') as HTMLButtonElement;
  
  const endpoint = endpointInput?.value.trim() || 'http://localhost:11434';
  
  if (testBtn) {
    testBtn.disabled = true;
    testBtn.textContent = '測試中...';
  }
  
  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (response.ok) {
      showNotification('連線成功！');
      // Load available models
      await loadOllamaModels();
    } else {
      showNotification('連線失敗', 'error');
    }
  } catch (error) {
    console.error('[Options] Ollama connection test failed:', error);
    showNotification('無法連線到 Ollama', 'error');
  } finally {
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.textContent = '測試連線';
    }
  }
}

async function loadOllamaModels(): Promise<void> {
  const endpointInput = document.getElementById('ollama-endpoint') as HTMLInputElement;
  const modelSelect = document.getElementById('ollama-model') as HTMLSelectElement;
  
  const endpoint = endpointInput?.value.trim() || 'http://localhost:11434';
  
  if (!modelSelect) return;
  
  try {
    const response = await fetch(`${endpoint}/api/tags`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      modelSelect.innerHTML = '<option value="">無法載入模型</option>';
      return;
    }
    
    interface OllamaTagsResponse {
      models: Array<{ name: string }>;
    }
    
    const data = await response.json() as OllamaTagsResponse;
    
    modelSelect.innerHTML = '<option value="">請選擇模型</option>';
    
    for (const model of data.models) {
      const option = document.createElement('option');
      option.value = model.name;
      option.textContent = model.name;
      modelSelect.appendChild(option);
    }
    
    // Load saved model selection
    const authProvider = await getAuthProvider('ollama');
    if (authProvider?.selectedModel) {
      modelSelect.value = authProvider.selectedModel;
    }
  } catch (error) {
    console.error('[Options] Failed to load Ollama models:', error);
    modelSelect.innerHTML = '<option value="">無法載入模型</option>';
  }
}

async function saveOllamaConfig(): Promise<void> {
  const endpointInput = document.getElementById('ollama-endpoint') as HTMLInputElement;
  const modelSelect = document.getElementById('ollama-model') as HTMLSelectElement;
  
  const endpoint = endpointInput?.value.trim() || 'http://localhost:11434';
  const selectedModel = modelSelect?.value || undefined;
  
  try {
    await saveProviderCredentials('ollama', endpoint, selectedModel);
    showNotification('Ollama 設定已儲存');
  } catch (error) {
    console.error('[Options] Failed to save Ollama config:', error);
    showNotification('儲存失敗', 'error');
  }
}

async function loadOllamaConfig(): Promise<void> {
  const endpointInput = document.getElementById('ollama-endpoint') as HTMLInputElement;
  
  try {
    const authProvider = await getAuthProvider('ollama');
    
    if (endpointInput && authProvider?.endpoint) {
      endpointInput.value = authProvider.endpoint;
    } else if (endpointInput) {
      endpointInput.value = 'http://localhost:11434';
    }
    
    // Try to load models
    await loadOllamaModels();
  } catch (error) {
    console.error('[Options] Failed to load Ollama config:', error);
  }
}

async function loadProviderConfig(): Promise<void> {
  try {
    const config = await getAuthConfig();
    
    // Select the current provider
    const providerRadio = document.querySelector(
      `input[name="provider"][value="${config.selectedProvider}"]`
    ) as HTMLInputElement | null;
    
    if (providerRadio) {
      providerRadio.checked = true;
      providerRadio.dispatchEvent(new Event('change'));
    }
  } catch (error) {
    console.error('[Options] Failed to load provider config:', error);
  }
}

async function loadApiKeyForProvider(providerType: ProviderType): Promise<void> {
  try {
    const authProvider = await getAuthProvider(providerType);
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
    const keyStatusEl = document.getElementById('key-status');
    
    if (apiKeyInput && authProvider?.apiKey) {
      // Show masked key
      apiKeyInput.value = '';
      apiKeyInput.placeholder = maskApiKey(authProvider.apiKey);
    } else if (apiKeyInput) {
      apiKeyInput.value = '';
      apiKeyInput.placeholder = '輸入 API Key';
    }
    
    // Update model options based on provider
    if (modelSelect) {
      modelSelect.innerHTML = '<option value="">請選擇模型</option>';
      
      // Get available models from the provider
      const provider = createProviderFromConfig(providerType);
      
      if (provider) {
        for (const model of provider.availableModels) {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = `${model.name}${model.recommended ? ' (推薦)' : ''}`;
          modelSelect.appendChild(option);
        }
        
        // Select previously chosen model
        if (authProvider?.selectedModel) {
          modelSelect.value = authProvider.selectedModel;
        } else if (provider.availableModels[0]) {
          modelSelect.value = provider.availableModels[0].id;
        }
      }
    }
    
    // Update status indicator
    if (keyStatusEl) {
      if (authProvider?.status === 'valid') {
        keyStatusEl.className = 'key-status valid';
        keyStatusEl.textContent = '已驗證';
      } else if (authProvider?.apiKey) {
        keyStatusEl.className = 'key-status unknown';
        keyStatusEl.textContent = '未驗證';
      } else {
        keyStatusEl.className = 'key-status';
        keyStatusEl.textContent = '';
      }
    }
  } catch (error) {
    console.error('[Options] Failed to load API key:', error);
  }
}

async function validateApiKey(): Promise<void> {
  const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
  const keyStatusEl = document.getElementById('key-status');
  const validateBtn = document.getElementById('validate-key') as HTMLButtonElement;
  
  const apiKey = apiKeyInput?.value.trim();
  if (!apiKey) {
    showNotification('請輸入 API Key', 'error');
    return;
  }
  
  // Get current provider type
  const providerRadio = document.querySelector('input[name="provider"]:checked') as HTMLInputElement;
  const providerType = providerRadio?.value as ProviderType;
  
  if (!providerType || !providerType.includes('api')) {
    showNotification('請先選擇 API 服務', 'error');
    return;
  }
  
  // Update UI to show loading
  if (validateBtn) {
    validateBtn.disabled = true;
    validateBtn.textContent = '驗證中...';
  }
  if (keyStatusEl) {
    keyStatusEl.className = 'key-status validating';
    keyStatusEl.textContent = '驗證中...';
  }
  
  try {
    // Create provider with the API key
    const provider = createProviderFromConfig(providerType, apiKey);
    
    if (!provider) {
      throw new Error('Failed to create provider');
    }
    
    const result = await provider.validateCredentials();
    
    if (result.valid) {
      if (keyStatusEl) {
        keyStatusEl.className = 'key-status valid';
        keyStatusEl.textContent = '驗證成功';
      }
      showNotification('API Key 驗證成功');
    } else {
      if (keyStatusEl) {
        keyStatusEl.className = 'key-status invalid';
        keyStatusEl.textContent = result.error?.message || '驗證失敗';
      }
      showNotification(result.error?.message || '驗證失敗', 'error');
    }
  } catch (error) {
    console.error('[Options] Validation error:', error);
    if (keyStatusEl) {
      keyStatusEl.className = 'key-status invalid';
      keyStatusEl.textContent = '驗證錯誤';
    }
    showNotification('驗證過程發生錯誤', 'error');
  } finally {
    if (validateBtn) {
      validateBtn.disabled = false;
      validateBtn.textContent = '驗證';
    }
  }
}

async function saveApiKey(): Promise<void> {
  const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
  const modelSelect = document.getElementById('model-select') as HTMLSelectElement;
  
  const apiKey = apiKeyInput?.value.trim();
  if (!apiKey) {
    showNotification('請輸入 API Key', 'error');
    return;
  }
  
  const providerRadio = document.querySelector('input[name="provider"]:checked') as HTMLInputElement;
  const providerType = providerRadio?.value as ProviderType;
  
  if (!providerType) {
    showNotification('請先選擇服務提供者', 'error');
    return;
  }
  
  try {
    const selectedModel = modelSelect?.value || undefined;
    await saveProviderCredentials(providerType, apiKey, selectedModel);
    
    // Clear the input and show masked key
    apiKeyInput.value = '';
    apiKeyInput.placeholder = maskApiKey(apiKey);
    
    showNotification('API Key 已儲存');
    
    // Reload to update status
    await loadApiKeyForProvider(providerType);
  } catch (error) {
    console.error('[Options] Failed to save API key:', error);
    showNotification('儲存失敗', 'error');
  }
}

async function clearApiKey(): Promise<void> {
  const providerRadio = document.querySelector('input[name="provider"]:checked') as HTMLInputElement;
  const providerType = providerRadio?.value as ProviderType;
  
  if (!providerType) {
    return;
  }
  
  try {
    await deleteProviderCredentials(providerType);
    
    const apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    const keyStatusEl = document.getElementById('key-status');
    
    if (apiKeyInput) {
      apiKeyInput.value = '';
      apiKeyInput.placeholder = '輸入 API Key';
    }
    if (keyStatusEl) {
      keyStatusEl.className = 'key-status';
      keyStatusEl.textContent = '';
    }
    
    showNotification('API Key 已清除');
  } catch (error) {
    console.error('[Options] Failed to clear API key:', error);
    showNotification('清除失敗', 'error');
  }
}

function initFontSizeSlider(): void {
  const fontSizeSlider = document.getElementById('font-size') as HTMLInputElement;
  const fontSizeValue = document.getElementById('font-size-value');
  
  fontSizeSlider?.addEventListener('input', () => {
    if (fontSizeValue) {
      fontSizeValue.textContent = `${fontSizeSlider.value}px`;
    }
  });
}

function initSaveButton(): void {
  const saveBtn = document.getElementById('save-settings');
  saveBtn?.addEventListener('click', () => {
    void saveSettings();
  });
}

function initCacheManagement(): void {
  // Clear all cache button
  const clearCacheBtn = document.getElementById('clear-cache');
  clearCacheBtn?.addEventListener('click', () => {
    void clearAllCache();
  });
  
  // Refresh cache stats button
  const refreshStatsBtn = document.getElementById('refresh-cache-stats');
  refreshStatsBtn?.addEventListener('click', () => {
    void loadCacheStats();
  });
}

async function loadSettings(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['authProvider', 'preferences']);
    
    // Load provider settings
    if (result.authProvider) {
      const providerRadio = document.querySelector(
        `input[name="provider"][value="${result.authProvider.type}"]`
      ) as HTMLInputElement | null;
      if (providerRadio) {
        providerRadio.checked = true;
        providerRadio.dispatchEvent(new Event('change'));
      }
    }
    
    // Load preferences
    if (result.preferences) {
      const prefs = result.preferences;
      
      const targetLang = document.getElementById('target-language') as HTMLSelectElement;
      if (targetLang) targetLang.value = prefs.defaultTargetLanguage ?? 'zh-TW';
      
      const fontSize = document.getElementById('font-size') as HTMLInputElement;
      const fontSizeValue = document.getElementById('font-size-value');
      if (fontSize && prefs.fontSize) {
        fontSize.value = String(prefs.fontSize);
        if (fontSizeValue) fontSizeValue.textContent = `${prefs.fontSize}px`;
      }
      
      const position = document.getElementById('subtitle-position') as HTMLSelectElement;
      if (position) position.value = prefs.subtitlePosition ?? 'bottom';
      
      const bilingual = document.getElementById('bilingual-mode') as HTMLInputElement;
      if (bilingual) bilingual.checked = prefs.bilingualMode ?? false;
    }
  } catch (error) {
    console.error('[Options] Failed to load settings:', error);
  }
}

async function saveSettings(): Promise<void> {
  try {
    const providerRadio = document.querySelector(
      'input[name="provider"]:checked'
    ) as HTMLInputElement | null;
    
    const preferences = {
      defaultTargetLanguage: (document.getElementById('target-language') as HTMLSelectElement)?.value ?? 'zh-TW',
      fontSize: parseInt((document.getElementById('font-size') as HTMLInputElement)?.value ?? '18', 10),
      subtitlePosition: (document.getElementById('subtitle-position') as HTMLSelectElement)?.value as 'top' | 'bottom' ?? 'bottom',
      bilingualMode: (document.getElementById('bilingual-mode') as HTMLInputElement)?.checked ?? false,
      autoTranslate: false,
      acceptedSubscriptionDisclaimer: false
    };
    
    await chrome.storage.local.set({ preferences });
    
    if (providerRadio) {
      // Provider configuration will be expanded in Phase 5
      console.log('[Options] Selected provider:', providerRadio.value);
    }
    
    showNotification('設定已儲存');
  } catch (error) {
    console.error('[Options] Failed to save settings:', error);
    showNotification('儲存失敗', 'error');
  }
}

async function clearAllCache(): Promise<void> {
  try {
    await cacheManager.clear();
    console.log('[Options] Cache cleared');
    showNotification('快取已清除');
    
    // Refresh stats
    void loadCacheStats();
  } catch (error) {
    console.error('[Options] Failed to clear cache:', error);
    showNotification('清除失敗', 'error');
  }
}

async function loadCacheStats(): Promise<void> {
  try {
    const stats = await cacheManager.getStats();
    const entries = await cacheManager.getAll();
    
    updateCacheStatsUI(stats, entries);
  } catch (error) {
    console.error('[Options] Failed to load cache stats:', error);
  }
}

function updateCacheStatsUI(stats: CacheManagerStats, entries: TranslationCache[]): void {
  // Update cache count
  const cacheCountEl = document.getElementById('cache-count');
  if (cacheCountEl) {
    cacheCountEl.textContent = `${stats.l2.count} 筆翻譯`;
  }
  
  // Update cache size
  const cacheSizeEl = document.getElementById('cache-size');
  if (cacheSizeEl) {
    cacheSizeEl.textContent = formatBytes(stats.l2.totalSize);
  }
  
  // Update hit rate
  const hitRateEl = document.getElementById('cache-hit-rate');
  if (hitRateEl) {
    hitRateEl.textContent = `${stats.combinedHitRate.toFixed(1)}%`;
  }
  
  // Update cache entries list
  const cacheListEl = document.getElementById('cache-entries-list');
  if (cacheListEl) {
    cacheListEl.innerHTML = '';
    
    if (entries.length === 0) {
      cacheListEl.innerHTML = '<div class="empty-state">沒有快取的翻譯</div>';
      return;
    }
    
    // Sort by last accessed (most recent first)
    const sortedEntries = [...entries].sort((a, b) => 
      new Date(b.lastAccessedAt).getTime() - new Date(a.lastAccessedAt).getTime()
    );
    
    for (const entry of sortedEntries) {
      const item = createCacheEntryItem(entry);
      cacheListEl.appendChild(item);
    }
  }
}

function createCacheEntryItem(entry: TranslationCache): HTMLElement {
  const item = document.createElement('div');
  item.className = 'cache-entry-item';
  
  const info = document.createElement('div');
  info.className = 'cache-entry-info';
  
  const videoId = document.createElement('span');
  videoId.className = 'video-id';
  videoId.textContent = entry.key.videoId;
  
  const langPair = document.createElement('span');
  langPair.className = 'lang-pair';
  langPair.textContent = `${entry.key.sourceLanguage} → ${entry.key.targetLanguage}`;
  
  const meta = document.createElement('span');
  meta.className = 'meta';
  const cueCount = entry.subtitle.cues?.length || 0;
  const lastAccessed = new Date(entry.lastAccessedAt).toLocaleDateString('zh-TW');
  meta.textContent = `${cueCount} 句 | ${formatBytes(entry.size)} | ${lastAccessed}`;
  
  info.appendChild(videoId);
  info.appendChild(langPair);
  info.appendChild(meta);
  
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-cache-btn';
  deleteBtn.textContent = '刪除';
  deleteBtn.addEventListener('click', () => {
    void deleteCacheEntry(entry.key.videoId);
  });
  
  item.appendChild(info);
  item.appendChild(deleteBtn);
  
  return item;
}

async function deleteCacheEntry(videoId: string): Promise<void> {
  try {
    const deleted = await cacheManager.deleteByVideoId(videoId);
    console.log(`[Options] Deleted ${deleted} cache entries for video ${videoId}`);
    showNotification('已刪除快取');
    
    // Refresh stats
    void loadCacheStats();
  } catch (error) {
    console.error('[Options] Failed to delete cache entry:', error);
    showNotification('刪除失敗', 'error');
  }
}

function showNotification(message: string, type: 'success' | 'error' = 'success'): void {
  // Simple notification - could be enhanced with a proper toast system
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.remove();
  }, 3000);
}

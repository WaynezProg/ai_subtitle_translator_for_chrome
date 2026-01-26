/**
 * Network Status Utilities
 * 
 * Detects offline status and suggests Ollama when configured.
 * 
 * @see T104: Detect offline status and suggest Ollama if configured
 */

import { getAuthConfig, hasValidCredentials } from './auth-storage';
import { createLogger } from './logger';

const log = createLogger('NetworkStatus');

// ============================================================================
// Types
// ============================================================================

export interface NetworkStatus {
  /** Whether the browser is online */
  isOnline: boolean;
  
  /** Whether Ollama is configured and available */
  ollamaAvailable: boolean;
  
  /** Suggested provider based on network status */
  suggestedProvider: 'current' | 'ollama';
  
  /** Message to display to user */
  message?: string;
}

// ============================================================================
// Network Status Detection
// ============================================================================

/**
 * Check current network status
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Check if Ollama is configured
 */
export async function isOllamaConfigured(): Promise<boolean> {
  return hasValidCredentials('ollama');
}

/**
 * Check if Ollama endpoint is reachable
 */
export async function isOllamaReachable(endpoint?: string): Promise<boolean> {
  const targetEndpoint = endpoint || 'http://localhost:11434';
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`${targetEndpoint}/api/tags`, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get comprehensive network status
 */
export async function getNetworkStatus(): Promise<NetworkStatus> {
  const online = isOnline();
  const ollamaConfigured = await isOllamaConfigured();
  
  let ollamaAvailable = false;
  if (ollamaConfigured) {
    ollamaAvailable = await isOllamaReachable();
  }
  
  // Determine suggested provider
  if (!online && ollamaAvailable) {
    return {
      isOnline: false,
      ollamaAvailable: true,
      suggestedProvider: 'ollama',
      message: '目前處於離線狀態，建議使用本地 Ollama 模型進行翻譯',
    };
  }
  
  if (!online && !ollamaAvailable) {
    return {
      isOnline: false,
      ollamaAvailable: false,
      suggestedProvider: 'current',
      message: '目前處於離線狀態，無法進行翻譯。請連接網路或設定 Ollama。',
    };
  }
  
  return {
    isOnline: true,
    ollamaAvailable,
    suggestedProvider: 'current',
  };
}

// ============================================================================
// Network Status Listener
// ============================================================================

type NetworkStatusCallback = (status: NetworkStatus) => void;

const listeners: Set<NetworkStatusCallback> = new Set();

/**
 * Subscribe to network status changes
 */
export function onNetworkStatusChange(callback: NetworkStatusCallback): () => void {
  listeners.add(callback);
  
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Notify all listeners of status change
 */
async function notifyListeners(): Promise<void> {
  const status = await getNetworkStatus();
  for (const listener of listeners) {
    try {
      listener(status);
    } catch (error) {
      console.error('[NetworkStatus] Listener error:', error);
    }
  }
}

// Setup event listeners
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    log.debug('Online');
    void notifyListeners();
  });

  window.addEventListener('offline', () => {
    log.debug('Offline');
    void notifyListeners();
  });
}

// ============================================================================
// Provider Suggestion
// ============================================================================

/**
 * Get provider suggestion for current network conditions
 */
export async function getProviderSuggestion(): Promise<{
  useOllama: boolean;
  reason?: string;
}> {
  const status = await getNetworkStatus();
  
  if (!status.isOnline && status.ollamaAvailable) {
    return {
      useOllama: true,
      reason: '離線狀態 - 使用本地模型',
    };
  }
  
  const config = await getAuthConfig();
  
  // If user has Ollama selected, confirm it's available
  if (config.selectedProvider === 'ollama') {
    const reachable = await isOllamaReachable();
    return {
      useOllama: reachable,
      reason: reachable ? undefined : 'Ollama 無法連線',
    };
  }
  
  return {
    useOllama: false,
  };
}

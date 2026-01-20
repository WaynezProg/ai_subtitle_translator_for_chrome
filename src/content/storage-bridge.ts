/**
 * Storage Bridge for MAIN World
 * 
 * Provides storage access for content scripts running in MAIN world.
 * Uses postMessage to communicate with the bridge script in ISOLATED world.
 */

// ============================================================================
// Types
// ============================================================================

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

// ============================================================================
// Storage Bridge
// ============================================================================

class StorageBridge {
  private pendingRequests = new Map<string, PendingRequest>();
  private requestCounter = 0;
  private initialized = false;
  
  constructor() {
    this.setupListener();
  }
  
  /**
   * Setup listener for bridge responses
   */
  private setupListener(): void {
    if (this.initialized) return;
    
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      
      const data = event.data;
      if (data?.type === 'AI_SUBTITLE_STORAGE_RESPONSE') {
        const { requestId, data: responseData, success, error } = data;
        const pending = this.pendingRequests.get(requestId);
        
        if (pending) {
          this.pendingRequests.delete(requestId);
          
          if (error) {
            pending.reject(new Error(error));
          } else if (success !== undefined) {
            pending.resolve(success);
          } else {
            pending.resolve(responseData);
          }
        }
      }
    });
    
    this.initialized = true;
  }
  
  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `storage-${Date.now()}-${++this.requestCounter}`;
  }
  
  /**
   * Get values from storage
   */
  async get(keys: string | string[] | null): Promise<Record<string, unknown>> {
    const requestId = this.generateRequestId();
    
    return new Promise((resolve, reject) => {
      // Set timeout for request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Storage request timeout'));
      }, 5000);
      
      this.pendingRequests.set(requestId, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value as Record<string, unknown>);
        },
        reject: (reason) => {
          clearTimeout(timeout);
          reject(reason);
        }
      });
      
      // Security: Use window.location.origin instead of '*' to restrict message receivers
      window.postMessage({
        type: 'AI_SUBTITLE_STORAGE_GET',
        requestId,
        keys
      }, window.location.origin);
    });
  }
  
  /**
   * Set values in storage
   */
  async set(items: Record<string, unknown>): Promise<void> {
    const requestId = this.generateRequestId();
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Storage request timeout'));
      }, 5000);
      
      this.pendingRequests.set(requestId, {
        resolve: () => {
          clearTimeout(timeout);
          resolve();
        },
        reject: (reason) => {
          clearTimeout(timeout);
          reject(reason);
        }
      });
      
      // Security: Use window.location.origin instead of '*' to restrict message receivers
      window.postMessage({
        type: 'AI_SUBTITLE_STORAGE_SET',
        requestId,
        data: items
      }, window.location.origin);
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const storageBridge = new StorageBridge();

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get auth configuration from storage
 */
export async function getAuthConfigFromBridge(): Promise<{
  selectedProvider: string;
  providers: Record<string, unknown>;
}> {
  try {
    const result = await storageBridge.get(['authConfig']);
    const config = result.authConfig as {
      selectedProvider?: string;
      providers?: Record<string, unknown>;
    } | undefined;
    
    return {
      selectedProvider: config?.selectedProvider || 'google-translate',
      providers: config?.providers || {}
    };
  } catch (error) {
    console.warn('[StorageBridge] Failed to get auth config, using defaults:', error);
    return {
      selectedProvider: 'google-translate',
      providers: {}
    };
  }
}

/**
 * Get user preferences from storage
 */
export async function getPreferencesFromBridge(): Promise<{
  defaultTargetLanguage: string;
  fontSize: number;
  subtitlePosition: 'top' | 'bottom';
  bilingualMode: boolean;
}> {
  try {
    const result = await storageBridge.get(['preferences']);
    const prefs = result.preferences as {
      defaultTargetLanguage?: string;
      fontSize?: number;
      subtitlePosition?: 'top' | 'bottom';
      bilingualMode?: boolean;
    } | undefined;
    
    return {
      defaultTargetLanguage: prefs?.defaultTargetLanguage || 'zh-TW',
      fontSize: prefs?.fontSize || 18,
      subtitlePosition: prefs?.subtitlePosition || 'bottom',
      bilingualMode: prefs?.bilingualMode || false
    };
  } catch (error) {
    console.warn('[StorageBridge] Failed to get preferences, using defaults:', error);
    return {
      defaultTargetLanguage: 'zh-TW',
      fontSize: 18,
      subtitlePosition: 'bottom',
      bilingualMode: false
    };
  }
}

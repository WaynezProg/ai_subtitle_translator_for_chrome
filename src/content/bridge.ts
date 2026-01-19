/**
 * Content Script Bridge
 * 
 * This script runs in the ISOLATED world and bridges messages between
 * the popup/background (via chrome.runtime) and the main content script
 * (via window.postMessage).
 * 
 * Required because the main content script runs in MAIN world for
 * XHR/fetch interception and doesn't have access to chrome.runtime.
 */

/**
 * Check if extension context is still valid
 */
function isExtensionContextValid(): boolean {
  try {
    // Accessing chrome.runtime.id will throw if context is invalidated
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

/**
 * Safely send message to background, handling context invalidation
 */
async function safeSendMessage(message: unknown): Promise<unknown> {
  if (!isExtensionContextValid()) {
    throw new Error('Extension context invalidated. Please refresh the page.');
  }
  
  return chrome.runtime.sendMessage(message);
}

// Listen for messages from popup/background → forward to MAIN world
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TOGGLE_SUBTITLES') {
    window.postMessage({
      type: 'AI_SUBTITLE_TOGGLE',
      visible: message.payload.visible
    }, '*');
    sendResponse({ success: true });
  }
  
  // Forward translation progress/complete/error messages to MAIN world
  if (message.type === 'TRANSLATION_PROGRESS' || 
      message.type === 'TRANSLATION_COMPLETE' || 
      message.type === 'TRANSLATION_ERROR' ||
      message.type === 'TRANSLATION_CHUNK_COMPLETE') {
    window.postMessage({
      type: 'AI_SUBTITLE_BACKGROUND_MESSAGE',
      message: message
    }, '*');
    sendResponse({ success: true });
  }
  
  // Handle subtitle state query from popup
  if (message.type === 'GET_SUBTITLE_STATE') {
    const requestId = `subtitle-state-${Date.now()}`;
    
    // Set up listener for response from MAIN world
    const responseHandler = (event: MessageEvent): void => {
      if (event.source !== window) return;
      if (event.data?.type === 'AI_SUBTITLE_STATE_RESPONSE' && event.data.requestId === requestId) {
        window.removeEventListener('message', responseHandler);
        sendResponse(event.data.state);
      }
    };
    window.addEventListener('message', responseHandler);
    
    // Request state from MAIN world
    window.postMessage({
      type: 'AI_SUBTITLE_GET_STATE',
      requestId
    }, '*');
    
    // Timeout after 2 seconds
    setTimeout(() => {
      window.removeEventListener('message', responseHandler);
      sendResponse(null);
    }, 2000);
    
    return true; // Keep channel open for async response
  }
  
  // Handle download request from popup
  if (message.type === 'DOWNLOAD_SUBTITLE') {
    window.postMessage({
      type: 'AI_SUBTITLE_DOWNLOAD',
      mode: message.payload.mode
    }, '*');
    sendResponse({ success: true });
  }
  
  // Handle upload request from popup
  if (message.type === 'UPLOAD_SUBTITLE') {
    window.postMessage({
      type: 'AI_SUBTITLE_UPLOAD',
      content: message.payload.content,
      filename: message.payload.filename
    }, '*');
    sendResponse({ success: true });
  }
  
  return true;
});

// Listen for requests from MAIN world → forward to background
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  const data = event.data;
  
  // Handle visibility request
  if (data?.type === 'AI_SUBTITLE_GET_VISIBILITY') {
    void (async (): Promise<void> => {
      try {
        if (!isExtensionContextValid()) {
          // Extension context invalidated, default to visible
          window.postMessage({
            type: 'AI_SUBTITLE_TOGGLE',
            visible: true
          }, '*');
          return;
        }
        
        const result = await chrome.storage.local.get(['subtitleVisible']);
        const visible = result.subtitleVisible !== false;
        window.postMessage({
          type: 'AI_SUBTITLE_TOGGLE',
          visible
        }, '*');
      } catch (error) {
        console.error('[Bridge] Failed to get visibility:', error);
      }
    })();
    return;
  }
  
  // Handle storage get request from MAIN world
  if (data?.type === 'AI_SUBTITLE_STORAGE_GET') {
    const { requestId, keys } = data;
    
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      window.postMessage({
        type: 'AI_SUBTITLE_STORAGE_RESPONSE',
        requestId,
        data: {},
        error: '擴充功能已更新，請重新整理頁面'
      }, '*');
      return;
    }
    
    // Use Promise wrapper for chrome.storage.local.get
    new Promise<Record<string, unknown>>((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    }).then((result) => {
      window.postMessage({
        type: 'AI_SUBTITLE_STORAGE_RESPONSE',
        requestId,
        data: result
      }, '*');
    }).catch((error: unknown) => {
      console.error('[Bridge] Failed to get storage:', error);
      window.postMessage({
        type: 'AI_SUBTITLE_STORAGE_RESPONSE',
        requestId,
        data: {},
        error: error instanceof Error ? error.message : 'Storage access failed'
      }, '*');
    });
    return;
  }
  
  // Handle storage set request from MAIN world
  if (data?.type === 'AI_SUBTITLE_STORAGE_SET') {
    const { requestId, data: storageData } = data;
    
    // Check if extension context is still valid
    if (!isExtensionContextValid()) {
      window.postMessage({
        type: 'AI_SUBTITLE_STORAGE_RESPONSE',
        requestId,
        success: false,
        error: '擴充功能已更新，請重新整理頁面'
      }, '*');
      return;
    }
    
    // Use Promise wrapper for chrome.storage.local.set
    new Promise<void>((resolve, reject) => {
      chrome.storage.local.set(storageData, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    }).then(() => {
      window.postMessage({
        type: 'AI_SUBTITLE_STORAGE_RESPONSE',
        requestId,
        success: true
      }, '*');
    }).catch((error: unknown) => {
      console.error('[Bridge] Failed to set storage:', error);
      window.postMessage({
        type: 'AI_SUBTITLE_STORAGE_RESPONSE',
        requestId,
        success: false,
        error: error instanceof Error ? error.message : 'Storage write failed'
      }, '*');
    });
    return;
  }
  
  // Handle bridge requests (forward to background and return response)
  if (data?.type === 'AI_SUBTITLE_BRIDGE_REQUEST') {
    const { requestId, message } = data;
    
    void (async (): Promise<void> => {
      try {
        const response = await safeSendMessage(message);
        window.postMessage({
          type: 'AI_SUBTITLE_BRIDGE_RESPONSE',
          requestId,
          response
        }, '*');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Bridge communication failed';
        const isContextInvalidated = errorMessage.includes('Extension context invalidated') ||
                                      errorMessage.includes('context invalidated');
        
        window.postMessage({
          type: 'AI_SUBTITLE_BRIDGE_RESPONSE',
          requestId,
          response: {
            success: false,
            error: {
              code: isContextInvalidated ? 'EXTENSION_RELOADED' : 'BRIDGE_ERROR',
              message: isContextInvalidated 
                ? '擴充功能已更新，請重新整理頁面' 
                : errorMessage
            }
          }
        }, '*');
      }
    })();
    return;
  }
});

console.log('[Bridge] Content script bridge loaded');

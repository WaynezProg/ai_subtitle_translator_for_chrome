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
        const response = await chrome.runtime.sendMessage(message);
        window.postMessage({
          type: 'AI_SUBTITLE_BRIDGE_RESPONSE',
          requestId,
          response
        }, '*');
      } catch (error) {
        window.postMessage({
          type: 'AI_SUBTITLE_BRIDGE_RESPONSE',
          requestId,
          response: {
            success: false,
            error: {
              code: 'BRIDGE_ERROR',
              message: error instanceof Error ? error.message : 'Bridge communication failed'
            }
          }
        }, '*');
      }
    })();
    return;
  }
});

console.log('[Bridge] Content script bridge loaded');

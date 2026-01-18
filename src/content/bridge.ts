/**
 * Content Script Bridge
 * 
 * This script runs in the ISOLATED world and bridges messages between
 * the popup/background (via chrome.runtime) and the main content script
 * (via window.postMessage).
 * 
 * Required because the main content script runs in MAIN world for
 * XHR/fetch interception.
 */

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TOGGLE_SUBTITLES') {
    // Forward to main world content script
    window.postMessage({
      type: 'AI_SUBTITLE_TOGGLE',
      visible: message.payload.visible
    }, '*');
    
    sendResponse({ success: true });
  }
  
  return true;
});

// Listen for visibility request from main world
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data?.type === 'AI_SUBTITLE_GET_VISIBILITY') {
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
  }
});

console.log('[Bridge] Content script bridge loaded');

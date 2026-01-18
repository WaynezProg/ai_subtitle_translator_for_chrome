/**
 * Background Message Handler
 * 
 * Handles incoming messages from content scripts and popup.
 * 
 * @see specs/001-ai-subtitle-translator/contracts/message-passing.md
 */

import type {
  ContentToBackgroundMessage,
  SubtitleDetectedMessage,
  SubtitleDetectedResponse,
  RequestTranslationMessage,
  RequestTranslationResponse,
  CancelTranslationMessage,
  CancelTranslationResponse,
  GetCachedTranslationMessage,
  GetCachedTranslationResponse,
  GetAuthStatusMessage,
  GetAuthStatusResponse,
  Response,
  BackgroundToContentMessage,
} from '../shared/types/messages';

// ============================================================================
// Types
// ============================================================================

/**
 * Handler function type for each message type
 */
type HandlerFunction<T extends ContentToBackgroundMessage, R extends Response> = (
  message: T,
  sender: chrome.runtime.MessageSender
) => Promise<R>;

/**
 * Handler registry type
 */
interface MessageHandlers {
  SUBTITLE_DETECTED: HandlerFunction<SubtitleDetectedMessage, SubtitleDetectedResponse>;
  REQUEST_TRANSLATION: HandlerFunction<RequestTranslationMessage, RequestTranslationResponse>;
  CANCEL_TRANSLATION: HandlerFunction<CancelTranslationMessage, CancelTranslationResponse>;
  GET_CACHED_TRANSLATION: HandlerFunction<GetCachedTranslationMessage, GetCachedTranslationResponse>;
  GET_AUTH_STATUS: HandlerFunction<GetAuthStatusMessage, GetAuthStatusResponse>;
}

// ============================================================================
// Message Handler Class
// ============================================================================

/**
 * MessageHandler manages incoming messages from content scripts
 */
export class MessageHandler {
  private handlers: Partial<MessageHandlers> = {};
  private isListening = false;
  
  /**
   * Register a handler for a specific message type
   */
  on<K extends keyof MessageHandlers>(type: K, handler: MessageHandlers[K]): this {
    this.handlers[type] = handler as MessageHandlers[K];
    return this;
  }
  
  /**
   * Unregister a handler for a specific message type
   */
  off<K extends keyof MessageHandlers>(type: K): this {
    delete this.handlers[type];
    return this;
  }
  
  /**
   * Start listening for messages
   */
  startListening(): void {
    if (this.isListening) {
      console.warn('[MessageHandler] Already listening for messages');
      return;
    }
    
    chrome.runtime.onMessage.addListener(this.handleMessage);
    this.isListening = true;
    console.log('[MessageHandler] Started listening for messages');
  }
  
  /**
   * Stop listening for messages
   */
  stopListening(): void {
    if (!this.isListening) {
      return;
    }
    
    chrome.runtime.onMessage.removeListener(this.handleMessage);
    this.isListening = false;
    console.log('[MessageHandler] Stopped listening for messages');
  }
  
  /**
   * Internal message handler bound to this instance
   */
  private handleMessage = (
    message: ContentToBackgroundMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: Response) => void
  ): boolean => {
    const handler = this.handlers[message.type as keyof MessageHandlers];
    
    if (!handler) {
      console.warn(`[MessageHandler] No handler for message type: ${message.type}`);
      sendResponse({
        success: false,
        error: {
          code: 'UNHANDLED_MESSAGE',
          message: `No handler registered for message type: ${message.type}`,
        },
      });
      return false;
    }
    
    // Execute handler asynchronously
    (handler as HandlerFunction<ContentToBackgroundMessage, Response>)(message, sender)
      .then((response) => {
        sendResponse(response);
      })
      .catch((error) => {
        console.error(`[MessageHandler] Error handling ${message.type}:`, error);
        sendResponse({
          success: false,
          error: {
            code: 'HANDLER_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      });
    
    // Return true to indicate we will send response asynchronously
    return true;
  };
}

// ============================================================================
// Tab Message Sender
// ============================================================================

/**
 * Send a message to a specific tab
 */
export async function sendToTab<T extends BackgroundToContentMessage>(
  tabId: number,
  message: T
): Promise<void> {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    // Tab might be closed or doesn't have content script
    console.warn(`[MessageHandler] Failed to send message to tab ${tabId}:`, error);
  }
}

/**
 * Broadcast a message to all tabs matching a URL pattern
 */
export async function broadcastToTabs<T extends BackgroundToContentMessage>(
  message: T,
  urlPattern: string = '<all_urls>'
): Promise<void> {
  try {
    const tabs = await chrome.tabs.query({ url: urlPattern });
    await Promise.all(
      tabs
        .filter((tab) => tab.id !== undefined)
        .map((tab) => sendToTab(tab.id!, message))
    );
  } catch (error) {
    console.error('[MessageHandler] Failed to broadcast message:', error);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

/**
 * Default message handler instance
 */
export const messageHandler = new MessageHandler();

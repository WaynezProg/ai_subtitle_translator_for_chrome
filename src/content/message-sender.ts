/**
 * Content Script Message Sender
 * 
 * Utilities for sending messages from content scripts to the background service worker.
 * 
 * @see specs/001-ai-subtitle-translator/contracts/message-passing.md
 */

import type {
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
  TranslateTextMessage,
  TranslateTextResponse,
  SaveTranslationMessage,
  SaveTranslationResponse,
  BackgroundToContentMessage,
  Response,
} from '../shared/types/messages';
import type { Platform, SubtitleFormat, Subtitle, Cue } from '../shared/types/subtitle';
import type { ProviderType, ProviderStatus } from '../shared/types/auth';

// ============================================================================
// Core Send Function
// ============================================================================

/**
 * Send a message to the background script and await response via bridge
 * 
 * In MAIN world, we don't have access to chrome.runtime, so we use
 * window.postMessage to communicate with the bridge script in ISOLATED world.
 * 
 * @throws Error if response indicates failure
 */
async function sendMessage<TResponse extends Response>(
  message: object
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const requestId = (message as { requestId?: string }).requestId || generateRequestId();
    const messageWithId = { ...message, requestId };
    
    // Set up response listener
    const handleResponse = (event: MessageEvent): void => {
      if (event.source !== window) return;
      if (event.data?.type !== 'AI_SUBTITLE_BRIDGE_RESPONSE') return;
      if (event.data?.requestId !== requestId) return;
      
      window.removeEventListener('message', handleResponse);
      
      const response = event.data.response;
      
      if (!response) {
        reject(new MessageError('NO_RESPONSE', 'No response received from background script'));
        return;
      }
      
      if (!response.success) {
        reject(new MessageError(
          response.error?.code ?? 'UNKNOWN_ERROR',
          response.error?.message ?? 'Unknown error occurred'
        ));
        return;
      }
      
      resolve(response as TResponse);
    };
    
    window.addEventListener('message', handleResponse);
    
    // Send message via bridge
    window.postMessage({
      type: 'AI_SUBTITLE_BRIDGE_REQUEST',
      requestId,
      message: messageWithId,
    }, '*');
    
    // Timeout after 30 seconds
    setTimeout(() => {
      window.removeEventListener('message', handleResponse);
      reject(new MessageError('TIMEOUT', 'Request timed out'));
    }, 30000);
  });
}

// ============================================================================
// Message Sender Functions
// ============================================================================

/**
 * Notify background that a subtitle was detected
 */
export async function sendSubtitleDetected(params: {
  platform: Platform;
  videoId: string;
  subtitleUrl: string;
  sourceLanguage: string;
  format: SubtitleFormat;
}): Promise<{ cached: boolean; cacheStatus?: 'hit' | 'partial' }> {
  const message: SubtitleDetectedMessage = {
    type: 'SUBTITLE_DETECTED',
    payload: params,
    requestId: generateRequestId(),
  };
  
  const response = await sendMessage<SubtitleDetectedResponse>(message);
  return response.data!;
}

/**
 * Request translation of subtitles
 */
export async function requestTranslation(params: {
  subtitleId: string;
  videoId: string;
  platform: Platform;
  sourceLanguage: string;
  targetLanguage: string;
  cues: Cue[];
  startFromIndex?: number;
}): Promise<{ jobId: string; status: 'started' | 'queued' }> {
  const message: RequestTranslationMessage = {
    type: 'REQUEST_TRANSLATION',
    payload: params,
    requestId: generateRequestId(),
  };
  
  const response = await sendMessage<RequestTranslationResponse>(message);
  return response.data!;
}

/**
 * Cancel an ongoing translation
 */
export async function cancelTranslation(jobId: string): Promise<{ cancelled: boolean }> {
  const message: CancelTranslationMessage = {
    type: 'CANCEL_TRANSLATION',
    payload: { jobId },
    requestId: generateRequestId(),
  };
  
  const response = await sendMessage<CancelTranslationResponse>(message);
  return response.data!;
}

/**
 * Get cached translation if available
 */
export async function getCachedTranslation(params: {
  videoId: string;
  sourceLanguage: string;
  targetLanguage: string;
}): Promise<{ found: boolean; subtitle?: Subtitle; lastAccessedAt?: string }> {
  const message: GetCachedTranslationMessage = {
    type: 'GET_CACHED_TRANSLATION',
    payload: params,
    requestId: generateRequestId(),
  };
  
  const response = await sendMessage<GetCachedTranslationResponse>(message);
  return response.data!;
}

/**
 * Get current authentication status
 */
export async function getAuthStatus(): Promise<{
  configured: boolean;
  provider?: ProviderType;
  status?: ProviderStatus;
}> {
  const message: GetAuthStatusMessage = {
    type: 'GET_AUTH_STATUS',
    payload: {},
    requestId: generateRequestId(),
  };
  
  const response = await sendMessage<GetAuthStatusResponse>(message);
  return response.data!;
}

/**
 * Translate a single text string (for real-time translation)
 */
export async function translateText(params: {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  /** Optional context from previous batch for better translation consistency */
  context?: {
    previousCues?: Array<{
      original: string;
      translated: string;
    }>;
  };
}): Promise<{ translatedText: string; cached: boolean }> {
  const message: TranslateTextMessage = {
    type: 'TRANSLATE_TEXT',
    payload: params,
    requestId: generateRequestId(),
  };

  const response = await sendMessage<TranslateTextResponse>(message);
  if (!response.success || !response.data) {
    throw new Error(response.error?.message || 'Translation failed');
  }
  return response.data;
}

/**
 * Save translation to cache
 */
export async function saveTranslation(params: {
  videoId: string;
  platform: Platform;
  sourceLanguage: string;
  targetLanguage: string;
  subtitle: Subtitle;
}): Promise<{ saved: boolean }> {
  const message: SaveTranslationMessage = {
    type: 'SAVE_TRANSLATION',
    payload: params,
    requestId: generateRequestId(),
  };
  
  const response = await sendMessage<SaveTranslationResponse>(message);
  return response.data || { saved: false };
}

// ============================================================================
// Message Listener
// ============================================================================

/**
 * Listener callback type for background messages
 */
export type BackgroundMessageListener<T extends BackgroundToContentMessage> = (
  message: T
) => void;

/**
 * Listener registry
 */
const listeners = new Map<string, Set<BackgroundMessageListener<BackgroundToContentMessage>>>();

/**
 * Add a listener for a specific message type from background
 */
export function addMessageListener<T extends BackgroundToContentMessage>(
  type: T['type'],
  listener: BackgroundMessageListener<T>
): () => void {
  if (!listeners.has(type)) {
    listeners.set(type, new Set());
  }
  
  listeners.get(type)!.add(listener as BackgroundMessageListener<BackgroundToContentMessage>);
  
  // Return unsubscribe function
  return () => {
    listeners.get(type)?.delete(listener as BackgroundMessageListener<BackgroundToContentMessage>);
  };
}

/**
 * Remove all listeners for a specific message type
 */
export function removeAllListeners(type: string): void {
  listeners.delete(type);
}

/**
 * Setup the message listener for incoming messages from background
 * 
 * In MAIN world, we listen for window messages forwarded by the bridge script.
 */
export function setupMessageListener(): void {
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    // Handle messages forwarded by bridge from background
    if (event.data?.type === 'AI_SUBTITLE_BACKGROUND_MESSAGE') {
      const message = event.data.message as BackgroundToContentMessage;
      const messageListeners = listeners.get(message.type);
      
      if (messageListeners) {
        for (const listener of messageListeners) {
          try {
            listener(message);
          } catch (error) {
            console.error(`[MessageSender] Error in listener for ${message.type}:`, error);
          }
        }
      }
    }
  });
}

// ============================================================================
// Error Class
// ============================================================================

/**
 * Error class for message-related errors
 */
export class MessageError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'MessageError';
  }
  
  /**
   * Check if this error is due to extension context being invalidated
   */
  isExtensionReloaded(): boolean {
    return this.code === 'EXTENSION_RELOADED' || 
           this.message.includes('Extension context invalidated');
  }
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

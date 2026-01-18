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
  BackgroundToContentMessage,
  Response,
} from '../shared/types/messages';
import type { Platform, SubtitleFormat, Subtitle } from '../shared/types/subtitle';
import type { ProviderType, ProviderStatus } from '../shared/types/auth';

// ============================================================================
// Core Send Function
// ============================================================================

/**
 * Send a message to the background script and await response
 * 
 * @throws Error if response indicates failure
 */
async function sendMessage<TResponse extends Response>(
  message: object
): Promise<TResponse> {
  const response = await chrome.runtime.sendMessage(message);
  
  if (!response) {
    throw new MessageError('NO_RESPONSE', 'No response received from background script');
  }
  
  if (!response.success) {
    throw new MessageError(
      response.error?.code ?? 'UNKNOWN_ERROR',
      response.error?.message ?? 'Unknown error occurred'
    );
  }
  
  return response as TResponse;
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
  targetLanguage: string;
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
 */
export function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener((message: BackgroundToContentMessage) => {
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
    
    // Return false to indicate we're not sending a response
    return false;
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

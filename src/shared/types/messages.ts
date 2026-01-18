/**
 * Message passing type definitions for Content Script ↔ Background communication
 * 
 * @see specs/001-ai-subtitle-translator/contracts/message-passing.md
 */

import type { Platform, SubtitleFormat, Subtitle, Cue } from './subtitle';
import type { ProviderType, ProviderStatus } from './auth';
import type { JobProgress, ErrorCode } from './translation';

// ============================================================================
// Base Types
// ============================================================================

/**
 * Base message format
 */
export interface Message<T extends string, P = unknown> {
  type: T;
  payload: P;
  /** Optional request ID for tracking request-response pairs */
  requestId?: string;
}

/**
 * Response format
 */
export interface Response<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

// ============================================================================
// Content Script → Background Messages
// ============================================================================

/**
 * SUBTITLE_DETECTED: When content script detects a subtitle URL
 */
export interface SubtitleDetectedMessage extends Message<'SUBTITLE_DETECTED', {
  platform: Platform;
  videoId: string;
  subtitleUrl: string;
  sourceLanguage: string;
  format: SubtitleFormat;
}> {}

export interface SubtitleDetectedResponse extends Response<{
  cached: boolean;
  cacheStatus?: 'hit' | 'partial';
}> {}

/**
 * REQUEST_TRANSLATION: Request to translate subtitles
 */
export interface RequestTranslationMessage extends Message<'REQUEST_TRANSLATION', {
  subtitleId: string;
  videoId: string;
  platform: Platform;
  sourceLanguage: string;
  targetLanguage: string;
  cues: Cue[];
  startFromIndex?: number;
}> {}

export interface RequestTranslationResponse extends Response<{
  jobId: string;
  status: 'started' | 'queued';
}> {}

/**
 * CANCEL_TRANSLATION: Cancel an ongoing translation
 */
export interface CancelTranslationMessage extends Message<'CANCEL_TRANSLATION', {
  jobId: string;
}> {}

export interface CancelTranslationResponse extends Response<{
  cancelled: boolean;
}> {}

/**
 * GET_CACHED_TRANSLATION: Query cached translation
 */
export interface GetCachedTranslationMessage extends Message<'GET_CACHED_TRANSLATION', {
  videoId: string;
  sourceLanguage: string;
  targetLanguage: string;
}> {}

export interface GetCachedTranslationResponse extends Response<{
  found: boolean;
  subtitle?: Subtitle;
  lastAccessedAt?: string;
}> {}

/**
 * GET_AUTH_STATUS: Query authentication status
 */
export interface GetAuthStatusMessage extends Message<'GET_AUTH_STATUS', Record<string, never>> {}

export interface GetAuthStatusResponse extends Response<{
  configured: boolean;
  provider?: ProviderType;
  status?: ProviderStatus;
}> {}

/**
 * TRANSLATE_TEXT: Request to translate a single text (for real-time translation)
 */
export interface TranslateTextMessage extends Message<'TRANSLATE_TEXT', {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
}> {}

export interface TranslateTextResponse extends Response<{
  translatedText: string;
  cached: boolean;
}> {}

// ============================================================================
// Background → Content Script Messages
// ============================================================================

/**
 * TRANSLATION_PROGRESS: Translation progress update
 */
export interface TranslationProgressMessage extends Message<'TRANSLATION_PROGRESS', {
  jobId: string;
  progress: JobProgress;
}> {}

/**
 * TRANSLATION_CHUNK_COMPLETE: A translation chunk completed
 */
export interface TranslationChunkCompleteMessage extends Message<'TRANSLATION_CHUNK_COMPLETE', {
  jobId: string;
  chunkIndex: number;
  cues: Cue[];
}> {}

/**
 * TRANSLATION_COMPLETE: Translation job completed
 */
export interface TranslationCompleteMessage extends Message<'TRANSLATION_COMPLETE', {
  jobId: string;
  subtitle: Subtitle;
  cached: boolean;
}> {}

/**
 * TRANSLATION_ERROR: Translation error
 */
export interface TranslationErrorMessage extends Message<'TRANSLATION_ERROR', {
  jobId: string;
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    retryAfter?: number;
  };
}> {}

/**
 * AUTH_STATUS_CHANGED: Auth status changed
 */
export interface AuthStatusChangedMessage extends Message<'AUTH_STATUS_CHANGED', {
  provider: ProviderType;
  status: ProviderStatus;
}> {}

// ============================================================================
// Type Unions
// ============================================================================

/**
 * All content script to background messages
 */
export type ContentToBackgroundMessage =
  | SubtitleDetectedMessage
  | RequestTranslationMessage
  | CancelTranslationMessage
  | GetCachedTranslationMessage
  | GetAuthStatusMessage
  | TranslateTextMessage;

/**
 * All background to content script messages
 */
export type BackgroundToContentMessage =
  | TranslationProgressMessage
  | TranslationChunkCompleteMessage
  | TranslationCompleteMessage
  | TranslationErrorMessage
  | AuthStatusChangedMessage;

/**
 * All message types
 */
export type AnyMessage = ContentToBackgroundMessage | BackgroundToContentMessage;

/**
 * Message type string union
 */
export type MessageType = AnyMessage['type'];

// ============================================================================
// Type-safe Handler Utilities
// ============================================================================

/**
 * Type-safe message handler type
 */
export type MessageHandler<T extends ContentToBackgroundMessage> = 
  (message: T, sender: chrome.runtime.MessageSender) => Promise<Response>;

/**
 * Type guard for specific message type
 */
export function isMessageType<T extends AnyMessage>(
  message: AnyMessage,
  type: T['type']
): message is T {
  return message.type === type;
}

/**
 * Create a successful response
 */
export function successResponse<T>(data: T): Response<T> {
  return { success: true, data };
}

/**
 * Create an error response
 */
export function errorResponse(code: string, message: string): Response<never> {
  return { success: false, error: { code, message } };
}

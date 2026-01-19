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
 * Cached translation info for selection UI
 */
export interface CachedTranslationInfo {
  /** Cache key ID */
  id: string;
  /** Source language code */
  sourceLanguage: string;
  /** Target language code */
  targetLanguage: string;
  /** Provider type used */
  provider: string;
  /** Model name (if applicable) */
  model?: string;
  /** Translation timestamp (ISO 8601) */
  translatedAt: string;
  /** Number of translated cues */
  cueCount: number;
}

/**
 * GET_ALL_CACHED_TRANSLATIONS: Query all cached translations for a video
 * Used by the settings panel to show available cached versions
 */
export interface GetAllCachedTranslationsMessage extends Message<'GET_ALL_CACHED_TRANSLATIONS', {
  platform: Platform;
  videoId: string;
}> {}

export interface GetAllCachedTranslationsResponse extends Response<{
  translations: CachedTranslationInfo[];
}> {}

/**
 * LOAD_CACHED_TRANSLATION: Load a specific cached translation by ID
 */
export interface LoadCachedTranslationMessage extends Message<'LOAD_CACHED_TRANSLATION', {
  cacheId: string;
}> {}

export interface LoadCachedTranslationResponse extends Response<{
  found: boolean;
  subtitle?: Subtitle;
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
 * Context from previous translation batch for consistency
 */
export interface TranslationContextPayload {
  /** Last few translated cues from previous batch */
  previousCues?: Array<{
    original: string;
    translated: string;
  }>;
}

/**
 * TRANSLATE_TEXT: Request to translate a single text (for real-time translation)
 */
export interface TranslateTextMessage extends Message<'TRANSLATE_TEXT', {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  /** Optional context from previous batch for better translation consistency */
  context?: TranslationContextPayload;
  /** Force a specific provider (e.g., 'google-translate' for quick translation) */
  forceProvider?: 'google-translate';
}> {}

export interface TranslateTextResponse extends Response<{
  translatedText: string;
  cached: boolean;
  /** Context to pass to next batch */
  context?: TranslationContextPayload;
}> {}

/**
 * Input cue for batch translation
 */
export interface BatchTranslationCue {
  /** Cue index for ordering */
  index: number;
  /** Original text to translate */
  text: string;
}

/**
 * Translated cue result
 */
export interface TranslatedBatchCue {
  /** Cue index matching input */
  index: number;
  /** Translated text */
  translatedText: string;
}

/**
 * TRANSLATE_BATCH: Request to translate multiple cues in a batch
 * This provides better context for AI translation compared to single text translation
 */
export interface TranslateBatchMessage extends Message<'TRANSLATE_BATCH', {
  /** Array of cues to translate */
  cues: BatchTranslationCue[];
  sourceLanguage: string;
  targetLanguage: string;
  /** Optional context from previous batch for better translation consistency */
  context?: TranslationContextPayload;
  /** Force a specific provider (e.g., 'google-translate' for quick Phase 1 translation) */
  forceProvider?: 'google-translate';
}> {}

export interface TranslateBatchResponse extends Response<{
  /** Translated cues with same indices as input */
  cues: TranslatedBatchCue[];
  /** Context to pass to next batch */
  context?: TranslationContextPayload;
}> {}

/**
 * SAVE_TRANSLATION: Save translated subtitle to cache
 */
export interface SaveTranslationMessage extends Message<'SAVE_TRANSLATION', {
  videoId: string;
  platform: Platform;
  sourceLanguage: string;
  targetLanguage: string;
  subtitle: Subtitle;
}> {}

export interface SaveTranslationResponse extends Response<{
  saved: boolean;
}> {}

/**
 * VALIDATE_OAUTH_TOKEN: Validate OAuth token via background script (to avoid CORS)
 */
export interface ValidateOAuthTokenMessage extends Message<'VALIDATE_OAUTH_TOKEN', {
  provider: 'claude' | 'chatgpt';
  accessToken: string;
}> {}

export interface ValidateOAuthTokenResponse extends Response<{
  valid: boolean;
  error?: string;
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
  | GetAllCachedTranslationsMessage
  | LoadCachedTranslationMessage
  | GetAuthStatusMessage
  | TranslateTextMessage
  | TranslateBatchMessage
  | SaveTranslationMessage
  | ValidateOAuthTokenMessage;

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

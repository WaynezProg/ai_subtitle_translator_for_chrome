/**
 * Translation Provider Interface
 * 
 * @see specs/001-ai-subtitle-translator/contracts/translation-provider.md
 */

import type { ProviderType } from '../types/auth';

/**
 * Model information
 */
export interface ModelInfo {
  /** Model identifier for API calls */
  id: string;
  
  /** Display name */
  name: string;
  
  /** Context window size (tokens) */
  contextWindow: number;
  
  /** Maximum output tokens */
  maxOutputTokens: number;
  
  /** Cost per 1M input tokens (USD) */
  inputCostPer1M: number;
  
  /** Cost per 1M output tokens (USD) */
  outputCostPer1M: number;
  
  /** Recommended for subtitle translation */
  recommended: boolean;
}

/**
 * Input cue for translation
 */
export interface CueInput {
  index: number;
  text: string;
  speaker?: string;
}

/**
 * Character name glossary for consistent translations
 */
export interface CharacterGlossary {
  [originalName: string]: string;
}

/**
 * Context from previous translation chunks
 */
export interface TranslationContext {
  /** Last N translated cues from previous chunk */
  previousCues: Array<{
    original: string;
    translated: string;
  }>;
  
  /** Identified character names and their translations */
  characters: CharacterGlossary;
}

/**
 * Translation request
 */
export interface TranslationRequest {
  /** Cues to translate */
  cues: CueInput[];
  
  /** Source language (BCP 47) */
  sourceLanguage: string;
  
  /** Target language (BCP 47) */
  targetLanguage: string;
  
  /** Model to use */
  model: string;
  
  /** Context from previous chunks (for consistency) */
  previousContext?: TranslationContext;
  
  /** Character name glossary */
  characterGlossary?: CharacterGlossary;
  
  /** Additional instructions */
  customInstructions?: string;
}

/**
 * Translated cue result
 */
export interface TranslatedCue {
  index: number;
  translatedText: string;
}

/**
 * Token usage statistics
 */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
}

/**
 * Translation result
 */
export interface TranslationResult {
  /** Translated cues */
  cues: TranslatedCue[];
  
  /** Updated context for next chunk */
  context: TranslationContext;
  
  /** Token usage statistics */
  usage: TokenUsage;
  
  /** Any warnings (e.g., truncated output) */
  warnings: string[];
}

/**
 * Streaming progress update
 */
export interface StreamProgress {
  /** Current cue being processed */
  currentIndex: number;
  
  /** Partial translation text (if streaming) */
  partialText?: string;
  
  /** Estimated completion percentage */
  percentage: number;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: {
    code: 'INVALID_KEY' | 'EXPIRED' | 'INSUFFICIENT_QUOTA' | 'NETWORK_ERROR';
    message: string;
  };
  /** Account info if valid */
  accountInfo?: {
    tier?: string;
    quotaRemaining?: number;
  };
}

/**
 * Rate limit status
 */
export interface RateLimitStatus {
  /** Requests remaining in current window */
  requestsRemaining: number;
  
  /** Tokens remaining in current window */
  tokensRemaining: number;
  
  /** When the limit resets (ISO 8601) */
  resetsAt: string;
  
  /** Whether currently rate limited */
  isLimited: boolean;
  
  /** Seconds to wait if limited */
  retryAfter?: number;
}

/**
 * Cost estimate
 */
export interface CostEstimate {
  /** Estimated input tokens */
  estimatedInputTokens: number;
  
  /** Estimated output tokens */
  estimatedOutputTokens: number;
  
  /** Estimated cost in USD */
  estimatedCostUSD: number;
  
  /** Cost range (min-max) */
  costRange: {
    min: number;
    max: number;
  };
}

/**
 * Translation Provider Interface
 */
export interface TranslationProvider {
  /** Provider identifier */
  readonly type: ProviderType;
  
  /** Human-readable provider name */
  readonly displayName: string;
  
  /** Available models for this provider */
  readonly availableModels: ModelInfo[];
  
  /**
   * Validate credentials
   * Uses credentials provided during construction
   */
  validateCredentials(): Promise<ValidationResult>;
  
  /**
   * Translate a batch of subtitle cues
   */
  translate(request: TranslationRequest): Promise<TranslationResult>;
  
  /**
   * Translate with streaming response
   */
  translateStream(
    request: TranslationRequest,
    onProgress: (progress: StreamProgress) => void
  ): Promise<TranslationResult>;
  
  /**
   * Get rate limit status
   */
  getRateLimitStatus(): Promise<RateLimitStatus>;
  
  /**
   * Estimate cost for translation
   */
  estimateCost(cueCount: number, avgCharsPerCue: number): CostEstimate;
}

/**
 * Provider error codes
 */
export type ProviderErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'MODEL_NOT_FOUND'
  | 'CONTEXT_LENGTH_EXCEEDED'
  | 'INVALID_RESPONSE'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'SERVICE_UNAVAILABLE';

/**
 * Provider error class
 */
export class ProviderError extends Error {
  constructor(
    public code: ProviderErrorCode,
    message: string,
    public provider: ProviderType,
    public retryable: boolean = false,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

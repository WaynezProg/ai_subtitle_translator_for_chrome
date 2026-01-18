/**
 * Translation-related type definitions
 * 
 * @see specs/001-ai-subtitle-translator/data-model.md
 */

import type { Subtitle } from './subtitle';
import type { ProviderType } from './auth';

/**
 * Translation job status
 */
export type JobStatus = 
  | 'pending'      // Waiting to start
  | 'translating'  // In progress
  | 'paused'       // Paused (e.g., network interruption)
  | 'completed'    // Successfully completed
  | 'failed'       // Failed
  | 'cancelled';   // Cancelled by user

/**
 * Error codes for translation failures
 */
export type ErrorCode = 
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'AUTH_EXPIRED'
  | 'API_ERROR'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'
  | 'TIMEOUT'
  | 'UNSUPPORTED_FORMAT'
  | 'CACHE_ERROR'
  | 'CANCELLED';

/**
 * Translation job progress tracking
 */
export interface JobProgress {
  /** Number of translated cues */
  translatedCount: number;
  
  /** Total number of cues */
  totalCount: number;
  
  /** Current chunk index being processed */
  currentChunk: number;
  
  /** Total number of chunks */
  totalChunks: number;
  
  /** Estimated remaining time in seconds */
  estimatedTimeRemaining?: number;
}

/**
 * Translation job error information
 */
export interface JobError {
  /** Error code */
  code: ErrorCode;
  
  /** Error message */
  message: string;
  
  /** Whether the error is retryable */
  retryable: boolean;
  
  /** Suggested retry delay in seconds */
  retryAfter?: number;
}

/**
 * Translation job state
 */
export interface TranslationJob {
  /** Job ID (UUID v4) */
  id: string;
  
  /** Associated subtitle ID */
  subtitleId: string;
  
  /** Job status */
  status: JobStatus;
  
  /** Progress tracking */
  progress: JobProgress;
  
  /** Provider used for translation */
  provider: ProviderType;
  
  /** Error information (if failed) */
  error?: JobError;
  
  /** Creation time */
  createdAt: string;
  
  /** Start time */
  startedAt?: string;
  
  /** Completion time */
  completedAt?: string;
}

/**
 * Cache key components per Constitution VII
 * Format: ${videoId}:${sourceLanguage}:${targetLanguage}:${providerModel}
 */
export interface CacheKey {
  /** Video identifier */
  videoId: string;
  
  /** Source language */
  sourceLanguage: string;
  
  /** Target language */
  targetLanguage: string;
  
  /** Provider + Model (e.g., "claude:haiku-4.5") */
  providerModel: string;
}

/**
 * Serialized cache key format
 */
export type SerializedCacheKey = `${string}:${string}:${string}:${string}`;

/**
 * Translation cache entry
 */
export interface TranslationCache {
  /** Cache key (compound key) */
  key: CacheKey;
  
  /** Translated subtitle */
  subtitle: Subtitle;
  
  /** Creation time (ISO 8601) */
  createdAt: string;
  
  /** Last access time (ISO 8601) */
  lastAccessedAt: string;
  
  /** Access count (for LRU) */
  accessCount: number;
  
  /** Cache size in bytes */
  size: number;
}

/**
 * Serialize cache key to string
 */
export function serializeCacheKey(key: CacheKey): SerializedCacheKey {
  return `${key.videoId}:${key.sourceLanguage}:${key.targetLanguage}:${key.providerModel}` as SerializedCacheKey;
}

/**
 * Parse serialized cache key
 */
export function parseCacheKey(serialized: string): CacheKey | null {
  const parts = serialized.split(':');
  if (parts.length < 4) return null;
  
  // Handle case where providerModel contains colons (e.g., "claude:haiku-4.5")
  const [videoId, sourceLanguage, targetLanguage, ...providerParts] = parts;
  const providerModel = providerParts.join(':');
  
  if (!videoId || !sourceLanguage || !targetLanguage || !providerModel) {
    return null;
  }
  
  return { videoId, sourceLanguage, targetLanguage, providerModel };
}

/**
 * Helper to create initial job progress
 */
export function createInitialProgress(totalCount: number, chunkSize: number): JobProgress {
  return {
    translatedCount: 0,
    totalCount,
    currentChunk: 0,
    totalChunks: Math.ceil(totalCount / chunkSize)
  };
}

/**
 * Helper to check if job is active
 */
export function isJobActive(job: TranslationJob): boolean {
  return job.status === 'pending' || job.status === 'translating';
}

/**
 * Helper to check if job is terminal (completed, failed, cancelled)
 */
export function isJobTerminal(job: TranslationJob): boolean {
  return job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled';
}

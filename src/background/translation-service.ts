/**
 * Translation Service
 * 
 * Orchestrates the translation workflow including:
 * - Chunking subtitles for batch translation
 * - Progress tracking and updates
 * - Context passing between chunks for consistency
 * - Error handling and retry logic
 * - Cache integration (L1 memory + L2 IndexedDB)
 * 
 * @see specs/001-ai-subtitle-translator/contracts/message-passing.md
 * @see FR-012, FR-013: Translation Service Requirements
 * @see FR-014, FR-015: Cache Architecture
 */

import type { Cue, Subtitle, SubtitleFormat, Platform } from '../shared/types/subtitle';
import type { TranslationJob, JobStatus, JobProgress, ErrorCode } from '../shared/types/translation';
import type { ProviderType, AuthProvider } from '../shared/types/auth';
import type {
  TranslationProvider,
  TranslationRequest,
  TranslationResult,
  TranslationContext,
  CueInput,
} from '../shared/providers/types';
import { ProviderFactory } from '../shared/providers/factory';
import { TRANSLATION_CONFIG } from '../shared/utils/constants';
import { generateId, retry } from '../shared/utils/helpers';
import { sendToTab } from './message-handler';
import { cacheManager, createCacheKey, type CacheResult, type CacheManagerStats } from '../shared/cache';
import type { TranslationCache } from '../shared/types/translation';
import { createLogger } from '../shared/utils/logger';

const log = createLogger('TranslationService');

// Helper to normalize unknown errors for logging
function normalizeError(error: unknown): Error | Record<string, unknown> {
  if (error instanceof Error) return error;
  return { error: String(error) };
}

// ============================================================================
// Types
// ============================================================================

export interface TranslationJobRequest {
  /** Unique subtitle ID */
  subtitleId: string;
  
  /** Video ID */
  videoId: string;
  
  /** Platform */
  platform: Platform;
  
  /** Parsed cues to translate */
  cues: Cue[];
  
  /** Source language */
  sourceLanguage: string;
  
  /** Target language */
  targetLanguage: string;
  
  /** Provider configuration */
  provider: AuthProvider;
  
  /** Tab ID to send progress updates */
  tabId: number;
  
  /** Optional: Resume from index (for partial cache) */
  startFromIndex?: number;
  
  /** Optional: Character glossary */
  characterGlossary?: Record<string, string>;
  
  /** Optional: Custom instructions */
  customInstructions?: string;
}

export interface TranslationJobState {
  /** Job ID */
  id: string;
  
  /** Subtitle ID */
  subtitleId: string;
  
  /** Job status */
  status: JobStatus;
  
  /** Progress */
  progress: JobProgress;
  
  /** Provider type */
  provider: ProviderType;
  
  /** Error info */
  error?: {
    code: ErrorCode;
    message: string;
    retryable?: boolean;
  };
  
  /** Creation time */
  createdAt: string;
  
  /** Updated time */
  updatedAt: string;
  
  /** Current chunk being processed */
  currentChunk: number;
  
  /** Total chunks */
  totalChunks: number;
  
  /** Translation context for consistency */
  context: TranslationContext;
  
  /** Translated cues so far */
  translatedCues: Cue[];
  
  /** Tab ID for progress updates */
  tabId: number;
  
  /** Abort controller */
  abortController: AbortController;
}

// ============================================================================
// Translation Service
// ============================================================================

export class TranslationService {
  private activeJobs: Map<string, TranslationJobState> = new Map();
  // Track pending requests by video+language key to prevent duplicate requests
  private pendingRequests: Map<string, Promise<string>> = new Map();
  
  /**
   * Check cache for existing translation
   */
  async checkCache(
    platform: string,
    videoId: string,
    sourceLanguage: string,
    targetLanguage: string,
    provider: ProviderType,
    model?: string
  ): Promise<CacheResult> {
    const key = createCacheKey(platform, videoId, sourceLanguage, targetLanguage, provider, model);
    return cacheManager.get(key);
  }

  /**
   * Get cached translation if available
   */
  async getCachedTranslation(
    platform: string,
    videoId: string,
    sourceLanguage: string,
    targetLanguage: string,
    provider: ProviderType,
    model?: string
  ): Promise<Subtitle | null> {
    const result = await this.checkCache(platform, videoId, sourceLanguage, targetLanguage, provider, model);
    return result.subtitle;
  }
  
  /**
   * Generate a deduplication key for a translation request
   * Includes platform to prevent conflicts between same video IDs on different platforms
   */
  private getDeduplicationKey(platform: string, videoId: string, sourceLanguage: string, targetLanguage: string): string {
    return `${platform}:${videoId}:${sourceLanguage}:${targetLanguage}`;
  }

  /**
   * Start a new translation job
   */
  async startTranslation(request: TranslationJobRequest): Promise<string> {
    // Check for existing job by subtitle ID
    const existingJob = this.findExistingJob(request.subtitleId);
    if (existingJob) {
      log.debug('Job already exists for subtitle', { subtitleId: request.subtitleId });
      return existingJob.id;
    }

    // Check for pending request with same platform+video+language combination (race condition prevention)
    const dedupeKey = this.getDeduplicationKey(request.platform, request.videoId, request.sourceLanguage, request.targetLanguage);
    const pendingRequest = this.pendingRequests.get(dedupeKey);
    if (pendingRequest) {
      log.debug('Returning pending request for same video+language', { dedupeKey });
      return pendingRequest;
    }

    // Create the job promise and store it for deduplication
    const jobPromise = this.doStartTranslation(request);
    this.pendingRequests.set(dedupeKey, jobPromise);

    try {
      const jobId = await jobPromise;
      return jobId;
    } finally {
      // Clean up pending request after a short delay to handle rapid duplicate calls
      setTimeout(() => {
        this.pendingRequests.delete(dedupeKey);
      }, 1000);
    }
  }

  /**
   * Internal method to actually start the translation job
   */
  private async doStartTranslation(request: TranslationJobRequest): Promise<string> {
    
    // Check cache first
    const model = this.getModelForProvider(request.provider.type);
    const cacheResult = await this.checkCache(
      request.platform,
      request.videoId,
      request.sourceLanguage,
      request.targetLanguage,
      request.provider.type,
      model
    );
    
    if (cacheResult.hit && cacheResult.subtitle) {
      log.debug(`[TranslationService] Cache hit (${cacheResult.source}) for ${request.videoId}`);
      
      // Send cached result immediately
      const jobId = generateId();
      await sendToTab(request.tabId, {
        type: 'TRANSLATION_COMPLETE',
        payload: {
          jobId,
          subtitle: cacheResult.subtitle,
          cached: true,
        },
      });
      
      return jobId;
    }
    
    // Create provider
    const provider = ProviderFactory.tryCreate(request.provider);
    if (!provider) {
      throw new Error(`Provider ${request.provider.type} not available`);
    }
    
    // Calculate chunks
    const chunks = this.createChunks(request.cues, request.startFromIndex);
    const totalChunks = chunks.length;
    
    // Create job state
    const jobId = generateId();
    const now = new Date().toISOString();
    
    const jobState: TranslationJobState = {
      id: jobId,
      subtitleId: request.subtitleId,
      status: 'pending',
      progress: {
        translatedCount: request.startFromIndex || 0,
        totalCount: request.cues.length,
        currentChunk: 0,
        totalChunks,
      },
      provider: request.provider.type,
      createdAt: now,
      updatedAt: now,
      currentChunk: 0,
      totalChunks,
      context: {
        previousCues: [],
        characters: request.characterGlossary || {},
      },
      translatedCues: request.cues.slice(0, request.startFromIndex || 0).map(c => ({ ...c })),
      tabId: request.tabId,
      abortController: new AbortController(),
    };
    
    this.activeJobs.set(jobId, jobState);
    
    // Start translation asynchronously
    this.executeTranslation(jobId, request, provider, chunks).catch((error) => {
      log.error(`Job ${jobId} failed`, normalizeError(error));
    });
    
    return jobId;
  }
  
  /**
   * Cancel a translation job
   */
  cancelTranslation(jobId: string): boolean {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      return false;
    }
    
    job.abortController.abort();
    job.status = 'cancelled';
    job.updatedAt = new Date().toISOString();
    
    // Keep job for a short time for status queries
    setTimeout(() => {
      this.activeJobs.delete(jobId);
    }, 5000);
    
    return true;
  }
  
  /**
   * Get job status
   */
  getJobStatus(jobId: string): TranslationJob | null {
    const job = this.activeJobs.get(jobId);
    if (!job) {
      return null;
    }
    
    return {
      id: job.id,
      subtitleId: job.subtitleId,
      status: job.status,
      progress: job.progress,
      provider: job.provider,
      createdAt: job.createdAt,
      error: job.error ? {
        code: job.error.code,
        message: job.error.message,
        retryable: job.error.retryable ?? false,
      } : undefined,
    };
  }
  
  /**
   * Get all active jobs
   */
  getActiveJobs(): TranslationJob[] {
    return Array.from(this.activeJobs.values()).map(job => ({
      id: job.id,
      subtitleId: job.subtitleId,
      status: job.status,
      progress: job.progress,
      provider: job.provider,
      createdAt: job.createdAt,
      error: job.error ? {
        code: job.error.code,
        message: job.error.message,
        retryable: job.error.retryable ?? false,
      } : undefined,
    }));
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  /**
   * Execute the translation job
   */
  private async executeTranslation(
    jobId: string,
    request: TranslationJobRequest,
    provider: TranslationProvider,
    chunks: CueInput[][]
  ): Promise<void> {
    const job = this.activeJobs.get(jobId);
    if (!job) return;
    
    job.status = 'translating';
    job.updatedAt = new Date().toISOString();
    
    try {
      for (let i = 0; i < chunks.length; i++) {
        // Check for cancellation
        if (job.abortController.signal.aborted) {
          log.debug(`[TranslationService] Job ${jobId} was cancelled`);
          return;
        }
        
        const chunk = chunks[i];
        job.currentChunk = i;
        job.progress.currentChunk = i;
        
        log.debug(`[TranslationService] Translating chunk ${i + 1}/${chunks.length} (${chunk.length} cues)`);
        
        // Translate chunk with retry
        const result = await this.translateChunkWithRetry(
          provider,
          {
            cues: chunk,
            sourceLanguage: request.sourceLanguage,
            targetLanguage: request.targetLanguage,
            model: this.getModelForProvider(request.provider.type),
            previousContext: job.context,
            characterGlossary: request.characterGlossary,
            customInstructions: request.customInstructions,
          },
          job.abortController.signal
        );
        
        // Update translated cues
        for (const translatedCue of result.cues) {
          const originalCue = request.cues.find(c => c.index === translatedCue.index);
          if (originalCue) {
            job.translatedCues.push({
              ...originalCue,
              translatedText: translatedCue.translatedText,
            });
          }
        }
        
        // Update context for next chunk
        job.context = result.context;
        
        // Update progress
        job.progress.translatedCount = job.translatedCues.length;
        job.updatedAt = new Date().toISOString();
        
        // Calculate estimated time remaining
        const avgTimePerCue = (Date.now() - new Date(job.createdAt).getTime()) / job.translatedCues.length;
        const remainingCues = request.cues.length - job.translatedCues.length;
        job.progress.estimatedTimeRemaining = Math.round(avgTimePerCue * remainingCues / 1000);
        
        // Send progress update to tab
        await this.sendProgressUpdate(job);
        
        // Send chunk complete message
        await this.sendChunkComplete(job, i, result.cues.map(c => {
          const orig = request.cues.find(o => o.index === c.index);
          return {
            index: c.index,
            startTime: orig?.startTime || 0,
            endTime: orig?.endTime || 0,
            text: orig?.text || '',
            translatedText: c.translatedText,
          };
        }));
      }
      
      // Job completed
      job.status = 'completed';
      job.updatedAt = new Date().toISOString();
      
      // Build final subtitle
      const subtitle: Subtitle = {
        id: request.subtitleId,
        videoId: request.videoId,
        platform: request.platform,
        sourceLanguage: request.sourceLanguage,
        targetLanguage: request.targetLanguage,
        format: 'webvtt' as SubtitleFormat,
        cues: job.translatedCues,
        metadata: {
          cueCount: job.translatedCues.length,
        },
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };
      
      // Store in cache for future use
      const model = this.getModelForProvider(request.provider.type);
      await this.saveToCache(
        request.platform,
        request.videoId,
        request.sourceLanguage,
        request.targetLanguage,
        request.provider.type,
        model,
        subtitle
      );
      
      // Send completion message
      await this.sendTranslationComplete(job, subtitle);
      
      log.debug(`[TranslationService] Job ${jobId} completed successfully`);
      
    } catch (error) {
      job.status = 'failed';
      job.error = {
        code: this.mapErrorCode(error),
        message: error instanceof Error ? error.message : 'Unknown error',
        retryable: this.isRetryable(error),
      };
      job.updatedAt = new Date().toISOString();
      
      await this.sendTranslationError(job);

      log.error(`Job ${jobId} failed`, normalizeError(error));
    } finally {
      // Clean up job after some time
      setTimeout(() => {
        this.activeJobs.delete(jobId);
      }, 60000);
    }
  }
  
  /**
   * Translate a chunk with retry logic
   */
  private async translateChunkWithRetry(
    provider: TranslationProvider,
    request: TranslationRequest,
    signal: AbortSignal
  ): Promise<TranslationResult> {
    return retry(
      async () => {
        if (signal.aborted) {
          throw new Error('Translation cancelled');
        }
        return provider.translate(request);
      },
      {
        maxAttempts: TRANSLATION_CONFIG.MAX_RETRIES,
        baseDelay: TRANSLATION_CONFIG.RETRY_DELAY_BASE_MS,
        maxDelay: 30000,
        shouldRetry: (error) => this.isRetryable(error) && !signal.aborted,
      }
    );
  }
  
  /**
   * Create chunks from cues
   */
  private createChunks(cues: Cue[], startFromIndex = 0): CueInput[][] {
    const chunks: CueInput[][] = [];
    const cuesToProcess = cues.slice(startFromIndex);
    
    for (let i = 0; i < cuesToProcess.length; i += TRANSLATION_CONFIG.CHUNK_SIZE) {
      const chunk = cuesToProcess.slice(i, i + TRANSLATION_CONFIG.CHUNK_SIZE);
      chunks.push(chunk.map(c => ({
        index: c.index,
        text: c.text,
        speaker: c.speaker,
      })));
    }
    
    return chunks;
  }
  
  /**
   * Find existing job for a subtitle
   */
  private findExistingJob(subtitleId: string): TranslationJobState | null {
    for (const job of this.activeJobs.values()) {
      if (job.subtitleId === subtitleId && job.status === 'translating') {
        return job;
      }
    }
    return null;
  }
  
  /**
   * Get default model for provider
   */
  private getModelForProvider(providerType: ProviderType): string {
    switch (providerType) {
      case 'claude-subscription':
        return 'claude-3-sonnet-20240229';
      case 'chatgpt-subscription':
        return 'gpt-4';
      case 'claude-api':
        return 'claude-3-haiku-20240307';
      case 'openai-api':
        return 'gpt-4o-mini';
      case 'ollama':
        return 'llama3';
      case 'google-translate':
        return 'nmt';
      default:
        return 'gpt-4';
    }
  }
  
  /**
   * Map error to error code
   */
  private mapErrorCode(error: unknown): ErrorCode {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('rate limit')) return 'RATE_LIMITED';
      if (message.includes('auth') || message.includes('token')) return 'AUTH_FAILED';
      if (message.includes('network') || message.includes('fetch')) return 'NETWORK_ERROR';
      if (message.includes('timeout')) return 'TIMEOUT';
      if (message.includes('parse')) return 'PARSE_ERROR';
      if (message.includes('cancel')) return 'CANCELLED';
    }
    return 'API_ERROR';
  }
  
  /**
   * Check if error is retryable
   */
  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('rate limit') ||
             message.includes('network') ||
             message.includes('timeout') ||
             message.includes('503') ||
             message.includes('502');
    }
    return false;
  }
  
  // ============================================================================
  // Cache Operations
  // ============================================================================
  
  /**
   * Save translation to cache
   */
  async saveToCache(
    platform: string,
    videoId: string,
    sourceLanguage: string,
    targetLanguage: string,
    provider: ProviderType,
    model: string,
    subtitle: Subtitle
  ): Promise<void> {
    try {
      const key = createCacheKey(platform, videoId, sourceLanguage, targetLanguage, provider, model);
      await cacheManager.set(key, subtitle);
      log.debug(`Saved to cache: ${platform}:${videoId}`);
    } catch (error) {
      // Cache errors should not fail the translation
      log.error('Failed to save to cache', normalizeError(error));
    }
  }
  
  /**
   * Delete cached translation for a video
   */
  async deleteCachedTranslation(videoId: string): Promise<number> {
    return cacheManager.deleteByVideoId(videoId);
  }
  
  /**
   * Clear all cached translations
   */
  async clearCache(): Promise<void> {
    return cacheManager.clear();
  }
  
  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<CacheManagerStats> {
    return cacheManager.getStats();
  }

  /**
   * Get all cached entries
   */
  async getCachedEntries(): Promise<TranslationCache[]> {
    return cacheManager.getAll();
  }
  
  // ============================================================================
  // Message Sending
  // ============================================================================
  
  private async sendProgressUpdate(job: TranslationJobState): Promise<void> {
    await sendToTab(job.tabId, {
      type: 'TRANSLATION_PROGRESS',
      payload: {
        jobId: job.id,
        progress: job.progress,
      },
    });
  }
  
  private async sendChunkComplete(job: TranslationJobState, chunkIndex: number, cues: Cue[]): Promise<void> {
    await sendToTab(job.tabId, {
      type: 'TRANSLATION_CHUNK_COMPLETE',
      payload: {
        jobId: job.id,
        chunkIndex,
        cues,
      },
    });
  }
  
  private async sendTranslationComplete(job: TranslationJobState, subtitle: Subtitle): Promise<void> {
    await sendToTab(job.tabId, {
      type: 'TRANSLATION_COMPLETE',
      payload: {
        jobId: job.id,
        subtitle,
        cached: false,
      },
    });
  }
  
  private async sendTranslationError(job: TranslationJobState): Promise<void> {
    if (!job.error) return;
    
    await sendToTab(job.tabId, {
      type: 'TRANSLATION_ERROR',
      payload: {
        jobId: job.id,
        error: {
          code: job.error.code,
          message: job.error.message,
          retryable: job.error.retryable ?? false,
        },
      },
    });
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const translationService = new TranslationService();

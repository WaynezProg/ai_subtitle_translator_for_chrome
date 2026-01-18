/**
 * Cache Utilities
 * 
 * Helper functions for cache key generation and validation.
 * 
 * @see specs/001-ai-subtitle-translator/data-model.md - Cache Key Format
 * @see Constitution VII: Cache key format ${videoId}:${sourceLanguage}:${targetLanguage}:${providerModel}
 */

import type { CacheKey, SerializedCacheKey } from '../types/translation';
import type { ProviderType } from '../types/auth';
import { serializeCacheKey, parseCacheKey } from '../types/translation';

// ============================================================================
// Cache Key Generation
// ============================================================================

/**
 * Create a cache key from components
 */
export function createCacheKey(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  provider: ProviderType,
  model?: string
): CacheKey {
  // Normalize languages to lowercase
  const normalizedSource = sourceLanguage.toLowerCase();
  const normalizedTarget = targetLanguage.toLowerCase();
  
  // Combine provider and model
  const providerModel = model ? `${provider}:${model}` : provider;
  
  return {
    videoId,
    sourceLanguage: normalizedSource,
    targetLanguage: normalizedTarget,
    providerModel,
  };
}

/**
 * Serialize cache key to string format
 * Re-export for convenience
 */
export { serializeCacheKey, parseCacheKey };

/**
 * Create a serialized cache key directly from components
 */
export function createSerializedCacheKey(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  provider: ProviderType,
  model?: string
): SerializedCacheKey {
  const key = createCacheKey(videoId, sourceLanguage, targetLanguage, provider, model);
  return serializeCacheKey(key);
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a cache key has all required fields
 */
export function isValidCacheKey(key: unknown): key is CacheKey {
  if (!key || typeof key !== 'object') {
    return false;
  }
  
  const k = key as Record<string, unknown>;
  
  return (
    typeof k.videoId === 'string' &&
    k.videoId.length > 0 &&
    typeof k.sourceLanguage === 'string' &&
    k.sourceLanguage.length > 0 &&
    typeof k.targetLanguage === 'string' &&
    k.targetLanguage.length > 0 &&
    typeof k.providerModel === 'string' &&
    k.providerModel.length > 0
  );
}

/**
 * Validate a serialized cache key format
 */
export function isValidSerializedKey(serialized: string): boolean {
  const parsed = parseCacheKey(serialized);
  return parsed !== null && isValidCacheKey(parsed);
}

// ============================================================================
// Key Matching
// ============================================================================

/**
 * Check if two cache keys match
 */
export function cacheKeysMatch(a: CacheKey, b: CacheKey): boolean {
  return (
    a.videoId === b.videoId &&
    a.sourceLanguage.toLowerCase() === b.sourceLanguage.toLowerCase() &&
    a.targetLanguage.toLowerCase() === b.targetLanguage.toLowerCase() &&
    a.providerModel === b.providerModel
  );
}

/**
 * Check if a cache key matches a partial key (for filtering)
 */
export function cacheKeyMatchesPartial(
  key: CacheKey,
  partial: Partial<CacheKey>
): boolean {
  if (partial.videoId && key.videoId !== partial.videoId) {
    return false;
  }
  if (partial.sourceLanguage && key.sourceLanguage.toLowerCase() !== partial.sourceLanguage.toLowerCase()) {
    return false;
  }
  if (partial.targetLanguage && key.targetLanguage.toLowerCase() !== partial.targetLanguage.toLowerCase()) {
    return false;
  }
  if (partial.providerModel && key.providerModel !== partial.providerModel) {
    return false;
  }
  return true;
}

// ============================================================================
// Size Estimation
// ============================================================================

/**
 * Estimate size of data in bytes
 */
export function estimateByteSize(data: unknown): number {
  try {
    const json = JSON.stringify(data);
    // UTF-16 encoding: each char is 2 bytes
    return json.length * 2;
  } catch {
    return 0;
  }
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const units = ['B', 'KB', 'MB', 'GB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);
  
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

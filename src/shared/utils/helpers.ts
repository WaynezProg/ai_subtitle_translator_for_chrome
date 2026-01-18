/**
 * Helper Utilities
 * 
 * Common utility functions used across the extension.
 */

// ============================================================================
// Time Formatting
// ============================================================================

/**
 * Format seconds to HH:MM:SS or MM:SS format
 */
export function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format milliseconds to a human-readable duration
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 
      ? `${minutes}m ${remainingSeconds}s` 
      : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 
    ? `${hours}h ${remainingMinutes}m` 
    : `${hours}h`;
}

/**
 * Parse timestamp string to seconds
 * Supports formats: HH:MM:SS.mmm, MM:SS.mmm, SS.mmm
 */
export function parseTimestamp(timestamp: string): number {
  const parts = timestamp.split(':').map(p => parseFloat(p));
  
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  
  return 0;
}

// ============================================================================
// String Utilities
// ============================================================================

/**
 * Truncate string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, char => htmlEntities[char]);
}

/**
 * Strip HTML tags from string
 */
export function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
}

/**
 * Normalize whitespace in string
 */
export function normalizeWhitespace(str: string): string {
  return str.replace(/\s+/g, ' ').trim();
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// ============================================================================
// Language Utilities
// ============================================================================

/**
 * Get display name for language code
 */
export function getLanguageDisplayName(code: string): string {
  try {
    const displayName = new Intl.DisplayNames(['en'], { type: 'language' });
    return displayName.of(code) || code;
  } catch {
    return code;
  }
}

/**
 * Normalize language code to BCP 47 format
 */
export function normalizeLanguageCode(code: string): string {
  // Handle common variations
  const mappings: Record<string, string> = {
    'zh': 'zh-CN',
    'zh-hans': 'zh-CN',
    'zh-hant': 'zh-TW',
    'zh-tw': 'zh-TW',
    'zh-cn': 'zh-CN',
    'en-us': 'en',
    'en-gb': 'en-GB',
    'pt-br': 'pt-BR',
  };
  
  const normalized = code.toLowerCase().replace('_', '-');
  return mappings[normalized] || code;
}

// ============================================================================
// Async Utilities
// ============================================================================

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    baseDelay?: number;
    maxDelay?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    shouldRetry = () => true,
  } = options;
  
  let lastError: unknown;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error;
      }
      
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Create a debounced function
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Create a throttled function
 */
export function throttle<T extends (...args: Parameters<T>) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => { inThrottle = false; }, limit);
    }
  };
}

// ============================================================================
// URL Utilities
// ============================================================================

/**
 * Extract video ID from URL
 */
export function extractVideoId(url: string): { platform: string; videoId: string } | null {
  const urlObj = new URL(url);
  
  // YouTube
  if (urlObj.hostname.includes('youtube.com')) {
    const videoId = urlObj.searchParams.get('v');
    if (videoId) {
      return { platform: 'youtube', videoId };
    }
    // Embed URL
    const embedMatch = urlObj.pathname.match(/\/embed\/([^/?]+)/);
    if (embedMatch) {
      return { platform: 'youtube', videoId: embedMatch[1] };
    }
  }
  
  // youtu.be short URL
  if (urlObj.hostname === 'youtu.be') {
    const videoId = urlObj.pathname.slice(1);
    if (videoId) {
      return { platform: 'youtube', videoId };
    }
  }
  
  // Netflix
  if (urlObj.hostname.includes('netflix.com')) {
    const match = urlObj.pathname.match(/\/watch\/(\d+)/);
    if (match) {
      return { platform: 'netflix', videoId: match[1] };
    }
  }
  
  // Disney+
  if (urlObj.hostname.includes('disneyplus.com')) {
    const match = urlObj.pathname.match(/\/video\/([^/?]+)/);
    if (match) {
      return { platform: 'disney', videoId: match[1] };
    }
  }
  
  // Prime Video
  if (urlObj.hostname.includes('primevideo.com') || urlObj.hostname.includes('amazon.com')) {
    const match = urlObj.pathname.match(/\/detail\/([^/?]+)/);
    if (match) {
      return { platform: 'prime', videoId: match[1] };
    }
  }
  
  return null;
}

// ============================================================================
// Cache Key Utilities
// ============================================================================

/**
 * Generate cache key for translation
 */
export function generateCacheKey(
  videoId: string,
  sourceLanguage: string,
  targetLanguage: string,
  providerModel?: string
): string {
  const base = `${videoId}:${sourceLanguage}:${targetLanguage}`;
  return providerModel ? `${base}:${providerModel}` : base;
}

/**
 * Parse cache key
 */
export function parseCacheKey(key: string): {
  videoId: string;
  sourceLanguage: string;
  targetLanguage: string;
  providerModel?: string;
} | null {
  const parts = key.split(':');
  if (parts.length < 3) {
    return null;
  }
  
  return {
    videoId: parts[0],
    sourceLanguage: parts[1],
    targetLanguage: parts[2],
    providerModel: parts[3],
  };
}

// ============================================================================
// Validation Utilities
// ============================================================================

/**
 * Check if a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check if a value is a valid URL
 */
export function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a value is a valid BCP 47 language code
 */
export function isValidLanguageCode(code: string): boolean {
  // Simple validation for common patterns
  return /^[a-z]{2,3}(-[A-Z]{2,4})?(-[a-z]{4,})?$/i.test(code);
}

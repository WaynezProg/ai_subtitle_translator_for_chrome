# Extension Improvements Changelog

This document records all improvements made since commit `86f316f` (feat: Introduce encryption for sensitive data storage and enhance OAuth token management).

## Summary

This update focuses on **memory leak fixes**, **error handling improvements**, **race condition prevention**, and **cache system enhancements**.

---

## 1. MutationObserver Memory Leak Fixes

### Problem
MutationObservers created in `waitForVideoElement()` methods were stored in local variables and not properly cleaned up when the adapter was destroyed. This caused memory leaks when navigating between videos or pages.

### Files Changed

#### `src/content/adapters/netflix-adapter.ts`
- Added `private videoObserver: MutationObserver | null = null;` property
- Updated `waitForVideoElement()` to store observer in class property
- Added cleanup in `destroy()` method:
  ```typescript
  if (this.videoObserver) {
    this.videoObserver.disconnect();
    this.videoObserver = null;
  }
  ```

#### `src/content/adapters/disney-adapter.ts`
- Added `private videoObserver: MutationObserver | null = null;` property
- Updated `waitForVideoElement()` to use `this.videoObserver`
- Added cleanup in `destroy()` method

#### `src/content/adapters/prime-adapter.ts`
- Added `private videoObserver: MutationObserver | null = null;` property
- Updated `waitForVideoElement()` to use `this.videoObserver`
- Added cleanup in `destroy()` method

#### `src/content/adapters/youtube-adapter.ts`
- Already had proper MutationObserver cleanup (no changes needed)

---

## 2. Error Handling for XHR/Fetch Hooks

### Problem
XHR and fetch hooks in platform adapters could break the page if errors occurred during URL extraction, header capture, or subtitle interception.

### Files Changed

#### `src/content/adapters/prime-adapter.ts`

**Fetch Hook Improvements:**
```typescript
window.fetch = async function(input, init) {
  // Safety check: if originalFetch is gone, try to use the current window.fetch
  const fetchFn = self.originalFetch || window.fetch;

  let url: string;
  try {
    // URL extraction with error handling
  } catch {
    return fetchFn.call(window, input, init);
  }

  // Wrap header capture in try-catch
  try {
    if (self.isApiRequest(url) && init?.headers) {
      self.captureHeaders(init.headers);
    }
  } catch (error) {
    log.warn('Failed to capture headers', { error: String(error) });
  }
  // ... rest of the function
};
```

**XHR Hook Improvements:**
```typescript
XMLHttpRequest.prototype.open = function(...) {
  const xhrOpen = self.originalXHROpen;
  if (!xhrOpen) {
    log.warn('XHR hook: originalXHROpen is null');
    return;
  }

  let urlString: string;
  try {
    urlString = url.toString();
  } catch {
    return xhrOpen.call(this, method, url, ...);
  }

  try {
    if (self.isSubtitleUrl(urlString)) {
      self.captureSubtitleUrl(urlString);
    }
  } catch (error) {
    log.warn('Failed to capture XHR subtitle URL', { error: String(error) });
  }
  // ...
};
```

#### `src/content/adapters/youtube-adapter.ts`
- Same error handling pattern for XHR and fetch hooks
- Added safety checks for null `originalXHROpen` and `originalFetch`
- Wrapped all capture operations in try-catch blocks

#### `src/content/adapters/disney-adapter.ts`
- Added error handling to fetch hook
- Wrapped subtitle URL capture in try-catch

#### `src/content/adapters/netflix-adapter.ts`
- Added error handling to JSON.parse hook:
  ```typescript
  JSON.parse = function(text, reviver) {
    const jsonParse = self.originalJsonParse || JSON.parse;

    let result: unknown;
    try {
      result = jsonParse.call(this, text, reviver);
    } catch (error) {
      throw error; // Re-throw parsing errors
    }

    try {
      if (self.isNetflixManifest(result)) {
        self.extractSubtitleTracks(result);
      }
    } catch (error) {
      log.warn('Failed to extract from Netflix manifest', { error });
    }

    return result;
  };
  ```

---

## 3. Race Condition Prevention

### Problem
1. Rapid button clicks could start multiple translation jobs simultaneously
2. Same video ID on different platforms could cause cache key conflicts

### Files Changed

#### `src/content/index.ts`

**Added translation start lock:**
```typescript
// Lock to prevent race conditions when starting translation
let translationStartLock = false;

async function handleTranslateClick(): Promise<void> {
  if (translationStartLock) {
    log.debug('[Content] Translation start already in progress, ignoring click');
    return;
  }
  // ...
}

async function startRealtimeTranslation(targetLanguage: string): Promise<void> {
  // If already translating, stop it (toggle behavior)
  if (realtimeTranslator?.getState() === 'active') {
    // ... stop translation
    return;
  }

  // Acquire lock
  if (translationStartLock) {
    log.debug('[Content] Translation start already in progress');
    return;
  }
  translationStartLock = true;

  try {
    // ... translation logic
  } catch (error) {
    // ...
  } finally {
    translationStartLock = false; // Always release lock
  }
}
```

#### `src/background/translation-service.ts`

**Added platform to deduplication key:**
```typescript
// Before:
private getDeduplicationKey(videoId, sourceLanguage, targetLanguage) {
  return `${videoId}:${sourceLanguage}:${targetLanguage}`;
}

// After:
private getDeduplicationKey(platform, videoId, sourceLanguage, targetLanguage) {
  return `${platform}:${videoId}:${sourceLanguage}:${targetLanguage}`;
}
```

---

## 4. Cache System Enhancements

### Problem
Cache keys didn't include platform, causing potential conflicts when the same video ID exists on different streaming platforms.

### Files Changed

#### `src/shared/types/translation.ts`

**Added platform to CacheKey interface:**
```typescript
export interface CacheKey {
  platform: string;      // NEW: 'youtube' | 'netflix' | 'disney' | 'prime'
  videoId: string;
  sourceLanguage: string;
  targetLanguage: string;
  providerModel: string;
}
```

**Updated serialization functions:**
```typescript
export function serializeCacheKey(key: CacheKey): SerializedCacheKey {
  return `${key.platform}:${key.videoId}:${key.sourceLanguage}:${key.targetLanguage}:${key.providerModel}`;
}

export function parseCacheKey(serialized: string): CacheKey | null {
  const parts = serialized.split(':');
  if (parts.length < 5) return null;
  const [platform, videoId, sourceLanguage, targetLanguage, ...providerParts] = parts;
  return { platform, videoId, sourceLanguage, targetLanguage, providerModel: providerParts.join(':') };
}
```

#### `src/shared/cache/cache-utils.ts`
- Updated `createCacheKey()` to include platform parameter
- Updated `cacheKeysMatch()` to compare platform
- Updated `cacheKeyMatchesPartial()` to handle platform
- Updated `isValidCacheKey()` to validate platform field

#### `src/shared/cache/cache-manager.ts`
- Updated all methods to use new cache key format with platform

---

## 5. Network Retry with Exponential Backoff

### Files Changed

#### `src/shared/utils/error-handler.ts` (NEW FILE)

**Added `fetchWithRetry` utility:**
```typescript
export async function fetchWithRetry(
  url: string,
  options: RequestInit & { timeout?: number } = {},
  retryOptions?: {
    strategy?: RetryStrategy;
    onRetry?: (attempt: number, error: Error, delay: number) => void;
  }
): Promise<Response> {
  const strategy = retryOptions?.strategy ?? RetryStrategies.network;
  // ... implementation with AbortController and exponential backoff
}

export const RetryStrategies = {
  network: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    retryableStatuses: [408, 429, 500, 502, 503, 504],
  },
  // ... other strategies
};
```

#### `src/shared/providers/google-translate-provider.ts`
- Updated to use `fetchWithRetry` for automatic retry on network failures
- Custom retry strategy with shorter delays for rate limiting

#### `src/shared/providers/ollama-provider.ts`
- Updated to use `fetchWithRetry` for connection retry

---

## 6. Additional Improvements

### `src/shared/utils/logger.ts` (NEW FILE)
- Added structured logging utility with log levels
- Consistent log format across the codebase

### `src/shared/types/messages.ts`
- Added `platform` field to `GetCachedTranslationMessage`

### `src/content/message-sender.ts`
- Updated `getCachedTranslation` to include platform parameter

---

## Test Results

All 334 unit tests pass:
```
 Test Files  14 passed (14)
      Tests  334 passed (334)
```

Build successful:
```
webpack 5.104.1 compiled successfully
```

---

## Files Changed Summary

| File | Changes |
|------|---------|
| `src/content/adapters/netflix-adapter.ts` | MutationObserver leak fix, JSON.parse hook error handling |
| `src/content/adapters/disney-adapter.ts` | MutationObserver leak fix, fetch hook error handling |
| `src/content/adapters/prime-adapter.ts` | MutationObserver leak fix, XHR/fetch hook error handling |
| `src/content/adapters/youtube-adapter.ts` | XHR/fetch hook error handling |
| `src/content/index.ts` | Translation start lock for race condition prevention |
| `src/background/translation-service.ts` | Platform in deduplication key |
| `src/shared/types/translation.ts` | Platform in CacheKey |
| `src/shared/cache/cache-utils.ts` | Platform in cache key functions |
| `src/shared/cache/cache-manager.ts` | Updated for new cache key format |
| `src/shared/utils/error-handler.ts` | NEW: fetchWithRetry utility |
| `src/shared/utils/logger.ts` | NEW: Structured logging utility |
| `src/shared/providers/google-translate-provider.ts` | fetchWithRetry integration |
| `src/shared/providers/ollama-provider.ts` | fetchWithRetry integration |

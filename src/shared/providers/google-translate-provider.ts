/**
 * Google Translate Provider
 * 
 * Implements translation using Google Translate (free tier).
 * Uses the unofficial Google Translate API endpoint.
 * 
 * Note: This uses an unofficial API and may be rate limited or blocked.
 * For production use, consider using the official Google Cloud Translation API.
 */

import type { ProviderType, AuthProvider } from '../types/auth';
import type {
  TranslationProvider,
  TranslationRequest,
  TranslationResult,
  TranslatedCue,
  StreamProgress,
  ValidationResult,
  RateLimitStatus,
  CostEstimate,
  ModelInfo,
  TranslationContext,
} from './types';
import { ProviderError } from './types';
import { TRANSLATION_CONFIG } from '../utils/constants';
import { fetchWithRetry, RetryStrategies, type RetryStrategy } from '../utils/error-handler';

// ============================================================================
// Constants
// ============================================================================

// Google Translate unofficial API endpoint
const GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';

// Language code mapping (BCP 47 to Google Translate codes)
const LANGUAGE_MAP: Record<string, string> = {
  'zh-TW': 'zh-TW',
  'zh-CN': 'zh-CN',
  'zh': 'zh-CN',
  'en': 'en',
  'en-US': 'en',
  'en-GB': 'en',
  'ja': 'ja',
  'ko': 'ko',
  'es': 'es',
  'fr': 'fr',
  'de': 'de',
  'it': 'it',
  'pt': 'pt',
  'ru': 'ru',
  'ar': 'ar',
  'hi': 'hi',
  'th': 'th',
  'vi': 'vi',
  'id': 'id',
  'ms': 'ms',
  'nl': 'nl',
  'pl': 'pl',
  'tr': 'tr',
  'uk': 'uk',
  'cs': 'cs',
  'sv': 'sv',
  'da': 'da',
  'fi': 'fi',
  'no': 'no',
  'hu': 'hu',
  'el': 'el',
  'he': 'he',
  'ro': 'ro',
  'bg': 'bg',
  'hr': 'hr',
  'sk': 'sk',
  'sl': 'sl',
  'et': 'et',
  'lv': 'lv',
  'lt': 'lt',
};

// ============================================================================
// Google Translate Provider
// ============================================================================

export class GoogleTranslateProvider implements TranslationProvider {
  readonly type: ProviderType = 'google-translate';
  readonly displayName = 'Google 翻譯 (免費)';
  
  readonly availableModels: ModelInfo[] = [
    {
      id: 'nmt',
      name: 'Google Neural Machine Translation',
      contextWindow: 5000, // Characters, not tokens
      maxOutputTokens: 5000,
      inputCostPer1M: 0, // Free
      outputCostPer1M: 0,
      recommended: true,
    },
  ];
  
  private requestCount = 0;
  private lastRequestTime = 0;
  private readonly minRequestInterval = 100; // ms between requests
  
  constructor(_config?: AuthProvider) {
    // No configuration needed for free Google Translate
  }
  
  /**
   * Validate credentials (always valid for free tier)
   */
  async validateCredentials(): Promise<ValidationResult> {
    try {
      // Test with a simple translation
      const testResult = await this.translateText('hello', 'en', 'zh-TW');
      
      if (testResult) {
        return {
          valid: true,
          accountInfo: {
            tier: 'Free',
          },
        };
      }
      
      return {
        valid: false,
        error: {
          code: 'NETWORK_ERROR',
          message: 'Google 翻譯服務無回應',
        },
      };
    } catch (error) {
      return {
        valid: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : '驗證失敗',
        },
      };
    }
  }
  
  /**
   * Translate subtitle cues
   */
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const sourceLang = this.mapLanguageCode(request.sourceLanguage);
    const targetLang = this.mapLanguageCode(request.targetLanguage);
    
    const translatedCues: TranslatedCue[] = [];
    
    // Translate cues one by one to avoid separator translation issues
    // Google Translate may translate text separators like "---SPLIT---" into target language
    for (const cue of request.cues) {
      // Throttle requests
      await this.throttle();
      
      const translatedText = await this.translateText(cue.text, sourceLang, targetLang);
      
      translatedCues.push({
        index: cue.index,
        translatedText: translatedText.trim() || cue.text,
      });
    }
    
    // Build context for next chunk
    const context: TranslationContext = {
      previousCues: translatedCues.slice(-TRANSLATION_CONFIG.CONTEXT_OVERLAP).map((cue, idx) => ({
        original: request.cues[request.cues.length - TRANSLATION_CONFIG.CONTEXT_OVERLAP + idx]?.text || '',
        translated: cue.translatedText,
      })),
      characters: request.characterGlossary || {},
    };
    
    return {
      cues: translatedCues,
      context,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
      },
      warnings: [],
    };
  }
  
  /**
   * Translate with streaming (simulated for Google Translate)
   */
  async translateStream(
    request: TranslationRequest,
    onProgress: (progress: StreamProgress) => void
  ): Promise<TranslationResult> {
    const sourceLang = this.mapLanguageCode(request.sourceLanguage);
    const targetLang = this.mapLanguageCode(request.targetLanguage);
    
    const translatedCues: TranslatedCue[] = [];
    const totalCues = request.cues.length;
    
    // Translate one by one to provide progress updates
    for (let i = 0; i < request.cues.length; i++) {
      const cue = request.cues[i];
      
      await this.throttle();
      
      const translatedText = await this.translateText(cue.text, sourceLang, targetLang);
      
      translatedCues.push({
        index: cue.index,
        translatedText: translatedText.trim(),
      });
      
      // Report progress
      onProgress({
        currentIndex: i + 1,
        percentage: Math.round(((i + 1) / totalCues) * 100),
      });
    }
    
    const context: TranslationContext = {
      previousCues: translatedCues.slice(-TRANSLATION_CONFIG.CONTEXT_OVERLAP).map((cue, idx) => ({
        original: request.cues[request.cues.length - TRANSLATION_CONFIG.CONTEXT_OVERLAP + idx]?.text || '',
        translated: cue.translatedText,
      })),
      characters: request.characterGlossary || {},
    };
    
    return {
      cues: translatedCues,
      context,
      usage: { inputTokens: 0, outputTokens: 0 },
      warnings: [],
    };
  }
  
  /**
   * Get rate limit status (not applicable for free tier)
   */
  async getRateLimitStatus(): Promise<RateLimitStatus> {
    return {
      requestsRemaining: -1, // Unknown for free tier
      tokensRemaining: -1,
      resetsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      isLimited: false,
    };
  }
  
  /**
   * Estimate cost (always free)
   */
  estimateCost(_cueCount: number, _avgCharsPerCue: number): CostEstimate {
    return {
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      estimatedCostUSD: 0,
      costRange: { min: 0, max: 0 },
    };
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  // Custom retry strategy for Google Translate (shorter delays due to rate limiting)
  private readonly retryStrategy: RetryStrategy = {
    ...RetryStrategies.network,
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    retryableStatuses: [408, 429, 500, 502, 503, 504],
  };

  /**
   * Translate text using Google Translate API with retry logic
   */
  private async translateText(
    text: string,
    sourceLang: string,
    targetLang: string
  ): Promise<string> {
    const params = new URLSearchParams({
      client: 'gtx',
      sl: sourceLang,
      tl: targetLang,
      dt: 't',
      q: text,
    });

    const url = `${GOOGLE_TRANSLATE_URL}?${params.toString()}`;

    try {
      // Use fetchWithRetry for automatic retry on network failures
      const response = await fetchWithRetry(
        url,
        {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          timeout: 10000, // 10 second timeout per request
        },
        {
          strategy: this.retryStrategy,
          onRetry: (attempt, error, delay) => {
            console.warn(`[GoogleTranslate] Retry ${attempt}: ${error.message}, waiting ${delay}ms`);
          },
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw this.createError('RATE_LIMITED', 'Google 翻譯請求過於頻繁');
        }
        throw this.createError('SERVICE_UNAVAILABLE', `HTTP ${response.status}`);
      }

      // Google Translate returns a nested array structure
      // [[["translated text","original text",null,null,10]],null,"en",...]
      const data = await response.json() as unknown[][];

      if (!Array.isArray(data) || !Array.isArray(data[0])) {
        throw this.createError('INVALID_RESPONSE', '無效的回應格式');
      }

      // Extract translated text from nested array
      let translatedText = '';
      for (const item of data[0]) {
        if (Array.isArray(item) && typeof item[0] === 'string') {
          translatedText += item[0];
        }
      }

      this.requestCount++;

      return translatedText;
    } catch (error) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw this.createError(
        'NETWORK_ERROR',
        error instanceof Error ? error.message : '翻譯請求失敗'
      );
    }
  }
  
  /**
   * Map BCP 47 language code to Google Translate code
   */
  private mapLanguageCode(code: string): string {
    // Check direct mapping
    if (LANGUAGE_MAP[code]) {
      return LANGUAGE_MAP[code];
    }
    
    // Try base language (e.g., 'en-US' -> 'en')
    const baseLang = code.split('-')[0];
    if (LANGUAGE_MAP[baseLang]) {
      return LANGUAGE_MAP[baseLang];
    }
    
    // Return as-is and hope Google understands it
    return code;
  }
  
  /**
   * Throttle requests to avoid rate limiting
   */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    
    if (elapsed < this.minRequestInterval) {
      await new Promise(resolve => 
        setTimeout(resolve, this.minRequestInterval - elapsed)
      );
    }
    
    this.lastRequestTime = Date.now();
  }
  
  /**
   * Create a provider error
   */
  private createError(code: ProviderError['code'], message: string): ProviderError {
    const error = new Error(message) as ProviderError;
    error.code = code;
    error.provider = this.type;
    error.retryable = code === 'RATE_LIMITED' || code === 'NETWORK_ERROR';
    error.name = 'ProviderError';
    return error;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createGoogleTranslateProvider(
  config?: AuthProvider
): GoogleTranslateProvider {
  return new GoogleTranslateProvider(config);
}

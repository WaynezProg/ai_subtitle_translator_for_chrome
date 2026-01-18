/**
 * Claude API Provider
 * 
 * Official Claude API implementation for subtitle translation.
 * Uses Anthropic Messages API with optional Message Batches API for cost optimization.
 * 
 * @see specs/001-ai-subtitle-translator/contracts/translation-provider.md
 * @see FR-009: Claude API Key Support
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
  ProviderErrorCode,
} from './types';
import { ProviderError } from './types';
import { API_ENDPOINTS, TRANSLATION_CONFIG } from '../utils/constants';

// ============================================================================
// Constants
// ============================================================================

const ANTHROPIC_API_VERSION = '2023-06-01';

const CLAUDE_MODELS: ModelInfo[] = [
  {
    id: 'claude-3-5-haiku-20241022',
    name: 'Claude 3.5 Haiku',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    inputCostPer1M: 1.0,
    outputCostPer1M: 5.0,
    recommended: true,
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    inputCostPer1M: 3.0,
    outputCostPer1M: 15.0,
    recommended: false,
  },
  {
    id: 'claude-3-haiku-20240307',
    name: 'Claude 3 Haiku',
    contextWindow: 200000,
    maxOutputTokens: 4096,
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.25,
    recommended: false,
  },
];

// ============================================================================
// Claude API Provider
// ============================================================================

export class ClaudeApiProvider implements TranslationProvider {
  readonly type: ProviderType = 'claude-api';
  readonly displayName = 'Claude API';
  readonly availableModels = CLAUDE_MODELS;
  
  private apiKey: string;
  private baseUrl: string;
  private lastRateLimitInfo: RateLimitStatus | null = null;
  
  constructor(config: AuthProvider) {
    if (config.type !== 'claude-api') {
      throw new Error(`Invalid provider type: ${config.type}`);
    }
    
    // Try to get API key from various sources
    const configWithKey = config as AuthProvider & { apiKey?: string };
    if (configWithKey.apiKey) {
      this.apiKey = configWithKey.apiKey;
    } else if (config.credentials?.type === 'api-key') {
      this.apiKey = config.credentials.encryptedApiKey || '';
    } else {
      this.apiKey = '';
    }
    
    this.baseUrl = API_ENDPOINTS.CLAUDE_API;
  }
  
  // ============================================================================
  // Credential Validation
  // ============================================================================
  
  async validateCredentials(): Promise<ValidationResult> {
    if (!this.apiKey) {
      return {
        valid: false,
        error: {
          code: 'INVALID_KEY',
          message: 'API key is required',
        },
      };
    }
    
    try {
      // Make a minimal API call to validate the key
      const response = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });
      
      if (response.ok) {
        return { valid: true };
      }
      
      if (response.status === 401) {
        return {
          valid: false,
          error: {
            code: 'INVALID_KEY',
            message: 'Invalid API key',
          },
        };
      }
      
      if (response.status === 429) {
        return {
          valid: false,
          error: {
            code: 'INSUFFICIENT_QUOTA',
            message: 'Rate limited - quota may be exceeded',
          },
        };
      }
      
      const errorData = await response.json().catch(() => ({}));
      return {
        valid: false,
        error: {
          code: 'NETWORK_ERROR',
          message: errorData.error?.message || `API error: ${response.status}`,
        },
      };
    } catch (error) {
      return {
        valid: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Network error',
        },
      };
    }
  }
  
  // ============================================================================
  // Translation
  // ============================================================================
  
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const prompt = this.buildTranslationPrompt(request);
    
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: request.model || CLAUDE_MODELS[0].id,
        max_tokens: 8192,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    
    this.updateRateLimitInfo(response);
    
    if (!response.ok) {
      throw await this.handleApiError(response);
    }
    
    const data = await response.json();
    return this.parseTranslationResponse(data, request);
  }
  
  async translateStream(
    request: TranslationRequest,
    onProgress: (progress: StreamProgress) => void
  ): Promise<TranslationResult> {
    const prompt = this.buildTranslationPrompt(request);
    
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: request.model || CLAUDE_MODELS[0].id,
        max_tokens: 8192,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    
    this.updateRateLimitInfo(response);
    
    if (!response.ok) {
      throw await this.handleApiError(response);
    }
    
    // Process SSE stream
    const reader = response.body?.getReader();
    if (!reader) {
      throw new ProviderError('NETWORK_ERROR', 'No response body', this.type, true);
    }
    
    let fullContent = '';
    let currentIndex = 0;
    const decoder = new TextDecoder();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                fullContent += parsed.delta.text;
                
                // Update progress
                const matches = fullContent.match(/\[(\d+)\]/g);
                if (matches) {
                  currentIndex = Math.max(currentIndex, parseInt(matches[matches.length - 1].slice(1, -1)));
                }
                
                onProgress({
                  currentIndex,
                  partialText: fullContent,
                  percentage: Math.min(99, (currentIndex / request.cues.length) * 100),
                });
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    return this.parseTranslationText(fullContent, request);
  }
  
  // ============================================================================
  // Rate Limit & Cost
  // ============================================================================
  
  async getRateLimitStatus(): Promise<RateLimitStatus> {
    if (this.lastRateLimitInfo) {
      return this.lastRateLimitInfo;
    }
    
    // Return default status if no recent info
    return {
      requestsRemaining: 1000,
      tokensRemaining: 100000,
      resetsAt: new Date(Date.now() + 60000).toISOString(),
      isLimited: false,
    };
  }
  
  estimateCost(cueCount: number, avgCharsPerCue: number): CostEstimate {
    // Estimate tokens: ~4 chars per token for English, ~2 for CJK
    const charsPerToken = 3;
    const inputTokens = Math.ceil((cueCount * avgCharsPerCue) / charsPerToken);
    const outputTokens = inputTokens * 1.2; // Output slightly larger due to formatting
    
    const model = CLAUDE_MODELS[0]; // Use recommended model
    const inputCost = (inputTokens / 1_000_000) * model.inputCostPer1M;
    const outputCost = (outputTokens / 1_000_000) * model.outputCostPer1M;
    const estimatedCost = inputCost + outputCost;
    
    return {
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: Math.ceil(outputTokens),
      estimatedCostUSD: estimatedCost,
      costRange: {
        min: estimatedCost * 0.8,
        max: estimatedCost * 1.5,
      },
    };
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'anthropic-version': ANTHROPIC_API_VERSION,
    };
  }
  
  private buildTranslationPrompt(request: TranslationRequest): string {
    const { cues, sourceLanguage, targetLanguage, previousContext, characterGlossary, customInstructions } = request;
    
    let prompt = `You are a professional subtitle translator. Translate the following subtitle lines from ${sourceLanguage} to ${targetLanguage}.

IMPORTANT RULES:
1. Preserve the exact index number [N] at the start of each line
2. Keep translations natural and concise (suitable for subtitles)
3. Maintain speaker markers if present (e.g., "Speaker1:", "[John]")
4. Do not add or remove any lines
5. Output ONLY the translated lines, nothing else

`;
    
    // Add character glossary if provided
    if (characterGlossary && Object.keys(characterGlossary).length > 0) {
      prompt += `CHARACTER NAME GLOSSARY (use these translations):\n`;
      for (const [original, translated] of Object.entries(characterGlossary)) {
        prompt += `- ${original} → ${translated}\n`;
      }
      prompt += '\n';
    }
    
    // Add context from previous chunk
    if (previousContext?.previousCues.length) {
      prompt += `CONTEXT FROM PREVIOUS CHUNK (for reference only, do not re-translate):\n`;
      for (const cue of previousContext.previousCues.slice(-3)) {
        prompt += `Original: ${cue.original}\nTranslated: ${cue.translated}\n\n`;
      }
    }
    
    // Add custom instructions
    if (customInstructions) {
      prompt += `ADDITIONAL INSTRUCTIONS:\n${customInstructions}\n\n`;
    }
    
    // Add cues to translate
    prompt += `LINES TO TRANSLATE:\n`;
    for (const cue of cues) {
      const speaker = cue.speaker ? `[${cue.speaker}] ` : '';
      prompt += `[${cue.index}] ${speaker}${cue.text}\n`;
    }
    
    return prompt;
  }
  
  private parseTranslationResponse(data: AnthropicResponse, request: TranslationRequest): TranslationResult {
    const content = data.content[0]?.text || '';
    const result = this.parseTranslationText(content, request);
    
    result.usage = {
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    };
    
    return result;
  }
  
  private parseTranslationText(content: string, request: TranslationRequest): TranslationResult {
    const cues: TranslatedCue[] = [];
    const warnings: string[] = [];
    const characters: Record<string, string> = { ...(request.previousContext?.characters || {}) };
    
    // Parse translated lines
    const lines = content.split('\n').filter(l => l.trim());
    const indexPattern = /^\[(\d+)\]\s*(.*)$/;
    
    for (const line of lines) {
      const match = line.match(indexPattern);
      if (match) {
        const index = parseInt(match[1]);
        let translatedText = match[2].trim();
        
        // Remove speaker markers for storage (they're already in original)
        const speakerMatch = translatedText.match(/^\[([^\]]+)\]\s*/);
        if (speakerMatch) {
          translatedText = translatedText.slice(speakerMatch[0].length);
        }
        
        cues.push({ index, translatedText });
      }
    }
    
    // Check for missing translations
    const translatedIndices = new Set(cues.map(c => c.index));
    for (const cue of request.cues) {
      if (!translatedIndices.has(cue.index)) {
        warnings.push(`Missing translation for cue ${cue.index}`);
        // Add original text as fallback
        cues.push({ index: cue.index, translatedText: cue.text });
      }
    }
    
    // Sort by index
    cues.sort((a, b) => a.index - b.index);
    
    // Build context for next chunk
    const lastCues = cues.slice(-TRANSLATION_CONFIG.CONTEXT_OVERLAP);
    const previousCues = lastCues.map(c => {
      const original = request.cues.find(r => r.index === c.index);
      return {
        original: original?.text || '',
        translated: c.translatedText,
      };
    });
    
    return {
      cues,
      context: { previousCues, characters },
      usage: { inputTokens: 0, outputTokens: 0 },
      warnings,
    };
  }
  
  private updateRateLimitInfo(response: Response): void {
    const requestsRemaining = parseInt(response.headers.get('x-ratelimit-limit-requests') || '1000');
    const tokensRemaining = parseInt(response.headers.get('x-ratelimit-limit-tokens') || '100000');
    const resetRequests = response.headers.get('x-ratelimit-reset-requests');
    
    this.lastRateLimitInfo = {
      requestsRemaining,
      tokensRemaining,
      resetsAt: resetRequests || new Date(Date.now() + 60000).toISOString(),
      isLimited: response.status === 429,
      retryAfter: response.status === 429 ? parseInt(response.headers.get('retry-after') || '60') : undefined,
    };
  }
  
  private async handleApiError(response: Response): Promise<ProviderError> {
    let errorData: { error?: { type?: string; message?: string } } = {};
    
    try {
      errorData = await response.json();
    } catch {
      // Ignore parse errors
    }
    
    const message = errorData.error?.message || `API error: ${response.status}`;
    
    let code: ProviderErrorCode = 'SERVICE_UNAVAILABLE';
    let retryable = false;
    let retryAfter: number | undefined;
    
    switch (response.status) {
      case 401:
        code = 'AUTHENTICATION_FAILED';
        break;
      case 429:
        code = 'RATE_LIMITED';
        retryable = true;
        retryAfter = parseInt(response.headers.get('retry-after') || '60');
        break;
      case 400:
        if (errorData.error?.type === 'invalid_request_error') {
          code = 'CONTEXT_LENGTH_EXCEEDED';
        }
        break;
      case 500:
      case 502:
      case 503:
        code = 'SERVICE_UNAVAILABLE';
        retryable = true;
        retryAfter = 30;
        break;
    }
    
    return new ProviderError(code, message, this.type, retryable, retryAfter);
  }
}

// ============================================================================
// Types
// ============================================================================

interface AnthropicResponse {
  content: Array<{ type: string; text: string }>;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

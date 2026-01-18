/**
 * OpenAI API Provider
 * 
 * Official OpenAI API implementation for subtitle translation.
 * Uses Chat Completions API with GPT-4 models.
 * 
 * @see specs/001-ai-subtitle-translator/contracts/translation-provider.md
 * @see FR-010: OpenAI API Key Support
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

const OPENAI_MODELS: ModelInfo[] = [
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.6,
    recommended: true,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    inputCostPer1M: 2.5,
    outputCostPer1M: 10.0,
    recommended: false,
  },
  {
    id: 'gpt-4-turbo',
    name: 'GPT-4 Turbo',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    inputCostPer1M: 10.0,
    outputCostPer1M: 30.0,
    recommended: false,
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    contextWindow: 16385,
    maxOutputTokens: 4096,
    inputCostPer1M: 0.5,
    outputCostPer1M: 1.5,
    recommended: false,
  },
];

// ============================================================================
// OpenAI API Provider
// ============================================================================

export class OpenAIApiProvider implements TranslationProvider {
  readonly type: ProviderType = 'openai-api';
  readonly displayName = 'OpenAI API';
  readonly availableModels = OPENAI_MODELS;
  
  private apiKey: string;
  private baseUrl: string;
  private lastRateLimitInfo: RateLimitStatus | null = null;
  
  constructor(config: AuthProvider) {
    if (config.type !== 'openai-api') {
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
    
    this.baseUrl = API_ENDPOINTS.OPENAI_API;
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
      // List models to validate the key
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: this.getHeaders(),
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
            message: 'Rate limited or quota exceeded',
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
    const messages = this.buildMessages(request);
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: request.model || OPENAI_MODELS[0].id,
        messages,
        max_tokens: 8192,
        temperature: 0.3,
      }),
    });
    
    this.updateRateLimitInfo(response);
    
    if (!response.ok) {
      throw await this.handleApiError(response);
    }
    
    const data = await response.json();
    return this.parseResponse(data, request);
  }
  
  async translateStream(
    request: TranslationRequest,
    onProgress: (progress: StreamProgress) => void
  ): Promise<TranslationResult> {
    const messages = this.buildMessages(request);
    
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: request.model || OPENAI_MODELS[0].id,
        messages,
        max_tokens: 8192,
        temperature: 0.3,
        stream: true,
      }),
    });
    
    this.updateRateLimitInfo(response);
    
    if (!response.ok) {
      throw await this.handleApiError(response);
    }
    
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
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                
                // Update progress based on translated indices
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
    
    return {
      requestsRemaining: 10000,
      tokensRemaining: 1000000,
      resetsAt: new Date(Date.now() + 60000).toISOString(),
      isLimited: false,
    };
  }
  
  estimateCost(cueCount: number, avgCharsPerCue: number): CostEstimate {
    const charsPerToken = 4;
    const inputTokens = Math.ceil((cueCount * avgCharsPerCue) / charsPerToken);
    const outputTokens = inputTokens * 1.2;
    
    const model = OPENAI_MODELS[0];
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
      'Authorization': `Bearer ${this.apiKey}`,
    };
  }
  
  private buildMessages(request: TranslationRequest): Array<{ role: string; content: string }> {
    const { cues, sourceLanguage, targetLanguage, previousContext, characterGlossary, customInstructions } = request;
    
    // System message
    let systemPrompt = `You are a professional subtitle translator. Translate subtitle lines from ${sourceLanguage} to ${targetLanguage}.

RULES:
1. Preserve the exact index number [N] at the start of each line
2. Keep translations natural and concise (suitable for subtitles)
3. Maintain speaker markers if present (e.g., "Speaker1:", "[John]")
4. Do not add or remove any lines
5. Output ONLY the translated lines, nothing else`;
    
    if (characterGlossary && Object.keys(characterGlossary).length > 0) {
      systemPrompt += '\n\nCHARACTER NAME GLOSSARY:\n';
      for (const [original, translated] of Object.entries(characterGlossary)) {
        systemPrompt += `- ${original} → ${translated}\n`;
      }
    }
    
    if (customInstructions) {
      systemPrompt += `\n\nADDITIONAL INSTRUCTIONS:\n${customInstructions}`;
    }
    
    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: systemPrompt },
    ];
    
    // Add context from previous chunk as assistant message
    if (previousContext?.previousCues.length) {
      let contextContent = 'Previous translations for context:\n';
      for (const cue of previousContext.previousCues.slice(-3)) {
        contextContent += `Original: ${cue.original}\nTranslated: ${cue.translated}\n\n`;
      }
      messages.push({ role: 'assistant', content: contextContent });
    }
    
    // User message with cues to translate
    let userContent = 'Translate these lines:\n\n';
    for (const cue of cues) {
      const speaker = cue.speaker ? `[${cue.speaker}] ` : '';
      userContent += `[${cue.index}] ${speaker}${cue.text}\n`;
    }
    messages.push({ role: 'user', content: userContent });
    
    return messages;
  }
  
  private parseResponse(data: OpenAIResponse, request: TranslationRequest): TranslationResult {
    const content = data.choices[0]?.message?.content || '';
    const result = this.parseTranslationText(content, request);
    
    result.usage = {
      inputTokens: data.usage?.prompt_tokens || 0,
      outputTokens: data.usage?.completion_tokens || 0,
    };
    
    return result;
  }
  
  private parseTranslationText(content: string, request: TranslationRequest): TranslationResult {
    const cues: TranslatedCue[] = [];
    const warnings: string[] = [];
    const characters: Record<string, string> = { ...(request.previousContext?.characters || {}) };
    
    const lines = content.split('\n').filter(l => l.trim());
    const indexPattern = /^\[(\d+)\]\s*(.*)$/;
    
    for (const line of lines) {
      const match = line.match(indexPattern);
      if (match) {
        const index = parseInt(match[1]);
        let translatedText = match[2].trim();
        
        // Remove speaker markers
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
        cues.push({ index: cue.index, translatedText: cue.text });
      }
    }
    
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
    const requestsRemaining = parseInt(response.headers.get('x-ratelimit-remaining-requests') || '10000');
    const tokensRemaining = parseInt(response.headers.get('x-ratelimit-remaining-tokens') || '1000000');
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
    let errorData: { error?: { type?: string; message?: string; code?: string } } = {};
    
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
        if (errorData.error?.code === 'context_length_exceeded') {
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

interface OpenAIResponse {
  choices: Array<{
    message: { content: string };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

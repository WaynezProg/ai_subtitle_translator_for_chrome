/**
 * Ollama Provider
 * 
 * Local Ollama model implementation for subtitle translation.
 * Uses OpenAI-compatible API format for easy integration.
 * 
 * @see specs/001-ai-subtitle-translator/contracts/translation-provider.md
 * @see FR-011: Ollama Local Model Support
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
} from './types';
import { ProviderError } from './types';
import { API_ENDPOINTS, TRANSLATION_CONFIG } from '../utils/constants';
import { getLanguageDisplayName } from '../utils/helpers';
import { fetchWithRetry, RetryStrategies, type RetryStrategy } from '../utils/error-handler';

// ============================================================================
// Types
// ============================================================================

interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

interface OllamaModelsResponse {
  models: OllamaModel[];
}

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  eval_count?: number;
  prompt_eval_count?: number;
}

// ============================================================================
// Ollama Provider
// ============================================================================

export class OllamaProvider implements TranslationProvider {
  readonly type: ProviderType = 'ollama';
  readonly displayName = 'Ollama (Local)';
  
  // Available models will be populated from Ollama API
  private _availableModels: ModelInfo[] = [];

  private endpoint: string;
  private currentModel: string = '';
  private isConnected: boolean = false;

  // Custom retry strategy for Ollama (local service, quick retries)
  private readonly retryStrategy: RetryStrategy = {
    ...RetryStrategies.network,
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 3000,
    backoffMultiplier: 1.5,
    retryableStatuses: [408, 500, 502, 503, 504],
  };

  constructor(config?: AuthProvider) {
    // Get endpoint from config or use default
    if (config?.credentials?.type === 'ollama') {
      this.endpoint = config.credentials.endpoint || API_ENDPOINTS.OLLAMA_DEFAULT;
      this.currentModel = config.credentials.model || '';
    } else {
      this.endpoint = API_ENDPOINTS.OLLAMA_DEFAULT;
    }
  }
  
  get availableModels(): ModelInfo[] {
    return this._availableModels;
  }
  
  /**
   * Set endpoint URL
   */
  setEndpoint(endpoint: string): void {
    this.endpoint = endpoint;
    this.isConnected = false;
  }
  
  /**
   * Set current model
   */
  setModel(model: string): void {
    this.currentModel = model;
  }
  
  // ============================================================================
  // Connection Test (T098)
  // ============================================================================
  
  /**
   * Test connection to Ollama endpoint
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Use AbortController with timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.endpoint}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        this.isConnected = true;
        return { success: true };
      }

      return {
        success: false,
        error: `Connection failed: ${response.status} ${response.statusText}`
      };
    } catch (error) {
      this.isConnected = false;
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Connection timed out. Is Ollama running?'
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  /**
   * Quick health check - faster than testConnection, just checks if endpoint is reachable
   */
  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(`${this.endpoint}/api/tags`, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }
  
  // ============================================================================
  // Model Listing (T099)
  // ============================================================================
  
  /**
   * Fetch available models from Ollama
   */
  async fetchAvailableModels(): Promise<ModelInfo[]> {
    try {
      const response = await fetch(`${this.endpoint}/api/tags`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }
      
      const data = await response.json() as OllamaModelsResponse;
      
      this._availableModels = data.models.map((model): ModelInfo => ({
        id: model.name,
        name: model.name,
        contextWindow: this.estimateContextWindow(model),
        maxOutputTokens: 4096, // Conservative default
        inputCostPer1M: 0, // Local - no cost
        outputCostPer1M: 0,
        recommended: this.isRecommendedModel(model.name),
      }));
      
      this.isConnected = true;
      return this._availableModels;
    } catch (error) {
      console.error('[OllamaProvider] Failed to fetch models:', error);
      return [];
    }
  }
  
  private estimateContextWindow(model: OllamaModel): number {
    // Estimate based on model name/size
    const name = model.name.toLowerCase();
    
    if (name.includes('llama3') || name.includes('llama-3')) {
      return 8192;
    }
    if (name.includes('mistral') || name.includes('mixtral')) {
      return 32768;
    }
    if (name.includes('qwen')) {
      return 32768;
    }
    if (name.includes('gemma')) {
      return 8192;
    }
    
    // Default conservative estimate
    return 4096;
  }
  
  private isRecommendedModel(name: string): boolean {
    const lower = name.toLowerCase();
    // Recommend models known to be good for translation
    return (
      lower.includes('llama3') ||
      lower.includes('qwen') ||
      lower.includes('mistral')
    );
  }
  
  // ============================================================================
  // Credential Validation
  // ============================================================================
  
  async validateCredentials(): Promise<ValidationResult> {
    const connectionResult = await this.testConnection();
    
    if (!connectionResult.success) {
      return {
        valid: false,
        error: {
          code: 'NETWORK_ERROR',
          message: connectionResult.error || 'Cannot connect to Ollama',
        },
      };
    }
    
    // Also check if models are available
    const models = await this.fetchAvailableModels();
    
    if (models.length === 0) {
      return {
        valid: false,
        error: {
          code: 'INVALID_KEY',
          message: 'No models found. Please pull a model first (e.g., ollama pull llama3)',
        },
      };
    }
    
    return {
      valid: true,
      accountInfo: {
        tier: 'local',
      },
    };
  }
  
  // ============================================================================
  // Translation (T100)
  // ============================================================================
  
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const model = request.model || this.currentModel || this._availableModels[0]?.id;

    if (!model) {
      throw new ProviderError(
        'MODEL_NOT_FOUND',
        'No model specified. Please select a model first.',
        this.type,
        false
      );
    }

    const messages = this.buildMessages(request);

    // Use fetchWithRetry for automatic retry on network failures
    const response = await fetchWithRetry(
      `${this.endpoint}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 8192,
          },
        }),
        timeout: 60000, // 60 second timeout for local model inference
      },
      {
        strategy: this.retryStrategy,
        onRetry: (attempt, error, delay) => {
          console.debug(`[Ollama] Retry ${attempt}: ${error.message}, waiting ${delay}ms`);
        },
      }
    );

    if (!response.ok) {
      throw await this.handleApiError(response);
    }

    const data = await response.json() as OllamaChatResponse;
    return this.parseResponse(data, request);
  }
  
  async translateStream(
    request: TranslationRequest,
    onProgress: (progress: StreamProgress) => void
  ): Promise<TranslationResult> {
    const model = request.model || this.currentModel || this._availableModels[0]?.id;
    
    if (!model) {
      throw new ProviderError(
        'MODEL_NOT_FOUND',
        'No model specified',
        this.type,
        false
      );
    }
    
    const messages = this.buildMessages(request);
    
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
        options: {
          temperature: 0.3,
          num_predict: 8192,
        },
      }),
    });
    
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
        const lines = chunk.split('\n').filter(l => l.trim());
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line) as OllamaChatResponse;
            if (parsed.message?.content) {
              fullContent += parsed.message.content;
              
              // Track progress
              const matches = fullContent.match(/\[(\d+)\]/g);
              if (matches) {
                currentIndex = Math.max(
                  currentIndex,
                  parseInt(matches[matches.length - 1].slice(1, -1))
                );
              }
              
              onProgress({
                currentIndex,
                partialText: fullContent,
                percentage: Math.min(99, (currentIndex / request.cues.length) * 100),
              });
            }
          } catch {
            // Skip invalid JSON lines
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
    // Ollama has no rate limits (local)
    return {
      requestsRemaining: 999999,
      tokensRemaining: 999999,
      resetsAt: new Date(Date.now() + 86400000).toISOString(),
      isLimited: false,
    };
  }
  
  estimateCost(_cueCount: number, _avgCharsPerCue: number): CostEstimate {
    // Ollama is free (local)
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
  
  private buildMessages(request: TranslationRequest): OllamaChatMessage[] {
    const { cues, sourceLanguage, targetLanguage, previousContext, characterGlossary, customInstructions } = request;

    // Use full language names for clarity in prompts
    const sourceLangName = getLanguageDisplayName(sourceLanguage);
    const targetLangName = getLanguageDisplayName(targetLanguage);

    // System message
    let systemPrompt = `You are a professional subtitle translator. Translate subtitle lines from ${sourceLangName} to ${targetLangName}.

RULES:
1. Preserve the exact index number [N] at the start of each line
2. Keep translations natural and concise (suitable for subtitles)
3. Maintain speaker markers if present
4. Do not add or remove any lines
5. Output ONLY the translated lines, nothing else`;
    
    if (characterGlossary && Object.keys(characterGlossary).length > 0) {
      systemPrompt += '\n\nCHARACTER NAME GLOSSARY:\n';
      for (const [original, translated] of Object.entries(characterGlossary)) {
        systemPrompt += `- ${original} -> ${translated}\n`;
      }
    }
    
    if (customInstructions) {
      systemPrompt += `\n\nADDITIONAL INSTRUCTIONS:\n${customInstructions}`;
    }
    
    const messages: OllamaChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ];
    
    // Add context from previous chunk
    if (previousContext?.previousCues.length) {
      let contextContent = 'Previous translations for reference:\n';
      for (const cue of previousContext.previousCues.slice(-3)) {
        contextContent += `Original: ${cue.original}\nTranslated: ${cue.translated}\n\n`;
      }
      messages.push({ role: 'assistant', content: contextContent });
    }
    
    // User message with cues
    let userContent = 'Translate these lines:\n\n';
    for (const cue of cues) {
      const speaker = cue.speaker ? `[${cue.speaker}] ` : '';
      userContent += `[${cue.index}] ${speaker}${cue.text}\n`;
    }
    messages.push({ role: 'user', content: userContent });
    
    return messages;
  }
  
  private parseResponse(data: OllamaChatResponse, request: TranslationRequest): TranslationResult {
    const content = data.message?.content || '';
    const result = this.parseTranslationText(content, request);
    
    // Ollama provides token counts
    result.usage = {
      inputTokens: data.prompt_eval_count || 0,
      outputTokens: data.eval_count || 0,
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
  
  private async handleApiError(response: Response): Promise<ProviderError> {
    let message = `Ollama API error: ${response.status}`;
    
    try {
      const errorData = await response.json();
      if (errorData.error) {
        message = errorData.error;
      }
    } catch {
      // Ignore parse errors
    }
    
    if (response.status === 404) {
      return new ProviderError(
        'MODEL_NOT_FOUND',
        'Model not found. Please pull the model first.',
        this.type,
        false
      );
    }
    
    return new ProviderError(
      'SERVICE_UNAVAILABLE',
      message,
      this.type,
      true,
      5
    );
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createOllamaProvider(config?: AuthProvider): OllamaProvider {
  return new OllamaProvider(config);
}

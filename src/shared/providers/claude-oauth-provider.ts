/**
 * Claude OAuth Provider
 * 
 * Implements translation using Claude Pro subscription via OAuth authentication.
 * This is the recommended way to authenticate with Claude Pro.
 * 
 * @see specs/001-ai-subtitle-translator/contracts/translation-provider.md
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
import {
  getValidClaudeToken,
  validateClaudeToken,
  translateWithClaudeOAuth,
  storeClaudeTokens,
  clearClaudeTokens,
  launchClaudeOAuthFlow,
  type ClaudeOAuthTokens,
} from './claude-oauth';

// ============================================================================
// Constants
// ============================================================================

const CLAUDE_API_BASE = 'https://api.anthropic.com';

// ============================================================================
// Claude OAuth Provider
// ============================================================================

export class ClaudeOAuthProvider implements TranslationProvider {
  readonly type: ProviderType = 'claude-subscription';
  readonly displayName = 'Claude Pro (OAuth)';
  
  readonly availableModels: ModelInfo[] = [
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      contextWindow: 200000,
      maxOutputTokens: 8192,
      inputCostPer1M: 0, // Subscription - no per-token cost
      outputCostPer1M: 0,
      recommended: true,
    },
    {
      id: 'claude-3-5-sonnet-20241022',
      name: 'Claude 3.5 Sonnet',
      contextWindow: 200000,
      maxOutputTokens: 8192,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      recommended: false,
    },
    {
      id: 'claude-3-5-haiku-20241022',
      name: 'Claude 3.5 Haiku',
      contextWindow: 200000,
      maxOutputTokens: 8192,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      recommended: false,
    },
  ];
  
  private accessToken: string | null = null;
  private currentModel = 'claude-sonnet-4-20250514';
  
  constructor(config?: AuthProvider) {
    if (config?.credentials?.type === 'oauth') {
      this.accessToken = config.credentials.accessToken;
    }
  }
  
  /**
   * Set access token directly
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }
  
  /**
   * Start OAuth flow to authenticate user
   */
  async authenticate(): Promise<ClaudeOAuthTokens> {
    const tokens = await launchClaudeOAuthFlow();
    await storeClaudeTokens(tokens);
    this.accessToken = tokens.accessToken;
    return tokens;
  }
  
  /**
   * Clear authentication
   */
  async logout(): Promise<void> {
    await clearClaudeTokens();
    this.accessToken = null;
  }
  
  /**
   * Validate credentials by testing API access
   */
  async validateCredentials(): Promise<ValidationResult> {
    // Try to get a valid token (may refresh if expired)
    const token = await getValidClaudeToken();
    
    if (!token) {
      return {
        valid: false,
        error: {
          code: 'INVALID_KEY',
          message: 'No OAuth token configured. Please authenticate with Claude.',
        },
      };
    }
    
    this.accessToken = token;
    
    try {
      const isValid = await validateClaudeToken(token);
      
      if (!isValid) {
        return {
          valid: false,
          error: {
            code: 'INVALID_KEY',
            message: 'OAuth token is invalid or expired',
          },
        };
      }
      
      return {
        valid: true,
        accountInfo: {
          tier: 'Claude Pro (OAuth)',
        },
      };
    } catch (error) {
      return {
        valid: false,
        error: {
          code: 'NETWORK_ERROR',
          message: error instanceof Error ? error.message : 'Validation failed',
        },
      };
    }
  }
  
  /**
   * Translate subtitle cues
   */
  async translate(request: TranslationRequest): Promise<TranslationResult> {
    const token = await this.ensureValidToken();
    
    // Build translation prompt
    const prompt = this.buildTranslationPrompt(request);
    
    // Send message and get response
    const response = await translateWithClaudeOAuth(
      token,
      [{ role: 'user', content: prompt }],
      this.currentModel
    );
    
    // Parse response into cues
    const translatedCues = this.parseTranslationResponse(response, request.cues);
    
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
        inputTokens: 0, // Not tracked for subscription
        outputTokens: 0,
      },
      warnings: [],
    };
  }
  
  /**
   * Translate with streaming (progress updates)
   */
  async translateStream(
    request: TranslationRequest,
    onProgress: (progress: StreamProgress) => void
  ): Promise<TranslationResult> {
    const token = await this.ensureValidToken();
    const prompt = this.buildTranslationPrompt(request);
    
    // For streaming, we'll use the SSE endpoint
    let fullResponse = '';
    let lastProgress = 0;
    
    await this.streamTranslation(token, prompt, (chunk) => {
      fullResponse += chunk;
      
      // Estimate progress based on response length
      const estimatedProgress = Math.min(
        (fullResponse.length / (request.cues.length * 50)) * 100,
        99
      );
      
      if (estimatedProgress - lastProgress >= 5) {
        onProgress({
          currentIndex: Math.floor(request.cues.length * (estimatedProgress / 100)),
          percentage: estimatedProgress,
        });
        lastProgress = estimatedProgress;
      }
    });
    
    const translatedCues = this.parseTranslationResponse(fullResponse, request.cues);
    
    onProgress({
      currentIndex: request.cues.length,
      percentage: 100,
    });
    
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
   * Get rate limit status (not applicable for subscription)
   */
  async getRateLimitStatus(): Promise<RateLimitStatus> {
    return {
      requestsRemaining: -1, // Unlimited for subscription
      tokensRemaining: -1,
      resetsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      isLimited: false,
    };
  }
  
  /**
   * Estimate cost (free for subscription)
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
  
  private async ensureValidToken(): Promise<string> {
    const token = await getValidClaudeToken();
    
    if (!token) {
      throw this.createError('AUTHENTICATION_FAILED', 'Not authenticated. Please log in with Claude.');
    }
    
    this.accessToken = token;
    return token;
  }
  
  private async streamTranslation(
    token: string,
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const response = await fetch(`${CLAUDE_API_BASE}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.currentModel,
        max_tokens: 8192,
        stream: true,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw this.createError('SERVICE_UNAVAILABLE', `API error: ${errorText}`);
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      throw this.createError('SERVICE_UNAVAILABLE', 'No response body');
    }
    
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = decoder.decode(value);
      const lines = text.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const event = JSON.parse(data) as {
              type: string;
              delta?: { text?: string };
            };
            
            if (event.type === 'content_block_delta' && event.delta?.text) {
              onChunk(event.delta.text);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }
  
  private buildTranslationPrompt(request: TranslationRequest): string {
    const cuesJson = JSON.stringify(
      request.cues.map(c => ({ index: c.index, text: c.text })),
      null,
      2
    );
    
    let prompt = `You are a professional subtitle translator. Translate the following subtitles from ${request.sourceLanguage} to ${request.targetLanguage}.

IMPORTANT RULES:
1. Return ONLY valid JSON with the same structure
2. Preserve the exact index numbers
3. Use natural, conversational language
4. Keep translations concise (max 2 lines, ~42 chars per line)
5. Do NOT translate proper nouns unless in the glossary
6. Preserve speaker labels like [John] unchanged

`;

    if (request.characterGlossary && Object.keys(request.characterGlossary).length > 0) {
      prompt += `CHARACTER GLOSSARY:\n`;
      for (const [original, translated] of Object.entries(request.characterGlossary)) {
        prompt += `- ${original} → ${translated}\n`;
      }
      prompt += '\n';
    }
    
    if (request.previousContext?.previousCues.length) {
      prompt += `PREVIOUS CONTEXT (for consistency):\n`;
      for (const prev of request.previousContext.previousCues) {
        prompt += `Original: ${prev.original}\nTranslation: ${prev.translated}\n\n`;
      }
    }
    
    if (request.customInstructions) {
      prompt += `ADDITIONAL INSTRUCTIONS: ${request.customInstructions}\n\n`;
    }
    
    prompt += `INPUT SUBTITLES:\n\`\`\`json\n${cuesJson}\n\`\`\`\n\nOutput the translated JSON only:`;
    
    return prompt;
  }
  
  private parseTranslationResponse(response: string, originalCues: TranslationRequest['cues']): TranslatedCue[] {
    // Extract JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      // Fallback: Try to parse line by line
      return this.parseLineByLine(response, originalCues);
    }
    
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{ index: number; text: string }>;
      return parsed.map(item => ({
        index: item.index,
        translatedText: item.text,
      }));
    } catch {
      return this.parseLineByLine(response, originalCues);
    }
  }
  
  private parseLineByLine(response: string, originalCues: TranslationRequest['cues']): TranslatedCue[] {
    // Fallback parsing for malformed responses
    const lines = response.split('\n').filter(l => l.trim());
    const result: TranslatedCue[] = [];
    
    for (let i = 0; i < originalCues.length; i++) {
      result.push({
        index: originalCues[i].index,
        translatedText: lines[i] || originalCues[i].text, // Fallback to original
      });
    }
    
    return result;
  }
  
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

export function createClaudeOAuthProvider(
  config?: AuthProvider
): ClaudeOAuthProvider {
  return new ClaudeOAuthProvider(config);
}

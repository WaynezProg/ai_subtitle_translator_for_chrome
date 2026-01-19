/**
 * ChatGPT OAuth Provider
 * 
 * Implements translation using ChatGPT Plus subscription via OAuth authentication.
 * This is the recommended way to authenticate with ChatGPT Plus.
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
  getValidChatGPTToken,
  validateChatGPTToken,
  storeChatGPTTokens,
  clearChatGPTTokens,
  launchChatGPTOAuthFlow,
  type ChatGPTOAuthTokens,
} from './chatgpt-oauth';

// ============================================================================
// Constants
// ============================================================================

// ChatGPT OAuth tokens work with ChatGPT backend-api (Codex endpoint)
// Reference: opencode-openai-codex-auth uses chatgpt.com/backend-api
const CHATGPT_BACKEND_API = 'https://chatgpt.com/backend-api';

// ============================================================================
// ChatGPT OAuth Provider
// ============================================================================

export class ChatGPTOAuthProvider implements TranslationProvider {
  readonly type: ProviderType = 'chatgpt-subscription';
  readonly displayName = 'ChatGPT Plus (OAuth)';
  
  readonly availableModels: ModelInfo[] = [
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      contextWindow: 128000,
      maxOutputTokens: 16384,
      inputCostPer1M: 0, // Subscription - no per-token cost
      outputCostPer1M: 0,
      recommended: true,
    },
    {
      id: 'gpt-4o-mini',
      name: 'GPT-4o Mini',
      contextWindow: 128000,
      maxOutputTokens: 16384,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      recommended: false,
    },
    {
      id: 'gpt-4-turbo',
      name: 'GPT-4 Turbo',
      contextWindow: 128000,
      maxOutputTokens: 4096,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      recommended: false,
    },
  ];
  
  private accessToken: string | null = null;
  private currentModel = 'gpt-4o';
  
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
  async authenticate(): Promise<ChatGPTOAuthTokens> {
    const tokens = await launchChatGPTOAuthFlow();
    await storeChatGPTTokens(tokens);
    this.accessToken = tokens.accessToken;
    return tokens;
  }
  
  /**
   * Clear authentication
   */
  async logout(): Promise<void> {
    await clearChatGPTTokens();
    this.accessToken = null;
  }
  
  /**
   * Validate credentials by testing API access
   */
  async validateCredentials(): Promise<ValidationResult> {
    // Try to get a valid token (may refresh if expired)
    const token = await getValidChatGPTToken();
    
    if (!token) {
      return {
        valid: false,
        error: {
          code: 'INVALID_KEY',
          message: 'No OAuth token configured. Please authenticate with ChatGPT.',
        },
      };
    }
    
    this.accessToken = token;
    
    try {
      const isValid = await validateChatGPTToken(token);
      
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
          tier: 'ChatGPT Plus (OAuth)',
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
    
    // Send message and get response using OpenAI API
    const response = await this.sendChatCompletion(token, prompt);
    
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
    
    await this.streamChatCompletion(token, prompt, (chunk) => {
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
    const token = await getValidChatGPTToken();
    
    if (!token) {
      throw this.createError('AUTHENTICATION_FAILED', 'Not authenticated. Please log in with ChatGPT.');
    }
    
    this.accessToken = token;
    return token;
  }
  
  /**
   * Send a chat completion request using ChatGPT backend-api
   * Uses the conversation endpoint which supports the OAuth token
   */
  private async sendChatCompletion(token: string, prompt: string): Promise<string> {
    // Generate unique IDs for the conversation
    const messageId = this.generateUUID();
    const parentMessageId = this.generateUUID();

    const response = await fetch(`${CHATGPT_BACKEND_API}/conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'next',
        messages: [
          {
            id: messageId,
            author: { role: 'user' },
            content: {
              content_type: 'text',
              parts: [prompt],
            },
          },
        ],
        parent_message_id: parentMessageId,
        model: this.currentModel,
        timezone_offset_min: new Date().getTimezoneOffset(),
        history_and_training_disabled: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      if (response.status === 401 || response.status === 403) {
        throw this.createError('AUTHENTICATION_FAILED', 'TOKEN_EXPIRED');
      }

      throw this.createError('SERVICE_UNAVAILABLE', `ChatGPT API error: ${response.status} - ${errorText}`);
    }

    // Parse the SSE response
    return await this.parseSSEResponse(response);
  }

  /**
   * Parse Server-Sent Events response from ChatGPT backend-api
   */
  private async parseSSEResponse(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw this.createError('SERVICE_UNAVAILABLE', 'No response body');
    }

    const decoder = new TextDecoder();
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data) as {
              message?: {
                content?: {
                  parts?: string[];
                };
                status?: string;
              };
            };

            // Get the full content from the message
            const parts = event.message?.content?.parts;
            if (parts && parts.length > 0) {
              fullContent = parts.join('');
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }

    return fullContent;
  }

  /**
   * Generate a UUID v4
   */
  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  
  /**
   * Stream chat completion using ChatGPT backend-api
   * ChatGPT backend-api streams by default via SSE
   */
  private async streamChatCompletion(
    token: string,
    prompt: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const messageId = this.generateUUID();
    const parentMessageId = this.generateUUID();

    const response = await fetch(`${CHATGPT_BACKEND_API}/conversation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'next',
        messages: [
          {
            id: messageId,
            author: { role: 'user' },
            content: {
              content_type: 'text',
              parts: [prompt],
            },
          },
        ],
        parent_message_id: parentMessageId,
        model: this.currentModel,
        timezone_offset_min: new Date().getTimezoneOffset(),
        history_and_training_disabled: true,
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
    let lastContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data) as {
              message?: {
                content?: {
                  parts?: string[];
                };
              };
            };

            const parts = event.message?.content?.parts;
            if (parts && parts.length > 0) {
              const newContent = parts.join('');
              // Only send the new portion as a chunk
              if (newContent.length > lastContent.length) {
                const chunk = newContent.slice(lastContent.length);
                onChunk(chunk);
                lastContent = newContent;
              }
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

export function createChatGPTOAuthProvider(
  config?: AuthProvider
): ChatGPTOAuthProvider {
  return new ChatGPTOAuthProvider(config);
}

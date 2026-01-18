/**
 * ChatGPT Subscription Provider
 * 
 * Implements translation using ChatGPT Plus subscription.
 * Uses session-based authentication (experimental, may violate ToS).
 * 
 * WARNING: This feature may violate OpenAI's Terms of Service.
 * Users must accept the disclaimer before using this provider.
 * 
 * @see specs/001-ai-subtitle-translator/contracts/translation-provider.md
 * @see FR-008: ChatGPT Plus Subscription Authentication
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
  ProviderError,
} from './types';
import { TRANSLATION_CONFIG } from '../utils/constants';

// ============================================================================
// Types
// ============================================================================

// ChatGPT API types - kept for future implementation
// interface ChatGPTConversation {
//   conversation_id: string;
//   title: string;
//   create_time: number;
// }

// interface ChatGPTMessage {
//   id: string;
//   message: {
//     id: string;
//     author: { role: string };
//     content: {
//       content_type: string;
//       parts: string[];
//     };
//   };
// }

interface ChatGPTStreamMessage {
  message?: {
    content?: {
      parts?: string[];
    };
  };
  error?: string;
}

// ============================================================================
// Constants
// ============================================================================

const CHATGPT_BASE_URL = 'https://chat.openai.com';
const API_PATHS = {
  session: '/api/auth/session',
  conversations: '/backend-api/conversations',
  chat: '/backend-api/conversation',
};

// ============================================================================
// ChatGPT Subscription Provider
// ============================================================================

export class ChatGPTSubscriptionProvider implements TranslationProvider {
  readonly type: ProviderType = 'chatgpt-subscription';
  readonly displayName = 'ChatGPT Plus (訂閱)';
  
  readonly availableModels: ModelInfo[] = [
    {
      id: 'gpt-4',
      name: 'GPT-4',
      contextWindow: 128000,
      maxOutputTokens: 8192,
      inputCostPer1M: 0, // Subscription
      outputCostPer1M: 0,
      recommended: true,
    },
    {
      id: 'gpt-4o',
      name: 'GPT-4o',
      contextWindow: 128000,
      maxOutputTokens: 16384,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      recommended: false,
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
  ];
  
  private accessToken: string | null = null;
  private currentModel = 'gpt-4';
  
  constructor(config?: AuthProvider) {
    if (config?.credentials?.type === 'subscription') {
      this.accessToken = config.credentials.encryptedSessionToken;
    }
  }
  
  /**
   * Set access token
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }
  
  /**
   * Validate credentials
   */
  async validateCredentials(): Promise<ValidationResult> {
    if (!this.accessToken) {
      return {
        valid: false,
        error: {
          code: 'INVALID_KEY',
          message: 'No access token configured',
        },
      };
    }
    
    try {
      const session = await this.getSession();
      
      if (!session?.accessToken) {
        return {
          valid: false,
          error: {
            code: 'INVALID_KEY',
            message: 'Unable to access ChatGPT - session may be expired',
          },
        };
      }
      
      this.accessToken = session.accessToken;
      
      return {
        valid: true,
        accountInfo: {
          tier: 'ChatGPT Plus',
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
    if (!this.accessToken) {
      throw this.createError('AUTHENTICATION_FAILED', 'No access token configured');
    }
    
    // Build translation prompt
    const prompt = this.buildTranslationPrompt(request);
    
    // Send message
    const response = await this.sendMessage(prompt);
    
    // Parse response
    const translatedCues = this.parseTranslationResponse(response, request.cues);
    
    // Build context
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
   * Translate with streaming
   */
  async translateStream(
    request: TranslationRequest,
    onProgress: (progress: StreamProgress) => void
  ): Promise<TranslationResult> {
    if (!this.accessToken) {
      throw this.createError('AUTHENTICATION_FAILED', 'No access token configured');
    }
    
    const prompt = this.buildTranslationPrompt(request);
    
    let fullResponse = '';
    let lastProgress = 0;
    
    await this.streamMessage(prompt, (chunk) => {
      fullResponse += chunk;
      
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
   * Get rate limit status
   */
  async getRateLimitStatus(): Promise<RateLimitStatus> {
    return {
      requestsRemaining: -1,
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
  
  private async getSession(): Promise<{ accessToken: string } | null> {
    try {
      const response = await fetch(`${CHATGPT_BASE_URL}${API_PATHS.session}`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json() as { accessToken?: string };
      return data.accessToken ? { accessToken: data.accessToken } : null;
    } catch {
      return null;
    }
  }
  
  private async sendMessage(message: string): Promise<string> {
    const messageId = crypto.randomUUID();
    const parentMessageId = crypto.randomUUID();
    
    const response = await fetch(`${CHATGPT_BASE_URL}${API_PATHS.chat}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        action: 'next',
        messages: [
          {
            id: messageId,
            author: { role: 'user' },
            content: {
              content_type: 'text',
              parts: [message],
            },
          },
        ],
        parent_message_id: parentMessageId,
        model: this.currentModel,
        timezone_offset_min: new Date().getTimezoneOffset(),
      }),
    });
    
    if (!response.ok) {
      throw this.createError('SERVICE_UNAVAILABLE', 'Failed to send message to ChatGPT');
    }
    
    // Parse streaming response
    const text = await response.text();
    const lines = text.split('\n');
    let finalResponse = '';
    
    for (const line of lines) {
      if (line.startsWith('data: ') && !line.includes('[DONE]')) {
        try {
          const data = JSON.parse(line.slice(6)) as ChatGPTStreamMessage;
          const parts = data.message?.content?.parts;
          if (parts && parts.length > 0) {
            finalResponse = parts.join('');
          }
        } catch {
          // Skip invalid JSON
        }
      }
    }
    
    return finalResponse;
  }
  
  private async streamMessage(
    message: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const messageId = crypto.randomUUID();
    const parentMessageId = crypto.randomUUID();
    
    const response = await fetch(`${CHATGPT_BASE_URL}${API_PATHS.chat}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        action: 'next',
        messages: [
          {
            id: messageId,
            author: { role: 'user' },
            content: {
              content_type: 'text',
              parts: [message],
            },
          },
        ],
        parent_message_id: parentMessageId,
        model: this.currentModel,
        stream: true,
      }),
    });
    
    if (!response.ok) {
      throw this.createError('SERVICE_UNAVAILABLE', 'Failed to stream message');
    }
    
    const reader = response.body?.getReader();
    if (!reader) {
      throw this.createError('SERVICE_UNAVAILABLE', 'No response body');
    }
    
    const decoder = new TextDecoder();
    let previousContent = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = decoder.decode(value);
      const lines = text.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ') && !line.includes('[DONE]')) {
          try {
            const data = JSON.parse(line.slice(6)) as ChatGPTStreamMessage;
            const parts = data.message?.content?.parts;
            if (parts && parts.length > 0) {
              const currentContent = parts.join('');
              const newContent = currentContent.slice(previousContent.length);
              if (newContent) {
                onChunk(newContent);
              }
              previousContent = currentContent;
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
1. Return ONLY valid JSON array with the same structure
2. Preserve the exact index numbers
3. Use natural, conversational language appropriate for spoken dialogue
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
    
    prompt += `INPUT SUBTITLES:\n\`\`\`json\n${cuesJson}\n\`\`\`\n\nOutput ONLY the translated JSON array:`;
    
    return prompt;
  }
  
  private parseTranslationResponse(response: string, originalCues: TranslationRequest['cues']): TranslatedCue[] {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
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
    const lines = response.split('\n').filter(l => l.trim());
    const result: TranslatedCue[] = [];
    
    for (let i = 0; i < originalCues.length; i++) {
      result.push({
        index: originalCues[i].index,
        translatedText: lines[i] || originalCues[i].text,
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

export function createChatGPTSubscriptionProvider(
  config?: AuthProvider
): ChatGPTSubscriptionProvider {
  return new ChatGPTSubscriptionProvider(config);
}

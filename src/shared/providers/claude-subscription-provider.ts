/**
 * Claude Subscription Provider
 * 
 * Implements translation using Claude Pro subscription.
 * Uses session-based authentication (experimental, may violate ToS).
 * 
 * WARNING: This feature may violate Anthropic's Terms of Service.
 * Users must accept the disclaimer before using this provider.
 * 
 * @see specs/001-ai-subtitle-translator/contracts/translation-provider.md
 * @see FR-007: Claude Pro Subscription Authentication
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

// ============================================================================
// Types
// ============================================================================

interface ClaudeConversation {
  uuid: string;
  name: string;
  created_at: string;
}

// ClaudeMessage type - kept for future implementation
// interface ClaudeMessage {
//   uuid: string;
//   text: string;
//   sender: 'human' | 'assistant';
//   created_at: string;
// }

interface ClaudeStreamEvent {
  completion?: string;
  stop_reason?: string;
  model?: string;
}

// ============================================================================
// Constants
// ============================================================================

const CLAUDE_BASE_URL = 'https://claude.ai';
const API_PATHS = {
  organizations: '/api/organizations',
  conversations: '/api/organizations/{orgId}/chat_conversations',
  chat: '/api/organizations/{orgId}/chat_conversations/{conversationId}/completion',
};

// ============================================================================
// Claude Subscription Provider
// ============================================================================

export class ClaudeSubscriptionProvider implements TranslationProvider {
  readonly type: ProviderType = 'claude-subscription';
  readonly displayName = 'Claude Pro (訂閱)';
  
  readonly availableModels: ModelInfo[] = [
    {
      id: 'claude-3-opus-20240229',
      name: 'Claude 3 Opus',
      contextWindow: 200000,
      maxOutputTokens: 4096,
      inputCostPer1M: 0, // Subscription - no per-token cost
      outputCostPer1M: 0,
      recommended: false,
    },
    {
      id: 'claude-3-sonnet-20240229',
      name: 'Claude 3 Sonnet',
      contextWindow: 200000,
      maxOutputTokens: 4096,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      recommended: true,
    },
    {
      id: 'claude-3-haiku-20240307',
      name: 'Claude 3 Haiku',
      contextWindow: 200000,
      maxOutputTokens: 4096,
      inputCostPer1M: 0,
      outputCostPer1M: 0,
      recommended: false,
    },
  ];
  
  private sessionToken: string | null = null;
  private organizationId: string | null = null;
  private currentModel = 'claude-3-sonnet-20240229';
  
  constructor(config?: AuthProvider) {
    if (config?.credentials?.type === 'subscription') {
      this.sessionToken = config.credentials.encryptedSessionToken;
    }
  }
  
  /**
   * Set session token
   */
  setSessionToken(token: string): void {
    this.sessionToken = token;
  }
  
  /**
   * Validate credentials by testing API access
   */
  async validateCredentials(): Promise<ValidationResult> {
    if (!this.sessionToken) {
      return {
        valid: false,
        error: {
          code: 'INVALID_KEY',
          message: 'No session token configured',
        },
      };
    }
    
    try {
      // Try to fetch organizations to validate session
      const orgId = await this.getOrganizationId();
      
      if (!orgId) {
        return {
          valid: false,
          error: {
            code: 'INVALID_KEY',
            message: 'Unable to access Claude - session may be expired',
          },
        };
      }
      
      return {
        valid: true,
        accountInfo: {
          tier: 'Claude Pro',
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
    if (!this.sessionToken) {
      throw this.createError('AUTHENTICATION_FAILED', 'No session token configured');
    }
    
    const orgId = await this.getOrganizationId();
    if (!orgId) {
      throw this.createError('AUTHENTICATION_FAILED', 'Unable to get organization ID');
    }
    
    // Create a new conversation for this translation
    const conversationId = await this.createConversation(orgId);
    
    try {
      // Build translation prompt
      const prompt = this.buildTranslationPrompt(request);
      
      // Send message and get response
      const response = await this.sendMessage(orgId, conversationId, prompt);
      
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
          inputTokens: 0, // Not available for subscription
          outputTokens: 0,
        },
        warnings: [],
      };
    } finally {
      // Cleanup: Delete conversation after use
      await this.deleteConversation(orgId, conversationId).catch(() => {
        // Ignore cleanup errors
      });
    }
  }
  
  /**
   * Translate with streaming (progress updates)
   */
  async translateStream(
    request: TranslationRequest,
    onProgress: (progress: StreamProgress) => void
  ): Promise<TranslationResult> {
    if (!this.sessionToken) {
      throw this.createError('AUTHENTICATION_FAILED', 'No session token configured');
    }
    
    const orgId = await this.getOrganizationId();
    if (!orgId) {
      throw this.createError('AUTHENTICATION_FAILED', 'Unable to get organization ID');
    }
    
    const conversationId = await this.createConversation(orgId);
    
    try {
      const prompt = this.buildTranslationPrompt(request);
      
      // Stream the response
      let fullResponse = '';
      let lastProgress = 0;
      
      await this.streamMessage(orgId, conversationId, prompt, (chunk) => {
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
    } finally {
      await this.deleteConversation(orgId, conversationId).catch(() => {});
    }
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
  
  private async getOrganizationId(): Promise<string | null> {
    if (this.organizationId) {
      return this.organizationId;
    }
    
    try {
      const response = await this.fetchWithAuth(
        `${CLAUDE_BASE_URL}${API_PATHS.organizations}`
      );
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json() as Array<{ uuid: string; name: string }>;
      if (data.length > 0) {
        this.organizationId = data[0].uuid;
        return this.organizationId;
      }
      
      return null;
    } catch {
      return null;
    }
  }
  
  private async createConversation(orgId: string): Promise<string> {
    const url = API_PATHS.conversations.replace('{orgId}', orgId);
    
    const response = await this.fetchWithAuth(`${CLAUDE_BASE_URL}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Subtitle Translation ${new Date().toISOString()}`,
        uuid: crypto.randomUUID(),
      }),
    });
    
    if (!response.ok) {
      throw this.createError('SERVICE_UNAVAILABLE', 'Failed to create conversation');
    }
    
    const data = await response.json() as ClaudeConversation;
    return data.uuid;
  }
  
  private async deleteConversation(orgId: string, conversationId: string): Promise<void> {
    const url = API_PATHS.conversations.replace('{orgId}', orgId) + `/${conversationId}`;
    
    await this.fetchWithAuth(`${CLAUDE_BASE_URL}${url}`, {
      method: 'DELETE',
    });
  }
  
  private async sendMessage(orgId: string, conversationId: string, message: string): Promise<string> {
    const url = API_PATHS.chat
      .replace('{orgId}', orgId)
      .replace('{conversationId}', conversationId);
    
    const response = await this.fetchWithAuth(`${CLAUDE_BASE_URL}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: message,
        model: this.currentModel,
      }),
    });
    
    if (!response.ok) {
      throw this.createError('SERVICE_UNAVAILABLE', 'Failed to send message');
    }
    
    const data = await response.json() as { completion: string };
    return data.completion;
  }
  
  private async streamMessage(
    orgId: string,
    conversationId: string,
    message: string,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const url = API_PATHS.chat
      .replace('{orgId}', orgId)
      .replace('{conversationId}', conversationId);
    
    const response = await this.fetchWithAuth(`${CLAUDE_BASE_URL}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({
        prompt: message,
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
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const text = decoder.decode(value);
      const lines = text.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6)) as ClaudeStreamEvent;
            if (event.completion) {
              onChunk(event.completion);
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  }
  
  private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
    return fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        ...options.headers,
        'Cookie': this.sessionToken ? `sessionKey=${this.sessionToken}` : '',
      },
    });
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

export function createClaudeSubscriptionProvider(
  config?: AuthProvider
): ClaudeSubscriptionProvider {
  return new ClaudeSubscriptionProvider(config);
}

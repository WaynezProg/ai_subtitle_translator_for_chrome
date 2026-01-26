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
import { getLanguageDisplayName } from '../utils/helpers';
import { createLogger } from '../utils/logger';

const log = createLogger('ChatGPTOAuthProvider');
import {
  getValidChatGPTToken,
  validateChatGPTToken,
  storeChatGPTTokens,
  clearChatGPTTokens,
  launchChatGPTOAuthFlow,
  getStoredChatGPTTokens,
  refreshChatGPTToken,
  type ChatGPTOAuthTokens,
} from './chatgpt-oauth';

// ============================================================================
// Constants
// ============================================================================

// ChatGPT OAuth tokens work with ChatGPT backend-api (Codex endpoint)
// Reference: opencode-openai-codex-auth uses chatgpt.com/backend-api
// Note: Both chatgpt.com and chat.openai.com work, but chatgpt.com is preferred for OAuth tokens
// The /conversation endpoint is the web UI endpoint, not the official /v1/responses API
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
    // Get fresh token right before API call to ensure it's still valid
    // Token may expire between provider creation and actual API call
    const token = await this.ensureValidToken();
    
    // Build translation prompt
    const prompt = this.buildTranslationPrompt(request);
    
    // Send message and get response using OpenAI API
    // sendChatCompletion will handle token refresh and retry if needed
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
    // Get fresh token right before API call to ensure it's still valid
    // Token may expire between provider creation and actual API call
    const token = await this.ensureValidToken();
    const prompt = this.buildTranslationPrompt(request);
    
    // For streaming, we'll use the SSE endpoint
    // streamChatCompletion will handle token refresh and retry if needed
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
    log.debug('ensureValidToken called...');
    const token = await getValidChatGPTToken();

    if (!token) {
      log.error('getValidChatGPTToken returned null - no valid token available');
      throw this.createError('AUTHENTICATION_FAILED', 'Not authenticated. Please log in with ChatGPT.');
    }

    log.debug(`Got valid token (first 20 chars): ${token.substring(0, 20)}...`);
    this.accessToken = token;
    return token;
  }
  
  /**
   * Send a chat completion request using ChatGPT backend-api
   * Uses the conversation endpoint which supports the OAuth token
   * Automatically refreshes token if expired (401/403)
   * 
   * Reference: opencode-openai-codex-auth pattern
   * Uses ChatGPT web UI's conversation endpoint format
   */
  private async sendChatCompletion(token: string, prompt: string, retryCount = 0): Promise<string> {
    // Generate unique IDs for the conversation
    const messageId = this.generateUUID();
    const parentMessageId = this.generateUUID();

    const requestBody = {
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
    };

    const url = `${CHATGPT_BACKEND_API}/conversation`;
    log.debug(`Sending request to ${url}`, {
      model: this.currentModel,
      messageLength: prompt.length,
      retryCount,
      hasToken: !!token,
      messageId,
      parentMessageId,
      requestBody: {
        action: requestBody.action,
        model: requestBody.model,
        messageCount: requestBody.messages.length,
      },
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/event-stream',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify(requestBody),
    });

    log.debug(`Response received: status=${response.status}, ok=${response.ok}`, {
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error(`API error: status=${response.status}, retryCount=${retryCount}`, {
        error: errorText.substring(0, 500),
        url,
        requestBody: {
          action: requestBody.action,
          model: requestBody.model,
        },
      });

      // Check for "Unusual activity" error - this is NOT a token issue
      // Do NOT clear tokens or retry in this case
      if (errorText.includes('Unusual activity') || errorText.includes('unusual activity')) {
        log.error('ChatGPT detected unusual activity - this is a rate limit/security issue, not a token issue');
        throw this.createError(
          'RATE_LIMITED',
          'ChatGPT 偵測到異常活動，請稍後再試。這可能是因為短時間內發送太多請求。'
        );
      }

      // Check for other known non-token errors
      if (errorText.includes('capacity') || errorText.includes('overloaded')) {
        throw this.createError('SERVICE_UNAVAILABLE', 'ChatGPT 服務目前過載，請稍後再試。');
      }

      // Handle token expiration - try to refresh and retry once
      // Reference: opencode pattern - refresh on 401/403 and retry
      // Only do this for actual auth errors, not for "unusual activity"
      if ((response.status === 401 || response.status === 403) && retryCount === 0) {
        // Check if it's actually an auth error (not unusual activity which we handled above)
        const isAuthError = errorText.includes('unauthorized') || 
                           errorText.includes('invalid_token') ||
                           errorText.includes('token') ||
                           errorText.includes('authentication') ||
                           errorText.includes('expired');
        
        if (isAuthError) {
          log.debug('Token expired (401/403), attempting refresh...');

          try {
            // Get stored tokens
            const storedTokens = await getStoredChatGPTTokens();
            if (!storedTokens?.refreshToken) {
              log.warn('No refresh token available, cannot refresh');
              throw this.createError('AUTHENTICATION_FAILED', 'TOKEN_EXPIRED: No refresh token available. Please re-authenticate.');
            }

            // Refresh token using refresh token
            log.debug('Refreshing token...');
            const newTokens = await refreshChatGPTToken(storedTokens.refreshToken);
            await storeChatGPTTokens(newTokens);

            // Update instance token
            this.accessToken = newTokens.accessToken;

            log.debug('Token refreshed successfully, retrying request with new token...');

            // Retry with new token (increment retryCount to prevent infinite loops)
            return await this.sendChatCompletion(newTokens.accessToken, prompt, retryCount + 1);
          } catch (refreshError) {
            log.error('Token refresh failed', { error: refreshError });
            // If refresh failed, clear tokens to force re-authentication
            await clearChatGPTTokens();
            throw this.createError('AUTHENTICATION_FAILED', 'TOKEN_EXPIRED: Refresh failed. Please re-authenticate.');
          }
        } else {
          // 403 but not an auth error - don't retry or clear tokens
          log.warn('Got 403 but not an auth error, not retrying');
          throw this.createError('SERVICE_UNAVAILABLE', `ChatGPT 拒絕請求 (${response.status}): ${errorText.substring(0, 200)}`);
        }
      }

      // If we get 401/403 after retry, or if retryCount > 0, token refresh didn't help
      if (response.status === 401 || response.status === 403) {
        if (retryCount > 0) {
          log.error('Token still invalid after refresh, authentication required');
        }
        // Don't clear tokens here - the issue might be temporary
        throw this.createError('AUTHENTICATION_FAILED', `TOKEN_EXPIRED: HTTP ${response.status}`);
      }

      throw this.createError('SERVICE_UNAVAILABLE', `ChatGPT API error: ${response.status} - ${errorText}`);
    }

    // Parse the SSE response
    return await this.parseSSEResponse(response);
  }

  /**
   * Parse Server-Sent Events response from ChatGPT backend-api
   * ChatGPT may return errors in SSE stream even with 200 status code
   * 
   * Reference: ChatGPT backend-api returns SSE stream with data: lines
   * Each line contains JSON with message content or error information
   */
  private async parseSSEResponse(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw this.createError('SERVICE_UNAVAILABLE', 'No response body');
    }

    const decoder = new TextDecoder();
    let fullContent = '';
    let hasError = false;
    let errorMessage = '';
    let eventCount = 0;
    let lastMessageStatus: string | undefined;

    log.debug('Starting to parse SSE response...');

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        log.debug(`SSE stream ended. Parsed ${eventCount} events, content length: ${fullContent.length}`);
        break;
      }

      const text = decoder.decode(value, { stream: true });
      const lines = text.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            log.debug('Received [DONE] signal');
            continue;
          }

          try {
            const event = JSON.parse(data) as {
              error?: {
                message?: string;
                code?: string;
                type?: string;
              };
              message?: {
                content?: {
                  parts?: string[];
                };
                status?: string;
                metadata?: {
                  finish_details?: {
                    type?: string;
                  };
                };
              };
            };

            eventCount++;

            // Check for error in response (ChatGPT may return errors in SSE even with 200 status)
            if (event.error) {
              hasError = true;
              errorMessage = event.error.message || event.error.code || 'Unknown error';
              log.error('Error in SSE response', {
                error: event.error,
                eventNumber: eventCount,
              });
              // Continue parsing to get full error message, but mark as error
            }

            // Check message status for errors
            if (event.message?.status) {
              lastMessageStatus = event.message.status;
              if (event.message.status !== 'finished_successfully' && event.message.status !== 'in_progress') {
                hasError = true;
                errorMessage = `Message status: ${event.message.status}`;
                log.warn('Message status indicates error', {
                  status: event.message.status,
                  eventNumber: eventCount,
                });
              }
            }

            // Get the full content from the message
            const parts = event.message?.content?.parts;
            if (parts && parts.length > 0) {
              const newContent = parts.join('');
              if (newContent.length > fullContent.length) {
                fullContent = newContent;
              }
            }
          } catch (parseError) {
            // Skip invalid JSON, but log for debugging
            log.warn('Failed to parse SSE line', {
              line: line.substring(0, 200),
              error: parseError instanceof Error ? parseError.message : 'Unknown parse error',
            });
          }
        }
      }
    }

    log.debug('SSE parsing complete', {
      eventCount,
      contentLength: fullContent.length,
      lastStatus: lastMessageStatus,
      hasError,
    });

    // If we detected an error, throw it even though HTTP status was 200
    if (hasError) {
      log.error(`Error detected in SSE response: ${errorMessage}`);
      throw this.createError('SERVICE_UNAVAILABLE', `ChatGPT API error: ${errorMessage}`);
    }

    // If no content was received, that's also an error
    if (!fullContent || fullContent.trim().length === 0) {
      log.warn('Empty response from ChatGPT API', {
        eventCount,
        lastStatus: lastMessageStatus,
      });
      throw this.createError('SERVICE_UNAVAILABLE', 'Empty response from ChatGPT API');
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
   * Automatically refreshes token if expired (401/403)
   * 
   * Reference: opencode-openai-codex-auth pattern
   * Uses ChatGPT web UI's conversation endpoint format
   */
  private async streamChatCompletion(
    token: string,
    prompt: string,
    onChunk: (chunk: string) => void,
    retryCount = 0
  ): Promise<void> {
    const messageId = this.generateUUID();
    const parentMessageId = this.generateUUID();

    // Request body format based on ChatGPT backend-api conversation endpoint
    // Reference: ChatGPT web UI format - uses 'author' with 'role' nested
    // Note: ChatGPT backend-api uses 'author: { role: ... }' format, not 'role' directly
    const requestBody = {
      action: 'next',
      messages: [
        {
          id: messageId,
          author: { role: 'user' }, // ChatGPT backend-api uses nested author.role format
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
    };

    const url = `${CHATGPT_BACKEND_API}/conversation`;
    log.debug(`Streaming request to ${url}`, {
      model: this.currentModel,
      messageLength: prompt.length,
      retryCount,
      hasToken: !!token,
      messageId,
      parentMessageId,
      requestBody: {
        action: requestBody.action,
        model: requestBody.model,
        messageCount: requestBody.messages.length,
      },
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Accept': 'text/event-stream',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      body: JSON.stringify(requestBody),
    });

    log.debug(`Stream response received: status=${response.status}, ok=${response.ok}`);

    if (!response.ok) {
      const errorText = await response.text();
      log.error(`Stream API error: status=${response.status}, retryCount=${retryCount}`, {
        error: errorText.substring(0, 500),
        url,
        requestBody: {
          action: requestBody.action,
          model: requestBody.model,
        },
      });

      // Handle token expiration - try to refresh and retry once
      // Reference: opencode pattern - refresh on 401/403 and retry
      if ((response.status === 401 || response.status === 403) && retryCount === 0) {
        log.debug('Token expired during streaming (401/403), attempting refresh...');

        try {
          // Get stored tokens
          const storedTokens = await getStoredChatGPTTokens();
          if (!storedTokens?.refreshToken) {
            log.warn('No refresh token available, cannot refresh');
            throw this.createError('AUTHENTICATION_FAILED', 'TOKEN_EXPIRED: No refresh token available. Please re-authenticate.');
          }

          // Refresh token using refresh token
          log.debug('Refreshing token...');
          const newTokens = await refreshChatGPTToken(storedTokens.refreshToken);
          await storeChatGPTTokens(newTokens);

          // Update instance token
          this.accessToken = newTokens.accessToken;

          log.debug('Token refreshed successfully, retrying stream request with new token...');

          // Retry with new token (increment retryCount to prevent infinite loops)
          return await this.streamChatCompletion(newTokens.accessToken, prompt, onChunk, retryCount + 1);
        } catch (refreshError) {
          log.error('Token refresh failed', { error: refreshError });
          // If refresh failed, clear tokens to force re-authentication
          await clearChatGPTTokens();
          throw this.createError('AUTHENTICATION_FAILED', 'TOKEN_EXPIRED: Refresh failed. Please re-authenticate.');
        }
      }

      // If we get 401/403 after retry, or if retryCount > 0, token refresh didn't help
      if (response.status === 401 || response.status === 403) {
        if (retryCount > 0) {
          log.error('Token still invalid after refresh, authentication required');
        }
        throw this.createError('AUTHENTICATION_FAILED', `TOKEN_EXPIRED: HTTP ${response.status}`);
      }

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
              error?: {
                message?: string;
                code?: string;
                type?: string;
              };
              message?: {
                content?: {
                  parts?: string[];
                };
                status?: string;
              };
            };

            // Check for error in response (ChatGPT may return errors in SSE even with 200 status)
            if (event.error) {
              const errorMsg = event.error.message || event.error.code || 'Unknown error';
              log.error('Error in SSE stream', { error: event.error });
              throw this.createError('SERVICE_UNAVAILABLE', `ChatGPT API error: ${errorMsg}`);
            }

            // Check message status for errors
            if (event.message?.status && event.message.status !== 'finished_successfully') {
              log.warn(`Message status indicates error: ${event.message.status}`);
              throw this.createError('SERVICE_UNAVAILABLE', `ChatGPT API error: Message status ${event.message.status}`);
            }

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
          } catch (parseError) {
            // If it's a ProviderError, re-throw it
            if (parseError instanceof Error && 'code' in parseError) {
              throw parseError;
            }
            // Otherwise, skip invalid JSON but log for debugging
            log.warn(`Failed to parse SSE line: ${line.substring(0, 100)}`);
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
    
    // Use full language names for clarity in prompts
    const sourceLangName = getLanguageDisplayName(request.sourceLanguage);
    const targetLangName = getLanguageDisplayName(request.targetLanguage);

    let prompt = `You are a professional subtitle translator. Translate the following subtitles from ${sourceLangName} to ${targetLangName}.

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
    // Check if response contains error indicators
    const errorIndicators = [
      /error/i,
      /failed/i,
      /invalid/i,
      /unauthorized/i,
      /forbidden/i,
      /rate limit/i,
      /quota/i,
      /exceeded/i,
    ];
    
    const isErrorResponse = errorIndicators.some(pattern => pattern.test(response));
    if (isErrorResponse && !response.includes('[') && !response.includes('{')) {
      // Response looks like an error message, not JSON
      log.error(`Response appears to be an error: ${response.substring(0, 200)}`);
      throw this.createError('SERVICE_UNAVAILABLE', `ChatGPT API returned error: ${response.substring(0, 200)}`);
    }
    
    // Extract JSON from response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      // Check if response is empty or just whitespace
      if (!response.trim() || response.trim().length === 0) {
        log.error('Empty response from ChatGPT');
        throw this.createError('SERVICE_UNAVAILABLE', 'Empty response from ChatGPT API');
      }

      // Fallback: Try to parse line by line
      log.warn('No JSON array found in response, using fallback parsing');
      return this.parseLineByLine(response, originalCues);
    }
    
    try {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{ index: number; text: string }>;
      
      // Validate parsed result
      if (!Array.isArray(parsed)) {
        log.error(`Parsed response is not an array: ${typeof parsed}`);
        throw this.createError('SERVICE_UNAVAILABLE', 'Invalid response format from ChatGPT API');
      }

      // Check if we got the expected number of cues
      if (parsed.length !== originalCues.length) {
        log.warn(`Response has ${parsed.length} cues, expected ${originalCues.length}`);
      }

      // Validate each item has required fields
      for (const item of parsed) {
        if (typeof item.index !== 'number' || typeof item.text !== 'string') {
          log.error('Invalid cue format', { item });
          throw this.createError('SERVICE_UNAVAILABLE', 'Invalid response format from ChatGPT API');
        }
      }
      
      return parsed.map(item => ({
        index: item.index,
        translatedText: item.text,
      }));
    } catch (parseError) {
      // If it's a ProviderError, re-throw it
      if (parseError instanceof Error && 'code' in parseError) {
        throw parseError;
      }

      log.error('Failed to parse JSON response', { error: parseError });
      log.warn(`Response content: ${response.substring(0, 500)}`);

      // Fallback: Try to parse line by line
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

/**
 * OpenAI Tool Provider
 *
 * OpenAI API implementation with Function Calling (Tool) support.
 * Based on opencode's implementation pattern.
 *
 * @see https://platform.openai.com/docs/guides/function-calling
 */

import type {
  BaseTool,
  ToolCall,
  ToolResult,
  ToolTokenUsage,
  ProviderToolResponse,
  ProviderStreamEvent,
  FinishReason,
  ChatMessage,
} from '../types/tools';

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const MAX_RETRIES = 8;

// ============================================================================
// Types
// ============================================================================

export interface OpenAIToolProviderOptions {
  /** API key */
  apiKey: string;

  /** Model to use (e.g., 'gpt-4o', 'gpt-4o-mini') */
  model: string;

  /** Base URL (default: https://api.openai.com/v1) */
  baseUrl?: string;

  /** Maximum tokens for response */
  maxTokens?: number;

  /** System message/prompt */
  systemMessage?: string;

  /** Extra headers to include */
  extraHeaders?: Record<string, string>;

  /** Reasoning effort for reasoning models (low, medium, high) */
  reasoningEffort?: 'low' | 'medium' | 'high';
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | OpenAIContentPart[];
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

interface OpenAIChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
    };
  };
}

// ============================================================================
// OpenAI Tool Provider
// ============================================================================

export class OpenAIToolProvider {
  private options: Required<
    Pick<OpenAIToolProviderOptions, 'apiKey' | 'model' | 'baseUrl' | 'maxTokens'>
  > &
    OpenAIToolProviderOptions;

  constructor(opts: OpenAIToolProviderOptions) {
    this.options = {
      ...opts,
      baseUrl: opts.baseUrl || DEFAULT_BASE_URL,
      maxTokens: opts.maxTokens || 16384,
    };
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Send messages and get a response (non-streaming)
   */
  async send(
    messages: ChatMessage[],
    tools: BaseTool[] = []
  ): Promise<ProviderToolResponse> {
    const openaiMessages = this.convertMessages(messages);
    const openaiTools = this.convertTools(tools);
    const params = this.prepareParams(openaiMessages, openaiTools);

    let attempts = 0;
    while (true) {
      attempts++;

      const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const shouldRetry = await this.handleError(attempts, response);
        if (shouldRetry.retry) {
          await this.sleep(shouldRetry.waitMs);
          continue;
        }
        throw shouldRetry.error;
      }

      const data = (await response.json()) as OpenAIChatCompletionResponse;
      return this.parseResponse(data);
    }
  }

  /**
   * Send messages and stream the response
   */
  async *stream(
    messages: ChatMessage[],
    tools: BaseTool[] = []
  ): AsyncGenerator<ProviderStreamEvent> {
    const openaiMessages = this.convertMessages(messages);
    const openaiTools = this.convertTools(tools);
    const params = {
      ...this.prepareParams(openaiMessages, openaiTools),
      stream: true,
      stream_options: { include_usage: true },
    };

    let attempts = 0;
    while (true) {
      attempts++;

      const response = await fetch(`${this.options.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const shouldRetry = await this.handleError(attempts, response);
        if (shouldRetry.retry) {
          yield {
            type: 'warning',
            content: `Rate limited, retrying (attempt ${attempts}/${MAX_RETRIES})...`,
          };
          await this.sleep(shouldRetry.waitMs);
          continue;
        }
        yield { type: 'error', error: shouldRetry.error };
        return;
      }

      // Process SSE stream
      const reader = response.body?.getReader();
      if (!reader) {
        yield { type: 'error', error: new Error('No response body') };
        return;
      }

      const decoder = new TextDecoder();
      let currentContent = '';
      const toolCalls: Map<number, ToolCall> = new Map();
      let usage: ToolTokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
      };
      let finishReason: FinishReason = 'unknown';

      try {
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const chunk = JSON.parse(data) as OpenAIStreamChunk;

              for (const choice of chunk.choices) {
                // Content delta
                if (choice.delta.content) {
                  currentContent += choice.delta.content;
                  yield {
                    type: 'content_delta',
                    content: choice.delta.content,
                  };
                }

                // Tool calls
                if (choice.delta.tool_calls) {
                  for (const tc of choice.delta.tool_calls) {
                    const existing = toolCalls.get(tc.index);

                    if (tc.id) {
                      // New tool call
                      const newCall: ToolCall = {
                        id: tc.id,
                        name: tc.function?.name || '',
                        input: tc.function?.arguments || '',
                        type: 'function',
                        finished: false,
                      };
                      toolCalls.set(tc.index, newCall);
                      yield { type: 'tool_use_start', toolCall: newCall };
                    } else if (existing) {
                      // Delta to existing tool call
                      if (tc.function?.arguments) {
                        existing.input += tc.function.arguments;
                        yield { type: 'tool_use_delta', toolCall: existing };
                      }
                    }
                  }
                }

                // Finish reason
                if (choice.finish_reason) {
                  finishReason = this.mapFinishReason(choice.finish_reason);

                  // Mark tool calls as finished
                  if (finishReason === 'tool_calls') {
                    for (const tc of toolCalls.values()) {
                      tc.finished = true;
                      yield { type: 'tool_use_stop', toolCall: tc };
                    }
                  }
                }
              }

              // Usage (sent with final chunk when stream_options.include_usage is true)
              if (chunk.usage) {
                const cachedTokens =
                  chunk.usage.prompt_tokens_details?.cached_tokens || 0;
                usage = {
                  inputTokens: chunk.usage.prompt_tokens - cachedTokens,
                  outputTokens: chunk.usage.completion_tokens,
                  cacheReadTokens: cachedTokens,
                };
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }

        // Emit complete event
        yield {
          type: 'complete',
          response: {
            content: currentContent,
            toolCalls: Array.from(toolCalls.values()),
            usage,
            finishReason,
          },
        };
      } finally {
        reader.releaseLock();
      }

      return;
    }
  }

  /**
   * Execute a tool loop: send message, execute tools, send results, repeat
   */
  async executeWithTools(
    messages: ChatMessage[],
    tools: BaseTool[],
    onEvent?: (event: ProviderStreamEvent) => void,
    maxIterations = 10
  ): Promise<ProviderToolResponse> {
    const conversationMessages = [...messages];
    let iterations = 0;
    let finalResponse: ProviderToolResponse | null = null;

    while (iterations < maxIterations) {
      iterations++;

      // Stream the response
      let currentResponse: ProviderToolResponse | null = null;

      for await (const event of this.stream(conversationMessages, tools)) {
        if (onEvent) {
          onEvent(event);
        }

        if (event.type === 'complete' && event.response) {
          currentResponse = event.response;
        }

        if (event.type === 'error') {
          throw event.error;
        }
      }

      if (!currentResponse) {
        throw new Error('No response received');
      }

      finalResponse = currentResponse;

      // Check if there are tool calls to execute
      if (
        currentResponse.finishReason !== 'tool_calls' ||
        currentResponse.toolCalls.length === 0
      ) {
        break;
      }

      // Add assistant message with tool calls to conversation
      conversationMessages.push({
        role: 'assistant',
        content: currentResponse.content,
        toolCalls: currentResponse.toolCalls,
      });

      // Execute tools and collect results
      const toolResults: ToolResult[] = [];

      for (const toolCall of currentResponse.toolCalls) {
        const tool = tools.find((t) => t.info().name === toolCall.name);

        if (!tool) {
          toolResults.push({
            toolCallId: toolCall.id,
            content: `Error: Unknown tool "${toolCall.name}"`,
            isError: true,
          });
          continue;
        }

        try {
          const result = await tool.run(toolCall);
          toolResults.push({
            toolCallId: toolCall.id,
            content: result.content,
            isError: result.isError,
          });
        } catch (error) {
          toolResults.push({
            toolCallId: toolCall.id,
            content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            isError: true,
          });
        }
      }

      // Add tool results to conversation
      conversationMessages.push({
        role: 'tool',
        content: '',
        toolResults,
      });
    }

    if (!finalResponse) {
      throw new Error('No response after tool execution');
    }

    return finalResponse;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.options.apiKey}`,
    };

    if (this.options.extraHeaders) {
      Object.assign(headers, this.options.extraHeaders);
    }

    return headers;
  }

  private convertMessages(messages: ChatMessage[]): OpenAIMessage[] {
    const openaiMessages: OpenAIMessage[] = [];

    // Add system message if configured
    if (this.options.systemMessage) {
      openaiMessages.push({
        role: 'system',
        content: this.options.systemMessage,
      });
    }

    for (const msg of messages) {
      switch (msg.role) {
        case 'user':
          openaiMessages.push({
            role: 'user',
            content: msg.content,
          });
          break;

        case 'assistant':
          const assistantMsg: OpenAIMessage = {
            role: 'assistant',
          };

          if (msg.content) {
            assistantMsg.content = msg.content;
          }

          if (msg.toolCalls && msg.toolCalls.length > 0) {
            assistantMsg.tool_calls = msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: tc.input,
              },
            }));
          }

          openaiMessages.push(assistantMsg);
          break;

        case 'tool':
          if (msg.toolResults) {
            for (const result of msg.toolResults) {
              openaiMessages.push({
                role: 'tool',
                tool_call_id: result.toolCallId,
                content: result.content,
              });
            }
          }
          break;

        case 'system':
          openaiMessages.push({
            role: 'system',
            content: msg.content,
          });
          break;
      }
    }

    return openaiMessages;
  }

  private convertTools(tools: BaseTool[]): OpenAITool[] {
    return tools.map((tool) => {
      const info = tool.info();
      return {
        type: 'function' as const,
        function: {
          name: info.name,
          description: info.description,
          parameters: {
            type: 'object' as const,
            properties: info.parameters,
            required: info.required,
          },
        },
      };
    });
  }

  private prepareParams(
    messages: OpenAIMessage[],
    tools: OpenAITool[]
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {
      model: this.options.model,
      messages,
    };

    if (tools.length > 0) {
      params.tools = tools;
    }

    // Handle reasoning models (o1, o3, etc.)
    const isReasoningModel =
      this.options.model.startsWith('o1') ||
      this.options.model.startsWith('o3') ||
      this.options.model.startsWith('o4');

    if (isReasoningModel) {
      params.max_completion_tokens = this.options.maxTokens;

      if (this.options.reasoningEffort) {
        params.reasoning_effort = this.options.reasoningEffort;
      }
    } else {
      params.max_tokens = this.options.maxTokens;
    }

    return params;
  }

  private parseResponse(data: OpenAIChatCompletionResponse): ProviderToolResponse {
    const choice = data.choices[0];

    if (!choice) {
      throw new Error('No choices in response');
    }

    const content = choice.message.content || '';
    const toolCalls: ToolCall[] = (choice.message.tool_calls || []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: tc.function.arguments,
      type: 'function' as const,
      finished: true,
    }));

    const finishReason = this.mapFinishReason(choice.finish_reason);

    const cachedTokens = data.usage?.prompt_tokens_details?.cached_tokens || 0;
    const usage: ToolTokenUsage = {
      inputTokens: (data.usage?.prompt_tokens || 0) - cachedTokens,
      outputTokens: data.usage?.completion_tokens || 0,
      cacheReadTokens: cachedTokens,
    };

    return {
      content,
      toolCalls,
      usage,
      finishReason,
    };
  }

  private mapFinishReason(reason: string): FinishReason {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'length':
        return 'length';
      case 'tool_calls':
        return 'tool_calls';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'unknown';
    }
  }

  private async handleError(
    attempts: number,
    response: Response
  ): Promise<{ retry: boolean; waitMs: number; error?: Error }> {
    const status = response.status;

    // Non-retryable errors
    if (status !== 429 && status !== 500 && status !== 502 && status !== 503) {
      let errorMessage = `API error: ${status}`;
      try {
        const errorData = (await response.json()) as {
          error?: { message?: string };
        };
        if (errorData.error?.message) {
          errorMessage = errorData.error.message;
        }
      } catch {
        // Ignore parse error
      }
      return { retry: false, waitMs: 0, error: new Error(errorMessage) };
    }

    // Max retries exceeded
    if (attempts > MAX_RETRIES) {
      return {
        retry: false,
        waitMs: 0,
        error: new Error(`Maximum retry attempts reached (${MAX_RETRIES})`),
      };
    }

    // Calculate backoff with jitter
    let waitMs = 2000 * Math.pow(2, attempts - 1);
    waitMs += waitMs * 0.2 * Math.random(); // Add 20% jitter

    // Check Retry-After header
    const retryAfter = response.headers.get('Retry-After');
    if (retryAfter) {
      const retrySeconds = parseInt(retryAfter, 10);
      if (!isNaN(retrySeconds)) {
        waitMs = retrySeconds * 1000;
      }
    }

    return { retry: true, waitMs };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an OpenAI Tool Provider instance
 */
export function createOpenAIToolProvider(
  options: OpenAIToolProviderOptions
): OpenAIToolProvider {
  return new OpenAIToolProvider(options);
}

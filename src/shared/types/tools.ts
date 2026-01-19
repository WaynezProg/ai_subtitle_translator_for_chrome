/**
 * Tool/Function Calling type definitions for AI providers
 *
 * Based on OpenAI Function Calling API and compatible with:
 * - OpenAI Chat Completions API
 * - GitHub Copilot API
 * - Claude API (tool_use blocks)
 *
 * @see https://platform.openai.com/docs/guides/function-calling
 */

// ============================================================================
// Tool Definition Types
// ============================================================================

/**
 * JSON Schema for tool parameters
 * Simplified subset commonly used in function calling
 */
export interface ToolParameterSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  description?: string;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
  items?: ToolParameterProperty;
  enum?: string[];
}

export interface ToolParameterProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: ToolParameterProperty;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
}

/**
 * Tool information for registration
 * Compatible with OpenAI function definition
 */
export interface ToolInfo {
  /** Tool name (function name) */
  name: string;

  /** Human-readable description */
  description: string;

  /** Parameter schema (JSON Schema subset) */
  parameters: Record<string, ToolParameterProperty>;

  /** Required parameter names */
  required: string[];
}

/**
 * OpenAI-compatible function definition
 */
export interface FunctionDefinition {
  name: string;
  description?: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterProperty>;
    required?: string[];
  };
}

/**
 * OpenAI-compatible tool definition (wraps function)
 */
export interface ToolDefinition {
  type: 'function';
  function: FunctionDefinition;
}

// ============================================================================
// Tool Call Types (from AI response)
// ============================================================================

/**
 * Tool call requested by the AI model
 */
export interface ToolCall {
  /** Unique identifier for this tool call */
  id: string;

  /** Tool/function name to call */
  name: string;

  /** JSON string of arguments */
  input: string;

  /** Call type (always 'function' for now) */
  type: 'function';

  /** Whether the tool call is complete (for streaming) */
  finished: boolean;
}

/**
 * Result of executing a tool
 */
export interface ToolResult {
  /** ID of the tool call this result responds to */
  toolCallId: string;

  /** Result content (usually JSON string or text) */
  content: string;

  /** Whether the tool execution failed */
  isError?: boolean;

  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Tool response types
 */
export type ToolResponseType = 'text' | 'json' | 'image' | 'error';

/**
 * Structured tool response
 */
export interface ToolResponse {
  type: ToolResponseType;
  content: string;
  metadata?: string;
  isError: boolean;
}

// ============================================================================
// Tool Interface (for implementing tools)
// ============================================================================

/**
 * Context passed to tool execution
 */
export interface ToolContext {
  /** Current session ID */
  sessionId?: string;

  /** Current message ID */
  messageId?: string;

  /** Signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Base tool interface
 * All tools must implement this interface
 */
export interface BaseTool {
  /** Get tool information for registration */
  info(): ToolInfo;

  /** Execute the tool with given parameters */
  run(params: ToolCall, context?: ToolContext): Promise<ToolResponse>;
}

// ============================================================================
// Message Types with Tool Support
// ============================================================================

/**
 * Message roles in conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Finish reason from AI response
 */
export type FinishReason =
  | 'stop' // Normal completion
  | 'length' // Max tokens reached
  | 'tool_calls' // Tool use requested
  | 'content_filter' // Content filtered
  | 'end_turn' // End of turn
  | 'unknown';

/**
 * Chat message with tool support
 */
export interface ChatMessage {
  role: MessageRole;
  content: string;

  /** Tool calls (for assistant messages) */
  toolCalls?: ToolCall[];

  /** Tool results (for tool messages) */
  toolResults?: ToolResult[];
}

// ============================================================================
// Provider Response with Tools
// ============================================================================

/**
 * Token usage statistics
 */
export interface ToolTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}

/**
 * Provider response with tool support
 */
export interface ProviderToolResponse {
  /** Text content from the model */
  content: string;

  /** Tool calls requested by the model */
  toolCalls: ToolCall[];

  /** Token usage statistics */
  usage: ToolTokenUsage;

  /** Reason the model stopped generating */
  finishReason: FinishReason;
}

/**
 * Streaming event types
 */
export type StreamEventType =
  | 'content_start'
  | 'content_delta'
  | 'content_stop'
  | 'tool_use_start'
  | 'tool_use_delta'
  | 'tool_use_stop'
  | 'thinking_delta'
  | 'complete'
  | 'error'
  | 'warning';

/**
 * Streaming event from provider
 */
export interface ProviderStreamEvent {
  type: StreamEventType;

  /** Text content delta */
  content?: string;

  /** Thinking/reasoning content (for reasoning models) */
  thinking?: string;

  /** Complete response (for 'complete' event) */
  response?: ProviderToolResponse;

  /** Current tool call being streamed */
  toolCall?: ToolCall;

  /** Error (for 'error' event) */
  error?: Error;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert ToolInfo to OpenAI-compatible ToolDefinition
 */
export function toToolDefinition(info: ToolInfo): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: info.name,
      description: info.description,
      parameters: {
        type: 'object',
        properties: info.parameters,
        required: info.required,
      },
    },
  };
}

/**
 * Create a text response
 */
export function createTextResponse(content: string): ToolResponse {
  return {
    type: 'text',
    content,
    isError: false,
  };
}

/**
 * Create a JSON response
 */
export function createJsonResponse(data: unknown): ToolResponse {
  return {
    type: 'json',
    content: JSON.stringify(data),
    isError: false,
  };
}

/**
 * Create an error response
 */
export function createErrorResponse(message: string): ToolResponse {
  return {
    type: 'error',
    content: message,
    isError: true,
  };
}

/**
 * Parse tool call arguments from JSON string
 */
export function parseToolArguments<T = Record<string, unknown>>(
  input: string
): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    return null;
  }
}

/**
 * Check if finish reason indicates tool use
 */
export function isToolUseFinish(reason: FinishReason): boolean {
  return reason === 'tool_calls';
}

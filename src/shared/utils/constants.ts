/**
 * Application Constants
 * 
 * Centralized constants for the AI Subtitle Translator extension.
 */

// ============================================================================
// Extension Info
// ============================================================================

export const EXTENSION_NAME = 'AI Subtitle Translator';
export const EXTENSION_VERSION = '1.0.0';

// ============================================================================
// Storage Keys
// ============================================================================

export const STORAGE_KEYS = {
  /** Auth provider configuration */
  AUTH_PROVIDER: 'auth_provider',
  
  /** User preferences/settings */
  USER_SETTINGS: 'user_settings',
  
  /** Translation cache metadata */
  CACHE_METADATA: 'cache_metadata',
  
  /** ToS acceptance status */
  TOS_ACCEPTED: 'tos_accepted',
  
  /** Recent translations (for quick access) */
  RECENT_TRANSLATIONS: 'recent_translations',
} as const;

// ============================================================================
// Cache Configuration
// ============================================================================

export const CACHE_CONFIG = {
  /** Maximum number of cached translations */
  MAX_ENTRIES: 100,
  
  /** Cache entry TTL in milliseconds (30 days) */
  ENTRY_TTL_MS: 30 * 24 * 60 * 60 * 1000,
  
  /** IndexedDB database name */
  DB_NAME: 'ai-subtitle-translator-cache',
  
  /** IndexedDB store name */
  STORE_NAME: 'translations',
  
  /** Database version */
  DB_VERSION: 1,
} as const;

// ============================================================================
// Translation Configuration
// ============================================================================

export const TRANSLATION_CONFIG = {
  /** Maximum cues per translation chunk */
  CHUNK_SIZE: 50,
  
  /** Overlap cues for context continuity */
  CONTEXT_OVERLAP: 3,
  
  /** Maximum retries on failure */
  MAX_RETRIES: 3,
  
  /** Retry delay base (exponential backoff) */
  RETRY_DELAY_BASE_MS: 1000,
  
  /** Request timeout in milliseconds */
  REQUEST_TIMEOUT_MS: 60000,
  
  /** Maximum concurrent translation jobs */
  MAX_CONCURRENT_JOBS: 1,
} as const;

// ============================================================================
// API Endpoints
// ============================================================================

export const API_ENDPOINTS = {
  /** Claude API base URL */
  CLAUDE_API: 'https://api.anthropic.com/v1',
  
  /** OpenAI API base URL */
  OPENAI_API: 'https://api.openai.com/v1',
  
  /** Default Ollama endpoint */
  OLLAMA_DEFAULT: 'http://localhost:11434',
  
  /** Claude subscription (for OAuth) */
  CLAUDE_OAUTH_BASE: 'https://claude.ai',
  
  /** ChatGPT subscription (for OAuth) */
  CHATGPT_OAUTH_BASE: 'https://chat.openai.com',
} as const;

// ============================================================================
// Platform URL Patterns
// ============================================================================

export const PLATFORM_PATTERNS = {
  youtube: {
    watch: /^https?:\/\/(?:www\.)?youtube\.com\/watch/,
    embed: /^https?:\/\/(?:www\.)?youtube\.com\/embed\//,
    short: /^https?:\/\/youtu\.be\//,
  },
  netflix: {
    watch: /^https?:\/\/(?:www\.)?netflix\.com\/watch\//,
  },
  disney: {
    video: /^https?:\/\/(?:www\.)?disneyplus\.com\/video\//,
  },
  prime: {
    detail: /^https?:\/\/(?:www\.)?primevideo\.com\/detail\//,
    amazon: /^https?:\/\/(?:www\.)?amazon\.com\/gp\/video\//,
  },
} as const;

// ============================================================================
// Supported Languages
// ============================================================================

export const SUPPORTED_LANGUAGES = [
  { code: 'zh-TW', name: '繁體中文', nativeName: '繁體中文' },
  { code: 'zh-CN', name: '简体中文', nativeName: '简体中文' },
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'th', name: 'Thai', nativeName: 'ไทย' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt' },
] as const;

/** Default target language */
export const DEFAULT_TARGET_LANGUAGE = 'zh-TW';

// ============================================================================
// UI Constants
// ============================================================================

export const UI_CONSTANTS = {
  /** Default font size for subtitles */
  DEFAULT_FONT_SIZE: 28,
  
  /** Minimum font size */
  MIN_FONT_SIZE: 16,
  
  /** Maximum font size */
  MAX_FONT_SIZE: 48,
  
  /** Toast notification duration */
  TOAST_DURATION_MS: 3000,
  
  /** Progress update interval */
  PROGRESS_UPDATE_INTERVAL_MS: 100,
  
  /** Debounce delay for settings changes */
  SETTINGS_DEBOUNCE_MS: 500,
} as const;

// ============================================================================
// Event Names
// ============================================================================

export const EVENTS = {
  /** Subtitle detected by adapter */
  SUBTITLE_DETECTED: 'subtitle:detected',
  
  /** Translation started */
  TRANSLATION_STARTED: 'translation:started',
  
  /** Translation progress update */
  TRANSLATION_PROGRESS: 'translation:progress',
  
  /** Translation completed */
  TRANSLATION_COMPLETED: 'translation:completed',
  
  /** Translation error */
  TRANSLATION_ERROR: 'translation:error',
  
  /** Translation cancelled */
  TRANSLATION_CANCELLED: 'translation:cancelled',
  
  /** Settings changed */
  SETTINGS_CHANGED: 'settings:changed',
  
  /** Auth status changed */
  AUTH_CHANGED: 'auth:changed',
} as const;

// ============================================================================
// Type Exports
// ============================================================================

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];
export type EventName = typeof EVENTS[keyof typeof EVENTS];

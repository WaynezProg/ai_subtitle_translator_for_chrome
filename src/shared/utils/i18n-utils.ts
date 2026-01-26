/**
 * Internationalization (i18n) utilities
 * Provides language detection, locale formatting, and translation helpers
 */

// ============================================================================
// Types
// ============================================================================

export interface LanguageInfo {
  code: string;        // ISO 639-1 or 639-2 code
  name: string;        // English name
  nativeName: string;  // Name in native language
  direction: 'ltr' | 'rtl';
  region?: string;     // ISO 3166-1 alpha-2 region code
}

export interface LocaleOptions {
  style?: 'long' | 'short' | 'narrow';
  type?: 'language' | 'region' | 'script';
}

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export interface TranslationMessages {
  [key: string]: string | TranslationMessages;
}

// ============================================================================
// Language Database
// ============================================================================

const LANGUAGES: Record<string, LanguageInfo> = {
  'en': { code: 'en', name: 'English', nativeName: 'English', direction: 'ltr' },
  'en-US': { code: 'en-US', name: 'English (US)', nativeName: 'English (US)', direction: 'ltr', region: 'US' },
  'en-GB': { code: 'en-GB', name: 'English (UK)', nativeName: 'English (UK)', direction: 'ltr', region: 'GB' },
  'zh': { code: 'zh', name: 'Chinese', nativeName: '中文', direction: 'ltr' },
  'zh-CN': { code: 'zh-CN', name: 'Chinese (Simplified)', nativeName: '简体中文', direction: 'ltr', region: 'CN' },
  'zh-TW': { code: 'zh-TW', name: 'Chinese (Traditional)', nativeName: '繁體中文', direction: 'ltr', region: 'TW' },
  'zh-HK': { code: 'zh-HK', name: 'Chinese (Hong Kong)', nativeName: '繁體中文 (香港)', direction: 'ltr', region: 'HK' },
  'ja': { code: 'ja', name: 'Japanese', nativeName: '日本語', direction: 'ltr' },
  'ko': { code: 'ko', name: 'Korean', nativeName: '한국어', direction: 'ltr' },
  'es': { code: 'es', name: 'Spanish', nativeName: 'Español', direction: 'ltr' },
  'es-ES': { code: 'es-ES', name: 'Spanish (Spain)', nativeName: 'Español (España)', direction: 'ltr', region: 'ES' },
  'es-MX': { code: 'es-MX', name: 'Spanish (Mexico)', nativeName: 'Español (México)', direction: 'ltr', region: 'MX' },
  'fr': { code: 'fr', name: 'French', nativeName: 'Français', direction: 'ltr' },
  'fr-FR': { code: 'fr-FR', name: 'French (France)', nativeName: 'Français (France)', direction: 'ltr', region: 'FR' },
  'fr-CA': { code: 'fr-CA', name: 'French (Canada)', nativeName: 'Français (Canada)', direction: 'ltr', region: 'CA' },
  'de': { code: 'de', name: 'German', nativeName: 'Deutsch', direction: 'ltr' },
  'de-DE': { code: 'de-DE', name: 'German (Germany)', nativeName: 'Deutsch (Deutschland)', direction: 'ltr', region: 'DE' },
  'it': { code: 'it', name: 'Italian', nativeName: 'Italiano', direction: 'ltr' },
  'pt': { code: 'pt', name: 'Portuguese', nativeName: 'Português', direction: 'ltr' },
  'pt-BR': { code: 'pt-BR', name: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)', direction: 'ltr', region: 'BR' },
  'pt-PT': { code: 'pt-PT', name: 'Portuguese (Portugal)', nativeName: 'Português (Portugal)', direction: 'ltr', region: 'PT' },
  'ru': { code: 'ru', name: 'Russian', nativeName: 'Русский', direction: 'ltr' },
  'ar': { code: 'ar', name: 'Arabic', nativeName: 'العربية', direction: 'rtl' },
  'hi': { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', direction: 'ltr' },
  'th': { code: 'th', name: 'Thai', nativeName: 'ไทย', direction: 'ltr' },
  'vi': { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', direction: 'ltr' },
  'id': { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', direction: 'ltr' },
  'ms': { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', direction: 'ltr' },
  'nl': { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', direction: 'ltr' },
  'pl': { code: 'pl', name: 'Polish', nativeName: 'Polski', direction: 'ltr' },
  'tr': { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', direction: 'ltr' },
  'uk': { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', direction: 'ltr' },
  'cs': { code: 'cs', name: 'Czech', nativeName: 'Čeština', direction: 'ltr' },
  'sv': { code: 'sv', name: 'Swedish', nativeName: 'Svenska', direction: 'ltr' },
  'da': { code: 'da', name: 'Danish', nativeName: 'Dansk', direction: 'ltr' },
  'fi': { code: 'fi', name: 'Finnish', nativeName: 'Suomi', direction: 'ltr' },
  'no': { code: 'no', name: 'Norwegian', nativeName: 'Norsk', direction: 'ltr' },
  'el': { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', direction: 'ltr' },
  'he': { code: 'he', name: 'Hebrew', nativeName: 'עברית', direction: 'rtl' },
  'fa': { code: 'fa', name: 'Persian', nativeName: 'فارسی', direction: 'rtl' },
  'ur': { code: 'ur', name: 'Urdu', nativeName: 'اردو', direction: 'rtl' },
  'bn': { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', direction: 'ltr' },
  'ta': { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', direction: 'ltr' },
  'te': { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', direction: 'ltr' },
  'mr': { code: 'mr', name: 'Marathi', nativeName: 'मराठी', direction: 'ltr' },
  'gu': { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', direction: 'ltr' },
  'kn': { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', direction: 'ltr' },
  'ml': { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', direction: 'ltr' },
  'pa': { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', direction: 'ltr' },
  'hu': { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', direction: 'ltr' },
  'ro': { code: 'ro', name: 'Romanian', nativeName: 'Română', direction: 'ltr' },
  'bg': { code: 'bg', name: 'Bulgarian', nativeName: 'Български', direction: 'ltr' },
  'hr': { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', direction: 'ltr' },
  'sk': { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', direction: 'ltr' },
  'sl': { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina', direction: 'ltr' },
  'sr': { code: 'sr', name: 'Serbian', nativeName: 'Српски', direction: 'ltr' },
  'lt': { code: 'lt', name: 'Lithuanian', nativeName: 'Lietuvių', direction: 'ltr' },
  'lv': { code: 'lv', name: 'Latvian', nativeName: 'Latviešu', direction: 'ltr' },
  'et': { code: 'et', name: 'Estonian', nativeName: 'Eesti', direction: 'ltr' },
  'fil': { code: 'fil', name: 'Filipino', nativeName: 'Filipino', direction: 'ltr' },
  'sw': { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', direction: 'ltr' },
  'af': { code: 'af', name: 'Afrikaans', nativeName: 'Afrikaans', direction: 'ltr' },
  'ca': { code: 'ca', name: 'Catalan', nativeName: 'Català', direction: 'ltr' },
};

// ============================================================================
// Language Utilities
// ============================================================================

/**
 * Get language info by code
 */
export function getLanguageInfo(code: string): LanguageInfo | null {
  // Try exact match first
  if (LANGUAGES[code]) {
    return LANGUAGES[code];
  }

  // Try base language
  const baseCode = code.split('-')[0].toLowerCase();
  if (LANGUAGES[baseCode]) {
    return LANGUAGES[baseCode];
  }

  return null;
}

/**
 * Get language name by code
 */
export function getLanguageName(
  code: string,
  options?: { native?: boolean; locale?: string }
): string {
  const { native = false, locale } = options || {};

  // Try built-in database first
  const info = getLanguageInfo(code);
  if (info) {
    return native ? info.nativeName : info.name;
  }

  // Fall back to Intl API
  try {
    const displayNames = new Intl.DisplayNames([locale || 'en'], { type: 'language' });
    return displayNames.of(code) || code;
  } catch {
    return code;
  }
}

/**
 * Get all supported languages
 */
export function getSupportedLanguages(): LanguageInfo[] {
  return Object.values(LANGUAGES);
}

/**
 * Get languages by direction
 */
export function getLanguagesByDirection(direction: 'ltr' | 'rtl'): LanguageInfo[] {
  return Object.values(LANGUAGES).filter((lang) => lang.direction === direction);
}

/**
 * Check if language is RTL
 */
export function isRtlLanguage(code: string): boolean {
  const info = getLanguageInfo(code);
  return info?.direction === 'rtl';
}

/**
 * Get text direction for language
 */
export function getTextDirection(code: string): 'ltr' | 'rtl' {
  return isRtlLanguage(code) ? 'rtl' : 'ltr';
}

/**
 * Normalize language code to BCP 47 format
 */
export function normalizeLanguageCode(code: string): string {
  const parts = code.replace('_', '-').split('-');
  if (parts.length === 1) {
    return parts[0].toLowerCase();
  }
  if (parts.length === 2) {
    return `${parts[0].toLowerCase()}-${parts[1].toUpperCase()}`;
  }
  return code;
}

/**
 * Get base language code (without region)
 */
export function getBaseLanguageCode(code: string): string {
  return code.split('-')[0].toLowerCase();
}

/**
 * Check if two language codes are equivalent
 */
export function languagesMatch(
  code1: string,
  code2: string,
  options?: { strict?: boolean }
): boolean {
  const { strict = false } = options || {};

  const norm1 = normalizeLanguageCode(code1);
  const norm2 = normalizeLanguageCode(code2);

  if (strict) {
    return norm1 === norm2;
  }

  return getBaseLanguageCode(norm1) === getBaseLanguageCode(norm2);
}

// ============================================================================
// Browser/System Locale Detection
// ============================================================================

/**
 * Get browser's preferred language
 */
export function getBrowserLanguage(): string {
  if (typeof navigator !== 'undefined') {
    return navigator.language || (navigator as { userLanguage?: string }).userLanguage || 'en';
  }
  return 'en';
}

/**
 * Get browser's preferred languages in order of preference
 */
export function getBrowserLanguages(): string[] {
  if (typeof navigator !== 'undefined' && navigator.languages) {
    return [...navigator.languages];
  }
  return [getBrowserLanguage()];
}

/**
 * Find best matching language from available options
 */
export function findBestMatchingLanguage(
  preferred: string[],
  available: string[]
): string | null {
  const normalizedAvailable = available.map(normalizeLanguageCode);

  // First pass: exact match
  for (const pref of preferred) {
    const normPref = normalizeLanguageCode(pref);
    const exactMatch = normalizedAvailable.findIndex((a) => a === normPref);
    if (exactMatch !== -1) {
      return available[exactMatch];
    }
  }

  // Second pass: base language match
  for (const pref of preferred) {
    const basePref = getBaseLanguageCode(pref);
    const baseMatch = normalizedAvailable.findIndex(
      (a) => getBaseLanguageCode(a) === basePref
    );
    if (baseMatch !== -1) {
      return available[baseMatch];
    }
  }

  return null;
}

// ============================================================================
// Locale Formatting
// ============================================================================

/**
 * Format number for locale
 */
export function formatLocalizedNumber(
  value: number,
  locale: string,
  options?: Intl.NumberFormatOptions
): string {
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return value.toString();
  }
}

/**
 * Format currency for locale
 */
export function formatLocalizedCurrency(
  value: number,
  currency: string,
  locale: string
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

/**
 * Format date for locale
 */
export function formatLocalizedDate(
  date: Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

/**
 * Format time for locale
 */
export function formatLocalizedTime(
  date: Date,
  locale: string,
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: 'numeric',
      minute: 'numeric',
      ...options,
    }).format(date);
  } catch {
    return date.toLocaleTimeString();
  }
}

/**
 * Format relative time for locale
 */
export function formatLocalizedRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale: string,
  options?: Intl.RelativeTimeFormatOptions
): string {
  try {
    return new Intl.RelativeTimeFormat(locale, options).format(value, unit);
  } catch {
    return `${value} ${unit}`;
  }
}

/**
 * Format list for locale
 */
export function formatLocalizedList(
  items: string[],
  locale: string,
  options?: Intl.ListFormatOptions
): string {
  try {
    return new Intl.ListFormat(locale, options).format(items);
  } catch {
    return items.join(', ');
  }
}

// ============================================================================
// Pluralization
// ============================================================================

/**
 * Get plural category for number in locale
 */
export function getPluralCategory(
  count: number,
  locale: string
): PluralCategory {
  try {
    const rules = new Intl.PluralRules(locale);
    return rules.select(count) as PluralCategory;
  } catch {
    return count === 1 ? 'one' : 'other';
  }
}

/**
 * Get ordinal category for number in locale
 */
export function getOrdinalCategory(
  count: number,
  locale: string
): PluralCategory {
  try {
    const rules = new Intl.PluralRules(locale, { type: 'ordinal' });
    return rules.select(count) as PluralCategory;
  } catch {
    return 'other';
  }
}

/**
 * Pluralize a word based on count
 */
export function pluralize(
  count: number,
  forms: Partial<Record<PluralCategory, string>>,
  locale: string = 'en'
): string {
  const category = getPluralCategory(count, locale);
  return forms[category] || forms.other || '';
}

// ============================================================================
// Translation Utilities
// ============================================================================

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(
  obj: TranslationMessages,
  path: string
): string | undefined {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current === 'string' ? current : undefined;
}

/**
 * Create a translator function
 */
export function createTranslator(
  messages: TranslationMessages,
  options?: {
    fallbackMessages?: TranslationMessages;
    missingKeyHandler?: (key: string) => string;
  }
) {
  const { fallbackMessages, missingKeyHandler } = options || {};

  return function translate(
    key: string,
    params?: Record<string, string | number>
  ): string {
    // Try to find the message
    let message = getNestedValue(messages, key);

    // Try fallback
    if (message === undefined && fallbackMessages) {
      message = getNestedValue(fallbackMessages, key);
    }

    // Handle missing key
    if (message === undefined) {
      if (missingKeyHandler) {
        return missingKeyHandler(key);
      }
      return key;
    }

    // Replace parameters
    if (params) {
      return message.replace(/\{(\w+)\}/g, (_, name) => {
        const value = params[name];
        return value !== undefined ? String(value) : `{${name}}`;
      });
    }

    return message;
  };
}

/**
 * Interpolate parameters into a message
 */
export function interpolate(
  message: string,
  params: Record<string, string | number>
): string {
  return message.replace(/\{(\w+)\}/g, (_, name) => {
    const value = params[name];
    return value !== undefined ? String(value) : `{${name}}`;
  });
}

/**
 * Select message based on count (ICU-like syntax)
 */
export function selectByCount(
  count: number,
  messages: Record<string, string>,
  locale: string = 'en'
): string {
  // Check for exact match first
  if (messages[`=${count}`]) {
    return messages[`=${count}`];
  }

  // Get plural category
  const category = getPluralCategory(count, locale);

  // Return matching category or 'other'
  return messages[category] || messages.other || '';
}

// ============================================================================
// Chrome Extension i18n Integration
// ============================================================================

/**
 * Get Chrome extension message (wrapper for chrome.i18n.getMessage)
 */
export function getExtensionMessage(
  messageName: string,
  substitutions?: string | string[]
): string {
  if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
    return chrome.i18n.getMessage(messageName, substitutions) || messageName;
  }
  return messageName;
}

/**
 * Get Chrome extension UI locale
 */
export function getExtensionLocale(): string {
  if (typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage) {
    return chrome.i18n.getUILanguage();
  }
  return getBrowserLanguage();
}

/**
 * Get Chrome extension acceptable languages
 */
export async function getExtensionAcceptLanguages(): Promise<string[]> {
  if (typeof chrome !== 'undefined' && chrome.i18n?.getAcceptLanguages) {
    return new Promise((resolve) => {
      chrome.i18n.getAcceptLanguages((languages) => {
        resolve(languages || []);
      });
    });
  }
  return getBrowserLanguages();
}

// ============================================================================
// Text Direction Utilities
// ============================================================================

/**
 * Detect text direction from content
 */
export function detectTextDirection(text: string): 'ltr' | 'rtl' | 'auto' {
  // Check for RTL characters
  const rtlPattern = /[\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  const ltrPattern = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;

  const hasRtl = rtlPattern.test(text);
  const hasLtr = ltrPattern.test(text);

  if (hasRtl && !hasLtr) return 'rtl';
  if (hasLtr && !hasRtl) return 'ltr';
  if (hasRtl && hasLtr) return 'auto';
  return 'ltr';
}

/**
 * Wrap text with direction markers
 */
export function wrapWithDirection(
  text: string,
  direction: 'ltr' | 'rtl'
): string {
  const lrm = '\u200E'; // Left-to-right mark
  const rlm = '\u200F'; // Right-to-left mark

  return direction === 'rtl'
    ? `${rlm}${text}${rlm}`
    : `${lrm}${text}${lrm}`;
}

/**
 * Isolate bidirectional text
 */
export function isolateBidiText(text: string): string {
  const fsi = '\u2068'; // First strong isolate
  const pdi = '\u2069'; // Pop directional isolate
  return `${fsi}${text}${pdi}`;
}

// ============================================================================
// Subtitle-specific Language Utilities
// ============================================================================

/**
 * Common subtitle language codes mapping
 */
const SUBTITLE_LANGUAGE_ALIASES: Record<string, string> = {
  'chi': 'zh',
  'zho': 'zh',
  'chs': 'zh-CN',
  'cht': 'zh-TW',
  'cmn': 'zh',
  'jpn': 'ja',
  'kor': 'ko',
  'eng': 'en',
  'spa': 'es',
  'fre': 'fr',
  'fra': 'fr',
  'ger': 'de',
  'deu': 'de',
  'por': 'pt',
  'rus': 'ru',
  'ara': 'ar',
  'hin': 'hi',
  'tha': 'th',
  'vie': 'vi',
  'ind': 'id',
  'may': 'ms',
  'msa': 'ms',
  'dut': 'nl',
  'nld': 'nl',
};

/**
 * Convert ISO 639-2/B or ISO 639-3 code to ISO 639-1
 */
export function normalizeSubtitleLanguageCode(code: string): string {
  const lower = code.toLowerCase();

  // Check aliases first
  if (SUBTITLE_LANGUAGE_ALIASES[lower]) {
    return SUBTITLE_LANGUAGE_ALIASES[lower];
  }

  // If it's already a 2-letter code or has region, normalize it
  return normalizeLanguageCode(code);
}

/**
 * Get display name for subtitle language
 */
export function getSubtitleLanguageDisplayName(
  code: string,
  targetLocale?: string
): string {
  const normalized = normalizeSubtitleLanguageCode(code);
  return getLanguageName(normalized, { locale: targetLocale });
}

/**
 * Common subtitle language pairs
 */
export const COMMON_SUBTITLE_PAIRS: Array<{ source: string; target: string; name: string }> = [
  { source: 'en', target: 'zh-TW', name: 'English → Traditional Chinese' },
  { source: 'en', target: 'zh-CN', name: 'English → Simplified Chinese' },
  { source: 'en', target: 'ja', name: 'English → Japanese' },
  { source: 'en', target: 'ko', name: 'English → Korean' },
  { source: 'en', target: 'es', name: 'English → Spanish' },
  { source: 'en', target: 'fr', name: 'English → French' },
  { source: 'en', target: 'de', name: 'English → German' },
  { source: 'ja', target: 'en', name: 'Japanese → English' },
  { source: 'ja', target: 'zh-TW', name: 'Japanese → Traditional Chinese' },
  { source: 'ko', target: 'en', name: 'Korean → English' },
  { source: 'zh', target: 'en', name: 'Chinese → English' },
];

/**
 * Detect likely source language from subtitle text
 */
export function detectLikelyLanguage(text: string): string | null {
  // Simple character-based detection
  const patterns: Array<{ pattern: RegExp; code: string }> = [
    { pattern: /[\u4e00-\u9fff]/, code: 'zh' },
    { pattern: /[\u3040-\u30ff]/, code: 'ja' },
    { pattern: /[\uac00-\ud7af]/, code: 'ko' },
    { pattern: /[\u0600-\u06ff]/, code: 'ar' },
    { pattern: /[\u0590-\u05ff]/, code: 'he' },
    { pattern: /[\u0e00-\u0e7f]/, code: 'th' },
    { pattern: /[\u0400-\u04ff]/, code: 'ru' },
    { pattern: /[\u0370-\u03ff]/, code: 'el' },
    { pattern: /[a-zA-Z]/, code: 'en' }, // Fallback for Latin
  ];

  for (const { pattern, code } of patterns) {
    if (pattern.test(text)) {
      return code;
    }
  }

  return null;
}

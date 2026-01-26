/**
 * Subtitle Content Sanitizer
 *
 * Sanitizes subtitle content to prevent XSS attacks and ensure
 * safe rendering in the DOM. Handles various subtitle formats
 * and preserves legitimate styling while removing dangerous content.
 */

import { createLogger } from './logger';

const logger = createLogger('SubtitleSanitizer');

// ============================================================================
// Types
// ============================================================================

/**
 * Sanitization options
 */
export interface SanitizeOptions {
  /** Allow basic formatting tags (b, i, u) */
  allowFormatting?: boolean;
  /** Allow color styling */
  allowColors?: boolean;
  /** Allow position/alignment attributes */
  allowPositioning?: boolean;
  /** Maximum text length (0 = unlimited) */
  maxLength?: number;
  /** Strip all HTML tags */
  stripAllHtml?: boolean;
  /** Normalize whitespace */
  normalizeWhitespace?: boolean;
}

/**
 * Sanitization result
 */
export interface SanitizeResult {
  /** Sanitized text */
  text: string;
  /** Whether any content was modified */
  wasModified: boolean;
  /** List of removed elements/attributes */
  removed: string[];
}

/**
 * Allowed HTML tags for subtitle formatting
 */
const ALLOWED_TAGS = new Set(['b', 'i', 'u', 'em', 'strong', 'span', 'br']);

/**
 * Allowed attributes for formatting
 */
const ALLOWED_ATTRIBUTES: Record<string, Set<string>> = {
  span: new Set(['class', 'style']),
};

/**
 * Safe CSS properties for styling
 */
const SAFE_CSS_PROPERTIES = new Set([
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'text-decoration',
  'font-size',
]);

/**
 * Dangerous patterns to remove
 */
const DANGEROUS_PATTERNS = [
  // Script tags and events
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /on\w+\s*=/gi,
  // JavaScript URLs
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
  /data\s*:/gi,
  // Expression and behavior
  /expression\s*\(/gi,
  /behavior\s*:/gi,
  // Import and charset
  /@import/gi,
  /@charset/gi,
  // SVG and object
  /<svg\b[^>]*>[\s\S]*?<\/svg>/gi,
  /<object\b[^>]*>[\s\S]*?<\/object>/gi,
  /<embed\b[^>]*>/gi,
  /<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi,
  // Form elements
  /<form\b[^>]*>[\s\S]*?<\/form>/gi,
  /<input\b[^>]*>/gi,
  /<button\b[^>]*>[\s\S]*?<\/button>/gi,
  // Meta and link
  /<meta\b[^>]*>/gi,
  /<link\b[^>]*>/gi,
  /<base\b[^>]*>/gi,
  // Comments (can hide malicious content)
  /<!--[\s\S]*?-->/g,
];

/**
 * HTML entities for encoding
 */
const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
  '=': '&#x3D;',
};

// ============================================================================
// Core Sanitization Functions
// ============================================================================

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"'`=/]/g, (char) => HTML_ENTITIES[char] || char);
}

/**
 * Unescape common HTML entities
 */
export function unescapeHtml(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#x60;/g, '`')
    .replace(/&#x3D;/g, '=')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Remove all HTML tags from text
 */
export function stripHtmlTags(text: string): string {
  return text.replace(/<[^>]*>/g, '');
}

/**
 * Remove dangerous patterns from text
 */
export function removeDangerousPatterns(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  let result = text;

  for (const pattern of DANGEROUS_PATTERNS) {
    const matches = result.match(pattern);
    if (matches) {
      removed.push(...matches.map((m) => m.substring(0, 50)));
      result = result.replace(pattern, '');
    }
  }

  return { text: result, removed };
}

/**
 * Sanitize CSS style value
 */
export function sanitizeCssValue(property: string, value: string): string | null {
  // Only allow safe properties
  if (!SAFE_CSS_PROPERTIES.has(property.toLowerCase())) {
    return null;
  }

  // Remove dangerous values
  const lowerValue = value.toLowerCase();
  if (
    lowerValue.includes('javascript') ||
    lowerValue.includes('expression') ||
    lowerValue.includes('url(') ||
    lowerValue.includes('behavior')
  ) {
    return null;
  }

  return value;
}

/**
 * Sanitize inline style attribute
 */
export function sanitizeStyle(style: string): string {
  const sanitized: string[] = [];
  const declarations = style.split(';');

  for (const declaration of declarations) {
    const colonIndex = declaration.indexOf(':');
    if (colonIndex === -1) continue;

    const property = declaration.substring(0, colonIndex).trim();
    const value = declaration.substring(colonIndex + 1).trim();

    const sanitizedValue = sanitizeCssValue(property, value);
    if (sanitizedValue) {
      sanitized.push(`${property}: ${sanitizedValue}`);
    }
  }

  return sanitized.join('; ');
}

/**
 * Sanitize an HTML tag
 */
export function sanitizeTag(
  tag: string,
  tagName: string,
  attributes: string,
  options: SanitizeOptions
): string {
  const lowerTagName = tagName.toLowerCase();

  // Check if tag is allowed
  if (!ALLOWED_TAGS.has(lowerTagName)) {
    return '';
  }

  // If formatting not allowed, strip formatting tags
  if (!options.allowFormatting && ['b', 'i', 'u', 'em', 'strong'].includes(lowerTagName)) {
    return '';
  }

  // Handle self-closing tags
  if (lowerTagName === 'br') {
    return '<br>';
  }

  // Sanitize attributes
  const allowedAttrs = ALLOWED_ATTRIBUTES[lowerTagName];
  if (!allowedAttrs || !attributes.trim()) {
    return `<${lowerTagName}>`;
  }

  const sanitizedAttrs: string[] = [];
  const attrRegex = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match;

  while ((match = attrRegex.exec(attributes)) !== null) {
    const attrName = match[1].toLowerCase();
    const attrValue = match[2] || match[3] || match[4] || '';

    if (!allowedAttrs.has(attrName)) {
      continue;
    }

    // Special handling for style attribute
    if (attrName === 'style') {
      if (!options.allowColors) {
        continue;
      }
      const sanitizedStyle = sanitizeStyle(attrValue);
      if (sanitizedStyle) {
        sanitizedAttrs.push(`style="${escapeHtml(sanitizedStyle)}"`);
      }
    } else if (attrName === 'class') {
      // Only allow simple class names
      const classes = attrValue.split(/\s+/).filter((c) => /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(c));
      if (classes.length > 0) {
        sanitizedAttrs.push(`class="${escapeHtml(classes.join(' '))}"`);
      }
    }
  }

  if (sanitizedAttrs.length > 0) {
    return `<${lowerTagName} ${sanitizedAttrs.join(' ')}>`;
  }

  return `<${lowerTagName}>`;
}

// ============================================================================
// Main Sanitizer
// ============================================================================

/**
 * Sanitize subtitle text content
 */
export function sanitizeSubtitleText(
  text: string,
  options: SanitizeOptions = {}
): SanitizeResult {
  const {
    allowFormatting = true,
    allowColors = false,
    maxLength = 0,
    stripAllHtml = false,
    normalizeWhitespace = true,
  } = options;

  const removed: string[] = [];
  let result = text;
  let wasModified = false;

  // Remove dangerous patterns first
  const dangerous = removeDangerousPatterns(result);
  if (dangerous.removed.length > 0) {
    result = dangerous.text;
    removed.push(...dangerous.removed);
    wasModified = true;
    logger.debug('Removed dangerous patterns', { count: dangerous.removed.length });
  }

  // Strip all HTML if requested
  if (stripAllHtml) {
    const stripped = stripHtmlTags(result);
    if (stripped !== result) {
      result = stripped;
      wasModified = true;
    }
  } else {
    // Sanitize HTML tags
    const tagRegex = /<(\/?)([\w-]+)([^>]*)>/g;
    result = result.replace(tagRegex, (match, slash, tagName, attrs) => {
      if (slash === '/') {
        // Closing tag
        const lowerTagName = tagName.toLowerCase();
        if (ALLOWED_TAGS.has(lowerTagName) && (allowFormatting || lowerTagName === 'span')) {
          return `</${lowerTagName}>`;
        }
        wasModified = true;
        removed.push(match);
        return '';
      }

      const effectiveOptions: SanitizeOptions = {
        ...options,
        allowFormatting,
        allowColors,
      };
      const sanitized = sanitizeTag(match, tagName, attrs, effectiveOptions);
      if (sanitized !== match) {
        wasModified = true;
        if (!sanitized) {
          removed.push(match);
        }
      }
      return sanitized;
    });
  }

  // Normalize whitespace
  if (normalizeWhitespace) {
    const normalized = result
      .replace(/[\r\n]+/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n /g, '\n')
      .replace(/ \n/g, '\n')
      .trim();

    if (normalized !== result) {
      result = normalized;
      wasModified = true;
    }
  }

  // Truncate if needed
  if (maxLength > 0 && result.length > maxLength) {
    result = result.substring(0, maxLength);
    wasModified = true;
  }

  return { text: result, wasModified, removed };
}

/**
 * Sanitize an array of subtitle cues
 */
export function sanitizeSubtitleCues<T extends { text: string }>(
  cues: T[],
  options: SanitizeOptions = {}
): { cues: T[]; totalModified: number } {
  let totalModified = 0;

  const sanitizedCues = cues.map((cue) => {
    const result = sanitizeSubtitleText(cue.text, options);
    if (result.wasModified) {
      totalModified++;
    }
    return { ...cue, text: result.text };
  });

  if (totalModified > 0) {
    logger.debug('Sanitized subtitle cues', { total: cues.length, modified: totalModified });
  }

  return { cues: sanitizedCues, totalModified };
}

// ============================================================================
// Specialized Sanitizers
// ============================================================================

/**
 * Sanitize WebVTT cue text (allows VTT formatting)
 */
export function sanitizeVttCue(text: string): SanitizeResult {
  return sanitizeSubtitleText(text, {
    allowFormatting: true,
    allowColors: true,
    allowPositioning: true,
    normalizeWhitespace: true,
  });
}

/**
 * Sanitize plain text subtitle (no HTML allowed)
 */
export function sanitizePlainText(text: string): SanitizeResult {
  return sanitizeSubtitleText(text, {
    stripAllHtml: true,
    normalizeWhitespace: true,
  });
}

/**
 * Sanitize text for safe DOM insertion
 */
export function sanitizeForDom(text: string): string {
  // First remove dangerous patterns
  const { text: cleaned } = removeDangerousPatterns(text);
  // Then escape any remaining HTML
  return escapeHtml(cleaned);
}

/**
 * Sanitize translation result
 */
export function sanitizeTranslation(text: string): string {
  // Translations should be plain text, escape everything
  const { text: cleaned } = removeDangerousPatterns(text);
  return escapeHtml(cleaned);
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if text contains potentially dangerous content
 */
export function containsDangerousContent(text: string): boolean {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(text)) {
      // Reset regex lastIndex
      pattern.lastIndex = 0;
      return true;
    }
    pattern.lastIndex = 0;
  }
  return false;
}

/**
 * Validate subtitle text is safe
 */
export function isSubtitleTextSafe(text: string): boolean {
  return !containsDangerousContent(text);
}

/**
 * Get list of detected threats in text
 */
export function detectThreats(text: string): string[] {
  const threats: string[] = [];

  if (/<script/i.test(text)) threats.push('script_tag');
  if (/on\w+\s*=/i.test(text)) threats.push('event_handler');
  if (/javascript\s*:/i.test(text)) threats.push('javascript_url');
  if (/expression\s*\(/i.test(text)) threats.push('css_expression');
  if (/<iframe/i.test(text)) threats.push('iframe');
  if (/<object/i.test(text)) threats.push('object_tag');
  if (/<embed/i.test(text)) threats.push('embed_tag');
  if (/<form/i.test(text)) threats.push('form_tag');
  if (/<svg/i.test(text)) threats.push('svg_tag');

  return threats;
}

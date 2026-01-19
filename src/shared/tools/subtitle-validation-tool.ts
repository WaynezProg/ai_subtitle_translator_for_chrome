/**
 * Subtitle Validation Tool
 *
 * A tool that allows AI to validate translated subtitles
 * against common issues like timing, length, and formatting.
 */

import type {
  BaseTool,
  ToolInfo,
  ToolCall,
  ToolResponse,
  ToolContext,
} from '../types/tools';
import { createTextResponse, createErrorResponse, parseToolArguments } from '../types/tools';

// ============================================================================
// Types
// ============================================================================

interface ValidationParams {
  /** Original text */
  original: string;
  /** Translated text */
  translated: string;
  /** Maximum characters per line */
  maxCharsPerLine?: number;
  /** Maximum lines per subtitle */
  maxLines?: number;
  /** Source language code */
  sourceLanguage?: string;
  /** Target language code */
  targetLanguage?: string;
}

interface ValidationResult {
  isValid: boolean;
  issues: ValidationIssue[];
  suggestions: string[];
}

interface ValidationIssue {
  type: 'length' | 'lines' | 'formatting' | 'empty' | 'whitespace';
  severity: 'error' | 'warning';
  message: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

export class SubtitleValidationTool implements BaseTool {
  private defaultMaxCharsPerLine = 42;
  private defaultMaxLines = 2;

  info(): ToolInfo {
    return {
      name: 'validate_subtitle',
      description:
        'Validates a translated subtitle against quality criteria including line length, line count, and formatting. Returns validation results with any issues found.',
      parameters: {
        original: {
          type: 'string',
          description: 'The original subtitle text before translation',
        },
        translated: {
          type: 'string',
          description: 'The translated subtitle text to validate',
        },
        maxCharsPerLine: {
          type: 'number',
          description: 'Maximum characters allowed per line (default: 42)',
        },
        maxLines: {
          type: 'number',
          description: 'Maximum lines allowed per subtitle (default: 2)',
        },
        sourceLanguage: {
          type: 'string',
          description: 'Source language code (e.g., "en", "ja")',
        },
        targetLanguage: {
          type: 'string',
          description: 'Target language code (e.g., "zh-TW", "ko")',
        },
      },
      required: ['original', 'translated'],
    };
  }

  async run(params: ToolCall, _context?: ToolContext): Promise<ToolResponse> {
    const args = parseToolArguments<ValidationParams>(params.input);

    if (!args) {
      return createErrorResponse('Invalid parameters: could not parse JSON input');
    }

    if (!args.original || !args.translated) {
      return createErrorResponse('Missing required parameters: original and translated');
    }

    const result = this.validate(args);
    return createTextResponse(JSON.stringify(result, null, 2));
  }

  private validate(params: ValidationParams): ValidationResult {
    const issues: ValidationIssue[] = [];
    const suggestions: string[] = [];

    const maxChars = params.maxCharsPerLine || this.defaultMaxCharsPerLine;
    const maxLines = params.maxLines || this.defaultMaxLines;

    const translated = params.translated.trim();

    // Check for empty translation
    if (!translated) {
      issues.push({
        type: 'empty',
        severity: 'error',
        message: 'Translation is empty',
      });
      return { isValid: false, issues, suggestions };
    }

    // Check line count
    const lines = translated.split('\n');
    if (lines.length > maxLines) {
      issues.push({
        type: 'lines',
        severity: 'error',
        message: `Too many lines: ${lines.length} (max: ${maxLines})`,
      });
      suggestions.push(`Consider combining lines or shortening the translation`);
    }

    // Check line lengths
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineLength = this.getDisplayLength(line, params.targetLanguage);

      if (lineLength > maxChars) {
        issues.push({
          type: 'length',
          severity: 'warning',
          message: `Line ${i + 1} is too long: ${lineLength} chars (max: ${maxChars})`,
        });
        suggestions.push(`Shorten line ${i + 1}: "${line}"`);
      }
    }

    // Check for leading/trailing whitespace issues
    if (translated !== params.translated) {
      issues.push({
        type: 'whitespace',
        severity: 'warning',
        message: 'Translation has leading or trailing whitespace',
      });
    }

    // Check for formatting issues
    if (translated.includes('  ')) {
      issues.push({
        type: 'formatting',
        severity: 'warning',
        message: 'Translation contains multiple consecutive spaces',
      });
    }

    // Check translation ratio (very rough heuristic)
    const originalLength = this.getDisplayLength(params.original, params.sourceLanguage);
    const translatedLength = this.getDisplayLength(translated, params.targetLanguage);
    const ratio = translatedLength / originalLength;

    if (ratio > 2.0) {
      issues.push({
        type: 'length',
        severity: 'warning',
        message: `Translation is significantly longer than original (${ratio.toFixed(1)}x)`,
      });
      suggestions.push('Consider a more concise translation');
    }

    const hasErrors = issues.some((i) => i.severity === 'error');

    return {
      isValid: !hasErrors,
      issues,
      suggestions,
    };
  }

  /**
   * Get display length accounting for CJK characters
   * CJK characters typically take 2 character widths
   */
  private getDisplayLength(text: string, language?: string): number {
    // For CJK languages, count wide characters as 2
    const isCJK =
      language &&
      ['zh', 'zh-TW', 'zh-CN', 'ja', 'ko'].some(
        (l) => language.startsWith(l)
      );

    if (!isCJK) {
      return text.length;
    }

    let length = 0;
    for (const char of text) {
      // CJK Unified Ideographs and common fullwidth ranges
      const code = char.charCodeAt(0);
      if (
        (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
        (code >= 0x3000 && code <= 0x303f) || // CJK Punctuation
        (code >= 0xff00 && code <= 0xffef) || // Fullwidth forms
        (code >= 0x3040 && code <= 0x309f) || // Hiragana
        (code >= 0x30a0 && code <= 0x30ff) || // Katakana
        (code >= 0xac00 && code <= 0xd7af) // Korean Hangul
      ) {
        length += 2;
      } else {
        length += 1;
      }
    }

    return length;
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createSubtitleValidationTool(): SubtitleValidationTool {
  return new SubtitleValidationTool();
}

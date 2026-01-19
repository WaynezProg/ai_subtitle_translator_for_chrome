/**
 * SRT Generator
 *
 * Generates SRT (SubRip Text) format content from Cue arrays.
 * @see https://en.wikipedia.org/wiki/SubRip
 */

import type { Cue } from '../types/subtitle';

// ============================================================================
// Types
// ============================================================================

/**
 * SRT generation mode
 */
export type SRTGenerationMode = 'original' | 'translated' | 'bilingual';

/**
 * SRT generation options
 */
export interface SRTGenerationOptions {
  /** Generation mode */
  mode: SRTGenerationMode;
  /** Include UTF-8 BOM (default: true for Windows compatibility) */
  includeBOM?: boolean;
  /** Use Windows line endings (default: true for compatibility) */
  useWindowsLineEndings?: boolean;
}

// ============================================================================
// Timestamp Formatting
// ============================================================================

/**
 * Format milliseconds to SRT timestamp
 * Format: HH:MM:SS,mmm
 */
export function formatSRTTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = hours.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  const ss = seconds.toString().padStart(2, '0');
  const mmm = milliseconds.toString().padStart(3, '0');

  return `${hh}:${mm}:${ss},${mmm}`;
}

// ============================================================================
// Filename Utilities
// ============================================================================

/**
 * Characters that are invalid in filenames (including spaces)
 */
const INVALID_FILENAME_CHARS = /[/\\:*?"<>|\s]/g;

/**
 * Sanitize a string for use as a filename
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(INVALID_FILENAME_CHARS, '_')
    .replace(/_+/g, '_') // Collapse consecutive underscores
    .replace(/^_|_$/g, ''); // Trim leading/trailing underscores
}

/**
 * Generate a filename for subtitle download
 */
export function generateSubtitleFilename(
  videoTitle: string | undefined,
  videoId: string,
  sourceLanguage: string,
  targetLanguage?: string,
  mode: SRTGenerationMode = 'original'
): string {
  const baseName = videoTitle ? sanitizeFilename(videoTitle) : videoId;

  switch (mode) {
    case 'original':
      return `${baseName}_${sourceLanguage}.srt`;
    case 'translated':
      return `${baseName}_${targetLanguage || 'translated'}.srt`;
    case 'bilingual':
      return `${baseName}_${sourceLanguage}-${targetLanguage || 'translated'}.srt`;
    default:
      return `${baseName}.srt`;
  }
}

// ============================================================================
// SRT Generation
// ============================================================================

/**
 * Generate SRT content from cues
 */
export function generateSRT(
  cues: Cue[],
  options: SRTGenerationOptions
): string {
  const {
    mode,
    includeBOM = true,
    useWindowsLineEndings = true,
  } = options;

  const lineEnding = useWindowsLineEndings ? '\r\n' : '\n';
  const lines: string[] = [];

  let cueNumber = 1;

  for (const cue of cues) {
    const text = getTextForMode(cue, mode);

    // Skip cues with no text in the requested mode
    if (!text) {
      continue;
    }

    // Cue index
    lines.push(String(cueNumber));

    // Timing line
    const startTimestamp = formatSRTTimestamp(cue.startTime);
    const endTimestamp = formatSRTTimestamp(cue.endTime);
    lines.push(`${startTimestamp} --> ${endTimestamp}`);

    // Text content
    lines.push(text);

    // Blank line separator
    lines.push('');

    cueNumber++;
  }

  let content = lines.join(lineEnding);

  // Add UTF-8 BOM if requested
  if (includeBOM) {
    content = '\ufeff' + content;
  }

  return content;
}

/**
 * Get text content based on generation mode
 */
function getTextForMode(cue: Cue, mode: SRTGenerationMode): string {
  switch (mode) {
    case 'original':
      return cue.text;

    case 'translated':
      // Return translated text, or fall back to original if not available
      return cue.translatedText || cue.text;

    case 'bilingual':
      if (cue.translatedText && cue.translatedText !== cue.text) {
        // Both original and translated, on separate lines
        return `${cue.text}\n${cue.translatedText}`;
      }
      // Only original available
      return cue.text;

    default:
      return cue.text;
  }
}

// ============================================================================
// Quick Helpers
// ============================================================================

/**
 * Generate original text SRT
 */
export function generateOriginalSRT(cues: Cue[]): string {
  return generateSRT(cues, { mode: 'original' });
}

/**
 * Generate translated text SRT
 */
export function generateTranslatedSRT(cues: Cue[]): string {
  return generateSRT(cues, { mode: 'translated' });
}

/**
 * Generate bilingual SRT
 */
export function generateBilingualSRT(cues: Cue[]): string {
  return generateSRT(cues, { mode: 'bilingual' });
}

/**
 * Subtitle-related type definitions
 * 
 * @see specs/001-ai-subtitle-translator/data-model.md
 */

/**
 * Supported streaming platforms
 */
export type Platform = 'youtube' | 'netflix' | 'disney' | 'prime';

/**
 * Supported subtitle formats
 */
export type SubtitleFormat = 'webvtt' | 'ttml' | 'json3';

/**
 * Represents a complete subtitle file with all cues
 */
export interface Subtitle {
  /** Unique identifier (UUID v4) */
  id: string;
  
  /** Video unique identifier (platform-specific format) */
  videoId: string;
  
  /** Source platform */
  platform: Platform;
  
  /** Source language (BCP 47 format, e.g., "en-US") */
  sourceLanguage: string;
  
  /** Target translation language (BCP 47 format, e.g., "zh-TW") */
  targetLanguage?: string;
  
  /** Original subtitle format */
  format: SubtitleFormat;
  
  /** List of subtitle cues */
  cues: Cue[];
  
  /** Metadata */
  metadata: SubtitleMetadata;
  
  /** Creation time (ISO 8601) */
  createdAt: string;
  
  /** Last modified time (ISO 8601) */
  updatedAt: string;
}

/**
 * Represents a single subtitle cue with timing and text
 */
export interface Cue {
  /** Cue index (starting from 0) */
  index: number;
  
  /** Start time in milliseconds */
  startTime: number;
  
  /** End time in milliseconds */
  endTime: number;
  
  /** Original text */
  text: string;
  
  /** Translated text (filled after translation) */
  translatedText?: string;
  
  /** Speaker label (if present in original subtitle) */
  speaker?: string;
}

/**
 * Subtitle metadata
 */
export interface SubtitleMetadata {
  /** Video title (if available) */
  title?: string;
  
  /** Video duration in seconds */
  duration?: number;
  
  /** Total cue count */
  cueCount: number;
  
  /** Original file URL */
  sourceUrl?: string;
}

/**
 * Validation helper for Cue
 */
export function isValidCue(cue: Cue): boolean {
  return (
    cue.startTime >= 0 &&
    cue.endTime > cue.startTime &&
    cue.text.trim().length > 0 &&
    Number.isInteger(cue.index) &&
    cue.index >= 0
  );
}

/**
 * Validation helper for Subtitle
 */
export function isValidSubtitle(subtitle: Subtitle): boolean {
  if (subtitle.cues.length === 0 || subtitle.cues.length > 10000) {
    return false;
  }
  
  // Check all cues are valid and have sequential indices
  return subtitle.cues.every((cue, idx) => 
    isValidCue(cue) && cue.index === idx
  );
}

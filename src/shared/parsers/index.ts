/**
 * Parsers barrel export
 */

export * from './webvtt-parser';
export * from './ttml-parser';
export * from './json3-parser';
export * from './srt-parser';

import type { Cue, SubtitleFormat } from '../types/subtitle';
import { parseWebVTT, isValidWebVTT } from './webvtt-parser';
import { parseTTML, isValidTTML } from './ttml-parser';
import { parseJSON3, isValidJSON3, isJSON3Format } from './json3-parser';
import { parseSRT, isValidSRT, isSRTFormat } from './srt-parser';

/**
 * Parse subtitle content based on format
 */
export function parseSubtitle(content: string, format: SubtitleFormat): Cue[] {
  switch (format) {
    case 'webvtt':
      return parseWebVTT(content).cues;
    case 'ttml':
      return parseTTML(content).cues;
    case 'json3':
      return parseJSON3(content).cues;
    case 'srt':
      return parseSRT(content).cues;
    default:
      throw new Error(`Unsupported subtitle format: ${format as string}`);
  }
}

/**
 * Detect subtitle format from content
 */
export function detectSubtitleFormat(content: string): SubtitleFormat | null {
  const trimmed = content.trim();
  
  // Check WebVTT (starts with WEBVTT)
  if (trimmed.startsWith('WEBVTT')) {
    return 'webvtt';
  }
  
  // Check TTML (XML with tt root)
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<tt')) {
    return 'ttml';
  }
  
  // Check JSON3 (JSON with events array)
  if (trimmed.startsWith('{') && isJSON3Format(trimmed)) {
    return 'json3';
  }
  
  // Check SRT (starts with number, then timing line)
  if (isSRTFormat(trimmed)) {
    return 'srt';
  }
  
  return null;
}

/**
 * Validate subtitle content based on format
 */
export function isValidSubtitleContent(content: string, format: SubtitleFormat): boolean {
  switch (format) {
    case 'webvtt':
      return isValidWebVTT(content);
    case 'ttml':
      return isValidTTML(content);
    case 'json3':
      return isValidJSON3(content);
    case 'srt':
      return isValidSRT(content);
    default:
      return false;
  }
}

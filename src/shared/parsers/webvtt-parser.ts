/**
 * WebVTT Parser
 * 
 * Parses WebVTT (Web Video Text Tracks) subtitle format.
 * @see https://www.w3.org/TR/webvtt1/
 */

import type { Cue } from '../types/subtitle';

/**
 * WebVTT parsing result
 */
export interface WebVTTParseResult {
  cues: Cue[];
  metadata: {
    /** Optional header metadata */
    header?: string;
    /** Region definitions (if any) */
    regions?: string[];
    /** Style definitions (if any) */
    styles?: string[];
  };
}

/**
 * WebVTT parsing error
 */
export class WebVTTParseError extends Error {
  constructor(
    message: string,
    public readonly line?: number
  ) {
    super(message);
    this.name = 'WebVTTParseError';
  }
}

/**
 * Parse WebVTT timestamp to milliseconds
 * Format: [hh:]mm:ss.mmm or mm:ss.mmm
 */
export function parseTimestamp(timestamp: string): number {
  const pattern = /^(?:(\d{1,2}):)?(\d{2}):(\d{2})\.(\d{3})$/;
  const match = timestamp.trim().match(pattern);
  
  if (!match) {
    throw new WebVTTParseError(`Invalid timestamp format: ${timestamp}`);
  }
  
  const hours = parseInt(match[1] ?? '0', 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const milliseconds = parseInt(match[4], 10);
  
  return (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
}

/**
 * Parse WebVTT cue timing line
 * Format: start --> end [settings]
 */
function parseTimingLine(line: string): { startTime: number; endTime: number } | null {
  const arrowIndex = line.indexOf('-->');
  if (arrowIndex === -1) return null;
  
  const startPart = line.substring(0, arrowIndex).trim();
  const endAndSettings = line.substring(arrowIndex + 3).trim();
  
  // End timestamp may be followed by cue settings
  const endPart = endAndSettings.split(/\s+/)[0];
  
  try {
    const startTime = parseTimestamp(startPart);
    const endTime = parseTimestamp(endPart);
    return { startTime, endTime };
  } catch {
    return null;
  }
}

/**
 * Strip HTML-like tags from WebVTT text
 * WebVTT allows: <c>, <i>, <b>, <u>, <ruby>, <rt>, <v>, <lang>
 */
export function stripWebVTTTags(text: string): string {
  // Remove voice spans and extract speaker if present
  // e.g., <v Speaker>text</v> -> text
  let result = text.replace(/<v\s+([^>]*)>/gi, '').replace(/<\/v>/gi, '');
  
  // Remove other inline tags
  result = result.replace(/<\/?[^>]+>/g, '');
  
  // Unescape HTML entities
  result = result
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  
  return result.trim();
}

/**
 * Extract speaker from WebVTT voice tag
 * e.g., <v Speaker>text</v> -> "Speaker"
 */
export function extractSpeaker(text: string): string | undefined {
  const voiceMatch = text.match(/<v\s+([^>]*)>/i);
  return voiceMatch?.[1]?.trim() || undefined;
}

/**
 * Parse WebVTT content into cues
 */
export function parseWebVTT(content: string): WebVTTParseResult {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const cues: Cue[] = [];
  const metadata: WebVTTParseResult['metadata'] = {};
  
  let lineIndex = 0;
  
  // Check for WEBVTT header
  if (!lines[0]?.startsWith('WEBVTT')) {
    throw new WebVTTParseError('Missing WEBVTT header', 1);
  }
  
  // Parse optional header content
  if (lines[0].length > 6) {
    metadata.header = lines[0].substring(6).trim();
  }
  lineIndex++;
  
  // Skip blank lines after header
  while (lineIndex < lines.length && lines[lineIndex].trim() === '') {
    lineIndex++;
  }
  
  // Parse styles, regions, and cues
  let cueIndex = 0;
  
  while (lineIndex < lines.length) {
    const currentLine = lines[lineIndex].trim();
    
    // Skip empty lines
    if (currentLine === '') {
      lineIndex++;
      continue;
    }
    
    // Skip NOTE comments
    if (currentLine.startsWith('NOTE')) {
      while (lineIndex < lines.length && lines[lineIndex].trim() !== '') {
        lineIndex++;
      }
      continue;
    }
    
    // Skip STYLE blocks
    if (currentLine.startsWith('STYLE')) {
      const styleLines: string[] = [];
      lineIndex++;
      while (lineIndex < lines.length && lines[lineIndex].trim() !== '') {
        styleLines.push(lines[lineIndex]);
        lineIndex++;
      }
      metadata.styles = metadata.styles ?? [];
      metadata.styles.push(styleLines.join('\n'));
      continue;
    }
    
    // Skip REGION blocks
    if (currentLine.startsWith('REGION')) {
      const regionLines: string[] = [];
      lineIndex++;
      while (lineIndex < lines.length && lines[lineIndex].trim() !== '') {
        regionLines.push(lines[lineIndex]);
        lineIndex++;
      }
      metadata.regions = metadata.regions ?? [];
      metadata.regions.push(regionLines.join('\n'));
      continue;
    }
    
    // Parse cue
    // Check if this line is a cue identifier (optional)
    const nextLine = lines[lineIndex + 1];
    
    if (nextLine && nextLine.includes('-->')) {
      // This line is a cue identifier, skip it (we don't use cue IDs)
      lineIndex++;
    }
    
    // Parse timing line
    const timingLine = lines[lineIndex]?.trim();
    if (!timingLine) {
      lineIndex++;
      continue;
    }
    
    const timing = parseTimingLine(timingLine);
    if (!timing) {
      lineIndex++;
      continue;
    }
    
    lineIndex++;
    
    // Parse cue text (can be multiple lines until blank line)
    const textLines: string[] = [];
    while (lineIndex < lines.length && lines[lineIndex].trim() !== '') {
      textLines.push(lines[lineIndex]);
      lineIndex++;
    }
    
    if (textLines.length === 0) {
      continue;
    }
    
    const rawText = textLines.join('\n');
    const speaker = extractSpeaker(rawText);
    const text = stripWebVTTTags(rawText);
    
    if (text) {
      cues.push({
        index: cueIndex++,
        startTime: timing.startTime,
        endTime: timing.endTime,
        text,
        speaker
      });
    }
  }
  
  return { cues, metadata };
}

/**
 * Validate WebVTT content
 */
export function isValidWebVTT(content: string): boolean {
  try {
    const result = parseWebVTT(content);
    return result.cues.length > 0;
  } catch {
    return false;
  }
}

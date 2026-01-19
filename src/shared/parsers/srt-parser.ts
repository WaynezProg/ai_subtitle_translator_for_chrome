/**
 * SRT Parser
 *
 * Parses SRT (SubRip Text) subtitle format.
 * @see https://en.wikipedia.org/wiki/SubRip
 */

import type { Cue } from '../types/subtitle';

// ============================================================================
// Types
// ============================================================================

/**
 * SRT parsing result
 */
export interface SRTParseResult {
  cues: Cue[];
}

/**
 * SRT parsing error
 */
export class SRTParseError extends Error {
  constructor(
    message: string,
    public readonly line?: number
  ) {
    super(message);
    this.name = 'SRTParseError';
  }
}

// ============================================================================
// Timestamp Parsing
// ============================================================================

/**
 * Parse SRT timestamp to milliseconds
 * Format: HH:MM:SS,mmm or HH:MM:SS.mmm (period variant)
 */
export function parseSRTTimestamp(timestamp: string): number {
  // Support both comma (standard) and period (variant) as millisecond separator
  const pattern = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})$/;
  const match = timestamp.trim().match(pattern);

  if (!match) {
    throw new SRTParseError(`Invalid SRT timestamp format: ${timestamp}`);
  }

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);
  const milliseconds = parseInt(match[4], 10);

  return (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
}

/**
 * Parse SRT timing line
 * Format: start --> end
 */
function parseTimingLine(line: string): { startTime: number; endTime: number } | null {
  const arrowIndex = line.indexOf('-->');
  if (arrowIndex === -1) return null;

  const startPart = line.substring(0, arrowIndex).trim();
  const endPart = line.substring(arrowIndex + 3).trim();

  try {
    const startTime = parseSRTTimestamp(startPart);
    const endTime = parseSRTTimestamp(endPart);
    return { startTime, endTime };
  } catch {
    return null;
  }
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse SRT content into cues
 */
export function parseSRT(content: string): SRTParseResult {
  // Normalize line endings
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const cues: Cue[] = [];

  let lineIndex = 0;

  // Skip BOM if present
  if (lines[0]?.charCodeAt(0) === 0xfeff) {
    lines[0] = lines[0].substring(1);
  }

  // Skip leading empty lines
  while (lineIndex < lines.length && lines[lineIndex].trim() === '') {
    lineIndex++;
  }

  let cueIndex = 0;

  while (lineIndex < lines.length) {
    // Skip empty lines
    while (lineIndex < lines.length && lines[lineIndex].trim() === '') {
      lineIndex++;
    }

    if (lineIndex >= lines.length) break;

    // Parse cue index (optional, we don't rely on it)
    const indexLine = lines[lineIndex].trim();
    if (/^\d+$/.test(indexLine)) {
      lineIndex++;
    }

    if (lineIndex >= lines.length) break;

    // Parse timing line
    const timingLine = lines[lineIndex]?.trim();
    if (!timingLine) {
      lineIndex++;
      continue;
    }

    const timing = parseTimingLine(timingLine);
    if (!timing) {
      // Not a valid timing line, skip
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

    const text = textLines.join('\n').trim();

    if (text) {
      cues.push({
        index: cueIndex++,
        startTime: timing.startTime,
        endTime: timing.endTime,
        text,
      });
    }
  }

  return { cues };
}

/**
 * Validate SRT content
 */
export function isValidSRT(content: string): boolean {
  try {
    const result = parseSRT(content);
    return result.cues.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if content looks like SRT format
 */
export function isSRTFormat(content: string): boolean {
  const trimmed = content.trim();

  // Check for typical SRT pattern: number, then timing line
  const lines = trimmed.split(/\r?\n/);

  // Find first non-empty line
  let firstLineIdx = 0;
  while (firstLineIdx < lines.length && lines[firstLineIdx].trim() === '') {
    firstLineIdx++;
  }

  // Skip BOM
  let firstLine = lines[firstLineIdx]?.trim() || '';
  if (firstLine.charCodeAt(0) === 0xfeff) {
    firstLine = firstLine.substring(1);
  }

  // First meaningful line should be a number (cue index)
  if (!/^\d+$/.test(firstLine)) {
    return false;
  }

  // Second meaningful line should contain -->
  const secondLine = lines[firstLineIdx + 1]?.trim() || '';
  return secondLine.includes('-->');
}

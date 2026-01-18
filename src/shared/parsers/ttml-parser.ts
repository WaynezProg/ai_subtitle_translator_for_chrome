/**
 * TTML Parser
 * 
 * Parses TTML (Timed Text Markup Language) subtitle format.
 * Commonly used by Netflix.
 * @see https://www.w3.org/TR/ttml1/
 */

import type { Cue } from '../types/subtitle';

/**
 * TTML parsing result
 */
export interface TTMLParseResult {
  cues: Cue[];
  metadata: {
    /** Document language */
    language?: string;
    /** Frame rate (if specified) */
    frameRate?: number;
    /** Tick rate (if specified) */
    tickRate?: number;
  };
}

/**
 * TTML parsing error
 */
export class TTMLParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TTMLParseError';
  }
}

/**
 * Parse TTML timestamp to milliseconds
 * Formats:
 * - HH:MM:SS.mmm (clock time)
 * - HH:MM:SS:FF (clock time with frames)
 * - XXXXt (ticks)
 * - XXXXf (frames)
 * - XXXXms (milliseconds)
 * - XXXXs (seconds)
 */
export function parseTTMLTimestamp(
  timestamp: string,
  frameRate: number = 30,
  tickRate: number = 10000000
): number {
  const trimmed = timestamp.trim();
  
  // Tick format: 12345t
  const tickMatch = trimmed.match(/^(\d+)t$/);
  if (tickMatch) {
    return Math.floor((parseInt(tickMatch[1], 10) / tickRate) * 1000);
  }
  
  // Frame format: 12345f
  const frameMatch = trimmed.match(/^(\d+)f$/);
  if (frameMatch) {
    return Math.floor((parseInt(frameMatch[1], 10) / frameRate) * 1000);
  }
  
  // Milliseconds format: 12345ms
  const msMatch = trimmed.match(/^(\d+(?:\.\d+)?)ms$/);
  if (msMatch) {
    return Math.floor(parseFloat(msMatch[1]));
  }
  
  // Seconds format: 12.345s
  const sMatch = trimmed.match(/^(\d+(?:\.\d+)?)s$/);
  if (sMatch) {
    return Math.floor(parseFloat(sMatch[1]) * 1000);
  }
  
  // Clock time with frames: HH:MM:SS:FF
  const clockFrameMatch = trimmed.match(/^(\d{2}):(\d{2}):(\d{2}):(\d{2})$/);
  if (clockFrameMatch) {
    const hours = parseInt(clockFrameMatch[1], 10);
    const minutes = parseInt(clockFrameMatch[2], 10);
    const seconds = parseInt(clockFrameMatch[3], 10);
    const frames = parseInt(clockFrameMatch[4], 10);
    return (hours * 3600 + minutes * 60 + seconds) * 1000 + Math.floor((frames / frameRate) * 1000);
  }
  
  // Standard clock time: HH:MM:SS.mmm or HH:MM:SS
  const clockMatch = trimmed.match(/^(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/);
  if (clockMatch) {
    const hours = parseInt(clockMatch[1], 10);
    const minutes = parseInt(clockMatch[2], 10);
    const seconds = parseInt(clockMatch[3], 10);
    const ms = clockMatch[4] ? parseInt(clockMatch[4].padEnd(3, '0'), 10) : 0;
    return (hours * 3600 + minutes * 60 + seconds) * 1000 + ms;
  }
  
  throw new TTMLParseError(`Invalid TTML timestamp format: ${timestamp}`);
}

/**
 * Extract text content from TTML element, handling nested elements
 */
function extractTextContent(element: Element): string {
  let text = '';
  
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent ?? '';
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tagName = el.tagName.toLowerCase();
      
      // Handle line breaks
      if (tagName === 'br') {
        text += '\n';
      }
      // Handle span and other inline elements
      else if (tagName === 'span' || tagName.includes(':span')) {
        text += extractTextContent(el);
      }
      // Recursively handle other elements
      else {
        text += extractTextContent(el);
      }
    }
  }
  
  return text;
}

/**
 * Parse TTML content into cues
 */
export function parseTTML(content: string): TTMLParseResult {
  // Parse XML
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'application/xml');
  
  // Check for parsing errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new TTMLParseError(`XML parsing error: ${parseError.textContent}`);
  }
  
  // Find the root tt element
  const ttElement = doc.querySelector('tt') ?? doc.documentElement;
  if (!ttElement || ttElement.tagName !== 'tt') {
    throw new TTMLParseError('Missing tt root element');
  }
  
  // Extract metadata
  const metadata: TTMLParseResult['metadata'] = {};
  
  // Language
  const lang = ttElement.getAttribute('xml:lang') ?? ttElement.getAttribute('lang');
  if (lang) metadata.language = lang;
  
  // Frame rate (ttp:frameRate)
  const frameRateAttr = ttElement.getAttribute('ttp:frameRate');
  const frameRate = frameRateAttr ? parseInt(frameRateAttr, 10) : 30;
  if (frameRateAttr) metadata.frameRate = frameRate;
  
  // Tick rate (ttp:tickRate)
  const tickRateAttr = ttElement.getAttribute('ttp:tickRate');
  const tickRate = tickRateAttr ? parseInt(tickRateAttr, 10) : 10000000;
  if (tickRateAttr) metadata.tickRate = tickRate;
  
  // Find body and div elements containing paragraphs
  const body = ttElement.querySelector('body');
  if (!body) {
    throw new TTMLParseError('Missing body element');
  }
  
  // Find all p (paragraph) elements
  const paragraphs = body.querySelectorAll('p');
  const cues: Cue[] = [];
  let cueIndex = 0;
  
  for (const p of Array.from(paragraphs)) {
    const begin = p.getAttribute('begin');
    const end = p.getAttribute('end');
    const dur = p.getAttribute('dur');
    
    if (!begin) continue;
    
    const startTime = parseTTMLTimestamp(begin, frameRate, tickRate);
    let endTime: number;
    
    if (end) {
      endTime = parseTTMLTimestamp(end, frameRate, tickRate);
    } else if (dur) {
      // Calculate end from duration
      const duration = parseTTMLTimestamp(dur, frameRate, tickRate);
      endTime = startTime + duration;
    } else {
      // Skip if no end time can be determined
      continue;
    }
    
    const text = extractTextContent(p).trim();
    if (!text) continue;
    
    // Extract speaker from agent attribute (Netflix style)
    const agent = p.getAttribute('ttm:agent') ?? p.getAttribute('agent');
    
    cues.push({
      index: cueIndex++,
      startTime,
      endTime,
      text,
      speaker: agent ?? undefined
    });
  }
  
  return { cues, metadata };
}

/**
 * Validate TTML content
 */
export function isValidTTML(content: string): boolean {
  try {
    const result = parseTTML(content);
    return result.cues.length > 0;
  } catch {
    return false;
  }
}

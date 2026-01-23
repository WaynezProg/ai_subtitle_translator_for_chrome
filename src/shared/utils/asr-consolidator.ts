/**
 * ASR (Auto-generated) Subtitle Consolidator
 *
 * YouTube's auto-generated subtitles are often fragmented into very short segments
 * (single words or phrases). When displaying bilingual subtitles, this causes
 * misalignment between the original text and translation because:
 *
 * 1. Original: "Hello" (0:01.000) → Translation: "你好"
 * 2. Original: "World" (0:01.500) → Translation: "世界"
 *
 * But the intended sentence is "Hello World" → "你好世界"
 *
 * This consolidator groups nearby ASR segments into logical sentence units
 * for better alignment in bilingual display.
 *
 * TIMING ALIGNMENT STRATEGY:
 * The consolidated cue uses the FIRST word's startTime as the display start time.
 * This ensures the translation appears at the same moment the original audio begins,
 * allowing viewers to read ahead while listening. The endTime extends to the last
 * word's endTime to ensure the subtitle stays visible for the full duration.
 *
 * This approach matches the expected behavior where:
 * - Original ASR shows words progressively as they're spoken
 * - Our consolidated translation shows the full sentence from the start of the phrase
 * - Both are visible for the same overall time window
 */

import type { Cue } from '../types/subtitle';

/**
 * Options for ASR consolidation
 */
export interface ASRConsolidationOptions {
  /**
   * Maximum time gap (ms) between segments to consider them part of the same sentence.
   * Segments with gaps larger than this will start a new sentence group.
   * Default: 1500ms (1.5 seconds)
   */
  maxGapMs?: number;

  /**
   * Maximum duration (ms) for a consolidated cue.
   * Prevents overly long sentences.
   * Default: 8000ms (8 seconds)
   */
  maxDurationMs?: number;

  /**
   * Minimum number of characters to consider a cue complete.
   * Helps ensure we don't split mid-sentence.
   * Default: 5
   */
  minCharsForSentence?: number;

  /**
   * Characters that indicate sentence boundaries.
   * If a segment ends with one of these, it's considered a sentence break.
   */
  sentenceEndChars?: string[];

  /**
   * Strategy for determining the start time of consolidated cues.
   * - 'first': Use first segment's start time (default) - shows full translation immediately
   * - 'last': Use last segment's start time - shows translation when sentence is complete in audio
   * - 'weighted': Use weighted average based on text length - balances early display with timing
   * - 'midpoint': Use midpoint of first and last segment start times
   * Default: 'first'
   */
  timingStrategy?: 'first' | 'last' | 'weighted' | 'midpoint';
}

/**
 * Default consolidation options
 */
const DEFAULT_OPTIONS: Required<ASRConsolidationOptions> = {
  maxGapMs: 1500,
  maxDurationMs: 8000,
  minCharsForSentence: 5,
  sentenceEndChars: ['.', '!', '?', '。', '！', '？', '…', '；', ';'],
  timingStrategy: 'first',
};

/**
 * Consolidate fragmented ASR subtitle segments into logical sentence units.
 *
 * This function groups consecutive cues that are close in time into single cues,
 * making bilingual display more coherent by ensuring original text and translation
 * represent the same logical sentence.
 *
 * @param cues - Array of subtitle cues (should be sorted by startTime)
 * @param options - Consolidation options
 * @returns Array of consolidated cues
 */
export function consolidateASRCues(cues: Cue[], options?: ASRConsolidationOptions): Cue[] {
  if (cues.length === 0) return [];

  const opts = { ...DEFAULT_OPTIONS, ...options };
  const consolidated: Cue[] = [];

  let currentGroup: Cue[] = [];
  let groupStartTime = 0;

  function flushGroup(): void {
    if (currentGroup.length === 0) return;

    // Combine all text in the group
    const combinedText = currentGroup
      .map(c => c.text.trim())
      .filter(t => t.length > 0)
      .join(' ')
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .trim();

    if (combinedText.length === 0) {
      currentGroup = [];
      return;
    }

    // Create consolidated cue
    const firstCue = currentGroup[0];
    const lastCue = currentGroup[currentGroup.length - 1];

    // Calculate start time based on timing strategy
    let startTime: number;
    let endTime = lastCue.endTime;

    switch (opts.timingStrategy) {
      case 'last': {
        // Use last segment's start time - shows translation when sentence is complete in audio
        // This aligns the consolidated subtitle with when the speaker finishes the sentence
        startTime = lastCue.startTime;
        // Extend endTime to ensure the subtitle stays visible for at least the full sentence duration
        // This prevents the subtitle from disappearing too quickly
        const originalDuration = lastCue.endTime - firstCue.startTime;
        const minDisplayTime = Math.max(2000, originalDuration); // At least 2 seconds or original duration
        endTime = Math.max(lastCue.endTime, startTime + minDisplayTime);
        break;
      }
      case 'weighted': {
        // Weight start time based on text length distribution
        // This ensures the subtitle appears closer to when most of the text is spoken
        let totalWeight = 0;
        let weightedTime = 0;
        for (const cue of currentGroup) {
          const weight = cue.text.trim().length;
          weightedTime += cue.startTime * weight;
          totalWeight += weight;
        }
        startTime = totalWeight > 0 ? Math.round(weightedTime / totalWeight) : firstCue.startTime;
        // Ensure subtitle stays visible for at least the remaining duration after weighted start
        // plus a small buffer for reading time
        const remainingAudio = lastCue.endTime - startTime;
        const minDisplayTime = Math.max(2000, remainingAudio + 500); // At least 2s or remaining + 0.5s buffer
        endTime = Math.max(lastCue.endTime, startTime + minDisplayTime);
        break;
      }
      case 'midpoint': {
        // Use midpoint between first and last segment start times
        startTime = Math.round((firstCue.startTime + lastCue.startTime) / 2);
        break;
      }
      case 'first':
      default:
        // Use first segment's start time (original behavior)
        startTime = firstCue.startTime;
        break;
    }

    consolidated.push({
      index: consolidated.length,
      startTime,
      endTime,
      text: combinedText,
      // If any cue had a translation, combine them too
      translatedText: currentGroup.some(c => c.translatedText)
        ? currentGroup
            .map(c => c.translatedText || c.text)
            .filter(t => t.trim().length > 0)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim()
        : undefined,
      // Preserve speaker if consistent
      speaker: currentGroup.every(c => c.speaker === firstCue.speaker)
        ? firstCue.speaker
        : undefined,
    });

    currentGroup = [];
  }

  for (const cue of cues) {
    // Skip empty cues
    if (!cue.text.trim()) continue;

    // If this is the first cue in a group, start fresh
    if (currentGroup.length === 0) {
      currentGroup.push(cue);
      groupStartTime = cue.startTime;
      continue;
    }

    const lastCue = currentGroup[currentGroup.length - 1];
    const gap = cue.startTime - lastCue.endTime;
    const groupDuration = cue.endTime - groupStartTime;
    const lastText = lastCue.text.trim();

    // Check if we should start a new group
    const shouldBreak =
      // Gap is too large
      gap > opts.maxGapMs ||
      // Group duration would exceed maximum
      groupDuration > opts.maxDurationMs ||
      // Last cue ended with sentence-ending punctuation
      opts.sentenceEndChars.some(char => lastText.endsWith(char));

    if (shouldBreak) {
      flushGroup();
      currentGroup.push(cue);
      groupStartTime = cue.startTime;
    } else {
      currentGroup.push(cue);
    }
  }

  // Don't forget the last group
  flushGroup();

  return consolidated;
}

/**
 * Check if a cue array appears to be fragmented ASR content.
 *
 * Characteristics of fragmented ASR:
 * - Many short segments
 * - Average text length < 20 characters
 * - Average duration < 2 seconds
 *
 * @param cues - Array of subtitle cues
 * @returns True if the cues appear to be fragmented ASR content
 */
export function isFragmentedASR(cues: Cue[]): boolean {
  if (cues.length < 10) return false;

  // Calculate average text length
  const avgTextLength = cues.reduce((sum, c) => sum + c.text.trim().length, 0) / cues.length;

  // Calculate average duration
  const avgDuration = cues.reduce((sum, c) => sum + (c.endTime - c.startTime), 0) / cues.length;

  // Fragmented ASR typically has:
  // - Short text segments (< 20 chars average)
  // - Short durations (< 2000ms average)
  // - Many cues (typically > 50 for a few minutes of video)
  return avgTextLength < 20 && avgDuration < 2000;
}

/**
 * Smart consolidation that only consolidates if the content appears to be fragmented.
 *
 * @param cues - Array of subtitle cues
 * @param isAutoGenerated - Whether the subtitles are known to be auto-generated
 * @param options - Consolidation options
 * @returns Consolidated cues if fragmented, otherwise original cues
 */
export function smartConsolidateASRCues(
  cues: Cue[],
  isAutoGenerated: boolean,
  options?: ASRConsolidationOptions
): Cue[] {
  // Only consolidate if:
  // 1. Subtitles are auto-generated AND
  // 2. They appear to be fragmented
  if (isAutoGenerated && isFragmentedASR(cues)) {
    return consolidateASRCues(cues, options);
  }

  return cues;
}

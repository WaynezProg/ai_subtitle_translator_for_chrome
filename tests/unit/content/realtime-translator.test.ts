/**
 * Tests for RealtimeTranslator cue finding logic
 */

import { describe, it, expect } from 'vitest';

// Since RealtimeTranslator is a class with private methods,
// we'll test the cue finding logic by extracting the core algorithm
interface TranslatedCue {
  startTime: number;
  endTime: number;
  originalText: string;
  translatedText: string;
}

/**
 * Find active cue using the same logic as RealtimeTranslator.findActiveCue
 * This is extracted for testability
 *
 * Uses intelligent grace period based on gap duration (optimized for YouTube ASR):
 * - Very short gaps (≤500ms): 400ms grace period (nearly seamless transition)
 * - Short gaps (500-1000ms): 350ms grace period (brief pause)
 * - Medium gaps (1000-1500ms): 250ms grace period (sentence boundary)
 * - Long gaps (>1500ms): No extension (intentional pause/scene change)
 */
function findActiveCue(cues: TranslatedCue[], currentTime: number): TranslatedCue | null {
  if (cues.length === 0) return null;

  // First pass: find exact match
  for (const cue of cues) {
    if (currentTime >= cue.startTime && currentTime < cue.endTime) {
      return cue;
    }
  }

  // Second pass: handle gaps between cues for smoother display
  for (let i = 0; i < cues.length - 1; i++) {
    const currentCue = cues[i];
    const nextCue = cues[i + 1];
    const gapStart = currentCue.endTime;
    const gapEnd = nextCue.startTime;

    if (currentTime >= gapStart && currentTime < gapEnd) {
      const gapDuration = gapEnd - gapStart;
      const timeIntoGap = currentTime - gapStart;

      // Determine grace period based on gap duration
      // Optimized for YouTube ASR which has many small gaps between words
      let gracePeriod: number;
      if (gapDuration <= 500) {
        gracePeriod = 400;  // Very short gap: nearly seamless transition
      } else if (gapDuration <= 1000) {
        gracePeriod = 350;  // Short gap: extend 350ms
      } else if (gapDuration <= 1500) {
        gracePeriod = 250;  // Medium gap: extend 250ms
      } else {
        gracePeriod = 0;    // Long gap: no extension
      }

      if (gracePeriod > 0 && timeIntoGap <= gracePeriod) {
        return currentCue;
      }
      break;
    }
  }

  return null;
}

describe('RealtimeTranslator findActiveCue', () => {
  const makeCue = (start: number, end: number, text: string): TranslatedCue => ({
    startTime: start,
    endTime: end,
    originalText: text,
    translatedText: `翻譯: ${text}`,
  });

  describe('exact time matching', () => {
    it('should find cue when currentTime is within range', () => {
      const cues = [
        makeCue(1000, 2000, 'Hello'),
        makeCue(2000, 3000, 'World'),
      ];

      expect(findActiveCue(cues, 1500)?.originalText).toBe('Hello');
      expect(findActiveCue(cues, 2500)?.originalText).toBe('World');
    });

    it('should return null when currentTime is before first cue', () => {
      const cues = [makeCue(1000, 2000, 'Hello')];
      expect(findActiveCue(cues, 500)).toBeNull();
    });

    it('should return null when currentTime is after last cue', () => {
      const cues = [makeCue(1000, 2000, 'Hello')];
      expect(findActiveCue(cues, 2500)).toBeNull();
    });

    it('should handle empty cue array', () => {
      expect(findActiveCue([], 1000)).toBeNull();
    });

    it('should match cue at exact startTime', () => {
      const cues = [makeCue(1000, 2000, 'Hello')];
      expect(findActiveCue(cues, 1000)?.originalText).toBe('Hello');
    });

    it('should not match cue at exact endTime (exclusive)', () => {
      const cues = [
        makeCue(1000, 2000, 'Hello'),
        makeCue(2000, 3000, 'World'),
      ];
      // At exactly 2000, should match 'World' (its startTime), not 'Hello' (its endTime)
      expect(findActiveCue(cues, 2000)?.originalText).toBe('World');
    });
  });

  describe('gap grace period handling', () => {
    it('should extend previous cue display during very short gap (300ms)', () => {
      const cues = [
        makeCue(1000, 2000, 'Hello'),
        makeCue(2300, 3300, 'World'), // 300ms gap (very short: ≤500ms, grace = 400ms)
      ];

      // During the gap, should still show 'Hello' (grace period = 400ms for very short gaps)
      expect(findActiveCue(cues, 2100)?.originalText).toBe('Hello');
      expect(findActiveCue(cues, 2200)?.originalText).toBe('Hello');
    });

    it('should not extend beyond grace period (350ms) for short gaps (500-1000ms)', () => {
      const cues = [
        makeCue(1000, 2000, 'Hello'),
        makeCue(2800, 3800, 'World'), // 800ms gap (short: 500-1000ms, grace = 350ms)
      ];

      // First 350ms of gap - should extend
      expect(findActiveCue(cues, 2100)?.originalText).toBe('Hello');
      expect(findActiveCue(cues, 2300)?.originalText).toBe('Hello');

      // After 350ms into gap - should return null
      expect(findActiveCue(cues, 2400)).toBeNull();
      expect(findActiveCue(cues, 2700)).toBeNull();
    });

    it('should use shorter grace period (250ms) for medium gaps (1000-1500ms)', () => {
      const cues = [
        makeCue(1000, 2000, 'Hello'),
        makeCue(3200, 4200, 'World'), // 1200ms gap (medium: 1000-1500ms, grace = 250ms)
      ];

      // First 250ms of gap - should extend
      expect(findActiveCue(cues, 2100)?.originalText).toBe('Hello');
      expect(findActiveCue(cues, 2200)?.originalText).toBe('Hello');

      // After 250ms into gap - should return null
      expect(findActiveCue(cues, 2300)).toBeNull();
      expect(findActiveCue(cues, 2800)).toBeNull();
    });

    it('should not extend for long gaps (>1500ms)', () => {
      const cues = [
        makeCue(1000, 2000, 'Hello'),
        makeCue(4000, 5000, 'World'), // 2000ms gap (long: >1500ms, grace = 0)
      ];

      // Gap is too long, should not extend at all
      expect(findActiveCue(cues, 2100)).toBeNull();
      expect(findActiveCue(cues, 2500)).toBeNull();
    });

    it('should handle multiple consecutive gaps with different lengths', () => {
      const cues = [
        makeCue(1000, 2000, 'First'),
        makeCue(2300, 3000, 'Second'), // 300ms gap (very short: ≤500ms, grace = 400ms)
        makeCue(4200, 5000, 'Third'),  // 1200ms gap (medium: 1000-1500ms, grace = 250ms)
      ];

      // First gap (very short, grace = 400ms)
      expect(findActiveCue(cues, 2100)?.originalText).toBe('First');

      // Exact match for second cue
      expect(findActiveCue(cues, 2500)?.originalText).toBe('Second');

      // Second gap (medium, grace = 250ms)
      expect(findActiveCue(cues, 3100)?.originalText).toBe('Second');
      expect(findActiveCue(cues, 3200)?.originalText).toBe('Second');
      // After 250ms grace period
      expect(findActiveCue(cues, 3300)).toBeNull();
    });
  });

  describe('ASR subtitle scenarios', () => {
    it('should handle typical ASR consolidated cues', () => {
      // Simulates consolidated ASR cues with small gaps
      const cues = [
        makeCue(1000, 3500, 'Hello world how are you'),
        makeCue(3800, 6000, 'I am fine thank you'),
        makeCue(6200, 8500, 'Nice to meet you'),
      ];

      // During playback
      expect(findActiveCue(cues, 2000)?.originalText).toBe('Hello world how are you');
      expect(findActiveCue(cues, 5000)?.originalText).toBe('I am fine thank you');

      // In small gaps, extend previous cue
      expect(findActiveCue(cues, 3600)?.originalText).toBe('Hello world how are you');
      expect(findActiveCue(cues, 6100)?.originalText).toBe('I am fine thank you');
    });

    it('should handle rapid consecutive cues without gaps', () => {
      const cues = [
        makeCue(1000, 2000, 'First'),
        makeCue(2000, 3000, 'Second'),
        makeCue(3000, 4000, 'Third'),
      ];

      // No gaps, just exact matching
      expect(findActiveCue(cues, 1500)?.originalText).toBe('First');
      expect(findActiveCue(cues, 2500)?.originalText).toBe('Second');
      expect(findActiveCue(cues, 3500)?.originalText).toBe('Third');
    });
  });
});

// ============================================================================
// Progressive Reveal Logic Tests
// ============================================================================

/**
 * Progressive reveal for ASR subtitles - extracted for testability
 * Mirrors the logic in RealtimeTranslator.calculateProgressiveReveal
 *
 * Optimized reveal strategy for YouTube ASR:
 * - 0-5% of cue duration: Show first 40% of text (fast start to reduce delay perception)
 * - 5-80% of cue duration: Linearly reveal to 95% of text (steady progress)
 * - 80-100% of cue duration: Show full text (ensure complete text shown before end)
 * - For very short cues (< 1 second): Show full text immediately
 */
function calculateProgressiveReveal(
  cue: TranslatedCue,
  currentTime: number
): { revealedTranslation: string; revealedOriginal: string } {
  const fullTranslation = cue.translatedText;
  const fullOriginal = cue.originalText;
  const duration = cue.endTime - cue.startTime;

  // Edge case: very short or zero duration - show full text immediately
  if (duration <= 0) {
    return { revealedTranslation: fullTranslation, revealedOriginal: fullOriginal };
  }

  // For very short cues (< 1 second), show full text immediately
  // These are typically single words or brief phrases
  if (duration < 1000) {
    return { revealedTranslation: fullTranslation, revealedOriginal: fullOriginal };
  }

  const elapsed = currentTime - cue.startTime;
  const progress = Math.max(0, Math.min(1, elapsed / duration));

  // Optimized reveal strategy for YouTube ASR subtitles
  let revealRatio: number;
  if (progress <= 0.05) {
    // Fast start: show 40% of text within first 5% of time
    revealRatio = 0.4 * (progress / 0.05);
  } else if (progress >= 0.8) {
    // End: show all text to ensure complete reading
    revealRatio = 1;
  } else {
    // Middle: linear reveal from 40% to 95%
    const middleProgress = (progress - 0.05) / 0.75;
    revealRatio = 0.4 + (0.55 * middleProgress);
  }

  const translationLength = Math.ceil(fullTranslation.length * revealRatio);
  const originalLength = Math.ceil(fullOriginal.length * revealRatio);

  const revealedTranslation = revealTextProgressively(fullTranslation, translationLength);
  const revealedOriginal = revealTextProgressively(fullOriginal, originalLength);

  return { revealedTranslation, revealedOriginal };
}

/**
 * Reveal text progressively - extracted for testability
 */
function revealTextProgressively(text: string, targetLength: number): string {
  if (targetLength >= text.length) {
    return text;
  }

  const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(text);

  if (hasCJK) {
    return text.substring(0, targetLength);
  }

  const words = text.split(/(\s+)/);
  let revealed = '';
  let currentLength = 0;

  for (const word of words) {
    if (currentLength + word.length <= targetLength) {
      revealed += word;
      currentLength += word.length;
    } else if (currentLength === 0) {
      revealed = word.substring(0, targetLength);
      break;
    } else {
      break;
    }
  }

  return revealed;
}

describe('Progressive Reveal for ASR Subtitles', () => {
  const makeCue = (start: number, end: number, original: string, translated: string): TranslatedCue => ({
    startTime: start,
    endTime: end,
    originalText: original,
    translatedText: translated,
  });

  describe('calculateProgressiveReveal', () => {
    it('should reveal minimal text at the start of cue (0% progress)', () => {
      const cue = makeCue(1000, 5000, 'Hello world everyone', '你好世界大家好');
      const result = calculateProgressiveReveal(cue, 1000);

      // At 0% progress, should show 0% of text
      expect(result.revealedTranslation.length).toBeLessThan(cue.translatedText.length);
      expect(result.revealedOriginal.length).toBeLessThan(cue.originalText.length);
    });

    it('should reveal ~40% text at 5% progress (fast start)', () => {
      const cue = makeCue(1000, 5000, 'Hello world everyone', '你好世界大家好');
      const result = calculateProgressiveReveal(cue, 1200); // 5% of 4000ms duration

      // At 5% progress, should show ~40% of text (with ceiling rounding)
      const translationRatio = result.revealedTranslation.length / cue.translatedText.length;
      expect(translationRatio).toBeGreaterThanOrEqual(0.35);
      expect(translationRatio).toBeLessThanOrEqual(0.6);
    });

    it('should reveal full text at 80% progress', () => {
      const cue = makeCue(1000, 5000, 'Hello world everyone', '你好世界大家好');
      const result = calculateProgressiveReveal(cue, 4200); // 80% of 4000ms duration

      expect(result.revealedTranslation).toBe(cue.translatedText);
      expect(result.revealedOriginal).toBe(cue.originalText);
    });

    it('should reveal full text at end of cue (100% progress)', () => {
      const cue = makeCue(1000, 5000, 'Hello world everyone', '你好世界大家好');
      const result = calculateProgressiveReveal(cue, 5000);

      expect(result.revealedTranslation).toBe(cue.translatedText);
      expect(result.revealedOriginal).toBe(cue.originalText);
    });

    it('should handle zero duration cue', () => {
      const cue = makeCue(1000, 1000, 'Test', '測試');
      const result = calculateProgressiveReveal(cue, 1000);

      // Zero duration should show full text
      expect(result.revealedTranslation).toBe(cue.translatedText);
      expect(result.revealedOriginal).toBe(cue.originalText);
    });

    it('should show full text immediately for short duration cues (< 1 second)', () => {
      const cue = makeCue(1000, 1800, 'Test', '測試'); // 800ms duration
      const result = calculateProgressiveReveal(cue, 1000);

      // Short duration cues should show full text immediately
      expect(result.revealedTranslation).toBe(cue.translatedText);
      expect(result.revealedOriginal).toBe(cue.originalText);
    });

    it('should increase revealed text as time progresses', () => {
      const cue = makeCue(0, 4000, 'This is a longer test sentence', '這是一個較長的測試句子');

      const result1 = calculateProgressiveReveal(cue, 200);  // 5%
      const result2 = calculateProgressiveReveal(cue, 2000); // 50%
      const result3 = calculateProgressiveReveal(cue, 3200); // 80%

      expect(result1.revealedTranslation.length).toBeLessThan(result2.revealedTranslation.length);
      expect(result2.revealedTranslation.length).toBeLessThanOrEqual(result3.revealedTranslation.length);
    });
  });

  describe('revealTextProgressively', () => {
    it('should return full text when target length exceeds text length', () => {
      expect(revealTextProgressively('Hello', 10)).toBe('Hello');
    });

    it('should reveal CJK text character by character', () => {
      expect(revealTextProgressively('你好世界', 2)).toBe('你好');
      expect(revealTextProgressively('這是測試', 3)).toBe('這是測');
    });

    it('should reveal Latin text at word boundaries when possible', () => {
      expect(revealTextProgressively('Hello world test', 10)).toBe('Hello ');
      expect(revealTextProgressively('Hello world test', 11)).toBe('Hello world');
    });

    it('should show partial first word if target is smaller than first word', () => {
      expect(revealTextProgressively('Hello', 3)).toBe('Hel');
    });
  });
});

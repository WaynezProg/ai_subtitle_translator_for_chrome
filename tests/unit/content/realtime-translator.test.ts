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
 * Uses intelligent grace period based on gap duration:
 * - Short gaps (≤1000ms): 500ms grace period (likely pause within sentence)
 * - Medium gaps (1000-2000ms): 300ms grace period (likely sentence boundary)
 * - Long gaps (>2000ms): No extension (intentional pause/scene change)
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
      let gracePeriod: number;
      if (gapDuration <= 1000) {
        gracePeriod = 500;  // Short gap: extend 500ms
      } else if (gapDuration <= 2000) {
        gracePeriod = 300;  // Medium gap: extend 300ms
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
    it('should extend previous cue display during short gap (300ms)', () => {
      const cues = [
        makeCue(1000, 2000, 'Hello'),
        makeCue(2300, 3300, 'World'), // 300ms gap (short: ≤1000ms)
      ];

      // During the gap, should still show 'Hello' (grace period = 500ms for short gaps)
      expect(findActiveCue(cues, 2100)?.originalText).toBe('Hello');
      expect(findActiveCue(cues, 2200)?.originalText).toBe('Hello');
    });

    it('should not extend beyond grace period (500ms) for short gaps', () => {
      const cues = [
        makeCue(1000, 2000, 'Hello'),
        makeCue(2800, 3800, 'World'), // 800ms gap (short: ≤1000ms, grace = 500ms)
      ];

      // First 500ms of gap - should extend
      expect(findActiveCue(cues, 2100)?.originalText).toBe('Hello');
      expect(findActiveCue(cues, 2400)?.originalText).toBe('Hello');

      // After 500ms into gap - should return null
      expect(findActiveCue(cues, 2600)).toBeNull();
      expect(findActiveCue(cues, 2700)).toBeNull();
    });

    it('should use shorter grace period (300ms) for medium gaps', () => {
      const cues = [
        makeCue(1000, 2000, 'Hello'),
        makeCue(3500, 4500, 'World'), // 1500ms gap (medium: 1000-2000ms, grace = 300ms)
      ];

      // First 300ms of gap - should extend
      expect(findActiveCue(cues, 2100)?.originalText).toBe('Hello');
      expect(findActiveCue(cues, 2200)?.originalText).toBe('Hello');

      // After 300ms into gap - should return null
      expect(findActiveCue(cues, 2400)).toBeNull();
      expect(findActiveCue(cues, 2800)).toBeNull();
    });

    it('should not extend for very long gaps (>2000ms)', () => {
      const cues = [
        makeCue(1000, 2000, 'Hello'),
        makeCue(4500, 5500, 'World'), // 2500ms gap (long: >2000ms, grace = 0)
      ];

      // Gap is too long, should not extend at all
      expect(findActiveCue(cues, 2100)).toBeNull();
      expect(findActiveCue(cues, 2500)).toBeNull();
    });

    it('should handle multiple consecutive gaps with different lengths', () => {
      const cues = [
        makeCue(1000, 2000, 'First'),
        makeCue(2300, 3000, 'Second'), // 300ms gap (short)
        makeCue(4200, 5000, 'Third'),  // 1200ms gap (medium)
      ];

      // First gap (short, grace = 500ms)
      expect(findActiveCue(cues, 2100)?.originalText).toBe('First');

      // Exact match for second cue
      expect(findActiveCue(cues, 2500)?.originalText).toBe('Second');

      // Second gap (medium, grace = 300ms)
      expect(findActiveCue(cues, 3100)?.originalText).toBe('Second');
      expect(findActiveCue(cues, 3200)?.originalText).toBe('Second');
      // After 300ms grace period
      expect(findActiveCue(cues, 3500)).toBeNull();
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
 */
function calculateProgressiveReveal(
  cue: TranslatedCue,
  currentTime: number
): { revealedTranslation: string; revealedOriginal: string } {
  const fullTranslation = cue.translatedText;
  const fullOriginal = cue.originalText;
  const duration = cue.endTime - cue.startTime;

  if (duration <= 0) {
    return { revealedTranslation: fullTranslation, revealedOriginal: fullOriginal };
  }

  const elapsed = currentTime - cue.startTime;
  const progress = Math.max(0, Math.min(1, elapsed / duration));

  let revealRatio: number;
  if (progress <= 0.1) {
    revealRatio = 0.3 * (progress / 0.1);
  } else if (progress >= 0.9) {
    revealRatio = 1;
  } else {
    const middleProgress = (progress - 0.1) / 0.8;
    revealRatio = 0.3 + (0.7 * middleProgress);
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

    it('should reveal ~30% text at 10% progress', () => {
      const cue = makeCue(1000, 5000, 'Hello world everyone', '你好世界大家好');
      const result = calculateProgressiveReveal(cue, 1400); // 10% of 4000ms duration

      // At 10% progress, should show ~30% of text (with ceiling rounding)
      // The ratio may be slightly higher due to Math.ceil
      const translationRatio = result.revealedTranslation.length / cue.translatedText.length;
      expect(translationRatio).toBeGreaterThanOrEqual(0.25);
      expect(translationRatio).toBeLessThanOrEqual(0.5);
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

    it('should increase revealed text as time progresses', () => {
      const cue = makeCue(0, 4000, 'This is a longer test sentence', '這是一個較長的測試句子');

      const result1 = calculateProgressiveReveal(cue, 500);  // 12.5%
      const result2 = calculateProgressiveReveal(cue, 2000); // 50%
      const result3 = calculateProgressiveReveal(cue, 3500); // 87.5%

      expect(result1.revealedTranslation.length).toBeLessThan(result2.revealedTranslation.length);
      expect(result2.revealedTranslation.length).toBeLessThan(result3.revealedTranslation.length);
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

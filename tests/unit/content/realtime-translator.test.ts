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
  const GAP_GRACE_PERIOD_MS = 500;

  for (let i = 0; i < cues.length - 1; i++) {
    const currentCue = cues[i];
    const nextCue = cues[i + 1];
    const gapStart = currentCue.endTime;
    const gapEnd = nextCue.startTime;

    if (currentTime >= gapStart && currentTime < gapEnd) {
      const gapDuration = gapEnd - gapStart;
      const timeIntoGap = currentTime - gapStart;

      if (gapDuration <= GAP_GRACE_PERIOD_MS * 2 && timeIntoGap <= GAP_GRACE_PERIOD_MS) {
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
        makeCue(2300, 3300, 'World'), // 300ms gap
      ];

      // During the gap, should still show 'Hello'
      expect(findActiveCue(cues, 2100)?.originalText).toBe('Hello');
      expect(findActiveCue(cues, 2200)?.originalText).toBe('Hello');
    });

    it('should not extend beyond grace period (500ms)', () => {
      const cues = [
        makeCue(1000, 2000, 'Hello'),
        makeCue(3000, 4000, 'World'), // 1000ms gap
      ];

      // First 500ms of gap - should extend
      expect(findActiveCue(cues, 2100)?.originalText).toBe('Hello');
      expect(findActiveCue(cues, 2400)?.originalText).toBe('Hello');

      // After 500ms into gap - should return null
      expect(findActiveCue(cues, 2600)).toBeNull();
      expect(findActiveCue(cues, 2800)).toBeNull();
    });

    it('should not extend for very long gaps (>1000ms)', () => {
      const cues = [
        makeCue(1000, 2000, 'Hello'),
        makeCue(4000, 5000, 'World'), // 2000ms gap (> 2 * grace period)
      ];

      // Gap is too long, should not extend at all
      expect(findActiveCue(cues, 2100)).toBeNull();
    });

    it('should handle multiple consecutive gaps', () => {
      const cues = [
        makeCue(1000, 2000, 'First'),
        makeCue(2300, 3000, 'Second'), // 300ms gap
        makeCue(3400, 4000, 'Third'),  // 400ms gap
      ];

      // First gap
      expect(findActiveCue(cues, 2100)?.originalText).toBe('First');

      // Exact match for second cue
      expect(findActiveCue(cues, 2500)?.originalText).toBe('Second');

      // Second gap
      expect(findActiveCue(cues, 3100)?.originalText).toBe('Second');
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

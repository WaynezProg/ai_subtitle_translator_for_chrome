/**
 * Tests for subtitle upload utility
 */

import { describe, it, expect } from 'vitest';
import {
  SubtitleUploadError,
  validateUploadedFile,
  mapUploadedCuesToOriginal,
} from '@shared/utils/subtitle-upload';
import type { Cue } from '@shared/types/subtitle';

// ============================================================================
// SubtitleUploadError Tests
// ============================================================================

describe('SubtitleUploadError', () => {
  it('should create error with correct code and message', () => {
    const error = new SubtitleUploadError('INVALID_FILE_TYPE', 'Invalid file');
    expect(error.code).toBe('INVALID_FILE_TYPE');
    expect(error.message).toBe('Invalid file');
    expect(error.name).toBe('SubtitleUploadError');
  });

  it('should be instance of Error', () => {
    const error = new SubtitleUploadError('PARSE_ERROR', 'Parse failed');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SubtitleUploadError);
  });
});

// ============================================================================
// validateUploadedFile Tests
// ============================================================================

describe('validateUploadedFile', () => {
  it('should accept .srt files', () => {
    const file = new File(['content'], 'subtitles.srt', { type: 'text/plain' });
    expect(() => validateUploadedFile(file)).not.toThrow();
  });

  it('should accept .SRT files (case insensitive)', () => {
    const file = new File(['content'], 'subtitles.SRT', { type: 'text/plain' });
    expect(() => validateUploadedFile(file)).not.toThrow();
  });

  it('should reject non-srt files', () => {
    const txtFile = new File(['content'], 'subtitles.txt', { type: 'text/plain' });
    expect(() => validateUploadedFile(txtFile)).toThrow(SubtitleUploadError);
    expect(() => validateUploadedFile(txtFile)).toThrow(/Invalid file type/);

    const vttFile = new File(['content'], 'subtitles.vtt', { type: 'text/plain' });
    expect(() => validateUploadedFile(vttFile)).toThrow(SubtitleUploadError);
  });

  it('should reject files larger than 10MB', () => {
    // Create a mock file object with large size
    const largeContent = new ArrayBuffer(11 * 1024 * 1024); // 11MB
    const file = new File([largeContent], 'large.srt', { type: 'text/plain' });
    expect(() => validateUploadedFile(file)).toThrow(SubtitleUploadError);
    expect(() => validateUploadedFile(file)).toThrow(/too large/);
  });

  it('should accept files under 10MB', () => {
    const content = 'a'.repeat(1024 * 1024); // 1MB
    const file = new File([content], 'normal.srt', { type: 'text/plain' });
    expect(() => validateUploadedFile(file)).not.toThrow();
  });
});

// ============================================================================
// mapUploadedCuesToOriginal Tests
// ============================================================================

describe('mapUploadedCuesToOriginal', () => {
  const createCue = (index: number, startTime: number, endTime: number, text: string): Cue => ({
    index,
    startTime,
    endTime,
    text,
  });

  describe('with matching cue counts', () => {
    it('should map cues by index when counts match', () => {
      const originalCues: Cue[] = [
        createCue(0, 0, 1000, 'Hello'),
        createCue(1, 1000, 2000, 'World'),
        createCue(2, 2000, 3000, 'Test'),
      ];

      const uploadedCues: Cue[] = [
        createCue(0, 0, 1000, '你好'),
        createCue(1, 1000, 2000, '世界'),
        createCue(2, 2000, 3000, '測試'),
      ];

      const result = mapUploadedCuesToOriginal(originalCues, uploadedCues);

      expect(result.mappedCount).toBe(3);
      expect(result.originalCount).toBe(3);
      expect(result.uploadedCount).toBe(3);
      expect(result.warning).toBeUndefined();
      expect(result.mappedCues[0].translatedText).toBe('你好');
      expect(result.mappedCues[1].translatedText).toBe('世界');
      expect(result.mappedCues[2].translatedText).toBe('測試');
    });

    it('should preserve original cue properties', () => {
      const originalCues: Cue[] = [
        { index: 0, startTime: 0, endTime: 1000, text: 'Hello', speaker: 'John' },
      ];

      const uploadedCues: Cue[] = [
        createCue(0, 0, 1000, '你好'),
      ];

      const result = mapUploadedCuesToOriginal(originalCues, uploadedCues);

      expect(result.mappedCues[0].text).toBe('Hello');
      expect(result.mappedCues[0].speaker).toBe('John');
      expect(result.mappedCues[0].translatedText).toBe('你好');
    });
  });

  describe('with mismatched cue counts', () => {
    it('should map by timing when original has more cues', () => {
      const originalCues: Cue[] = [
        createCue(0, 0, 1000, 'Hello'),
        createCue(1, 5000, 6000, 'World'),  // 5 seconds - no close match
        createCue(2, 10000, 11000, 'Test'),
      ];

      const uploadedCues: Cue[] = [
        createCue(0, 0, 1000, '你好'),       // Matches Hello
        createCue(1, 10000, 11000, '測試'),  // Matches Test
      ];

      const result = mapUploadedCuesToOriginal(originalCues, uploadedCues);

      expect(result.mappedCount).toBe(2);
      expect(result.warning).toContain('mismatch');
      expect(result.mappedCues[0].translatedText).toBe('你好');
      expect(result.mappedCues[1].translatedText).toBeUndefined(); // No match within 2000ms tolerance
      expect(result.mappedCues[2].translatedText).toBe('測試');
    });

    it('should map by timing when uploaded has more cues', () => {
      const originalCues: Cue[] = [
        createCue(0, 0, 1000, 'Hello'),
        createCue(1, 2000, 3000, 'Test'),
      ];

      const uploadedCues: Cue[] = [
        createCue(0, 0, 1000, '你好'),
        createCue(1, 1000, 2000, '世界'),
        createCue(2, 2000, 3000, '測試'),
      ];

      const result = mapUploadedCuesToOriginal(originalCues, uploadedCues);

      expect(result.mappedCount).toBe(2);
      expect(result.warning).toContain('mismatch');
      expect(result.mappedCues[0].translatedText).toBe('你好');
      expect(result.mappedCues[1].translatedText).toBe('測試');
    });

    it('should use tolerance of 2000ms for timing matching', () => {
      const originalCues: Cue[] = [
        createCue(0, 0, 1000, 'Hello'),
        createCue(1, 5000, 6000, 'World'), // 5 seconds in
      ];

      const uploadedCues: Cue[] = [
        createCue(0, 100, 1100, '你好'), // Within 2000ms tolerance
        createCue(1, 6500, 7500, '世界'), // Within 2000ms of 5000
      ];

      const result = mapUploadedCuesToOriginal(originalCues, uploadedCues);

      expect(result.mappedCount).toBe(2);
      expect(result.mappedCues[0].translatedText).toBe('你好');
      expect(result.mappedCues[1].translatedText).toBe('世界');
    });

    it('should not match cues outside tolerance (2000ms) when counts differ', () => {
      // With mismatched counts, the algorithm maps by timing
      // The tolerance is 2000ms, so cues more than 2000ms apart should not match
      // We use 3 original cues and 2 uploaded to force timing-based mapping
      const originalCues: Cue[] = [
        createCue(0, 0, 1000, 'Hello'),         // At 0ms
        createCue(1, 50000, 51000, 'Middle'),   // At 50 seconds
        createCue(2, 100000, 101000, 'World'),  // At 100 seconds
      ];

      const uploadedCues: Cue[] = [
        createCue(0, 30000, 31000, '你好'),    // At 30 seconds - 30000ms from Hello, 20000ms from Middle
        createCue(1, 200000, 201000, '世界'),  // At 200 seconds - 100000ms from World
      ];

      const result = mapUploadedCuesToOriginal(originalCues, uploadedCues);

      // With 3 vs 2 counts, timing-based mapping is used
      expect(result.warning).toContain('mismatch');
      // All cues should have no match since all uploaded cues are > 2000ms away from originals
      expect(result.mappedCues[0].translatedText).toBeUndefined(); // 0ms vs 30000ms = 30000ms diff
      expect(result.mappedCues[1].translatedText).toBeUndefined(); // 50000ms vs 30000ms = 20000ms diff
      expect(result.mappedCues[2].translatedText).toBeUndefined(); // 100000ms vs 200000ms = 100000ms diff
      expect(result.mappedCount).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle empty original cues', () => {
      const result = mapUploadedCuesToOriginal([], [createCue(0, 0, 1000, '你好')]);

      expect(result.mappedCues).toHaveLength(0);
      expect(result.mappedCount).toBe(0);
      expect(result.originalCount).toBe(0);
      expect(result.uploadedCount).toBe(1);
    });

    it('should handle empty uploaded cues', () => {
      const originalCues: Cue[] = [createCue(0, 0, 1000, 'Hello')];
      const result = mapUploadedCuesToOriginal(originalCues, []);

      expect(result.mappedCues).toHaveLength(1);
      expect(result.mappedCount).toBe(0);
      expect(result.mappedCues[0].translatedText).toBeUndefined();
    });

    it('should not modify original cues array', () => {
      const originalCues: Cue[] = [createCue(0, 0, 1000, 'Hello')];
      const uploadedCues: Cue[] = [createCue(0, 0, 1000, '你好')];

      mapUploadedCuesToOriginal(originalCues, uploadedCues);

      expect(originalCues[0].translatedText).toBeUndefined();
    });

    it('should find best match when multiple cues are within tolerance', () => {
      const originalCues: Cue[] = [
        createCue(0, 1000, 2000, 'Hello'),
      ];

      const uploadedCues: Cue[] = [
        createCue(0, 500, 1500, '遠一點'), // 500ms diff
        createCue(1, 900, 1900, '近一點'), // 100ms diff - should be chosen
        createCue(2, 1500, 2500, '更遠'), // 500ms diff
      ];

      const result = mapUploadedCuesToOriginal(originalCues, uploadedCues);

      expect(result.mappedCues[0].translatedText).toBe('近一點');
    });
  });
});

/**
 * Tests for ASR Subtitle Consolidator
 */

import { describe, it, expect } from 'vitest';
import {
  consolidateASRCues,
  isFragmentedASR,
  smartConsolidateASRCues,
} from '../../../src/shared/utils/asr-consolidator';
import type { Cue } from '../../../src/shared/types/subtitle';

describe('ASR Consolidator', () => {
  describe('consolidateASRCues', () => {
    it('should consolidate consecutive short segments into sentences', () => {
      const cues: Cue[] = [
        { index: 0, startTime: 1000, endTime: 1500, text: 'Hello' },
        { index: 1, startTime: 1500, endTime: 2000, text: 'world' },
        { index: 2, startTime: 2000, endTime: 2500, text: 'how' },
        { index: 3, startTime: 2500, endTime: 3000, text: 'are' },
        { index: 4, startTime: 3000, endTime: 3500, text: 'you' },
      ];

      const consolidated = consolidateASRCues(cues);

      // Should consolidate all into one cue since they're close together
      expect(consolidated.length).toBe(1);
      expect(consolidated[0].text).toBe('Hello world how are you');
      expect(consolidated[0].startTime).toBe(1000);
      expect(consolidated[0].endTime).toBe(3500);
      expect(consolidated[0].index).toBe(0);
    });

    it('should split on sentence-ending punctuation', () => {
      const cues: Cue[] = [
        { index: 0, startTime: 1000, endTime: 1500, text: 'Hello' },
        { index: 1, startTime: 1500, endTime: 2000, text: 'world.' },
        { index: 2, startTime: 2000, endTime: 2500, text: 'How' },
        { index: 3, startTime: 2500, endTime: 3000, text: 'are' },
        { index: 4, startTime: 3000, endTime: 3500, text: 'you?' },
      ];

      const consolidated = consolidateASRCues(cues);

      // Should split at periods and question marks
      expect(consolidated.length).toBe(2);
      expect(consolidated[0].text).toBe('Hello world.');
      expect(consolidated[1].text).toBe('How are you?');
    });

    it('should split on large time gaps', () => {
      const cues: Cue[] = [
        { index: 0, startTime: 1000, endTime: 1500, text: 'Hello' },
        { index: 1, startTime: 1500, endTime: 2000, text: 'world' },
        // Large gap (3 seconds)
        { index: 2, startTime: 5000, endTime: 5500, text: 'How' },
        { index: 3, startTime: 5500, endTime: 6000, text: 'are you' },
      ];

      const consolidated = consolidateASRCues(cues);

      expect(consolidated.length).toBe(2);
      expect(consolidated[0].text).toBe('Hello world');
      expect(consolidated[0].endTime).toBe(2000);
      expect(consolidated[1].text).toBe('How are you');
      expect(consolidated[1].startTime).toBe(5000);
    });

    it('should respect maxDurationMs option', () => {
      const cues: Cue[] = [
        { index: 0, startTime: 0, endTime: 1000, text: 'Word1' },
        { index: 1, startTime: 1000, endTime: 2000, text: 'Word2' },
        { index: 2, startTime: 2000, endTime: 3000, text: 'Word3' },
        { index: 3, startTime: 3000, endTime: 4000, text: 'Word4' },
        { index: 4, startTime: 4000, endTime: 5000, text: 'Word5' },
      ];

      const consolidated = consolidateASRCues(cues, { maxDurationMs: 3000 });

      // Should split when duration exceeds 3 seconds
      expect(consolidated.length).toBe(2);
      expect(consolidated[0].text).toBe('Word1 Word2 Word3');
      expect(consolidated[1].text).toBe('Word4 Word5');
    });

    it('should skip empty cues', () => {
      const cues: Cue[] = [
        { index: 0, startTime: 1000, endTime: 1500, text: 'Hello' },
        { index: 1, startTime: 1500, endTime: 2000, text: '   ' },
        { index: 2, startTime: 2000, endTime: 2500, text: 'world' },
      ];

      const consolidated = consolidateASRCues(cues);

      expect(consolidated.length).toBe(1);
      expect(consolidated[0].text).toBe('Hello world');
    });

    it('should normalize whitespace in combined text', () => {
      const cues: Cue[] = [
        { index: 0, startTime: 1000, endTime: 1500, text: '  Hello  ' },
        { index: 1, startTime: 1500, endTime: 2000, text: '  world  ' },
      ];

      const consolidated = consolidateASRCues(cues);

      expect(consolidated[0].text).toBe('Hello world');
    });

    it('should preserve translations if present', () => {
      const cues: Cue[] = [
        { index: 0, startTime: 1000, endTime: 1500, text: 'Hello', translatedText: '你好' },
        { index: 1, startTime: 1500, endTime: 2000, text: 'world', translatedText: '世界' },
      ];

      const consolidated = consolidateASRCues(cues);

      expect(consolidated[0].text).toBe('Hello world');
      expect(consolidated[0].translatedText).toBe('你好 世界');
    });

    it('should handle empty input', () => {
      const consolidated = consolidateASRCues([]);
      expect(consolidated).toEqual([]);
    });

    it('should handle single cue', () => {
      const cues: Cue[] = [
        { index: 0, startTime: 1000, endTime: 2000, text: 'Hello world' },
      ];

      const consolidated = consolidateASRCues(cues);

      expect(consolidated.length).toBe(1);
      expect(consolidated[0].text).toBe('Hello world');
    });

    it('should handle CJK sentence endings', () => {
      const cues: Cue[] = [
        { index: 0, startTime: 1000, endTime: 1500, text: 'こんにちは' },
        { index: 1, startTime: 1500, endTime: 2000, text: '世界。' },
        { index: 2, startTime: 2000, endTime: 2500, text: '元気' },
        { index: 3, startTime: 2500, endTime: 3000, text: 'ですか？' },
      ];

      const consolidated = consolidateASRCues(cues);

      expect(consolidated.length).toBe(2);
      expect(consolidated[0].text).toBe('こんにちは 世界。');
      expect(consolidated[1].text).toBe('元気 ですか？');
    });

    it('should reindex consolidated cues correctly', () => {
      const cues: Cue[] = [
        { index: 0, startTime: 1000, endTime: 1500, text: 'First.' },
        { index: 1, startTime: 2000, endTime: 2500, text: 'Second.' },
        { index: 2, startTime: 3000, endTime: 3500, text: 'Third.' },
      ];

      const consolidated = consolidateASRCues(cues);

      expect(consolidated.length).toBe(3);
      expect(consolidated[0].index).toBe(0);
      expect(consolidated[1].index).toBe(1);
      expect(consolidated[2].index).toBe(2);
    });
  });

  describe('isFragmentedASR', () => {
    it('should detect fragmented ASR content', () => {
      const cues: Cue[] = Array.from({ length: 20 }, (_, i) => ({
        index: i,
        startTime: i * 500,
        endTime: (i + 1) * 500,
        text: 'Word',  // Short text
      }));

      expect(isFragmentedASR(cues)).toBe(true);
    });

    it('should not detect non-fragmented content', () => {
      const cues: Cue[] = Array.from({ length: 20 }, (_, i) => ({
        index: i,
        startTime: i * 5000,
        endTime: (i + 1) * 5000,
        text: 'This is a complete sentence with many words.',
      }));

      expect(isFragmentedASR(cues)).toBe(false);
    });

    it('should return false for small cue arrays', () => {
      const cues: Cue[] = [
        { index: 0, startTime: 0, endTime: 500, text: 'Hi' },
        { index: 1, startTime: 500, endTime: 1000, text: 'there' },
      ];

      expect(isFragmentedASR(cues)).toBe(false);
    });
  });

  describe('smartConsolidateASRCues', () => {
    it('should consolidate when isAutoGenerated is true and content is fragmented', () => {
      const cues: Cue[] = Array.from({ length: 20 }, (_, i) => ({
        index: i,
        startTime: i * 500,
        endTime: (i + 1) * 500,
        text: `Word${i}`,
      }));

      const result = smartConsolidateASRCues(cues, true);

      // Should be consolidated (fewer cues than original)
      expect(result.length).toBeLessThan(cues.length);
    });

    it('should not consolidate when isAutoGenerated is false', () => {
      const cues: Cue[] = Array.from({ length: 20 }, (_, i) => ({
        index: i,
        startTime: i * 500,
        endTime: (i + 1) * 500,
        text: `Word${i}`,
      }));

      const result = smartConsolidateASRCues(cues, false);

      // Should return original cues unchanged
      expect(result.length).toBe(cues.length);
      expect(result).toEqual(cues);
    });

    it('should not consolidate when content is not fragmented even if ASR', () => {
      const cues: Cue[] = Array.from({ length: 20 }, (_, i) => ({
        index: i,
        startTime: i * 5000,
        endTime: (i + 1) * 5000,
        text: 'This is a complete sentence with many words and proper timing.',
      }));

      const result = smartConsolidateASRCues(cues, true);

      // Content is not fragmented, so should return original
      expect(result.length).toBe(cues.length);
    });
  });
});
